"""
test_isolation.py — 6 test cases

Multi-tenant data isolation: verifies that one client's JWT cannot read,
write, or accidentally modify another client's stock or billing data.
"""

import json
import uuid
import pytest
from extensions import db
from conftest import make_token, auth_hdr


# ── second-client headers ─────────────────────────────────────────────────────

@pytest.fixture
def second_headers(second_user, second_client):
    token = make_token(
        second_user.user_id,
        second_client.client_id,
        permissions=["gst_billing", "non_gst_billing", "add_product", "view_stock"],
    )
    return auth_hdr(token)


# ── helpers ───────────────────────────────────────────────────────────────────

def _gst_bill_body(product_id, qty=1):
    return {
        "customer_name": "Isolation Test",
        "items": [
            {
                "product_id": str(product_id),
                "product_name": "Widget",
                "quantity": qty,
                "rate": 500.0,
                "gst_percentage": 18.0,
                "gst_amount": round(qty * 500.0 * 0.18, 2),
                "amount": round(qty * 500.0 * 1.18, 2),
                "unit": "pcs",
            }
        ],
        "subtotal": qty * 500.0,
        "gst_percentage": 18.0,
        "payment_type": "cash",
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Isolation tests
# ═══════════════════════════════════════════════════════════════════════════════

# 1. Client A's token returns only Client A's stock
def test_stock_list_scoped_to_client_a(http, gst_headers, sample_stock, second_stock):
    resp = http.get("/api/stock", headers=gst_headers)
    assert resp.status_code == 200

    pids = [p["product_id"] for p in resp.get_json()["stock"]]
    assert str(sample_stock.product_id) in pids
    assert str(second_stock.product_id) not in pids


# 2. Client B's token returns only Client B's stock
def test_stock_list_scoped_to_client_b(http, second_headers, sample_stock, second_stock):
    resp = http.get("/api/stock", headers=second_headers)
    assert resp.status_code == 200

    pids = [p["product_id"] for p in resp.get_json()["stock"]]
    assert str(second_stock.product_id) in pids
    assert str(sample_stock.product_id) not in pids


# 3. Billing with Client A's token using Client B's product_id → 404
def test_billing_cannot_use_cross_tenant_product(http, gst_headers, second_stock):
    """Client A cannot bill a product that belongs to Client B."""
    body = _gst_bill_body(second_stock.product_id, qty=1)
    resp = http.post(
        "/api/billing/gst",
        data=json.dumps(body),
        content_type="application/json",
        headers=gst_headers,
    )
    # Billing route filters: StockEntry.product_id IN [...] AND client_id == token.client_id
    # Client B's product is not found for Client A → 404
    assert resp.status_code == 404


# 4. Billing with Client B's token using Client A's product_id → 404
def test_billing_cannot_use_other_client_product(
    http, second_headers, sample_stock
):
    """Client B cannot bill a product that belongs to Client A."""
    body = _gst_bill_body(sample_stock.product_id, qty=1)
    resp = http.post(
        "/api/billing/gst",
        data=json.dumps(body),
        content_type="application/json",
        headers=second_headers,
    )
    assert resp.status_code == 404


# 5. Successful Client A bill does NOT affect Client B's stock
def test_billing_reduces_only_own_client_stock(
    http, gst_headers, sample_stock, second_stock
):
    initial_b = second_stock.quantity          # Client B stock before A bills

    body = _gst_bill_body(sample_stock.product_id, qty=5)
    resp = http.post(
        "/api/billing/gst",
        data=json.dumps(body),
        content_type="application/json",
        headers=gst_headers,
    )
    assert resp.status_code == 201

    db.session.expire_all()
    from models.stock_model import StockEntry

    b_after = StockEntry.query.filter_by(
        product_id=str(second_stock.product_id)
    ).first()
    assert b_after.quantity == initial_b   # Client B's stock is untouched


# 6. Two clients can have products with the same name; each sees only their own
def test_same_product_name_in_two_clients_is_isolated(
    http, gst_headers, second_headers, sample_client, second_client
):
    from models.stock_model import StockEntry

    shared_name = "Duplicate Product"
    for cid in [sample_client.client_id, second_client.client_id]:
        db.session.add(StockEntry(
            product_id=str(uuid.uuid4()),
            client_id=cid,
            product_name=shared_name,
            quantity=10,
            rate=100.0,
            gst_percentage=0.0,
            unit="pcs",
            low_stock_alert=2,
        ))
    db.session.commit()

    resp_a = http.get("/api/stock", headers=gst_headers)
    resp_b = http.get("/api/stock", headers=second_headers)

    names_a = [p["product_name"] for p in resp_a.get_json()["stock"]]
    names_b = [p["product_name"] for p in resp_b.get_json()["stock"]]

    # Both see the shared name, but only inside their own namespace
    assert shared_name in names_a
    assert shared_name in names_b

    pids_a = {p["product_id"] for p in resp_a.get_json()["stock"]}
    pids_b = {p["product_id"] for p in resp_b.get_json()["stock"]}
    assert pids_a.isdisjoint(pids_b)       # zero product_id overlap
