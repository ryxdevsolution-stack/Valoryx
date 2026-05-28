"""
test_billing.py — 13 test cases

Section A (1-5):  Pure helper-function unit tests — Decimal math, rounding, validation.
                  No DB, no HTTP. Fast and deterministic.
Section B (6-13): HTTP endpoint tests — GST/non-GST bill creation via the Flask test client.
"""

import json
import uuid
import pytest
from decimal import Decimal

# ─────────────────────────────────────────────────────────────────────────────
# Section A — Pure calculation helpers (no I/O, no fixtures needed)
# ─────────────────────────────────────────────────────────────────────────────

from utils.helpers import calculate_gst_amount, calculate_final_amount, validate_items


# 1. Standard 18% GST on a round number
def test_gst_18_percent_round():
    result = calculate_gst_amount(1000, 18)
    assert result == Decimal("180.00")


# 2. 5% GST slab
def test_gst_5_percent():
    result = calculate_gst_amount(1000, 5)
    assert result == Decimal("50.00")


# 3. 12% GST slab
def test_gst_12_percent():
    result = calculate_gst_amount(500, 12)
    assert result == Decimal("60.00")


# 4. 28% GST slab
def test_gst_28_percent():
    result = calculate_gst_amount(1000, 28)
    assert result == Decimal("280.00")


# 5. Decimal rounding — 333.33 × 18% = 59.9994 → rounds to 60.00
def test_gst_rounding():
    result = calculate_gst_amount(333.33, 18)
    # 333.33 * 0.18 = 59.9994 → round to 2dp → 60.00
    assert result == Decimal("60.00")


# 6. calculate_final_amount adds subtotal + gst correctly
def test_final_amount_addition():
    gst = calculate_gst_amount(1000, 18)          # 180.00
    final = calculate_final_amount(1000, gst)      # 1180.00
    assert final == Decimal("1180.00")


# 7. validate_items: valid item list returns (True, None)
def test_validate_items_valid():
    items = [
        {
            "product_id": str(uuid.uuid4()),
            "product_name": "Widget",
            "quantity": 2,
            "rate": 500.0,
            "amount": 1000.0,
        }
    ]
    ok, msg = validate_items(items)
    assert ok is True
    assert msg is None


# 8. validate_items: missing required field returns (False, message)
def test_validate_items_missing_product_id():
    items = [{"product_name": "Widget", "quantity": 2, "rate": 500.0, "amount": 1000.0}]
    ok, msg = validate_items(items)
    assert ok is False
    assert "product_id" in msg


# 9. validate_items: zero quantity is invalid
def test_validate_items_zero_quantity():
    items = [
        {
            "product_id": str(uuid.uuid4()),
            "product_name": "Widget",
            "quantity": 0,
            "rate": 500.0,
            "amount": 0.0,
        }
    ]
    ok, msg = validate_items(items)
    assert ok is False
    assert "quantity" in msg.lower()


# ─────────────────────────────────────────────────────────────────────────────
# Section B — HTTP endpoint tests
# ─────────────────────────────────────────────────────────────────────────────

def _gst_body(product_id):
    return {
        "customer_name": "John Doe",
        "customer_phone": "9876543210",
        "items": [
            {
                "product_id": str(product_id),
                "product_name": "Widget",
                "quantity": 2,
                "rate": 500.0,
                "gst_percentage": 18.0,
                "gst_amount": 180.0,
                "amount": 1180.0,
                "item_code": "WDG-001",
                "unit": "pcs",
                "hsn_code": "8471",
            }
        ],
        "subtotal": 1000.0,
        "gst_percentage": 18.0,
        "payment_type": "cash",
    }


def _create_gst_bill(http, sample_stock, gst_headers):
    """Create a GST bill and return (bill_id, body)."""
    body = _gst_body(sample_stock.product_id)
    resp = http.post(
        "/api/billing/gst",
        data=json.dumps(body),
        content_type="application/json",
        headers=gst_headers,
    )
    assert resp.status_code == 201, resp.get_json()
    return resp.get_json()["bill_id"], body


def _nongst_body(product_id):
    return {
        "customer_name": "Jane Doe",
        "items": [
            {
                "product_id": str(product_id),
                "product_name": "Widget",
                "quantity": 1,
                "rate": 500.0,
                "amount": 500.0,
            }
        ],
        "total_amount": 500.0,
        "payment_type": "upi",
    }


