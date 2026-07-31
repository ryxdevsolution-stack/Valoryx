"""
Electron first-run setup — identity paths.

Covers POST /api/electron/setup accepting EITHER email + password OR a
cloud-signed, PKCE-bound Google assertion.

The Google path exists because users who signed up with Google hold a random
bcrypt hash they can never type (google_callback's dummy_pw), which locked them
out of the "Connect Your Account" screen on a fresh install entirely.

Supabase is never touched: _fetch_supabase_user / _fetch_from_supabase are
patched, so these tests assert routing, identity checks and error contracts —
not SQL.
"""

import json
import bcrypt
import pytest

from routes import electron as electron_mod
from routes import oauth as oauth_mod

_SECRET = "test-desktop-secret-for-setup"
_VERIFIER = "setup-pkce-verifier-0123456789abcdef"
_CLIENT_ID = "11111111-2222-3333-4444-555555555555"


# ── fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _clean_rate_limit_state():
    """The setup endpoint allows 5 requests per 5 minutes per IP, and the store
    is module-level — without this, later tests in the file 429 instead of
    exercising what they claim to."""
    from utils import rate_limiter as rl
    rl._STORE.clear()
    yield
    rl._STORE.clear()


class _DummyEngine:
    """Stands in for the Supabase engine. Connecting would mean a real network
    call, so it is an error here — every query path must be patched."""

    def __init__(self):
        self.disposed = False

    def connect(self):
        raise AssertionError("test attempted a real Supabase connection")

    def dispose(self):
        self.disposed = True


@pytest.fixture
def supabase(monkeypatch):
    """Patch out everything that talks to Supabase and record what setup did."""
    engine = _DummyEngine()
    recorded = {"engine": engine, "imported": None, "fetched_client_id": None}

    monkeypatch.setenv("DB_URL", "postgresql://fake-host/fake-db")
    monkeypatch.setattr(electron_mod, "create_engine", lambda *a, **k: engine)

    def _fetch(_engine, client_id):
        recorded["fetched_client_id"] = client_id
        return {"users": []}

    def _import(data):
        recorded["imported"] = data

    monkeypatch.setattr(electron_mod, "_fetch_from_supabase", _fetch)
    monkeypatch.setattr(electron_mod, "_import_data", _import)
    return recorded


def _row(**overrides):
    row = {
        "user_id": "99999999-8888-7777-6666-555555555555",
        "client_id": _CLIENT_ID,
        "password_hash": bcrypt.hashpw(b"CorrectHorse1", bcrypt.gensalt()).decode(),
        "is_active": True,
        "deleted_at": None,
        "google_id": "",
    }
    row.update(overrides)
    return row


def _user_is(monkeypatch, row):
    monkeypatch.setattr(electron_mod, "_fetch_supabase_user", lambda _e, _email: row)


def _assertion(email, google_id, *, challenge=None):
    return oauth_mod._issue_desktop_assertion(
        email=email,
        google_id=google_id,
        challenge=challenge if challenge is not None else oauth_mod._pkce_challenge(_VERIFIER),
    )


def _post(http, body):
    return http.post(
        "/api/electron/setup",
        data=json.dumps(body),
        content_type="application/json",
    )


def _post_google(http, assertion, verifier=_VERIFIER):
    body = {"assertion": assertion}
    if verifier is not None:
        body["verifier"] = verifier
    return _post(http, body)


# ── needs-setup advertises whether the Google button can work ───────────────

def test_needs_setup_reports_google_enabled(http, monkeypatch):
    monkeypatch.setattr(oauth_mod.Config, "DESKTOP_OAUTH_SECRET", _SECRET)
    data = http.get("/api/electron/needs-setup").get_json()
    assert data["google_enabled"] is True


def test_needs_setup_reports_google_disabled_without_secret(http, monkeypatch):
    monkeypatch.setattr(oauth_mod.Config, "DESKTOP_OAUTH_SECRET", "")
    data = http.get("/api/electron/needs-setup").get_json()
    assert data["google_enabled"] is False


# ── Google identity path ────────────────────────────────────────────────────

