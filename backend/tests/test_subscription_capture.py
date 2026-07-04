"""
Regression tests for the Razorpay autopay capture fix.

Root cause these lock in:
    On manual-capture Razorpay accounts, a subscription's first charge arrives
    as `authorized` (money debited) but is NOT captured unless the merchant
    calls payment.capture(). If it is never captured, Razorpay AUTO-REFUNDS it
    and the subscription halts — the exact "money taken then returned by the
    bank" bug seen in production.

_capture_authorized_payment() is the guard that must capture an authorized,
uncaptured recurring payment. verify-payment now calls it synchronously so the
flow no longer depends on the payment.authorized webhook being registered.
"""

from unittest.mock import MagicMock

from routes.subscription import _capture_authorized_payment, _subscription_end_date
from datetime import datetime, timedelta


class _FakeRz:
    """Minimal stand-in for a razorpay.Client with payment.fetch / payment.capture."""

    def __init__(self, payment):
        self._payment = payment
        self.captured_with = None
        self.payment = MagicMock()
        self.payment.fetch = MagicMock(return_value=payment)
        self.payment.capture = MagicMock(side_effect=self._capture)

    def _capture(self, payment_id, amount):
        self.captured_with = (payment_id, amount)
        return {"id": payment_id, "status": "captured", "amount": amount}


def test_authorized_uncaptured_payment_is_captured():
    """The core fix: an authorized, uncaptured recurring payment MUST be captured."""
    rz = _FakeRz({"id": "pay_X", "status": "authorized", "captured": False, "amount": 99900})

    result = _capture_authorized_payment(rz, "pay_X")

    assert result is True
    assert rz.captured_with == ("pay_X", 99900), "must capture with the exact authorized amount"


def test_already_captured_payment_is_not_recaptured():
    """Idempotency: a captured payment must not be captured again (would error/double-charge)."""
    rz = _FakeRz({"id": "pay_X", "status": "captured", "captured": True, "amount": 99900})

    result = _capture_authorized_payment(rz, "pay_X")

    assert result is False
    rz.payment.capture.assert_not_called()


def test_zero_amount_authorization_is_not_captured():
    """eMandate registration auths have amount 0 — never call capture on them."""
    rz = _FakeRz({"id": "pay_X", "status": "authorized", "captured": False, "amount": 0})

    result = _capture_authorized_payment(rz, "pay_X")

    assert result is False
    rz.payment.capture.assert_not_called()


def test_capture_failure_is_swallowed_not_raised():
    """A capture error must never break verify-payment — the webhook is the backup."""
    rz = _FakeRz({"id": "pay_X", "status": "authorized", "captured": False, "amount": 99900})
    rz.payment.capture = MagicMock(side_effect=Exception("razorpay down"))

    # Must return False, not raise.
    assert _capture_authorized_payment(rz, "pay_X") is False


def test_end_date_prefers_razorpay_current_end():
    """Activation end date must track Razorpay's actual next-billing timestamp."""
    future = datetime(2026, 8, 1, 0, 0, 0)
    ts = int((future - datetime(1970, 1, 1)).total_seconds())

    end = _subscription_end_date({"current_end": ts}, "monthly")

    assert end.year == 2026 and end.month == 8


def test_end_date_falls_back_by_cycle_when_no_current_end():
    """With no current_end, monthly ≈ +30d and yearly ≈ +365d."""
    monthly = _subscription_end_date({}, "monthly")
    yearly = _subscription_end_date({}, "yearly")

    now = datetime.utcnow()
    assert timedelta(days=29) < (monthly - now) < timedelta(days=31)
    assert timedelta(days=364) < (yearly - now) < timedelta(days=366)


# ── _apply_activation idempotency & no-shorten guard ─────────────────────────
# These test the pure decision logic that prevents the concurrent
# webhook + verify-payment double-activation (duplicate email/audit) and the
# end-date-shortening bug, without needing a DB.

from routes.subscription import _apply_activation
import routes.subscription as sub_mod


class _FakeClient:
    """Stand-in for a ClientEntry with just the fields _apply_activation touches."""

    def __init__(self, status, plan_id, end_date):
        self.client_id = "client-1"
        self.subscription_status = status
        self.plan_id = plan_id
        self.subscription_end_date = end_date
        self.razorpay_subscription_id = None
        self.email = "a@b.com"
        self.client_name = "Acme"

    def to_dict(self):
        return {
            "subscription_status": self.subscription_status,
            "plan_id": self.plan_id,
            "subscription_end_date": self.subscription_end_date,
        }


def _patch_side_effects(monkeypatch):
    """Neutralise DB commit, cache, audit log and email so we test pure logic."""
    calls = {"log": 0, "email": 0}
    monkeypatch.setattr(sub_mod.db.session, "commit", lambda: None)
    monkeypatch.setattr(sub_mod, "get_cache_manager", lambda: type("C", (), {"delete": lambda self, k: None})())
    monkeypatch.setattr(sub_mod, "log_action", lambda *a, **k: calls.__setitem__("log", calls["log"] + 1))
    monkeypatch.setattr(sub_mod, "_send_lifecycle_email", lambda *a, **k: calls.__setitem__("email", calls["email"] + 1))
    return calls