# 10. POST /api/billing/gst — happy path creates bill, returns 201 with bill_id
def test_create_gst_bill_success(http, sample_stock, gst_headers):
    body = _gst_body(sample_stock.product_id)
    resp = http.post(
        "/api/billing/gst",
        data=json.dumps(body),
        content_type="application/json",
        headers=gst_headers,
    )
    assert resp.status_code == 201
    data = resp.get_json()
    assert data["success"] is True
    assert "bill_id" in data


# 11. POST /api/billing/gst — missing required field returns 400
def test_create_gst_bill_missing_field(http, sample_stock, gst_headers):
    body = _gst_body(sample_stock.product_id)
    del body["subtotal"]   # remove required field
    resp = http.post(
        "/api/billing/gst",
        data=json.dumps(body),
        content_type="application/json",
        headers=gst_headers,
    )
    assert resp.status_code == 400
    assert "subtotal" in resp.get_json().get("error", "").lower()


# 12. POST /api/billing/gst — requesting more than available stock returns 400
def test_create_gst_bill_insufficient_stock(http, sample_stock, gst_headers):
    body = _gst_body(sample_stock.product_id)
    body["items"][0]["quantity"] = 999   # way more than stock (50)
    body["subtotal"] = 999 * 500.0
    resp = http.post(
        "/api/billing/gst",
        data=json.dumps(body),
        content_type="application/json",
        headers=gst_headers,
    )
    assert resp.status_code == 400
    assert "insufficient" in resp.get_json().get("error", "").lower()


# 13. POST /api/billing/non-gst — happy path returns 201
def test_create_non_gst_bill_success(http, sample_stock, gst_headers):
    body = _nongst_body(sample_stock.product_id)
    resp = http.post(
        "/api/billing/non-gst",
        data=json.dumps(body),
        content_type="application/json",
        headers=gst_headers,
    )
    assert resp.status_code == 201
    data = resp.get_json()
    assert data["success"] is True
    assert "bill_id" in data


def test_audit_only_user_cannot_edit_customer_name(http, sample_stock, gst_headers, audit_only_headers):
    """A user with ONLY edit_bill_price_audit cannot change customer_name."""
    bill_id, body = _create_gst_bill(http, sample_stock, gst_headers)
    resp = http.put(
        f"/api/billing/{bill_id}",
        data=json.dumps({
            "items": body["items"],
            "customer_name": "EVIL HACKER",  # not allowed
            "subtotal": body["subtotal"],
            "gst_percentage": body["gst_percentage"],
            "payment_type": body["payment_type"],
        }),
        content_type="application/json",
        headers=audit_only_headers,
    )
    assert resp.status_code == 400, resp.get_json()
    assert "pricing fields" in resp.get_json().get("error", "").lower()


def test_audit_only_user_can_edit_pricing_fields(http, sample_stock, gst_headers, audit_only_headers):
    """A user with ONLY edit_bill_price_audit CAN edit item rate."""
    bill_id, body = _create_gst_bill(http, sample_stock, gst_headers)
    items = [dict(i) for i in body["items"]]
    items[0]["rate"] = float(items[0]["rate"]) + 10.0
    resp = http.put(
        f"/api/billing/{bill_id}",
        data=json.dumps({
            "items": items,
            "subtotal": body["subtotal"],
            "gst_percentage": body["gst_percentage"],
            "payment_type": body["payment_type"],
        }),
        content_type="application/json",
        headers=audit_only_headers,
    )
    assert resp.status_code == 200, resp.get_json()


# 14. PUT /api/billing/<id> — edit_bill_price_audit permission is accepted
def test_update_bill_accepts_edit_bill_price_audit_permission(http, sample_stock, gst_headers, audit_only_headers):
    """A user with ONLY edit_bill_price_audit (no edit_bill_details) can call PUT /api/billing/<id>."""
    bill_id, body = _create_gst_bill(http, sample_stock, gst_headers)
    resp = http.put(
        f"/api/billing/{bill_id}",
        data=json.dumps({
            "items": body["items"],
            "subtotal": body["subtotal"],
            "gst_percentage": body["gst_percentage"],
            "payment_type": body["payment_type"],
        }),
        content_type="application/json",
        headers=audit_only_headers,
    )
    assert resp.status_code == 200, resp.get_json()
    assert resp.get_json()["success"] is True


