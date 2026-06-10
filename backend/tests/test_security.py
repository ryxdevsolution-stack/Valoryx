"""Security regression tests — run with: pytest backend/tests/test_security.py -v"""
import pytest


@pytest.fixture
def app_no_cors_env(monkeypatch):
    """App with CORS_ORIGINS unset — tests the safe-default behaviour."""
    monkeypatch.delenv('CORS_ORIGINS', raising=False)
    from app import create_app
    app = create_app()
    app.config['TESTING'] = True
    return app.test_client()


@pytest.fixture
def app_client(monkeypatch):
    """App with CORS_ORIGINS set to localhost."""
    monkeypatch.setenv('CORS_ORIGINS', 'http://localhost:3002')
    from app import create_app
    app = create_app()
    app.config['TESTING'] = True
    return app.test_client()


def test_cors_default_does_not_allow_wildcard_on_regular_request(app_no_cors_env):
    """When CORS_ORIGINS is unset, regular requests must not get Access-Control-Allow-Origin: *"""
    resp = app_no_cors_env.get('/api/health', headers={'Origin': 'http://evil.com'})
    acao = resp.headers.get('Access-Control-Allow-Origin', '')
    assert acao != '*', f"Expected no wildcard CORS, got: {acao}"


def test_cors_default_does_not_allow_wildcard_on_preflight(app_no_cors_env):
    """When CORS_ORIGINS is unset, OPTIONS preflight must not return Access-Control-Allow-Origin: *"""
    resp = app_no_cors_env.options(
        '/api/health',
        headers={'Origin': 'http://evil.com', 'Access-Control-Request-Method': 'POST'},
    )
    acao = resp.headers.get('Access-Control-Allow-Origin', '')
    assert acao != '*', f"Expected no wildcard preflight CORS, got: {acao}"


def test_cors_allows_configured_origin(app_client):
    """When CORS_ORIGINS is set, requests from that origin are allowed"""
    resp = app_client.get('/api/health', headers={'Origin': 'http://localhost:3002'})
    acao = resp.headers.get('Access-Control-Allow-Origin', '')
    assert acao == 'http://localhost:3002', f"Expected configured origin, got: {acao}"


def test_security_headers_present(app_client):
    """Every response must include the required security headers"""
    resp = app_client.get('/api/health')
    assert resp.headers.get('X-Frame-Options') == 'DENY'
    assert resp.headers.get('X-Content-Type-Options') == 'nosniff'
    assert resp.headers.get('Referrer-Policy') == 'strict-origin-when-cross-origin'
    # Directive order is not significant — compare as a set
    policy = resp.headers.get('Permissions-Policy', '')
    directives = {d.strip() for d in policy.split(',')}
    assert directives == {'geolocation=()', 'microphone=()', 'camera=()'}, \
        f"unexpected Permissions-Policy: {policy}"


def test_printer_name_rejects_path_traversal(app_client):
    """printerName with path traversal chars must return 400"""
    resp = app_client.post(
        '/api/billing/print',
        json={
            'bill': {'items': []},
            'clientInfo': {},
            'printerName': '../../etc/passwd',
        },
        headers={'Authorization': 'Bearer test'}
    )
    # 400 (validation fail) or 401 (auth fail) are both acceptable;
    # 500 (crashes into subprocess) is NOT acceptable
    assert resp.status_code in (400, 401, 403), \
        f"Expected 400/401/403, got {resp.status_code}"


def test_printer_name_rejects_flag_injection(app_client):
    """printerName that looks like an lp flag must return 400"""
    resp = app_client.post(
        '/api/billing/print',
        json={
            'bill': {'items': []},
            'clientInfo': {},
            'printerName': '--hold',
        },
        headers={'Authorization': 'Bearer test'}
    )
    assert resp.status_code in (400, 401, 403)


def test_printer_name_accepts_valid_name(app_client):
    """printerName with valid characters must not be rejected by validation"""
    resp = app_client.post(
        '/api/billing/print',
        json={
            'bill': {'items': []},
            'clientInfo': {},
            'printerName': 'RP3220-Star',
        },
        headers={'Authorization': 'Bearer test'}
    )
    # Must NOT be 400 from our validation (may be 401 auth or 500 printer error)
    body = resp.get_data(as_text=True)
    assert resp.status_code != 400 or 'Invalid printer name' not in body