def test_google_assertion_completes_setup(http, monkeypatch, supabase):
    monkeypatch.setattr(oauth_mod.Config, "DESKTOP_OAUTH_SECRET", _SECRET)
    _user_is(monkeypatch, _row(google_id="g-setup-1"))

    resp = _post_google(http, _assertion("google.user@example.com", "g-setup-1"))

    assert resp.status_code == 200, resp.get_data(as_text=True)
    assert resp.get_json()["success"] is True
    # It resolved the right tenant and actually imported what it fetched.
    assert supabase["fetched_client_id"] == _CLIENT_ID
    assert supabase["imported"] == {"users": []}


def test_google_setup_never_mints_a_session(http, monkeypatch, supabase):
    """Design decision: setup syncs data only. The user signs in afterwards on
    the normal login screen, which works once the local user exists."""
    monkeypatch.setattr(oauth_mod.Config, "DESKTOP_OAUTH_SECRET", _SECRET)
    _user_is(monkeypatch, _row(google_id="g-setup-2"))

    data = _post_google(http, _assertion("google.user@example.com", "g-setup-2")).get_json()

    assert "token" not in data
    assert "user" not in data


def test_google_assertion_without_verifier_rejected(http, monkeypatch, supabase):
    """Cold start: the app was not running when the deep link arrived, so the
    in-memory verifier is gone. PKCE binding must still be enforced."""
    monkeypatch.setattr(oauth_mod.Config, "DESKTOP_OAUTH_SECRET", _SECRET)
    _user_is(monkeypatch, _row())

    resp = _post_google(http, _assertion("a@b.test", "g-x"), verifier=None)

    assert resp.status_code == 401
    assert resp.get_json()["reason"] == "no_verifier"


def test_google_assertion_wrong_verifier_rejected(http, monkeypatch, supabase):
    monkeypatch.setattr(oauth_mod.Config, "DESKTOP_OAUTH_SECRET", _SECRET)
    _user_is(monkeypatch, _row())

    resp = _post_google(http, _assertion("a@b.test", "g-x"), verifier="not-the-verifier")

    assert resp.status_code == 401
    assert resp.get_json()["reason"] == "pkce_mismatch"


def test_google_assertion_replay_rejected(http, monkeypatch, supabase):
    """The nonce cache is shared with /oauth/desktop-login, so an assertion is
    single-use across both endpoints."""
    monkeypatch.setattr(oauth_mod.Config, "DESKTOP_OAUTH_SECRET", _SECRET)
    _user_is(monkeypatch, _row(google_id="g-replay"))
    assertion = _assertion("replay@example.com", "g-replay")

    assert _post_google(http, assertion).status_code == 200
    second = _post_google(http, assertion)

    assert second.status_code == 401
    assert second.get_json()["reason"] == "replayed"


def test_google_assertion_spent_on_setup_cannot_be_reused_for_login(http, monkeypatch, supabase):
    monkeypatch.setattr(oauth_mod.Config, "DESKTOP_OAUTH_SECRET", _SECRET)
    _user_is(monkeypatch, _row(google_id="g-cross"))
    assertion = _assertion("cross@example.com", "g-cross")

    assert _post_google(http, assertion).status_code == 200
    login = http.post(
        "/api/oauth/desktop-login",
        data=json.dumps({"assertion": assertion, "verifier": _VERIFIER}),
        content_type="application/json",
        headers={"User-Agent": "pytest-agent"},
    )

    assert login.status_code == 401
    assert login.get_json()["reason"] == "replayed"


def test_google_assertion_signed_with_wrong_secret_rejected(http, monkeypatch, supabase):
    monkeypatch.setattr(oauth_mod.Config, "DESKTOP_OAUTH_SECRET", "secret-A")
    assertion = _assertion("a@b.test", "g-x")
    monkeypatch.setattr(oauth_mod.Config, "DESKTOP_OAUTH_SECRET", "secret-B")
    _user_is(monkeypatch, _row())

    resp = _post_google(http, assertion)

    assert resp.status_code == 401
    assert resp.get_json()["reason"] == "bad_signature"


def test_google_path_unavailable_without_secret(http, monkeypatch, supabase):
    monkeypatch.setattr(oauth_mod.Config, "DESKTOP_OAUTH_SECRET", _SECRET)
    assertion = _assertion("a@b.test", "g-x")
    monkeypatch.setattr(oauth_mod.Config, "DESKTOP_OAUTH_SECRET", "")

    assert _post_google(http, assertion).status_code == 501


