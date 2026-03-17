"""
test_stock_billing.py — 8 test cases

Verifies the atomic stock-reduction that happens inside bill creation:
  - Stock quantity decreases exactly by the billed quantity (GST and non-GST paths).
  - Insufficient stock blocks the bill and leaves stock unchanged.
  - Multi-item bills reduce every product correctly.
  - Two sequential bills accumulate the reductions.
  - Stock is clamped to 0 when the bill exactly matches available quantity.
"""

import json
import uuid
import pytest
from extensions import db


# ── helpers ────────────────────────────────────────────────────────────────────

def _post_gst(http, product_id, qty, headers):
    body = {
        "customer_name": "Stock Test",
        "items": [
            {
                "product_id": str(product_id),
                "product_name": "Widget",
                "quantity": qty,
                "rate": 500.0,
                "gst_percentage": 18.0,
                "gst_amount": round(qty * 500.0 * 0.18, 2),
                "amount": round(qty * 500.0 * 1.18, 2),
                "item_code": "WDG-001",
                "unit": "pcs",
                "hsn_code": "8471",
            }
        ],
        "subtotal": qty * 500.0,
        "gst_percentage": 18.0,
        "payment_type": "cash",
    }
    return http.post(
        "/api/billing/gst",
        data=json.dumps(body),
        content_type="application/json",
        headers=headers,
    )


def _post_nongst(http, product_id, qty, headers):
    body = {
        "customer_name": "Stock Test",
        "items": [
            {
                "product_id": str(product_id),
                "product_name": "Widget",
                "quantity": qty,
                "rate": 500.0,
                "amount": qty * 500.0,
            }
        ],
        "total_amount": qty * 500.0,
        "payment_type": "upi",
    }
    return http.post(
        "/api/billing/non-gst",
        data=json.dumps(body),
        content_type="application/json",
        headers=headers,
    )


def _refresh_stock(product_id):
    from models.stock_model import StockEntry
    db.session.expire_all()
    return StockEntry.query.filter_by(product_id=str(product_id)).first()


# ── tests ──────────────────────────────────────────────────────────────────────

# 1. GST bill reduces stock by the billed quantity
def test_gst_bill_reduces_stock(http, sample_stock, gst_headers):
    initial_qty = sample_stock.quantity     # 50
    resp = _post_gst(http, sample_stock.product_id, 5, gst_headers)
    assert resp.status_code == 201

    after = _refresh_stock(sample_stock.product_id)
    assert after.quantity == initial_qty - 5


# 2. Non-GST bill reduces stock by the billed quantity
def test_nongst_bill_reduces_stock(http, sample_stock, gst_headers):
    initial_qty = sample_stock.quantity
    resp = _post_nongst(http, sample_stock.product_id, 3, gst_headers)
    assert resp.status_code == 201

    after = _refresh_stock(sample_stock.product_id)
    assert after.quantity == initial_qty - 3


# 3. Insufficient stock blocks bill creation — stock stays unchanged
def test_insufficient_stock_blocks_bill(http, sample_stock, gst_headers):
    initial_qty = sample_stock.quantity
    resp = _post_gst(http, sample_stock.product_id, initial_qty + 100, gst_headers)
    assert resp.status_code == 400

    after = _refresh_stock(sample_stock.product_id)
    assert after.quantity == initial_qty    # unchanged


# 4. Multi-item bill reduces each product's stock independently
def test_multi_item_bill_reduces_each_product(http, sample_client, gst_headers):
    from models.stock_model import StockEntry

    # Create two products
    pid_a = str(uuid.uuid4())
    pid_b = str(uuid.uuid4())
    for pid, name, qty in [(pid_a, "Alpha", 20), (pid_b, "Beta", 30)]:
        db.session.add(StockEntry(
            product_id=pid,
            client_id=sample_client.client_id,
            product_name=name,
            quantity=qty,
            rate=100.0,
            gst_percentage=18.0,
            unit="pcs",
            low_stock_alert=5,
        ))
    db.session.commit()

    body = {
        "customer_name": "Multi Test",
        "items": [
            {
                "product_id": pid_a,
                "product_name": "Alpha",
                "quantity": 4,
                "rate": 100.0,
                "gst_percentage": 18.0,
                "gst_amount": 72.0,
                "amount": 472.0,
                "unit": "pcs",
            },
            {
                "product_id": pid_b,
                "product_name": "Beta",
                "quantity": 7,
                "rate": 100.0,
                "gst_percentage": 18.0,
                "gst_amount": 126.0,
                "amount": 826.0,
                "unit": "pcs",
            },
        ],
        "subtotal": 1100.0,
        "gst_percentage": 18.0,
        "payment_type": "card",
    }
    resp = http.post(
        "/api/billing/gst",
        data=json.dumps(body),
        content_type="application/json",
        headers=gst_headers,
    )
    assert resp.status_code == 201

    db.session.expire_all()
    a = StockEntry.query.filter_by(product_id=pid_a).first()
    b = StockEntry.query.filter_by(product_id=pid_b).first()
    assert a.quantity == 16   # 20 - 4
    assert b.quantity == 23   # 30 - 7


# 5. Two sequential bills accumulate reductions correctly
def test_two_sequential_bills_accumulate_reductions(http, sample_stock, gst_headers):
    initial_qty = sample_stock.quantity     # 50

    resp1 = _post_gst(http, sample_stock.product_id, 10, gst_headers)
    assert resp1.status_code == 201
    resp2 = _post_gst(http, sample_stock.product_id, 15, gst_headers)
    assert resp2.status_code == 201

    after = _refresh_stock(sample_stock.product_id)
    assert after.quantity == initial_qty - 25   # 50 - 10 - 15


# 6. Second bill fails when remaining stock is less than requested
def test_second_bill_fails_when_stock_depleted(http, sample_stock, gst_headers):
    initial_qty = sample_stock.quantity     # 50

    # First bill: buy most of the stock
    resp1 = _post_gst(http, sample_stock.product_id, 45, gst_headers)
    assert resp1.status_code == 201

    # Second bill: only 5 remain, trying to buy 10 → should fail
    resp2 = _post_gst(http, sample_stock.product_id, 10, gst_headers)
    assert resp2.status_code == 400

    after = _refresh_stock(sample_stock.product_id)
    assert after.quantity == initial_qty - 45   # only first bill committed


# 7. Bill for exactly available quantity reduces stock to zero
def test_bill_reduces_stock_to_zero(http, sample_stock, gst_headers):
    qty = sample_stock.quantity   # 50
    resp = _post_gst(http, sample_stock.product_id, qty, gst_headers)
    assert resp.status_code == 201

    after = _refresh_stock(sample_stock.product_id)
    assert after.quantity == 0


# 8. Bill with zero-quantity item is rejected (validate_items check)
def test_bill_rejects_zero_quantity_item(http, sample_stock, gst_headers):
    body = {
        "customer_name": "Zero Qty Test",
        "items": [
            {
                "product_id": str(sample_stock.product_id),
                "product_name": "Widget",
                "quantity": 0,
                "rate": 500.0,
                "amount": 0.0,
            }
        ],
        "subtotal": 0.0,
        "gst_percentage": 18.0,
        "payment_type": "cash",
    }
    resp = http.post(
        "/api/billing/gst",
        data=json.dumps(body),
        content_type="application/json",
        headers=gst_headers,
    )
    assert resp.status_code == 400
