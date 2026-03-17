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
    assert resp.headers.get('Permissions-Policy') == 'geolocation=(), microphone=(), camera=()'


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
