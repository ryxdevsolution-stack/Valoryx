"""
test_permissions.py — 8 test cases

Verifies that @authenticate + @require_permission work together correctly:
  - Unauthenticated requests are rejected at the auth layer.
  - Tokens lacking a permission are rejected at the permission layer.
  - Tokens carrying the required permission are admitted.
  - Super-admin tokens bypass all permission checks.

Tests use /api/stock (view_stock / add_product) and /api/billing/gst
(gst_billing) as representative permission-guarded endpoints.
"""

import json
import uuid
import pytest
from conftest import make_token, auth_hdr


# ── small helpers to avoid repetition ────────────────────────────────────────

def _tok(sample_user, sample_client, perms=None, super_admin=False):
    return make_token(
        sample_user.user_id,
        sample_client.client_id,
        permissions=perms or [],
        is_super_admin=super_admin,
    )


def _gst_body(sample_stock, qty=1):
    return {
        "customer_name": "Perm Test",
        "items": [
            {
                "product_id": str(sample_stock.product_id),
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
# Permission tests
# ═══════════════════════════════════════════════════════════════════════════════

# 1. No Authorization header → 401 (auth layer rejects before permission check)
def test_no_auth_header_rejected(http):
    resp = http.get("/api/stock")
    assert resp.status_code == 401


# 2. Token WITH 'view_stock' → 200 on GET /api/stock
def test_view_stock_permission_granted(http, sample_user, sample_client, sample_stock):
    token = _tok(sample_user, sample_client, perms=["view_stock"])
    resp = http.get("/api/stock", headers=auth_hdr(token))
    assert resp.status_code == 200


# 3. Token WITHOUT 'view_stock' → 403 on GET /api/stock
def test_view_stock_permission_denied(http, sample_user, sample_client):
    token = _tok(sample_user, sample_client, perms=[])   # no permissions
    resp = http.get("/api/stock", headers=auth_hdr(token))
    assert resp.status_code == 403
    assert "access denied" in resp.get_json().get("error", "").lower()


# 4. Token WITHOUT 'add_product' → 403 on POST /api/stock
def test_add_product_permission_denied(http, sample_user, sample_client):
    token = _tok(sample_user, sample_client, perms=["view_stock"])  # missing add_product
    body = {
        "product_name": "Blocked Item",
        "quantity": 10,
        "rate": 100.0,
    }
    resp = http.post(
        "/api/stock",
        data=json.dumps(body),
        content_type="application/json",
        headers=auth_hdr(token),
    )
    assert resp.status_code == 403


# 5. Token WITH 'add_product' → 201 on POST /api/stock
def test_add_product_permission_granted(http, sample_user, sample_client):
    token = _tok(sample_user, sample_client, perms=["add_product"])
    body = {
        "product_name": "Allowed Item",
        "quantity": 5,
        "rate": 200.0,
    }
    resp = http.post(
        "/api/stock",
        data=json.dumps(body),
        content_type="application/json",
        headers=auth_hdr(token),
    )
    assert resp.status_code == 201


# 6. Token WITH 'gst_billing' → 201 on POST /api/billing/gst
def test_gst_billing_permission_granted(http, sample_user, sample_client, sample_stock):
    token = _tok(sample_user, sample_client, perms=["gst_billing"])
    resp = http.post(
        "/api/billing/gst",
        data=json.dumps(_gst_body(sample_stock)),
        content_type="application/json",
        headers=auth_hdr(token),
    )
    assert resp.status_code == 201


# 7. Token WITHOUT 'gst_billing' → 403 on POST /api/billing/gst
def test_gst_billing_permission_denied(http, sample_user, sample_client, sample_stock):
    token = _tok(sample_user, sample_client, perms=["view_stock"])  # no gst_billing
    resp = http.post(
        "/api/billing/gst",
        data=json.dumps(_gst_body(sample_stock)),
        content_type="application/json",
        headers=auth_hdr(token),
    )
    assert resp.status_code == 403


# 8. Super-admin token bypasses permission check on all routes
def test_super_admin_bypasses_all_permissions(http, sample_user, sample_client, sample_stock):
    # Super admin with zero explicit permissions
    token = _tok(sample_user, sample_client, perms=[], super_admin=True)

    # Should access view_stock route without that permission
    resp_get = http.get("/api/stock", headers=auth_hdr(token))
    assert resp_get.status_code == 200

    # Should also access gst_billing route without that permission
    resp_bill = http.post(
        "/api/billing/gst",
        data=json.dumps(_gst_body(sample_stock)),
        content_type="application/json",
        headers=auth_hdr(token),
    )
    assert resp_bill.status_code == 201
