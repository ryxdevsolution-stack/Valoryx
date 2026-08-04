"""
Partial payment on customer bills (v42).

The scenario this feature exists for: a customer buys ₹5000 of goods, pays
₹3000 at the till, and returns days later with the ₹2000. The bill must carry
Total / Paid / Balance, the status must be derived from AMOUNTS (never the
client's word), every payment must land in the bill_payments ledger, and each
mutation must re-queue the bill for sync.
"""
import json
import uuid
import pytest
from conftest import make_token, auth_hdr

from routes.billing import _derive_payment_state


# ─────────────────────────────────────────────────────────────────────────────
# Section A — status derivation (pure, no I/O)
# ─────────────────────────────────────────────────────────────────────────────

def test_derive_full_payment_is_paid():
    paid, status = _derive_payment_state({'paid_amount': 5000}, 5000)
    assert (paid, status) == (5000.0, 'paid')


def test_derive_partial_payment():
    paid, status = _derive_payment_state({'paid_amount': 3000}, 5000)
    assert (paid, status) == (3000.0, 'partial')


def test_derive_zero_is_pending():
    paid, status = _derive_payment_state({'paid_amount': 0}, 5000)
    assert (paid, status) == (0.0, 'pending')


def test_derive_overpayment_is_clamped_to_total():
    """A client claiming to have paid more than the bill must not create a
    negative balance or inflate revenue."""
    paid, status = _derive_payment_state({'paid_amount': 9999}, 5000)
    assert (paid, status) == (5000.0, 'paid')


def test_derive_negative_is_clamped_to_pending():
    paid, status = _derive_payment_state({'paid_amount': -50}, 5000)
    assert (paid, status) == (0.0, 'pending')


def test_derive_client_status_is_ignored_when_amount_present():
    """The exact attack/bug this guards: client says 'paid' but sent ₹3000 of
    ₹5000. Amounts win."""
    paid, status = _derive_payment_state(
        {'paid_amount': 3000, 'payment_status': 'paid'}, 5000)
    assert status == 'partial'


def test_derive_legacy_client_without_paid_amount():
    """Old clients only send payment_status — preserve their binary behaviour."""
    assert _derive_payment_state({'payment_status': 'pending'}, 5000) == (0.0, 'pending')
    assert _derive_payment_state({'payment_status': 'paid'}, 5000) == (5000.0, 'paid')
    assert _derive_payment_state({}, 5000) == (5000.0, 'paid')


def test_derive_paise_tolerance_counts_as_paid():
    """4999.995 vs 5000 is float noise, not an outstanding balance."""
    paid, status = _derive_payment_state({'paid_amount': 4999.995}, 5000)
    assert status == 'paid'


# ─────────────────────────────────────────────────────────────────────────────
# Section B — HTTP flow (create partial → receive balance → settled)
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def billing_headers(sample_user, sample_client):
    token = make_token(
        sample_user.user_id,
        sample_client.client_id,
        permissions=["gst_billing", "non_gst_billing", "add_product",
                     "view_stock", "edit_bill_details"],
    )
    return auth_hdr(token)


def _partial_bill_body(product_id, qty=10, rate=500.0, paid=3000):
    """A ₹5000-ish GST bill paying `paid` now (item total 10 × 500 = 5000 + GST)."""
    return {
        "customer_name": "Partial Customer",
        "customer_phone": "9876500000",
        "items": [{
            "product_id": str(product_id),
            "product_name": "Widget",
            "quantity": qty,
            "rate": rate,
            "gst_percentage": 18.0,
            "unit": "pcs",
        }],
        "payment_type": json.dumps([{"payment_type": "Cash", "amount": paid}]),
        "amount_received": paid,
        "paid_amount": paid,
        "payment_status": "partial",
        "is_gst_bill": True,
    }


