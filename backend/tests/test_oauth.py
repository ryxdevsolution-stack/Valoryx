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
            "verified_email": True,
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
            "verified_email": True,
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


# ═══════════════════════════════════════════════════════════════════════════
# Desktop Google OAuth handoff (signed-assertion bridge into the offline app)
# ═══════════════════════════════════════════════════════════════════════════

# A fixed PKCE pair used across the desktop tests.
_VERIFIER = "test-pkce-verifier-0123456789abcdef"


def _challenge_for(verifier):
    return oauth_mod._pkce_challenge(verifier)


def _desktop_login(http, assertion, verifier=_VERIFIER):
    body = {"assertion": assertion}
    if verifier is not None:
        body["verifier"] = verifier
    return http.post(
        "/api/oauth/desktop-login",
        data=json.dumps(body),
        content_type="application/json",
        headers={"User-Agent": "pytest-agent"},
    )


def _assertion(email, google_id, *, challenge=None):
    return oauth_mod._issue_desktop_assertion(
        email=email, google_id=google_id,
        challenge=challenge if challenge is not None else _challenge_for(_VERIFIER),
    )


# 5. Desktop-flagged callback returns a signed assertion, NOT a web session.
def test_desktop_callback_returns_assertion_not_token(http, monkeypatch):
    monkeypatch.setattr(oauth_mod.Config, "DESKTOP_OAUTH_SECRET", "test-desktop-secret")
    state = oauth_mod._issue_state_token(desktop=True, challenge=_challenge_for(_VERIFIER))
    resp = _callback(http, state=state)
    assert resp.status_code == 200, resp.get_data(as_text=True)
    data = resp.get_json()
    assert data["desktop"] is True
    assert data["assertion"]
    assert "token" not in data  # no web session is created for the desktop flow


# 5b. Desktop callback WITHOUT a PKCE challenge is rejected (binding required).
def test_desktop_callback_requires_challenge(http, monkeypatch):
    monkeypatch.setattr(oauth_mod.Config, "DESKTOP_OAUTH_SECRET", "test-desktop-secret")
    state = oauth_mod._issue_state_token(desktop=True)  # no challenge
    resp = _callback(http, state=state)
    assert resp.status_code == 400


# 6. A valid assertion + matching verifier mints a LOCAL session token.
def test_desktop_login_issues_local_token(http, monkeypatch, sample_user):
    monkeypatch.setattr(oauth_mod.Config, "DESKTOP_OAUTH_SECRET", "test-desktop-secret")
    resp = _desktop_login(http, _assertion(sample_user.email, "g-desk-1"))
    assert resp.status_code == 200, resp.get_data(as_text=True)
    data = resp.get_json()
    assert data["success"] is True
    assert data["token"]
    assert data["user"]["email"] == sample_user.email


# 6b. Right assertion but WRONG/missing verifier is rejected (PKCE binding).
def test_desktop_login_wrong_verifier_rejected(http, monkeypatch, sample_user):
    monkeypatch.setattr(oauth_mod.Config, "DESKTOP_OAUTH_SECRET", "test-desktop-secret")
    assertion = _assertion(sample_user.email, "g-desk-1b")
    assert _desktop_login(http, assertion, verifier="not-the-verifier").status_code == 401
    # And with no verifier at all
    assert _desktop_login(http, _assertion(sample_user.email, "g-desk-1c"), verifier=None).status_code == 401


# 7. Unknown email → 403 (user must already be synced to this device).
def test_desktop_login_unknown_user_rejected(http, monkeypatch):
    monkeypatch.setattr(oauth_mod.Config, "DESKTOP_OAUTH_SECRET", "test-desktop-secret")
    resp = _desktop_login(http, _assertion("nobody@nowhere.test", "g-x"))
    assert resp.status_code == 403


# 8. Replayed assertion (same nonce) is rejected on the second use.
def test_desktop_login_replay_rejected(http, monkeypatch, sample_user):
    monkeypatch.setattr(oauth_mod.Config, "DESKTOP_OAUTH_SECRET", "test-desktop-secret")
    assertion = _assertion(sample_user.email, "g-desk-2")
    first = _desktop_login(http, assertion)
    assert first.status_code == 200, first.get_data(as_text=True)
    second = _desktop_login(http, assertion)
    assert second.status_code == 401


# 9. An assertion signed with a different secret is rejected (shared-secret gate).
def test_desktop_login_wrong_secret_rejected(http, monkeypatch, sample_user):
    monkeypatch.setattr(oauth_mod.Config, "DESKTOP_OAUTH_SECRET", "secret-A")
    assertion = _assertion(sample_user.email, "g-desk-3")
    monkeypatch.setattr(oauth_mod.Config, "DESKTOP_OAUTH_SECRET", "secret-B")
    resp = _desktop_login(http, assertion)
    assert resp.status_code == 401


# 10. A tampered assertion (broken signature) is rejected.
def test_desktop_login_tampered_rejected(http, monkeypatch, sample_user):
    monkeypatch.setattr(oauth_mod.Config, "DESKTOP_OAUTH_SECRET", "test-desktop-secret")
    assertion = _assertion(sample_user.email, "g-desk-4")
    resp = _desktop_login(http, assertion + "tamper")
    assert resp.status_code == 401