def test_scope_audit_only_writes_to_audit_overrides(http, sample_stock, gst_headers, audit_only_headers):
    """scope=audit_only writes to audit_overrides JSON and does NOT touch items."""
    from models.billing_model import GSTBilling

    bill_id, body = _create_gst_bill(http, sample_stock, gst_headers)
    items = [dict(i) for i in body["items"]]
    new_rate = float(items[0]["rate"]) + 25.0
    items[0]["rate"] = new_rate
    items[0]["amount"] = new_rate * float(items[0]["quantity"]) * 1.18  # placeholder amount

    resp = http.put(
        f"/api/billing/{bill_id}?scope=audit_only",
        data=json.dumps({
            "items": items,
            "subtotal": body["subtotal"],
            "gst_percentage": body["gst_percentage"],
            "payment_type": body["payment_type"],
        }),
        content_type="application/json",
        headers=audit_only_headers,
    )
    assert resp.status_code == 200, resp.get_json()
    assert resp.get_json()["scope"] == "audit_only"

    bill = GSTBilling.query.filter_by(bill_id=bill_id).first()
    # items should be UNCHANGED
    assert float(bill.items[0]["rate"]) == float(body["items"][0]["rate"]), "items must not change in audit_only mode"
    # audit_overrides should hold the corrected rate
    assert bill.audit_overrides is not None
    assert float(bill.audit_overrides[0]["rate"]) == new_rate


def test_scope_apply_writes_to_items_and_clears_overrides(http, sample_stock, gst_headers, audit_only_headers):
    """scope=apply mutates items and clears any prior audit_overrides."""
    from extensions import db
    from models.billing_model import GSTBilling

    bill_id, body = _create_gst_bill(http, sample_stock, gst_headers)

    # First: write an audit_only override
    items = [dict(i) for i in body["items"]]
    items[0]["rate"] = float(items[0]["rate"]) + 5.0
    http.put(
        f"/api/billing/{bill_id}?scope=audit_only",
        data=json.dumps({"items": items, "subtotal": body["subtotal"],
                         "gst_percentage": body["gst_percentage"], "payment_type": body["payment_type"]}),
        content_type="application/json",
        headers=audit_only_headers,
    )

    # Confirm override is set
    bill = GSTBilling.query.filter_by(bill_id=bill_id).first()
    assert bill.audit_overrides is not None

    # Then: apply with a different rate
    items2 = [dict(i) for i in body["items"]]
    new_rate = float(items2[0]["rate"]) + 99.0
    items2[0]["rate"] = new_rate
    resp = http.put(
        f"/api/billing/{bill_id}?scope=apply",
        data=json.dumps({"items": items2, "subtotal": body["subtotal"],
                         "gst_percentage": body["gst_percentage"], "payment_type": body["payment_type"]}),
        content_type="application/json",
        headers=audit_only_headers,
    )
    assert resp.status_code == 200, resp.get_json()
    assert resp.get_json()["scope"] == "apply"

    db.session.expire_all()
    bill = GSTBilling.query.filter_by(bill_id=bill_id).first()
    # items should now reflect the apply
    assert float(bill.items[0]["rate"]) == new_rate
    # audit_overrides should be cleared
    assert bill.audit_overrides is None


def test_default_scope_is_apply(http, sample_stock, gst_headers, audit_only_headers):
    """Omitting ?scope defaults to apply (back-compat with existing PUT consumers)."""
    from models.billing_model import GSTBilling

    bill_id, body = _create_gst_bill(http, sample_stock, gst_headers)
    items = [dict(i) for i in body["items"]]
    new_rate = float(items[0]["rate"]) + 10.0
    items[0]["rate"] = new_rate

    resp = http.put(
        f"/api/billing/{bill_id}",  # no ?scope query param
        data=json.dumps({"items": items, "subtotal": body["subtotal"],
                         "gst_percentage": body["gst_percentage"], "payment_type": body["payment_type"]}),
        content_type="application/json",
        headers=audit_only_headers,
    )
    assert resp.status_code == 200, resp.get_json()

    bill = GSTBilling.query.filter_by(bill_id=bill_id).first()
    assert float(bill.items[0]["rate"]) == new_rate  # items were updated → default is apply
