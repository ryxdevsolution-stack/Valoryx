# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply 6 security fixes (git history purge + 5 code changes) to close vulnerabilities found in the full-app scan without altering any business logic.

**Architecture:** All changes are guard-rail additions only — no data model changes, no new routes, no business logic touched. The CORS and preflight handler are both inside `create_app()` in `backend/app.py`. Security headers are added as an `@app.after_request` decorator in the same file. Input validation is inserted immediately before `ThermalPrinter` construction in two billing endpoints.

**Tech Stack:** Flask, flask-cors, Python `re` module (stdlib), `git filter-repo` (must be installed)

---

## Chunk 1: Git History Purge + .gitignore

### Task 1: Purge `.env` files from git history

**Files:**
- Modify: `.gitignore`
- Bash: `git filter-repo` commands

- [ ] **Step 1: Verify git-filter-repo is available**

```bash
git filter-repo --version
```

Expected output: version string like `git filter-repo 2.x.x`. If not installed:
```bash
pip install git-filter-repo --break-system-packages
# or: pipx install git-filter-repo
```

- [ ] **Step 2: Verify current .gitignore covers all .env patterns**

Read `.gitignore` and confirm these lines exist:
```
.env
.env.*
**/.env
**/.env.*
*.env
backend/.env
```
If any are missing, add them before running filter-repo (otherwise the purged file could be re-committed).
**Important:** Do NOT remove any pre-existing `.gitignore` patterns during verification — only add missing ones.

- [ ] **Step 3: Confirm which .env files are currently tracked**

```bash
git ls-files | grep -E "\.env"
```

Expected: only `.env.example` files and `frontend/.env` (which contains no secrets — only public API URL). Do NOT purge these.

- [ ] **Step 4: Check if any secret-containing .env was ever committed**

```bash
git log --all --oneline -- .env "backend/.env"
```

If output shows commits, proceed. If empty, skip Steps 5-8 (already clean).