def test_webhook_rejects_when_secret_not_configured(monkeypatch, app_client):
    """Webhook endpoint must return 500 (not 200) when RAZORPAY_WEBHOOK_SECRET is missing"""
    from config import Config
    monkeypatch.setattr(Config, 'RAZORPAY_WEBHOOK_SECRET', None)
    resp = app_client.post(
        '/api/subscription/webhook',
        json={'event': 'invoice.paid'},
        headers={'X-Razorpay-Signature': 'fake'}
    )
    assert resp.status_code == 500, \
        f"Expected 500 when secret not configured, got {resp.status_code}"


def test_invite_password_minimum_8_chars(app_client):
    """Invite registration must reject passwords shorter than 8 chars"""
    resp = app_client.post(
        '/api/invite/accept',
        json={'token': 'fake-token', 'password': 'abc123'}  # 6 chars
    )
    # 400 (too short) or 404 (invalid token) are both fine; NOT 200 success
    assert resp.status_code != 200, \
        f"6-char password should not succeed, got {resp.status_code}"
    if resp.status_code == 400:
        data = resp.get_json()
        assert '8' in (data.get('error', '') + data.get('message', '')), \
            "Error message should mention 8 characters"


# ═══════════════════════════════════════════════════════════════════════════
# 2026-06-10 audit regression tests
# ═══════════════════════════════════════════════════════════════════════════

@pytest.fixture(autouse=True)
def _clean_rate_limit_state():
    """Rate-limit counters are module-level; keep tests order-independent."""
    from utils import rate_limiter as rl
    try:
        from routes import auth as auth_mod
        login_store = auth_mod._LOGIN_FAIL_STORE
    except ImportError:
        login_store = {}
    rl._STORE.clear()
    login_store.clear()
    yield
    rl._STORE.clear()
    login_store.clear()


# ── Stored XSS: default barcode label template ─────────────────────────────

def test_default_label_template_escapes_html():
    """product_name / item_code / unit must be HTML-escaped in the default label"""
    from utils.barcode_label import generate_label_html
    item = {
        'item_code': '<svg onload=alert(1)>',
        'product_name': '<img src=x onerror=alert(1)>',
        'unit': '<b>kg</b>',
    }
    html = generate_label_html(item)
    assert '<img src=x' not in html, "product_name rendered unescaped"
    assert '<svg onload' not in html, "item_code rendered unescaped"
    assert '<b>kg</b>' not in html, "unit rendered unescaped"
    assert '&lt;img' in html, "expected escaped product_name in output"


def test_labels_roll_escapes_html():
    """The full multi-label roll must not pass payloads through unescaped"""
    from utils.barcode_label import generate_labels_html
    html = generate_labels_html([
        {'item_code': 'X1', 'product_name': '<script>steal()</script>', 'quantity': 1},
    ])
    assert '<script>steal()' not in html


# ── User enumeration via login error messages ───────────────────────────────

def test_login_unknown_email_and_wrong_password_same_error(http, sample_user):
    """401 bodies must not reveal whether the email exists"""
    r_unknown = http.post('/api/auth/login', json={
        'email': 'no-such-user@valoryx-test.invalid', 'password': 'whatever123',
    })
    r_wrongpw = http.post('/api/auth/login', json={
        'email': sample_user.email, 'password': 'WrongPass999!',
    })
    assert r_unknown.status_code == 401
    assert r_wrongpw.status_code == 401
    assert r_unknown.get_json()['error'] == r_wrongpw.get_json()['error'], \
        "distinct messages allow account enumeration"
    assert 'not found' not in r_unknown.get_json()['error'].lower()


# ── Login rate limiting: spoofed X-Forwarded-For must not bypass ────────────

def test_login_rate_limit_not_bypassed_by_spoofed_xff(http):
    """Rotating X-Forwarded-For must not reset the per-IP failure counter"""
    for i in range(10):
        http.post(
            '/api/auth/login',
            json={'email': f'u{i}@valoryx-test.invalid', 'password': 'xxxxxxxx'},
            headers={'X-Forwarded-For': f'1.2.3.{i}'},
        )
    resp = http.post(
        '/api/auth/login',
        json={'email': 'final@valoryx-test.invalid', 'password': 'xxxxxxxx'},
        headers={'X-Forwarded-For': '99.99.99.99'},
    )
    assert resp.status_code == 429, \
        f"XFF rotation bypassed the login rate limit (got {resp.status_code})"


def test_login_locks_account_after_repeated_failures(http, sample_user):
    """Per-account lockout must trip even if attacker IPs vary (keyed by email)"""
    for _ in range(5):
        r = http.post('/api/auth/login', json={
            'email': sample_user.email, 'password': 'WrongPass999!',
        })
        assert r.status_code in (401, 429)
    resp = http.post('/api/auth/login', json={
        'email': sample_user.email, 'password': 'WrongPass999!',
    })
    assert resp.status_code == 429, \
        f"expected per-account lockout after 5 failures, got {resp.status_code}"


