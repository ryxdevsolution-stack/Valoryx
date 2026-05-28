"""
test_stock.py — 10 test cases

CRUD tests for the /api/stock endpoints:
  - List returns current inventory.
  - Adding a new product creates a row and returns 201.
  - Adding the same product name sums the quantity (upsert behaviour).
  - Missing required field returns 400.
  - PUT updates individual fields on an existing product.
  - PUT on a non-existent / wrong-client product returns 404.
  - DELETE removes the product and returns 200.
  - DELETE on an already-deleted product returns 404.
  - Search filter narrows the list result.
"""

import json
import uuid
import pytest
from extensions import db
from conftest import make_token, auth_hdr


# ── fixture: token with all stock permissions ─────────────────────────────────

@pytest.fixture
def stock_headers(sample_user, sample_client):
    token = make_token(
        sample_user.user_id,
        sample_client.client_id,
        permissions=["view_stock", "add_product", "edit_product_details"],
    )
    return auth_hdr(token)


# ── helpers ───────────────────────────────────────────────────────────────────

def _add_product(http, headers, name, qty, rate=100.0, gst=18.0):
    body = {
        "product_name": name,
        "quantity": qty,
        "rate": rate,
        "gst_percentage": gst,
        "unit": "pcs",
        "low_stock_alert": 5,
    }
    return http.post(
        "/api/stock",
        data=json.dumps(body),
        content_type="application/json",
        headers=headers,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Stock CRUD tests
# ═══════════════════════════════════════════════════════════════════════════════

# 1. GET /api/stock with no products returns empty list
def test_list_stock_empty(http, stock_headers, sample_client):
    resp = http.get("/api/stock", headers=stock_headers)
    assert resp.status_code == 200
    assert resp.get_json()["stock"] == []


# 2. GET /api/stock after inserting a product returns that product
def test_list_stock_returns_existing(http, stock_headers, sample_stock):
    resp = http.get("/api/stock", headers=stock_headers)
    assert resp.status_code == 200
    pids = [p["product_id"] for p in resp.get_json()["stock"]]
    assert str(sample_stock.product_id) in pids


# 3. POST /api/stock creates a new product → 201 with product_id
def test_add_product_creates_new(http, stock_headers):
    resp = _add_product(http, stock_headers, "Gadget Alpha", 20, rate=250.0)
    assert resp.status_code == 201
    data = resp.get_json()
    assert data["success"] is True
    assert "product_id" in data


# 4. POST /api/stock missing required field → 400
def test_add_product_missing_field(http, stock_headers):
    body = {"product_name": "Incomplete"}   # missing quantity and rate
    resp = http.post(
        "/api/stock",
        data=json.dumps(body),
        content_type="application/json",
        headers=stock_headers,
    )
    assert resp.status_code == 400


# 5. POST /api/stock same product name → auto-sum: quantity increases, returns 200
def test_add_product_same_name_sums_quantity(http, stock_headers):
    # First addition — creates the product
    resp1 = _add_product(http, stock_headers, "Shared Item", 10)
    assert resp1.status_code == 201
    pid = resp1.get_json()["product_id"]

    # Second addition — upserts (qty should become 10+5=15)
    resp2 = _add_product(http, stock_headers, "Shared Item", 5)
    assert resp2.status_code == 200   # 200 = update, not 201 create

    from models.stock_model import StockEntry
    db.session.expire_all()
    entry = StockEntry.query.filter_by(product_id=pid).first()
    assert entry.quantity == 15


# 6. PUT /api/stock/<id> updates rate and returns 200
def test_update_stock_rate(http, stock_headers, sample_stock):
    new_rate = 999.0
    resp = http.put(
        f"/api/stock/{sample_stock.product_id}",
        data=json.dumps({"rate": new_rate}),
        content_type="application/json",
        headers=stock_headers,
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["success"] is True
    assert float(data["product"]["rate"]) == new_rate


# 7. PUT /api/stock/<id> updates quantity field correctly
def test_update_stock_quantity(http, stock_headers, sample_stock):
    resp = http.put(
        f"/api/stock/{sample_stock.product_id}",
        data=json.dumps({"quantity": 77}),
        content_type="application/json",
        headers=stock_headers,
    )
    assert resp.status_code == 200

    db.session.expire_all()
    from models.stock_model import StockEntry
    entry = StockEntry.query.filter_by(
        product_id=str(sample_stock.product_id)
    ).first()
    assert entry.quantity == 77


# 8. PUT /api/stock/<id> on a non-existent product → 404
def test_update_nonexistent_product(http, stock_headers):
    fake_id = str(uuid.uuid4())
    resp = http.put(
        f"/api/stock/{fake_id}",
        data=json.dumps({"rate": 1.0}),
        content_type="application/json",
        headers=stock_headers,
    )
    assert resp.status_code == 404


# 9. DELETE /api/stock/<id> removes the product → 200
def test_delete_product_success(http, stock_headers, sample_stock):
    # Save the ID now; after delete + expire_all the ORM object is invalidated.
    pid = str(sample_stock.product_id)

    resp = http.delete(f"/api/stock/{pid}", headers=stock_headers)
    assert resp.status_code == 200
    assert resp.get_json()["success"] is True

    # Confirm it's gone
    from models.stock_model import StockEntry
    db.session.expire_all()
    assert StockEntry.query.filter_by(product_id=pid).first() is None


# 11. POST /api/stock — created_by is captured from the authenticated user
def test_stock_creation_captures_created_by(http, stock_headers, sample_user, sample_client):
    """When a user adds stock, created_by should equal their user_id."""
    from models.stock_model import StockEntry
    from extensions import db

    resp = _add_product(http, stock_headers, "Test Widget X", 10, rate=50.0, gst=18.0)
    assert resp.status_code == 201, resp.get_json()

    db.session.expire_all()
    stock = StockEntry.query.filter_by(product_name="Test Widget X").first()
    assert stock is not None
    assert str(stock.created_by) == str(sample_user.user_id)


# 10. GET /api/stock?search=<term> filters results by product name
def test_list_stock_search_filter(http, stock_headers):
    from models.stock_model import StockEntry
    from conftest import make_token, auth_hdr

    # Add two products with distinct names
    resp1 = _add_product(http, stock_headers, "Banana Bread", 10)
    assert resp1.status_code == 201
    resp2 = _add_product(http, stock_headers, "Cherry Tart", 10)
    assert resp2.status_code == 201

    resp = http.get("/api/stock?search=banana", headers=stock_headers)
    assert resp.status_code == 200
    names = [p["product_name"].lower() for p in resp.get_json()["stock"]]
    assert any("banana" in n for n in names)
    assert not any("cherry" in n for n in names)


def test_stock_creation_persists_added_by_label(http, sample_user, sample_client, stock_headers):
    """When add_stock includes added_by_label, the column gets persisted."""
    from models.stock_model import StockEntry

    payload = {
        'product_name': 'AddedByLabel Test Widget',
        'quantity': 5,
        'rate': 75.0,
        'gst_percentage': 18,
        'added_by_label': 'Ramesh',
    }
    resp = http.post(
        '/api/stock',
        data=json.dumps(payload),
        content_type='application/json',
        headers=stock_headers,
    )
    assert resp.status_code in (200, 201), resp.get_json()

    stock = StockEntry.query.filter_by(product_name='Addedbylabel Test Widget').first() \
        or StockEntry.query.filter_by(product_name='AddedByLabel Test Widget').first()
    assert stock is not None
    assert stock.added_by_label == 'Ramesh'
