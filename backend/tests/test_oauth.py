"""
test_oauth.py — Google OAuth callback regression tests

Guards the two bugs that broke Google sign-in in production:

1. `client_ip` NameError — a refactor that removed the per-IP rate limiter
   also deleted the `client_ip` definition, but two later uses survived.
   Every successful callback then crashed with a 500 at session creation.
   Tests 1-2 drive the callback far enough to hit those uses.

2. Redirect-URI / SPA-route contract — the backend hands Google a
   `<origin>/frontend/oauth/callback` redirect URI. The React SPA must have a
   route at that exact path or Google's redirect lands on a blank page.
   Test 3 pins the path so a change here forces a matching frontend route.

Google's network calls (token exchange + userinfo) are mocked — no real
requests leave the test process.
"""

import json
import os

import pytest

import routes.oauth as oauth_mod
from extensions import db
from models.user_model import User

_TEST_ORIGIN = "https://app.test"


# ── Google network mocks ─────────────────────────────────────────────────────

class _FakeResp:
    def __init__(self, payload, *, ok=True, status_code=200, text=""):
        self._payload = payload
        self.ok = ok
        self.status_code = status_code
        self.text = text

    def json(self):
        return self._payload


@pytest.fixture(autouse=True)
def mock_google(monkeypatch):
    """Patch the token-exchange POST and userinfo GET to Google."""
    # CORS_ORIGINS is read from the env directly by _get_redirect_uri().
    monkeypatch.setenv("CORS_ORIGINS", _TEST_ORIGIN)

    def _fake_post(url, *a, **k):
        return _FakeResp({"access_token": "fake-access-token"})

    monkeypatch.setattr(oauth_mod.http_requests, "post", _fake_post)
    # Default userinfo — individual tests override the email/id as needed.
    monkeypatch.setattr(
        oauth_mod.http_requests,
        "get",
        lambda url, *a, **k: _FakeResp({
            "id": "google-uid-new-001",
            "email": "brand-new@example.com",
            "name": "Brand New",
            "picture": "https://lh3.googleusercontent.com/a/pic",
        }),
    )


def _callback(http, *, code="auth-code-123", state=None):
    if state is None:
        state = oauth_mod._issue_state_token()
    return http.post(
        "/api/oauth/google/callback",
        data=json.dumps({"code": code, "state": state}),
        content_type="application/json",
        headers={"Origin": _TEST_ORIGIN, "User-Agent": "pytest-agent"},
    )


# ═══════════════════════════════════════════════════════════════════════════
# Regression: the callback must complete without a client_ip NameError
# ═══════════════════════════════════════════════════════════════════════════

# 1. New Google user → 200, JWT issued, user provisioned (hits client_ip twice)
def test_new_google_user_completes_without_nameerror(http):
    resp = _callback(http)

    assert resp.status_code == 200, resp.get_data(as_text=True)
    data = resp.get_json()
    assert data["success"] is True
    assert data["token"]
    assert data["user"]["email"] == "brand-new@example.com"

    # User was actually persisted with the linked Google id.
    user = User.query.filter_by(google_id="google-uid-new-001").first()
    assert user is not None
    assert user.role == "owner"


# 2. Existing email gets linked to Google → 200 (also exercises client_ip)
def test_existing_user_links_google_id(http, monkeypatch, sample_user):
    monkeypatch.setattr(
        oauth_mod.http_requests,
        "get",
        lambda url, *a, **k: _FakeResp({
            "id": "google-uid-link-002",
            "email": sample_user.email,
            "name": "Linked User",
            "picture": "https://lh3.googleusercontent.com/a/pic",
        }),
    )

    resp = _callback(http)

    assert resp.status_code == 200, resp.get_data(as_text=True)
    db.session.expire(sample_user)
    refreshed = User.query.filter_by(user_id=sample_user.user_id).first()
    assert refreshed.google_id == "google-uid-link-002"


# 3. Invalid state token is rejected before any Google call (CSRF guard intact)
def test_invalid_state_is_rejected(http):
    resp = _callback(http, state="not-a-valid-jwt")
    assert resp.status_code == 400
    assert resp.get_json()["success"] is False


# ═══════════════════════════════════════════════════════════════════════════
# Contract: redirect URI path must match the frontend SPA route
# ═══════════════════════════════════════════════════════════════════════════

# 4. The redirect URI the backend sends Google must end in the exact path the
#    React router registers. If this assertion fails, update the matching
#    <Route> in frontend-react/src/router.tsx (or vice versa) — otherwise
#    Google's post-consent redirect lands on a blank, unmatched route.
def test_redirect_uri_path_matches_frontend_route(app, monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", _TEST_ORIGIN)
    with app.test_request_context(headers={"Origin": _TEST_ORIGIN}):
        uri = oauth_mod._get_redirect_uri()
    assert uri == f"{_TEST_ORIGIN}/frontend/oauth/callback"