def _create_partial(http, sample_stock, headers, paid=3000):
    resp = http.post("/api/billing/create",
                     data=json.dumps(_partial_bill_body(sample_stock.product_id, paid=paid)),
                     content_type="application/json", headers=headers)
    assert resp.status_code == 201, resp.get_json()
    return resp.get_json()


def test_create_partial_bill_records_status_and_ledger(http, sample_stock, billing_headers):
    from models.billing_model import GSTBilling, BillPayment

    data = _create_partial(http, sample_stock, billing_headers)
    bill_id = data["bill_id"]

    assert data["bill"]["payment_status"] == "partial"
    assert float(data["bill"]["paid_amount"]) == 3000.0
    total = float(data["final_amount"])
    assert float(data["bill"]["balance_due"]) == round(total - 3000.0, 2)

    bill = GSTBilling.query.filter_by(bill_id=bill_id).first()
    assert bill.payment_status == "partial"
    assert float(bill.paid_amount) == 3000.0

    ledger = BillPayment.query.filter_by(bill_id=bill_id).all()
    assert len(ledger) == 1
    assert float(ledger[0].amount) == 3000.0
    assert ledger[0].payment_method == "Cash"
    assert ledger[0].bill_kind == "gst"


def test_receive_balance_settles_the_bill(http, sample_stock, billing_headers):
    from models.billing_model import GSTBilling, BillPayment
    from extensions import db

    data = _create_partial(http, sample_stock, billing_headers)
    bill_id = data["bill_id"]
    balance = float(data["bill"]["balance_due"])

    # Simulate the bill having already synced, so we can prove the payment
    # re-queues it (synced_at must go back to NULL — the sync invariant).
    bill = GSTBilling.query.filter_by(bill_id=bill_id).first()
    from datetime import datetime
    bill.synced_at = datetime.utcnow()
    db.session.commit()

    resp = http.post(f"/api/billing/{bill_id}/payments",
                     data=json.dumps({"amount": balance, "payment_method": "UPI"}),
                     content_type="application/json", headers=billing_headers)
    assert resp.status_code == 200, resp.get_json()
    out = resp.get_json()

    assert out["bill"]["payment_status"] == "paid"
    assert float(out["bill"]["balance_due"]) == 0.0

    db.session.expire_all()
    bill = GSTBilling.query.filter_by(bill_id=bill_id).first()
    assert bill.payment_status == "paid"
    assert bill.synced_at is None, "settlement must re-queue the bill for sync"

    # Ledger now shows both events with their own methods.
    ledger = BillPayment.query.filter_by(bill_id=bill_id).order_by(BillPayment.created_at).all()
    assert [float(p.amount) for p in ledger] == [3000.0, balance]
    assert ledger[1].payment_method == "UPI"

    # And the splits JSON gained the second payment for display parsers.
    splits = json.loads(bill.payment_type)
    assert splits[-1]["payment_type"] == "UPI"
    assert float(splits[-1]["amount"]) == balance


def test_overpayment_is_rejected(http, sample_stock, billing_headers):
    data = _create_partial(http, sample_stock, billing_headers)
    balance = float(data["bill"]["balance_due"])

    resp = http.post(f"/api/billing/{data['bill_id']}/payments",
                     data=json.dumps({"amount": balance + 100, "payment_method": "Cash"}),
                     content_type="application/json", headers=billing_headers)
    assert resp.status_code == 400
    assert "exceeds" in resp.get_json()["error"].lower()


def test_payment_on_fully_paid_bill_is_rejected(http, sample_stock, billing_headers):
    data = _create_partial(http, sample_stock, billing_headers, paid=3000)
    balance = float(data["bill"]["balance_due"])
    http.post(f"/api/billing/{data['bill_id']}/payments",
              data=json.dumps({"amount": balance, "payment_method": "Cash"}),
              content_type="application/json", headers=billing_headers)

    resp = http.post(f"/api/billing/{data['bill_id']}/payments",
                     data=json.dumps({"amount": 1, "payment_method": "Cash"}),
                     content_type="application/json", headers=billing_headers)
    assert resp.status_code == 400
    assert "already" in resp.get_json()["error"].lower()