# ── rate_limit decorator must actually limit (was a no-op stub) ─────────────

def _make_limited_app(route, **kw):
    from flask import Flask
    from utils.rate_limiter import rate_limit
    app = Flask(__name__)

    @rate_limit(**kw)
    def limited():
        return 'ok'
    # Unique endpoint per route — the limiter keys on (endpoint, ip), so two
    # test apps must not share a bucket through the module-level store
    app.add_url_rule(route, endpoint=f'limited{route}', view_func=limited)
    return app.test_client()


def test_rate_limit_decorator_enforces_limit():
    c = _make_limited_app('/limited-a', max_requests=3, window_seconds=60)
    codes = [c.get('/limited-a').status_code for _ in range(4)]
    assert codes[:3] == [200, 200, 200], f"valid requests blocked: {codes}"
    assert codes[3] == 429, f"4th request should be 429, got {codes[3]}"


def test_rate_limit_decorator_ignores_spoofed_xff():
    c = _make_limited_app('/limited-b', max_requests=3, window_seconds=60)
    for i in range(3):
        c.get('/limited-b', headers={'X-Forwarded-For': f'10.0.0.{i}'})
    resp = c.get('/limited-b', headers={'X-Forwarded-For': '8.8.8.8'})
    assert resp.status_code == 429, "spoofed XFF must not create a fresh bucket"


def test_electron_setup_is_rate_limited(http):
    """Unauthenticated credential-check endpoint must be throttled"""
    codes = [
        http.post('/api/electron/setup', json={}).status_code
        for _ in range(8)
    ]
    assert 429 in codes, f"no 429 after 8 rapid requests: {codes}"


def test_rate_limiter_prune_respects_per_entry_window():
    """A 60s-window endpoint's prune must not wipe live 300s-window buckets"""
    import time
    from utils import rate_limiter as rl
    now = time.monotonic()
    rl._STORE.clear()
    # Fill past the prune threshold with stale short-window buckets
    for i in range(rl._PRUNE_THRESHOLD):
        rl._STORE[('fill', f'ip{i}')] = (60, [now - 120])
    # A long-window bucket that is still live (100s old, 300s window)
    rl._STORE[('reset-password', 'attacker')] = (300, [now - 100])
    rl._prune(now)
    assert ('reset-password', 'attacker') in rl._STORE, \
        "prune dropped a live long-window bucket"
    rl._STORE.clear()


def test_login_fail_store_does_not_accumulate_empty_keys(app):
    """Checking a clean key must not create a permanent empty store entry"""
    from routes import auth as auth_mod
    auth_mod._LOGIN_FAIL_STORE.clear()
    auth_mod._check_login_rate_limit('ip:198.51.100.7')
    assert 'ip:198.51.100.7' not in auth_mod._LOGIN_FAIL_STORE, \
        "empty bucket persisted — unbounded growth under email/IP spraying"


# ── supabase_storage must not require credentials at import time ────────────

def test_supabase_storage_imports_without_credentials(monkeypatch):
    """Module import must not crash when Supabase env vars are absent
    (the packaged desktop app no longer ships server credentials)."""
    import sys
    monkeypatch.delenv('SUPABASE_URL', raising=False)
    monkeypatch.delenv('SUPABASE_KEY', raising=False)
    monkeypatch.delenv('SUPABASE_SERVICE_ROLE_KEY', raising=False)
    sys.modules.pop('utils.supabase_storage', None)
    import utils.supabase_storage  # noqa: F401 — must not raise


# ── SQLite database file permissions ─────────────────────────────────────────

def test_sqlite_db_permissions_hardened(tmp_path, monkeypatch):
    """get_database_uri must chmod existing DB to 0600 and its dir to 0700"""
    import stat
    db_dir = tmp_path / 'valoryx-data'
    db_dir.mkdir()
    db_file = db_dir / 'local.db'
    db_file.write_bytes(b'')
    db_file.chmod(0o644)

    monkeypatch.setenv('DB_MODE', 'offline')
    monkeypatch.setenv('SQLITE_DB_PATH', str(db_file))
    from config import get_database_uri
    get_database_uri()

    file_mode = stat.S_IMODE(db_file.stat().st_mode)
    dir_mode = stat.S_IMODE(db_dir.stat().st_mode)
    assert file_mode == 0o600, f"DB file mode is {oct(file_mode)}, expected 0o600"
    assert dir_mode == 0o700, f"DB dir mode is {oct(dir_mode)}, expected 0o700"