# 11. Desktop login is disabled (501) when no shared secret is configured.
def test_desktop_login_disabled_without_secret(http, monkeypatch):
    monkeypatch.setattr(oauth_mod.Config, "DESKTOP_OAUTH_SECRET", "")
    resp = _desktop_login(http, "anything")
    assert resp.status_code == 501


# 12. An unverified Google email is rejected before any account link (takeover guard).
def test_unverified_google_email_rejected(http, monkeypatch):
    monkeypatch.setattr(
        oauth_mod.http_requests,
        "get",
        lambda url, *a, **k: _FakeResp({
            "id": "google-uid-unverified",
            "email": "attacker@example.com",
            "verified_email": False,
            "name": "Mallory",
            "picture": "https://lh3.googleusercontent.com/a/pic",
        }),
    )
    resp = _callback(http)
    assert resp.status_code == 400
    assert resp.get_json()["success"] is False


# ═══════════════════════════════════════════════════════════════════════════
# Regression: desktop sign-in failures must be distinguishable, and the
# desktop app must be able to reach Google without loading the SPA first.
# All three of these previously collapsed into one opaque
# "Invalid or expired sign-in" message, so a misconfigured shared secret was
# indistinguishable from a slow user.
# ═══════════════════════════════════════════════════════════════════════════

# 13. Cold start (app not running) sends no verifier — say so, don't cry "expired".
def test_desktop_login_missing_verifier_reports_cold_start(http, monkeypatch, sample_user):
    monkeypatch.setattr(oauth_mod.Config, "DESKTOP_OAUTH_SECRET", "test-desktop-secret")
    resp = _desktop_login(http, _assertion(sample_user.email, "google-uid-1"), verifier=None)
    assert resp.status_code == 401
    body = resp.get_json()
    assert body["reason"] == "no_verifier"
    assert "not running" in body["error"].lower()


# 14. A genuinely expired assertion is reported as expired, not as a bad key.
def test_desktop_login_expired_reports_expired(http, monkeypatch, sample_user):
    monkeypatch.setattr(oauth_mod.Config, "DESKTOP_OAUTH_SECRET", "test-desktop-secret")
    monkeypatch.setattr(oauth_mod, "DESKTOP_ASSERTION_TTL", -1)
    monkeypatch.setattr(oauth_mod, "DESKTOP_CLOCK_SKEW_LEEWAY", 0)
    resp = _desktop_login(http, _assertion(sample_user.email, "google-uid-1"))
    assert resp.status_code == 401
    assert resp.get_json()["reason"] == "expired"


# 15. A secret mismatch between cloud and installer is named as such — this is
#     the failure that used to burn a support cycle guessing.
def test_desktop_login_secret_mismatch_reports_bad_signature(http, monkeypatch, sample_user):
    good = _assertion(sample_user.email, "google-uid-1")
    monkeypatch.setattr(oauth_mod.Config, "DESKTOP_OAUTH_SECRET", "a-completely-different-secret-value")
    resp = _desktop_login(http, good)
    assert resp.status_code == 401
    assert resp.get_json()["reason"] == "bad_signature"


# 16. Modest clock skew must NOT reject an assertion that was just minted.
def test_desktop_login_tolerates_clock_skew(http, monkeypatch, sample_user):
    monkeypatch.setattr(oauth_mod.Config, "DESKTOP_OAUTH_SECRET", "test-desktop-secret")
    # Assertion already 30s past its own exp; leeway must absorb it.
    monkeypatch.setattr(oauth_mod, "DESKTOP_ASSERTION_TTL", -30)
    resp = _desktop_login(http, _assertion(sample_user.email, "google-uid-1"))
    assert resp.status_code == 200, resp.get_json()


# 17. redirect=1 sends the browser straight to Google, with no Origin/Referer
#     (a top-level navigation opened by the desktop app).
def test_authorize_redirect_goes_straight_to_google(http, monkeypatch):
    monkeypatch.setattr(oauth_mod.Config, "GOOGLE_CLIENT_ID", "test-client-id.apps.googleusercontent.com")
    # A top-level navigation carries no Origin/Referer, so the endpoint falls back
    # to the configured public URL — which must itself be an allowed origin.
    monkeypatch.setattr(oauth_mod.Config, "FRONTEND_URL", _TEST_ORIGIN)
    monkeypatch.setenv("CORS_ORIGINS", _TEST_ORIGIN)
    resp = http.get("/api/oauth/google/authorize?desktop=valoryx&challenge=abc&redirect=1")
    assert resp.status_code == 302
    assert resp.headers["Location"].startswith("https://accounts.google.com/")
    assert "prompt=select_account" in resp.headers["Location"]


# 18. Without redirect=1 the endpoint still returns JSON for the web SPA.
def test_authorize_without_redirect_still_returns_json(http, monkeypatch):
    monkeypatch.setattr(oauth_mod.Config, "GOOGLE_CLIENT_ID", "test-client-id.apps.googleusercontent.com")
    monkeypatch.setenv("CORS_ORIGINS", _TEST_ORIGIN)
    resp = http.get("/api/oauth/google/authorize", headers={"Origin": _TEST_ORIGIN})
    assert resp.status_code == 200
    assert resp.get_json()["auth_url"].startswith("https://accounts.google.com/")