def test_first_activation_emails_and_logs(monkeypatch):
    """trial -> active is a real activation: email + audit log fire exactly once."""
    calls = _patch_side_effects(monkeypatch)
    end = datetime(2026, 8, 1)
    client = _FakeClient("trial", None, None)

    _apply_activation(client, "plan-A", "monthly", end, 99900, rz_sub_id="sub_1")

    assert client.subscription_status == "active"
    assert client.subscription_end_date == end
    assert calls == {"log": 1, "email": 1}


def test_duplicate_activation_is_silent(monkeypatch):
    """Concurrent webhook+verify for the SAME period must NOT re-email or re-log."""
    calls = _patch_side_effects(monkeypatch)
    end = datetime(2026, 8, 1)
    client = _FakeClient("active", "plan-A", end)  # already active, same plan/period

    _apply_activation(client, "plan-A", "monthly", end, 99900, rz_sub_id="sub_1")

    assert calls == {"log": 0, "email": 0}, "duplicate activation must be silent"


def test_renewal_to_later_period_emails(monkeypatch):
    """A genuine renewal (later end date) IS a real event: email + log fire."""
    calls = _patch_side_effects(monkeypatch)
    old_end = datetime(2026, 8, 1)
    new_end = datetime(2026, 9, 1)
    client = _FakeClient("active", "plan-A", old_end)

    _apply_activation(client, "plan-A", "monthly", new_end, 99900, rz_sub_id="sub_1")

    assert client.subscription_end_date == new_end
    assert calls == {"log": 1, "email": 1}


def test_activation_never_shortens_end_date(monkeypatch):
    """A stale/fallback end date must never move the paid period earlier."""
    _patch_side_effects(monkeypatch)
    later = datetime(2026, 12, 1)
    earlier = datetime(2026, 8, 1)
    client = _FakeClient("active", "plan-A", later)

    _apply_activation(client, "plan-A", "monthly", earlier, 99900)

    assert client.subscription_end_date == later, "must keep the longer existing period"


# ── Reconciler decision logic (the hourly autopay safety-net) ────────────────
from services.subscription_reconciler import compute_reconciliation


def test_reconcile_missed_renewal_extends_access():
    """The core safety-net: a missed webhook renewal is caught and access extended."""
    local_end = datetime(2026, 7, 10)
    rz_end = datetime(2026, 8, 10)  # Razorpay already charged + moved the period forward

    d = compute_reconciliation("active", local_end, "active", rz_end)

    assert d["changed"] is True
    assert d["status"] == "active"
    assert d["end_date"] == rz_end


def test_reconcile_halted_marks_expired():
    d = compute_reconciliation("active", datetime(2026, 7, 10), "halted", None)
    assert d == {"status": "expired", "end_date": datetime(2026, 7, 10), "changed": True}


def test_reconcile_cancelled_keeps_end_date():
    """Cancelled at Razorpay → cancelled locally, but access stays until period end."""
    end = datetime(2026, 7, 10)
    d = compute_reconciliation("active", end, "cancelled", None)
    assert d["status"] == "cancelled"
    assert d["end_date"] == end
    assert d["changed"] is True


def test_reconcile_steady_state_is_noop():
    """Already active for the same period → no write, no churn."""
    end = datetime(2026, 8, 10)
    d = compute_reconciliation("active", end, "active", end)
    assert d["changed"] is False


def test_reconcile_never_shortens_end_date():
    """A stale Razorpay current_end must never pull the paid period earlier."""
    local_end = datetime(2026, 12, 1)
    rz_end = datetime(2026, 8, 1)
    d = compute_reconciliation("active", local_end, "active", rz_end)
    assert d["end_date"] == local_end
    assert d["changed"] is False


def test_reconcile_pending_status_is_untouched():
    """created/pending/paused are not paid states — leave local state alone."""
    end = datetime(2026, 7, 10)
    for rz in ("created", "pending", "paused"):
        d = compute_reconciliation("trial", end, rz, None)
        assert d["changed"] is False
        assert d["status"] == "trial"


# ── Dead/stale subscription id classification (soft-skip, not error) ─────────
from services.subscription_reconciler import _is_missing_subscription_error


def test_missing_subscription_error_recognised():
    """Razorpay 'invalid or could not be found' → treated as a soft-skip."""
    assert _is_missing_subscription_error(Exception("The ID provided is invalid or could not be found.")) is True
    assert _is_missing_subscription_error(Exception("No such subscription: sub_x")) is True


def test_real_error_is_not_soft_skipped():
    """Genuine failures (network, auth, 500) must still count as errors."""
    assert _is_missing_subscription_error(Exception("Connection timed out")) is False
    assert _is_missing_subscription_error(Exception("Authentication failed")) is False