- [ ] **Step 5: Back up current working .env files (they stay on disk, filter-repo won't touch them)**

```bash
cp .env .env.backup-before-purge
cp backend/.env backend/.env.backup-before-purge
```

- [ ] **Step 6: Purge root .env from all history**

```bash
cd /home/development1/Desktop/Valoryx
git filter-repo --path .env --invert-paths --force
```

Expected: output shows rewritten commits, ends with `Ref 'refs/heads/main' was rewritten`.

- [ ] **Step 7: Purge backend/.env from all history**

```bash
git filter-repo --path backend/.env --invert-paths --force
```

- [ ] **Step 8: Verify purge succeeded locally**

```bash
git log --all --oneline -- .env backend/.env
```

Expected: **empty output** (no lines). If still shows commits, the file path was different — check with `git log --all --full-history --name-only | grep "\.env"`.

- [ ] **Step 9: Restore working .env files from backups (filter-repo may reset working tree)**

```bash
# Only restore if the files are missing:
test -f .env || cp .env.backup-before-purge .env
test -f backend/.env || cp backend/.env.backup-before-purge backend/.env
rm -f .env.backup-before-purge backend/.env.backup-before-purge
```

- [ ] **Step 10: Force-push rewritten history to remote (if a remote exists)**

```bash
# Check if remote exists first
git remote -v
# If remote exists, force-push all branches and tags:
git push origin --force --all
git push origin --force --tags
```

If the remote is GitHub: after force-pushing, any tag that pointed to a purged commit will be orphaned. Delete and re-create each tag from the rewritten commits if needed.

- [ ] **Step 11: Re-clone verification (confirm purge is complete on remote)**

```bash
# In a temp directory, re-clone and verify:
cd /tmp && git clone <remote-url> valoryx-verify
git -C valoryx-verify log --all --oneline -- .env backend/.env
# Expected: empty output
cd - && rm -rf /tmp/valoryx-verify
```

- [ ] **Step 12: Commit any .gitignore additions (if Step 2 required changes)**

```bash
git add .gitignore
git diff --staged --quiet || git commit -m "chore: ensure all .env variants are gitignored"
```

---

## Chunk 2: CORS Wildcard Fix

### Task 2: Fix CORS default in `create_app()` and the preflight handler

**Files:**
- Modify: `backend/app.py` lines 19-21 (CORS init) and lines 749-760 (preflight handler)

- [ ] **Step 1: Create tests directory and test file**

```bash
mkdir -p backend/tests
touch backend/tests/__init__.py
```

Create `backend/tests/conftest.py`:
```python
import sys, os
# Ensure backend/ is on the path so `from app import create_app` resolves
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
```

Create `backend/tests/test_security.py`:
```python
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
```

- [ ] **Step 2: Run test to confirm it fails (proves vulnerability)**

```bash
cd /home/development1/Desktop/Valoryx/backend
python -m pytest tests/test_security.py::test_cors_default_does_not_allow_wildcard_on_regular_request -v
python -m pytest tests/test_security.py::test_cors_default_does_not_allow_wildcard_on_preflight -v
```

Expected: both **FAIL** (currently returns `*`).

- [ ] **Step 3: Fix CORS init in `create_app()` — `backend/app.py` lines 19-21**

Replace:
```python
cors_origins = os.environ.get('CORS_ORIGINS', '*')
if cors_origins != '*':
    cors_origins = [origin.strip() for origin in cors_origins.split(',')]
```

With:
```python
cors_origins_raw = os.environ.get('CORS_ORIGINS', '')
if cors_origins_raw.strip():
    cors_origins = [o.strip() for o in cors_origins_raw.split(',') if o.strip()]
else:
    cors_origins = []  # deny all cross-origin by default — safe when env var is missing
```

- [ ] **Step 4: Fix preflight handler — `backend/app.py` lines 749-760 (three surgical changes)**

This is a **targeted three-edit fix** inside the existing `handle_preflight` function. Do NOT rewrite the whole handler — only make these three targeted changes:

**Fix A — line 749 only:** change the default from `'*'` to `''`
```python
# BEFORE (line 749):
allowed_origins = os.environ.get('CORS_ORIGINS', '*')
# AFTER:
allowed_origins = os.environ.get('CORS_ORIGINS', '')
```

**Fix B — edit 1, line 752:** change `if allowed_origins == '*':` to `if allowed_origins:`
```python
# BEFORE (line 752):
if allowed_origins == '*':
    response.headers['Access-Control-Allow-Origin'] = '*'
else:
# AFTER:
if allowed_origins:
```
(The `response.headers['Access-Control-Allow-Origin'] = '*'` line and `else:` are removed entirely — the entire block is replaced.)

**Fix B — edit 2, line 760:** change the wildcard fallback `'*'` to `''`
```python
# BEFORE (line 760):
        response.headers['Access-Control-Allow-Origin'] = allowed_list[0] if allowed_list else '*'
# AFTER:
        response.headers['Access-Control-Allow-Origin'] = allowed_list[0] if allowed_list else ''
```

The final result of lines 749-763 should look like:
```python
# AFTER — complete replacement of the relevant block:
allowed_origins = os.environ.get('CORS_ORIGINS', '')
if allowed_origins:
    allowed_list = [o.strip() for o in allowed_origins.split(',') if o.strip()]
    if request_origin in allowed_list:
        response.headers['Access-Control-Allow-Origin'] = request_origin
    else:
        response.headers['Access-Control-Allow-Origin'] = allowed_list[0] if allowed_list else ''
# else: CORS_ORIGINS is empty — do NOT set Access-Control-Allow-Origin at all (omit header entirely)
```

The three changes from the original are:
1. Default `'*'` → `''` on line 749 (Fix A)
2. `if allowed_origins == '*': ... else:` block replaced with `if allowed_origins:` (Fix B edit 1)
3. Final fallback `allowed_list[0] if allowed_list else '*'` → `allowed_list[0] if allowed_list else ''` (Fix B edit 2 — eliminates the empty-list wildcard)

When `allowed_origins` is empty/unset, the `if allowed_origins:` block is skipped entirely, so no `Access-Control-Allow-Origin` header is set — the header is omitted, not set to `''`.

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd /home/development1/Desktop/Valoryx/backend
python -m pytest tests/test_security.py -v
```

Expected: all 3 tests **PASS**.

- [ ] **Step 6: Commit**

```bash
git add backend/app.py backend/tests/test_security.py
git commit -m "fix(security): CORS default deny-all when CORS_ORIGINS env var is unset"
```

---

## Chunk 3: Security Response Headers

### Task 3: Add `@app.after_request` security headers

**Files:**
- Modify: `backend/app.py` (add after_request handler inside `create_app()`, before the `return app` line)

- [ ] **Step 1: Add failing test for security headers to `backend/tests/test_security.py`**

Append to the existing test file (`app_client` fixture is already defined in Task 2 — do not re-define it):
```python
def test_security_headers_present(app_client):
    """Every response must include the required security headers"""
    resp = app_client.get('/api/health')
    assert resp.headers.get('X-Frame-Options') == 'DENY'
    assert resp.headers.get('X-Content-Type-Options') == 'nosniff'
    assert resp.headers.get('Referrer-Policy') == 'strict-origin-when-cross-origin'
    assert resp.headers.get('Permissions-Policy') == 'geolocation=(), microphone=(), camera=()'
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
python -m pytest backend/tests/test_security.py::test_security_headers_present -v
```

Expected: **FAIL** — headers are absent.

- [ ] **Step 3: Add the after_request handler inside `create_app()` in `backend/app.py`**

Find the line `return app` at the end of `create_app()`. Add the handler **immediately before it** as a nested function inside `create_app()`. The `@app.after_request` decorator must reference the local `app` variable inside `create_app()`, NOT the module-level `app = create_app()` call that appears later in the file.

```python
    @app.after_request
    def set_security_headers(response):
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response.headers['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=()'
        if not app.debug:
            response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
        return response

    return app
```

- [ ] **Step 4: Run all security tests**

```bash
python -m pytest backend/tests/test_security.py -v
```

Expected: all tests **PASS**.

- [ ] **Step 5: Commit**

```bash
git add backend/app.py backend/tests/test_security.py
git commit -m "fix(security): add X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy headers"
```

---

## Chunk 4: Printer Name Validation

### Task 4: Validate `printerName` input in two billing endpoints

**Files:**
- Modify: `backend/routes/billing.py` (two locations: ~line 1311 and ~line 1434)
- Note: `import re` must be added at module level if not already present

- [ ] **Step 1: Check if `import re` already exists at module level**

```bash
head -30 backend/routes/billing.py | grep "^import re"
```

If not present, add `import re` to the imports block at the top of `billing.py`.

- [ ] **Step 2: Add failing test for printer name validation**

Append to `backend/tests/test_security.py`:

```python
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
    # This will fail further in (no real printer), but must not return 400 from validation
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
    assert resp.status_code != 400 or 'Invalid printer name' not in (resp.get_data(as_text=True))
```

- [ ] **Step 3: Run tests to confirm path traversal / flag injection currently pass through**

```bash
python -m pytest backend/tests/test_security.py::test_printer_name_rejects_path_traversal -v
python -m pytest backend/tests/test_security.py::test_printer_name_rejects_flag_injection -v
```

Note: These may return 401 (unauthenticated) rather than reaching the printer code — that's fine, it means auth is protecting the endpoint. Record the actual status code. If 401, the auth layer already blocks it and the validation is defence-in-depth.

- [ ] **Step 4: Add validation to first print endpoint (~line 1311 in `billing.py`)**

Find:
```python
        # Get printer name from request or use default
        printer_name = data.get('printerName', None)

        # Initialize thermal printer
        printer = ThermalPrinter(printer_name=printer_name)
```

Replace with:
```python
        # Get printer name from request or use default
        printer_name = data.get('printerName', None)

        # Validate printer name to prevent lp argument injection
        if printer_name is not None:
            if not re.match(r'^[a-zA-Z0-9_\-\.]{1,64}$', printer_name):
                return jsonify({'success': False, 'error': 'Invalid printer name'}), 400

        # Initialize thermal printer
        printer = ThermalPrinter(printer_name=printer_name)
```

- [ ] **Step 5: Add validation to second print endpoint (~line 1434 in `billing.py`)**

Find (label printing endpoint):
```python
        # Get printer name from request or use default
        printer_name = data.get('printerName', None)

        # Calculate total labels
```

Replace with:
```python
        # Get printer name from request or use default
        printer_name = data.get('printerName', None)

        # Validate printer name to prevent lp argument injection
        if printer_name is not None:
            if not re.match(r'^[a-zA-Z0-9_\-\.]{1,64}$', printer_name):
                return jsonify({'success': False, 'error': 'Invalid printer name'}), 400

        # Calculate total labels
```

- [ ] **Step 6: Run all security tests**

```bash
python -m pytest backend/tests/test_security.py -v
```

Expected: all tests **PASS**.

- [ ] **Step 7: Commit**

```bash
git add backend/routes/billing.py backend/tests/test_security.py
git commit -m "fix(security): validate printerName input to prevent lp argument injection"
```

---

## Chunk 5: Webhook + Password Fixes

### Task 5: Webhook 500 when secret missing + password minimum length

**Files:**
- Modify: `backend/routes/subscription.py` line 462-463
- Modify: `backend/routes/invite.py` line 88-89

- [ ] **Step 1: Add failing test for webhook behaviour**

Append to `backend/tests/test_security.py`:

```python
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
    # 400 (too short) or 404 (invalid token — either is fine, but NOT 200 success)
    assert resp.status_code != 200, \
        f"6-char password should not succeed, got {resp.status_code}"
    # If 400, check the error message
    if resp.status_code == 400:
        data = resp.get_json()
        assert '8' in (data.get('error', '') + data.get('message', '')), \
            "Error message should mention 8 characters"
```

- [ ] **Step 2: Run tests to confirm current behaviour**

```bash
python -m pytest backend/tests/test_security.py::test_webhook_rejects_when_secret_not_configured -v
python -m pytest backend/tests/test_security.py::test_invite_password_minimum_8_chars -v
```

Expected: `test_webhook` **FAILS** (currently returns 200). `test_invite` may pass or fail depending on whether the token check runs before password check.

- [ ] **Step 3: Fix webhook — `backend/routes/subscription.py` lines 461-463**

Replace:
```python
        if not webhook_secret:
            logger.warning('[Webhook] RAZORPAY_WEBHOOK_SECRET not configured — skipping')
            return jsonify({'status': 'ignored', 'reason': 'webhook secret not configured'}), 200
```

With:
```python
        if not webhook_secret:
            logger.error('[Webhook] RAZORPAY_WEBHOOK_SECRET not configured — rejecting all webhooks')
            return jsonify({'error': 'Webhook not configured on server'}), 500
```

- [ ] **Step 4: Fix invite password minimum — `backend/routes/invite.py` line 88-89**

Replace:
```python
    if len(password) < 6:
        return jsonify({'success': False, 'error': 'Password must be at least 6 characters'}), 400
```

With:
```python
    if len(password) < 8:
        return jsonify({'success': False, 'error': 'Password must be at least 8 characters'}), 400
```

- [ ] **Step 5: Run all security tests**

```bash
python -m pytest backend/tests/test_security.py -v
```

Expected: **all tests PASS**.

- [ ] **Step 6: Run any existing tests to check for regressions**

```bash
cd /home/development1/Desktop/Valoryx/backend
python -m pytest --tb=short -q 2>&1 | tail -20
```

Expected: no new failures introduced by these changes.

- [ ] **Step 7: Commit**

```bash
git add backend/routes/subscription.py backend/routes/invite.py backend/tests/test_security.py
git commit -m "fix(security): webhook returns 500 when secret unset; invite enforces 8-char password minimum"
```

---

## Chunk 6: Final Verification

### Task 6: Verify all fixes end-to-end + print credential rotation checklist

- [ ] **Step 1: Run full security test suite**

```bash
cd /home/development1/Desktop/Valoryx/backend
python -m pytest tests/test_security.py -v --tb=short
```

Expected: all tests green.

- [ ] **Step 2: Manual verification — security headers**

Start the backend (or use test client) and confirm headers appear:
```bash
curl -s -o /dev/null -D - http://localhost:5017/api/health | grep -E "X-Frame|X-Content|Referrer|Permissions"
```

Expected output includes all 4 headers.

- [ ] **Step 3: Manual verification — CORS preflight with unknown origin**

```bash
curl -X OPTIONS \
  -H "Origin: http://evil.com" \
  -H "Access-Control-Request-Method: POST" \
  -s -o /dev/null -D - \
  http://localhost:5017/api/auth/login | grep "Access-Control-Allow-Origin"
```

Expected: **no output** (header not present).

- [ ] **Step 4: Verify git history purge**

```bash
git log --all --oneline -- .env backend/.env
```

Expected: **empty output**.

- [ ] **Step 5: Print credential rotation checklist for user**

Print this block as a reminder to the user:

```
╔══════════════════════════════════════════════════════════════════╗
║         REQUIRED: Rotate these credentials NOW                   ║
╠══════════════════════════════════════════════════════════════════╣
║ 1. Supabase anon key + service role key                          ║
║    → supabase.com → Project Settings → API → Regenerate both     ║
║                                                                  ║
║ 2. Supabase DB password                                          ║
║    → supabase.com → Project Settings → Database → Reset Password ║
║                                                                  ║
║ 3. JWT_SECRET + SECRET_KEY (generate new values):               ║
║    $ openssl rand -hex 32   (run twice, one for each)           ║
║    → update backend/.env and .env with new values               ║
║                                                                  ║
║ 4. Razorpay key secret                                           ║
║    → razorpay.com → Settings → API Keys → Regenerate            ║
║                                                                  ║
║ 5. Gmail SMTP app password                                       ║
║    → myaccount.google.com → Security → App Passwords            ║
║                                                                  ║
║ 6. Google OAuth client secret                                    ║
║    → console.cloud.google.com → Credentials → Edit → Regenerate ║
╚══════════════════════════════════════════════════════════════════╝
```

- [ ] **Step 6: Final commit — add spec and plan docs**

```bash
cd /home/development1/Desktop/Valoryx
git add docs/superpowers/specs/2026-03-17-security-hardening.md \
        docs/superpowers/plans/2026-03-17-security-hardening.md
git commit -m "docs: security hardening spec and implementation plan"
```
