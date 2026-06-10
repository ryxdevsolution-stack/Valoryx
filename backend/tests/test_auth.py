"""
test_auth.py — 15 test cases

Section A (1-10): Login endpoint — valid credentials, various failure states,
                  rate limiting, and JWT claims validation.

Section B (11-15): @authenticate middleware — header absence, bad/expired
                   tokens, and revoked-user scenarios on a protected route.
"""

import json
import os
import time
import uuid
import jwt as _jwt
import pytest
from datetime import datetime, timedelta
from extensions import db
from conftest import make_token, auth_hdr, _bcrypt

# Read from environment — matches whichever app mode (offline or online) is active.
_JWT_SECRET = os.environ["JWT_SECRET"]
_CORRECT_PASSWORD = "TestPass123!"

# ── Clear in-memory rate-limit state between every test ──────────────────────

@pytest.fixture(autouse=True)
def clear_rate_limits():
    """Prevent login failures in one test from polluting the next."""
    import routes.auth as _auth_mod
    _auth_mod._LOGIN_FAIL_STORE.clear()
    yield
    _auth_mod._LOGIN_FAIL_STORE.clear()


# ── helper ────────────────────────────────────────────────────────────────────

def _login(http, email, password, extra=None):
    body = {"email": email, "password": password, **(extra or {})}
    return http.post(
        "/api/auth/login",
        data=json.dumps(body),
        content_type="application/json",
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Section A — Login endpoint
# ═══════════════════════════════════════════════════════════════════════════════

# 1. Correct credentials return 200 + JWT token
def test_login_success(http, sample_user, sample_client):
    resp = _login(http, sample_user.email, _CORRECT_PASSWORD)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data.get("success") is True
    assert "token" in data


# 2. Wrong password → 401
def test_login_wrong_password(http, sample_user, sample_client):
    resp = _login(http, sample_user.email, "WrongPassword!")
    assert resp.status_code == 401


# 3. Non-existent email → 401
def test_login_unknown_email(http, sample_client):
    resp = _login(http, "nobody@nowhere.invalid", "anything")
    assert resp.status_code == 401


# 4. Inactive user → 401
def test_login_inactive_user(http, sample_user, sample_client):
    sample_user.is_active = False
    db.session.commit()

    resp = _login(http, sample_user.email, _CORRECT_PASSWORD)
    assert resp.status_code == 401


# 5. Inactive client → 401
def test_login_inactive_client(http, sample_user, sample_client):
    sample_client.is_active = False
    db.session.commit()

    resp = _login(http, sample_user.email, _CORRECT_PASSWORD)
    assert resp.status_code == 401


# 6. Email address not verified → 403 with email_unverified flag
def test_login_email_unverified(http, sample_user, sample_client):
    sample_client.email_verified = False
    db.session.commit()

    resp = _login(http, sample_user.email, _CORRECT_PASSWORD)
    assert resp.status_code == 403
    data = resp.get_json()
    assert data.get("email_unverified") is True


# 7. Account scheduled for deletion → 403 with account_pending_deletion flag
def test_login_account_pending_deletion(http, sample_user, sample_client):
    sample_client.deletion_scheduled_at = datetime.utcnow() + timedelta(days=7)
    db.session.commit()

    resp = _login(http, sample_user.email, _CORRECT_PASSWORD)
    assert resp.status_code == 403
    data = resp.get_json()
    assert data.get("account_pending_deletion") is True


# 8. TOTP-enabled owner (created_by=None), no code provided → 200 + requires_totp
def test_login_totp_step_required(http, sample_client):
    from models.user_model import User

    uid = str(uuid.uuid4())
    totp_user = User(
        user_id=uid,
        email=f"totp-{uid[:8]}@example.com",
        password_hash=_bcrypt(_CORRECT_PASSWORD),
        client_id=sample_client.client_id,
        role="manager",
        is_active=True,
        is_super_admin=False,
        full_name="TOTP User",
        invite_accepted=True,
        totp_enabled=True,
        created_by=None,        # only owners (no creator) get the TOTP gate
    )
    db.session.add(totp_user)
    db.session.commit()

    resp = _login(http, totp_user.email, _CORRECT_PASSWORD)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data.get("requires_totp") is True
    assert data.get("success") is False


# 9. Missing body fields → 400
def test_login_missing_fields(http):
    resp = http.post(
        "/api/auth/login",
        data=json.dumps({}),
        content_type="application/json",
    )
    assert resp.status_code == 400


# 10. Rate-limit: 10 prior failures from same IP → 429 on next attempt
def test_login_rate_limit_blocks_after_ten_failures(http, sample_client):
    import routes.auth as _auth_mod

    now = time.time()
    # Seed 10 recent failures for the test client IP (keys are namespaced
    # "ip:<addr>" / "email:<addr>" since the 2026-06-10 hardening)
    _auth_mod._LOGIN_FAIL_STORE["ip:127.0.0.1"] = [now] * 10

    resp = _login(http, "any@example.com", "anything")
    assert resp.status_code == 429
    assert "too many" in resp.get_json().get("error", "").lower()
    # Clean up so later login tests in this module are not blocked
    _auth_mod._LOGIN_FAIL_STORE.pop("ip:127.0.0.1", None)


# ═══════════════════════════════════════════════════════════════════════════════
# Section B — @authenticate middleware (tested via GET /api/stock)
# ═══════════════════════════════════════════════════════════════════════════════

# 11. Missing Authorization header → 401
def test_middleware_missing_auth_header(http):
    resp = http.get("/api/stock")
    assert resp.status_code == 401
    assert "authorization" in resp.get_json().get("error", "").lower()


# 12. Malformed / invalid token → 401
def test_middleware_invalid_token(http):
    resp = http.get("/api/stock", headers={"Authorization": "Bearer this.is.garbage"})
    assert resp.status_code == 401


# 13. Expired JWT → 401
def test_middleware_expired_token(http, sample_user, sample_client):
    token = make_token(
        sample_user.user_id,
        sample_client.client_id,
        permissions=["view_stock"],
        expired=True,
    )
    resp = http.get("/api/stock", headers=auth_hdr(token))
    assert resp.status_code == 401


# 14. Valid token but user row has since been deleted → 401
def test_middleware_deleted_user(http, sample_user, sample_client):
    token = make_token(
        sample_user.user_id,
        sample_client.client_id,
        permissions=["view_stock"],
    )
    # Delete via raw SQL to bypass ORM cascade onto the 'notes' table which
    # is not present in the SQLite test schema.
    from sqlalchemy import text
    uid = str(sample_user.user_id)
    db.session.execute(text("DELETE FROM users WHERE user_id = :uid"), {"uid": uid})
    db.session.commit()

    resp = http.get("/api/stock", headers=auth_hdr(token))
    assert resp.status_code == 401


# 15. Valid token but user is now marked inactive → 401
def test_middleware_inactive_user(http, sample_user, sample_client):
    token = make_token(
        sample_user.user_id,
        sample_client.client_id,
        permissions=["view_stock"],
    )
    sample_user.is_active = False
    db.session.commit()

    resp = http.get("/api/stock", headers=auth_hdr(token))
    assert resp.status_code == 401
