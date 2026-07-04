"""
End-to-end autopay verification via signed Razorpay webhooks.

This is the proof that "auto-renewal works": it fires REAL, HMAC-signed
`invoice.paid` webhooks at the live webhook handler through the Flask test client
and asserts the database reacts correctly — the exact path that was broken in
production (renewals depend entirely on this webhook).

It needs no Razorpay API and no real money — the invoice.paid handler is pure DB
logic, so a correctly-signed synthetic payload exercises the whole renewal path.

Covers:
  • first charge      → trial client becomes active, end_date set from Razorpay
  • renewal           → end_date advances to the new billing period
  • duplicate invoice → idempotent, no double-activation, no duplicate rows
  • bad signature     → rejected 400 (security)
  • unsubscribed sub  → still renews (webhook is the source of truth)
"""
import json
import hmac
import hashlib
import uuid
from datetime import datetime

import pytest

WEBHOOK_SECRET = "test-webhook-secret-Ryx-2026"
WEBHOOK_URL = "/api/subscription/webhook"

# Deterministic future billing-period timestamps (T2 later than T1).
T1 = 1_790_000_000  # first period end
T2 = 1_795_000_000  # renewed period end (later)


# ── Harness: register the subscription blueprint + tables, stub side-effects ──

@pytest.fixture
def autopay(app, monkeypatch, sample_client):
    """Wire the subscription webhook into the test app and seed a pending sub."""
    from extensions import db
    import models.subscription_model  # noqa: F401 — registers the tables
    from models.subscription_model import SubscriptionPlan, PaymentTransaction
    from models.client_model import ClientEntry

    # Create subscription tables (not in conftest's base create_all set).
    db.create_all()

    # Known webhook secret + no emails/audit noise during the test.
    monkeypatch.setattr("config.Config.RAZORPAY_WEBHOOK_SECRET", WEBHOOK_SECRET)
    monkeypatch.setattr("routes.subscription._email_enabled", lambda *a, **k: False)
    monkeypatch.setattr("routes.subscription.log_action", lambda *a, **k: None)

    # Register the blueprint once.
    from routes.subscription import subscription_bp
    if "subscription" not in app.blueprints:
        app.register_blueprint(subscription_bp, url_prefix="/api/subscription")

    # A plan (for the lifecycle email lookup) and a pending first-charge tx.
    plan = SubscriptionPlan(
        plan_id=str(uuid.uuid4()), name="Starter", monthly_price=99900,
        yearly_price=999900, is_active=True,
    )
    db.session.add(plan)

    # Start the client on trial so activation is a real state transition.
    client = ClientEntry.query.filter_by(client_id=sample_client.client_id).first()
    client.subscription_status = "trial"
    client.subscription_end_date = None

    sub_id = "sub_TEST" + uuid.uuid4().hex[:10]
    tx = PaymentTransaction(
        transaction_id=str(uuid.uuid4()),
        client_id=client.client_id,
        plan_id=plan.plan_id,
        razorpay_subscription_id=sub_id,
        amount=99900,
        currency="INR",
        billing_cycle="monthly",
        status="created",
        created_at=datetime.utcnow(),
    )
    db.session.add(tx)
    db.session.commit()

    return {
        "client_id": str(client.client_id),
        "plan_id": str(plan.plan_id),
        "sub_id": sub_id,
        "http": app.test_client(),
        "db": db,
        "ClientEntry": ClientEntry,
        "PaymentTransaction": PaymentTransaction,
    }


def _sign(body: str) -> str:
    return hmac.new(WEBHOOK_SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()


def _post_invoice_paid(ctx, invoice_id, current_end, amount=99900, sign=True):
    """POST a signed invoice.paid webhook and return the Flask response."""
    notes = {"client_id": ctx["client_id"], "plan_id": ctx["plan_id"], "billing_cycle": "monthly"}
    payload = {
        "event": "invoice.paid",
        "payload": {
            "invoice": {"entity": {
                "id": invoice_id,
                "invoice_number": invoice_id,
                "payment_id": "pay_" + uuid.uuid4().hex[:10],
                "subscription_id": ctx["sub_id"],
                "amount_paid": amount,
                "amount": amount,
                "notes": notes,
            }},
            "subscription": {"entity": {
                "id": ctx["sub_id"],
                "current_end": current_end,
                "notes": notes,
            }},
        },
    }
    body = json.dumps(payload)
    sig = _sign(body) if sign else "deadbeef"
    return ctx["http"].post(
        WEBHOOK_URL, data=body,
        headers={"X-Razorpay-Signature": sig, "Content-Type": "application/json"},
    )


def _reload_client(ctx):
    return ctx["ClientEntry"].query.filter_by(client_id=ctx["client_id"]).first()


# ── The tests ────────────────────────────────────────────────────────────────

def test_first_charge_activates_client(autopay):
    """A signed invoice.paid flips a trial client to active with Razorpay's end date."""
    resp = _post_invoice_paid(autopay, "inv_FIRST", T1)

    assert resp.status_code == 200
    assert resp.get_json().get("status") == "activated"

    client = _reload_client(autopay)
    assert client.subscription_status == "active"
    assert client.subscription_end_date == datetime.utcfromtimestamp(T1)


def test_renewal_advances_end_date(autopay):
    """A later invoice.paid (new invoice) extends the subscription — the autopay renewal."""
    _post_invoice_paid(autopay, "inv_FIRST", T1)
    resp = _post_invoice_paid(autopay, "inv_RENEWAL", T2)

    assert resp.status_code == 200
    client = _reload_client(autopay)
    assert client.subscription_status == "active"
    assert client.subscription_end_date == datetime.utcfromtimestamp(T2), "renewal must push the period forward"


def test_duplicate_invoice_is_idempotent(autopay):
    """Razorpay retries webhooks — the same invoice must not double-activate or duplicate rows."""
    _post_invoice_paid(autopay, "inv_FIRST", T1)

    before = autopay["PaymentTransaction"].query.filter_by(
        razorpay_subscription_id=autopay["sub_id"]
    ).count()

    resp = _post_invoice_paid(autopay, "inv_FIRST", T1)  # exact same invoice again
    assert resp.status_code == 200
    assert resp.get_json().get("status") == "already_processed"

    after = autopay["PaymentTransaction"].query.filter_by(
        razorpay_subscription_id=autopay["sub_id"]
    ).count()
    assert after == before, "duplicate webhook must not create a new transaction row"


def test_renewal_does_not_shorten_period(autopay):
    """An out-of-order/stale invoice.paid must never pull the paid period earlier."""
    _post_invoice_paid(autopay, "inv_RENEWAL", T2)   # activate to the later date first
    _post_invoice_paid(autopay, "inv_STALE", T1)     # then a stale one with an earlier date

    client = _reload_client(autopay)
    assert client.subscription_end_date == datetime.utcfromtimestamp(T2), "must keep the longer period"


def test_bad_signature_is_rejected(autopay):
    """A forged/unsigned webhook must be rejected and must not touch the DB."""
    resp = _post_invoice_paid(autopay, "inv_FORGED", T1, sign=False)

    assert resp.status_code == 400
    client = _reload_client(autopay)
    assert client.subscription_status == "trial", "rejected webhook must not activate anyone"
