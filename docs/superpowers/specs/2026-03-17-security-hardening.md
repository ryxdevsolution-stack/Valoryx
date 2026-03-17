# Security Hardening Spec — Valoryx
**Date:** 2026-03-17
**Scope:** Flask backend + React frontend
**Goal:** Fix all critical/high/medium security issues found in full-app scan without altering any business logic.

---

## 1. Git History Purge

### Problem
Root `.env` (and historically `backend/.env`) was committed to git in commits `abc45b0c`, `52e3f7f8`, `a0f42a53`, `a727672`. These commits contain live Supabase service role key, DB password, JWT secret, and Razorpay key.

### Action
- Run `git filter-repo --path .env --invert-paths` to remove `.env` from all history
- Run `git filter-repo --path backend/.env --invert-paths` to remove `backend/.env` from all history
- Verify `.gitignore` covers: `.env`, `.env.*`, `**/.env`, `**/.env.*`, `backend/.env`
- After purge: force-push all branches **and tags** to remote (if remote exists) — tags pointing to rewritten commits must be deleted and re-created
- Verification: re-clone the repo and re-run `git log --all -- .env` to confirm purge is complete on the remote

### Constraints
- Does NOT remove or modify the current working `.env` files on disk
- Credentials must still be manually rotated externally (see Section 5)

---

## 2. CORS Wildcard Default Fix

### Problem
`backend/app.py:19` defaults to `'*'` when `CORS_ORIGINS` env var is missing:
```python
cors_origins = os.environ.get('CORS_ORIGINS', '*')
```
Combined with `supports_credentials=True`, this opens the API to any origin if the env var is ever unset.

### Fix
Change the default to an empty string, and treat empty as "no cross-origin access":
```python
cors_origins_raw = os.environ.get('CORS_ORIGINS', '')
if cors_origins_raw.strip():
    cors_origins = [o.strip() for o in cors_origins_raw.split(',') if o.strip()]
else:
    cors_origins = []  # deny all cross-origin by default
```

Also fix **two locations** in the preflight handler (`app.py:742-766`):

**Fix A — line 749** (the preflight handler reads `CORS_ORIGINS` independently):
```python
# BEFORE: allowed_origins = os.environ.get('CORS_ORIGINS', '*')
# AFTER:  allowed_origins = os.environ.get('CORS_ORIGINS', '')
```

**Fix B — line 760** (the fallback when origin is not in the allowed list):
```python
# BEFORE: allowed_list[0] if allowed_list else '*'
# AFTER:  allowed_list[0] if allowed_list else ''
```

Also add a guard: when `allowed_origins` is empty and the requesting origin is not in any list, do **not** set `Access-Control-Allow-Origin` at all (omit the header rather than setting it to `''`).

### Constraint
- `CORS_ORIGINS` is already set in the working `.env`, so no functional change in any running environment
- Only affects environments where the env var is missing (deployment misconfiguration safety net)

---

## 3. Security Response Headers

### Problem
The app sends no security headers, leaving it open to clickjacking, MIME sniffing, and XSS escalation.

### Fix
Add an `@app.after_request` handler in `backend/app.py` immediately after the app factory function:
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
```

### Constraint
- HSTS header only set when `app.debug` is False (won't break local HTTP dev)
- Does not modify any existing response headers (additive only)
- Does not affect CORS headers (those are managed by flask-cors before this handler)

---

## 4. Printer Name Input Validation

### Problem
`backend/routes/billing.py:1311` passes user-controlled `printerName` from request body directly into `subprocess.run(['lp', '-d', self.printer_name, ...])`, enabling argument injection.

### Fix
Add `import re` at the top of `billing.py` (module level, not inside the handler). Validate printer name with a strict allowlist regex before constructing `ThermalPrinter`. The risk is `lp` **option flag injection** — a crafted name like `--hold` passed as `-d --hold` could alter print behaviour on some CUPS versions, not shell execution (no `shell=True` is used anywhere):
```python
# At module level (top of billing.py):
import re

