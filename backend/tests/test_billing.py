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