def test_google_unknown_email_is_named(http, monkeypatch, supabase):
    """Safe to name: the caller already proved control of the address, so there
    is nothing left to enumerate."""
    monkeypatch.setattr(oauth_mod.Config, "DESKTOP_OAUTH_SECRET", _SECRET)
    _user_is(monkeypatch, None)

    resp = _post_google(http, _assertion("nobody@nowhere.test", "g-x"))

    assert resp.status_code == 404
    assert "nobody@nowhere.test" in resp.get_json()["error"]


def test_google_id_mismatch_rejected(http, monkeypatch, supabase):
    """The account on file is linked to a different Google identity."""
    monkeypatch.setattr(oauth_mod.Config, "DESKTOP_OAUTH_SECRET", _SECRET)
    _user_is(monkeypatch, _row(google_id="g-the-real-owner"))

    resp = _post_google(http, _assertion("shared@example.com", "g-someone-else"))

    assert resp.status_code == 401
    assert "does not match" in resp.get_json()["error"]


def test_google_links_unlinked_account(http, monkeypatch, supabase):
    """A password-era account with no google_id yet may still sync — the cloud
    only mints assertions for Google-verified addresses."""
    monkeypatch.setattr(oauth_mod.Config, "DESKTOP_OAUTH_SECRET", _SECRET)
    _user_is(monkeypatch, _row(google_id=None))

    assert _post_google(http, _assertion("legacy@example.com", "g-new")).status_code == 200


def test_google_inactive_account_rejected(http, monkeypatch, supabase):
    monkeypatch.setattr(oauth_mod.Config, "DESKTOP_OAUTH_SECRET", _SECRET)
    # _fetch_supabase_user filters inactive/deleted rows out entirely
    _user_is(monkeypatch, None)

    assert _post_google(http, _assertion("gone@example.com", "g-x")).status_code == 404


# ── password path: unchanged behaviour ──────────────────────────────────────

def test_password_path_still_completes_setup(http, monkeypatch, supabase):
    _user_is(monkeypatch, _row())

    resp = _post(http, {"email": "owner@example.com", "password": "CorrectHorse1"})

    assert resp.status_code == 200, resp.get_data(as_text=True)
    assert supabase["imported"] == {"users": []}


def test_password_path_rejects_wrong_password(http, monkeypatch, supabase):
    _user_is(monkeypatch, _row())

    resp = _post(http, {"email": "owner@example.com", "password": "WrongPassword"})

    assert resp.status_code == 401
    assert resp.get_json()["error"] == electron_mod._GENERIC_AUTH_ERROR


def test_password_path_does_not_enumerate_accounts(http, monkeypatch, supabase):
    """Unknown email and wrong password must be indistinguishable here — unlike
    the Google path, this caller has proven nothing."""
    _user_is(monkeypatch, None)
    unknown = _post(http, {"email": "nobody@nowhere.test", "password": "whatever"})

    _user_is(monkeypatch, _row())
    wrong = _post(http, {"email": "owner@example.com", "password": "WrongPassword"})

    assert unknown.status_code == wrong.status_code == 401
    assert unknown.get_json() == wrong.get_json()


def test_password_path_still_requires_both_fields(http, supabase):
    assert _post(http, {}).status_code == 400
    assert _post(http, {"email": "owner@example.com"}).status_code == 400


def test_google_only_account_cannot_use_password_path(http, monkeypatch, supabase):
    """The original bug, pinned: a Google signup's random hash is unguessable,
    so the password path is a dead end for them — hence the assertion path."""
    _user_is(monkeypatch, _row(password_hash=bcrypt.hashpw(b"\x00" * 32, bcrypt.gensalt()).decode()))

    resp = _post(http, {"email": "google.user@example.com", "password": "anything-they-try"})

    assert resp.status_code == 401


def test_invite_pending_account_rejected_cleanly(http, monkeypatch, supabase):
    """An empty hash would make bcrypt raise 'Invalid salt' — it must surface as
    a normal credential failure, not a 500."""
    _user_is(monkeypatch, _row(password_hash=""))

    resp = _post(http, {"email": "invited@example.com", "password": "anything"})

    assert resp.status_code == 401
    assert resp.get_json()["error"] == electron_mod._GENERIC_AUTH_ERROR