# Inside the print handler, before ThermalPrinter construction:
printer_name = data.get('printerName', None)
if printer_name is not None:
    if not re.match(r'^[a-zA-Z0-9_\-\.]{1,64}$', printer_name):
        return jsonify({'success': False, 'error': 'Invalid printer name'}), 400
```

Apply the same validation to the second print endpoint at `billing.py:1434`.

### Constraint
- Valid printer names (alphanumeric, hyphens, underscores, dots, max 64 chars) pass unchanged
- `None` (no printer specified) passes through unchanged — uses system default
- Does not affect any print functionality for real printer names

---

## 5. Webhook Reject When Secret Not Configured

### Problem
`backend/routes/subscription.py:460-463` returns HTTP 200 OK when `RAZORPAY_WEBHOOK_SECRET` is not configured, silently accepting all webhook calls (including forged ones).

### Fix
Return HTTP 500 instead:
```python
if not webhook_secret:
    logger.error('[Webhook] RAZORPAY_WEBHOOK_SECRET not configured — rejecting all webhooks')
    return jsonify({'error': 'Webhook not configured on server'}), 500
```

### Constraint
- In production, `RAZORPAY_WEBHOOK_SECRET` is already set — no functional change
- In dev/test environments without the secret, webhooks now fail loudly instead of silently, which is the correct behavior

---

## 6. Password Minimum Length Consistency

### Problem
`backend/routes/invite.py:88` enforces a 6-character minimum while `backend/routes/auth.py:470` enforces 8 characters. Users setting passwords via invite get a weaker policy.

### Fix
Change `invite.py:88`:
```python
# BEFORE:
if len(password) < 6:
    return jsonify({'error': 'Password must be at least 6 characters'}), 400

# AFTER:
if len(password) < 8:
    return jsonify({'error': 'Password must be at least 8 characters'}), 400
```

### Constraint
- Only affects the invite registration flow
- Existing users with 6-7 character passwords are not affected (they don't re-register)

---

## 7. Post-Fix Credential Rotation Checklist

After all code fixes are applied, these must be done manually:

| Credential | Where to rotate |
|------------|----------------|
| `SUPABASE_KEY` (anon) | Supabase Dashboard → Project Settings → API → Regenerate |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → API → Regenerate |
| `DB_PASS` | Supabase Dashboard → Project Settings → Database → Reset Password |
| `JWT_SECRET` | Run: `openssl rand -hex 32` → update `.env` |
| `SECRET_KEY` | Run: `openssl rand -hex 32` → update `.env` |
| `RAZORPAY_KEY_SECRET` | Razorpay Dashboard → Settings → API Keys → Regenerate |
| `SMTP_PASSWORD` | Google Account → Security → App Passwords → Delete & recreate |
| `GOOGLE_CLIENT_SECRET` | console.cloud.google.com → Credentials → Regenerate |

---

## Success Criteria

- [ ] `git log --all -- .env backend/.env` returns empty locally; re-clone and repeat to verify remote purge
- [ ] `curl -H "Origin: http://evil.com" http://localhost:5017/api/auth/login` returns no `Access-Control-Allow-Origin` header (regular request)
- [ ] `curl -X OPTIONS -H "Origin: http://evil.com" -H "Access-Control-Request-Method: POST" http://localhost:5017/api/auth/login` returns no `Access-Control-Allow-Origin` header (preflight request)
- [ ] 4 security headers present in debug mode (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`); 5 in production (adds `Strict-Transport-Security`)
- [ ] `POST /api/billing/print` with `printerName: "../../etc/passwd"` returns 400
- [ ] `POST /api/subscription/webhook` without `RAZORPAY_WEBHOOK_SECRET` set returns 500
- [ ] Invite registration with 6-char password returns 400 error

---

## Out of Scope

- JWT → httpOnly cookie migration (larger refactor, separate sprint)
- Supabase Row Level Security review (separate audit)
- Content-Security-Policy header (requires frontend CSP audit first)
