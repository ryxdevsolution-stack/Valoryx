"""Tests for the `use_membership` permission (migration v49 + bill-create gate).

- v49 creates the permission and grants it once to every user who can bill,
  so gating the Create Bill membership panel doesn't silently strip access.
- /api/billing/create rejects a membership_card_id from a user without it.
"""
import json
import uuid

from sqlalchemy import text

from conftest import make_token, auth_hdr, _bcrypt


def _bill_body(product_id, card_id=None):
    body = {
        "customer_name": "Member Customer",
        "items": [{
            "product_id": str(product_id),
            "product_name": "Widget",
            "quantity": 1,
            "rate": 100.0,
            "gst_percentage": 0,
            "gst_amount": 0,
            "amount": 100.0,
            "item_code": "WDG-001",
            "unit": "pcs",
        }],
        "payment_type": json.dumps([{"payment_type": "Cash", "amount": 100.0}]),
        "amount_received": 100.0,
        "payment_status": "paid",
    }
    if card_id:
        body["membership_card_id"] = card_id
    return body


def _post(http, body, headers):
    return http.post("/api/billing/create", data=json.dumps(body),
                     content_type="application/json", headers=headers)


# ── Bill-create gate ──────────────────────────────────────────────────────────

def test_bill_with_card_rejected_without_permission(http, sample_stock, gst_headers):
    resp = _post(http, _bill_body(sample_stock.product_id, card_id=str(uuid.uuid4())), gst_headers)
    assert resp.status_code == 403
    assert "use_membership" in resp.get_json()["message"]


def test_bill_without_card_unaffected(http, sample_stock, gst_headers):
    resp = _post(http, _bill_body(sample_stock.product_id), gst_headers)
    assert resp.status_code in (200, 201), resp.get_json()


def test_bill_with_card_allowed_with_permission(http, sample_stock, sample_user, sample_client):
    headers = auth_hdr(make_token(
        sample_user.user_id, sample_client.client_id,
        permissions=["gst_billing", "non_gst_billing", "use_membership"],
    ))
    # Unknown card id → membership hooks no-op; the point is it isn't a 403.
    resp = _post(http, _bill_body(sample_stock.product_id, card_id=str(uuid.uuid4())), headers)
    assert resp.status_code in (200, 201), resp.get_json()


# ── Migration v49 backfill ────────────────────────────────────────────────────

def _make_user(db, client_id, role):
    from models.user_model import User
    uid = str(uuid.uuid4())
    db.session.add(User(
        user_id=uid, client_id=client_id, email=f"{role}-{uid[:8]}@valoryx-test.invalid",
        password_hash=_bcrypt("x"), full_name=role, role=role, is_active=True,
        is_super_admin=False, invite_accepted=True, totp_enabled=False,
    ))
    db.session.commit()
    return uid


def _grant(db, uid, perm_name):
    from models.permission_model import Permission, UserPermission
    perm = Permission.query.filter_by(permission_name=perm_name).first()
    db.session.add(UserPermission(id=str(uuid.uuid4()), user_id=uid, permission_id=perm.permission_id))
    db.session.commit()


def _has(db, uid):
    return db.session.execute(text(
        "SELECT 1 FROM user_permissions up JOIN permissions p ON p.permission_id = up.permission_id "
        "WHERE up.user_id = :u AND p.permission_name = 'use_membership'"
    ), {'u': uid}).fetchone() is not None


def test_m049_grants_to_billing_users_only_and_is_idempotent(app, sample_client):
    from extensions import db
    from models.permission_model import Permission
    from migrations.runner import _m049_use_membership_permission

    with app.app_context():
        # Simulate a pre-v49 database: permission not yet present.
        Permission.query.filter_by(permission_name='use_membership').delete()
        db.session.commit()

        gst_user = _make_user(db, sample_client.client_id, 'staff')
        non_gst_user = _make_user(db, sample_client.client_id, 'staff')
        no_billing_user = _make_user(db, sample_client.client_id, 'staff')
        _grant(db, gst_user, 'gst_billing')
        _grant(db, non_gst_user, 'non_gst_billing')
        _grant(db, no_billing_user, 'view_stock')

        _m049_use_membership_permission(db)
        db.session.expire_all()

        assert Permission.query.filter_by(permission_name='use_membership').count() == 1
        assert _has(db, gst_user)
        assert _has(db, non_gst_user)
        assert not _has(db, no_billing_user)

        # Re-run: no duplicate permission, no duplicate grants (unique constraint would raise).
        _m049_use_membership_permission(db)
        db.session.expire_all()
        assert Permission.query.filter_by(permission_name='use_membership').count() == 1