def test_payment_history_endpoint_lists_all_payments(http, sample_stock, billing_headers):
    data = _create_partial(http, sample_stock, billing_headers)
    bill_id = data["bill_id"]
    http.post(f"/api/billing/{bill_id}/payments",
              data=json.dumps({"amount": 500, "payment_method": "UPI"}),
              content_type="application/json", headers=billing_headers)

    resp = http.get(f"/api/billing/{bill_id}/payments", headers=billing_headers)
    assert resp.status_code == 200
    payments = resp.get_json()["payments"]
    assert [float(p["amount"]) for p in payments] == [3000.0, 500.0]


def test_mark_paid_records_the_settlement_in_the_ledger(http, sample_stock, billing_headers):
    """mark-paid used to be a silent status flip that never synced and left no
    trace of the money. It must now write the ledger row and re-queue sync."""
    from models.billing_model import GSTBilling, BillPayment
    from extensions import db

    data = _create_partial(http, sample_stock, billing_headers)
    bill_id = data["bill_id"]
    balance = float(data["bill"]["balance_due"])

    resp = http.put(f"/api/billing/{bill_id}/mark-paid", headers=billing_headers)
    assert resp.status_code == 200

    db.session.expire_all()
    bill = GSTBilling.query.filter_by(bill_id=bill_id).first()
    assert bill.payment_status == "paid"
    assert float(bill.paid_amount) == float(bill.final_amount)
    assert bill.synced_at is None

    ledger = BillPayment.query.filter_by(bill_id=bill_id).all()
    assert len(ledger) == 2
    assert float(ledger[-1].amount) == balance


# ─────────────────────────────────────────────────────────────────────────────
# Section C — reporting must count MONEY RECEIVED, not whole bills
# ─────────────────────────────────────────────────────────────────────────────

def test_daily_summary_splits_a_partial_bill_between_revenue_and_pending(app, sample_client):
    """The money bug this guards: before v42 a 'partial' bill counted its FULL
    amount as revenue (it simply wasn't 'pending'), overstating takings by the
    outstanding balance. Revenue + pending must always equal what was billed."""
    from datetime import date
    from extensions import db
    from models.billing_model import GSTBilling
    from services.daily_summary_service import compute_daily_summary
    import uuid as _uuid

    with app.app_context():
        cid = sample_client.client_id
        db.session.add(GSTBilling(
            bill_id=str(_uuid.uuid4()), client_id=cid, bill_number=7101,
            items=[], subtotal=5000, gst_percentage=0, gst_amount=0,
            final_amount=5000, payment_type='[]', status='final',
            payment_status='partial', paid_amount=3000,
        ))
        db.session.commit()

        summary = compute_daily_summary(cid, date.today())

        assert summary['total_revenue'] == 3000.0, "only the money received is revenue"
        assert summary['pending_amount'] == 2000.0, "the balance is outstanding, not revenue"
        assert summary['total_revenue'] + summary['pending_amount'] == 5000.0


def test_daily_summary_still_handles_legacy_rows_without_paid_amount(app, sample_client):
    """Pre-v42 rows have paid_amount NULL — they must keep the old binary
    behaviour rather than reading as fully unpaid."""
    from datetime import date
    from extensions import db
    from models.billing_model import GSTBilling
    from services.daily_summary_service import compute_daily_summary
    import uuid as _uuid

    with app.app_context():
        cid = sample_client.client_id
        db.session.add(GSTBilling(
            bill_id=str(_uuid.uuid4()), client_id=cid, bill_number=7102,
            items=[], subtotal=800, gst_percentage=0, gst_amount=0,
            final_amount=800, payment_type='[]', status='final',
            payment_status='paid', paid_amount=None,
        ))
        db.session.commit()

        summary = compute_daily_summary(cid, date.today())
        assert summary['total_revenue'] == 800.0
        assert summary['pending_amount'] == 0.0
