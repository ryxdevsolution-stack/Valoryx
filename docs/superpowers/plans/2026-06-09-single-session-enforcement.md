# Single-Session Enforcement (Auto-Logout Previous Device) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user logs in, automatically revoke their other active sessions so each account can be used on only one device at a time; the displaced device is auto-logged-out on its next request, with a clear message explaining why.

**Architecture:** The plumbing already exists. The JWT carries a `session_id`, the `user_sessions` table tracks active sessions, and `auth_middleware._authenticate_inner` already returns `401 {code: 'SESSION_REVOKED'}` when a session's `is_active` is false. The frontend axios interceptor already clears auth and redirects to login on any `401`. The ONLY missing piece is: at login time, mark the user's *other* sessions inactive. We add one reusable helper (`enforce_session_limit`) and call it from both the password-login and OAuth-login paths. The maximum number of simultaneous sessions is a config value (default `1`) so it is never hardcoded. Frontend gets a small enhancement to show a distinct toast for `SESSION_REVOKED` (vs. an ordinary expiry).

**Tech Stack:** Flask + SQLAlchemy (backend), pytest (backend tests), React + TypeScript + axios + Vitest/MSW (frontend).

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `backend/config.py` | Hosts `MAX_CONCURRENT_SESSIONS_PER_USER` config (env-overridable, default 1) | Modify |
| `backend/utils/session_manager.py` | Reusable `enforce_session_limit()` — revokes oldest active sessions beyond the limit | Create |
| `backend/routes/auth.py` | Call `enforce_session_limit()` in the password-login flow | Modify |
| `backend/routes/oauth.py` | Call `enforce_session_limit()` in the Google OAuth login flow | Modify |
| `backend/tests/test_session_enforcement.py` | Unit + integration tests for the helper and login behavior | Create |
| `frontend-react/src/lib/api.ts` | Distinguish `SESSION_REVOKED` 401 and surface a clear message | Modify |
| `frontend-react/src/lib/__tests__/api.test.ts` | Test the `SESSION_REVOKED` branch | Modify |

**Why a shared helper instead of inlining:** Both `auth.py` (password login) and `oauth.py` (Google login) create `UserSession` rows. DRY requires one revocation function used by both, so the policy can't drift between login paths.

---

### Task 1: Add configurable concurrent-session limit

**Files:**
- Modify: `backend/config.py:216-217` (just after `JWT_DESKTOP_EXPIRATION_HOURS`)

- [ ] **Step 1: Add the config constant**

In `backend/config.py`, immediately after the line:

```python
    JWT_DESKTOP_EXPIRATION_HOURS = 168  # 7 days for desktop/offline mode (Phase 2)
```

add:

```python

    # -------------------------------
    # Concurrent session policy
    # -------------------------------
    # Maximum number of simultaneously-active sessions allowed per user account.
    # 1 = single-device: a new login auto-logs-out the previous device.
    # Set higher to allow multiple devices per account; 0 disables enforcement.
    MAX_CONCURRENT_SESSIONS_PER_USER = int(
        os.getenv("MAX_CONCURRENT_SESSIONS_PER_USER", "1")
    )
```

- [ ] **Step 2: Verify it loads**

Run: `cd backend && python -c "from config import Config; print(Config.MAX_CONCURRENT_SESSIONS_PER_USER)"`
Expected: prints `1`

- [ ] **Step 3: Commit**

```bash
cd /home/development1/Desktop/Valoryx
git add backend/config.py
git commit -m "feat(config): add MAX_CONCURRENT_SESSIONS_PER_USER (default 1)"
```

---

### Task 2: Create the session-enforcement helper (TDD)

**Files:**
- Create: `backend/utils/session_manager.py`
- Test: `backend/tests/test_session_enforcement.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_session_enforcement.py`:

```python
"""Tests for concurrent-session enforcement (single-device auto-logout)."""
import uuid
from datetime import datetime, timedelta

from extensions import db
from models.session_model import UserSession
from utils.session_manager import enforce_session_limit


def _make_session(user_id, client_id, *, active=True, created_offset_min=0):
    """Insert a UserSession row and return it. created_offset_min lets us
    control age — more-negative = older."""
    s = UserSession(
        id=str(uuid.uuid4()),
        session_id=uuid.uuid4().hex,
        user_id=str(user_id),
        client_id=str(client_id),
        ip_address="127.0.0.1",
        user_agent="pytest",
        device="Desktop",
        created_at=datetime.utcnow() + timedelta(minutes=created_offset_min),
        last_seen=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(hours=2),
        is_active=active,
    )
    db.session.add(s)
    db.session.commit()
    return s


def test_limit_1_revokes_all_other_active_sessions(sample_user):
    uid, cid = sample_user.user_id, sample_user.client_id
    old1 = _make_session(uid, cid, created_offset_min=-30)
    old2 = _make_session(uid, cid, created_offset_min=-10)
    current = _make_session(uid, cid, created_offset_min=0)

    revoked = enforce_session_limit(uid, current.session_id, max_sessions=1)
    db.session.commit()

    assert revoked == 2
    assert db.session.get(UserSession, old1.id).is_active is False
    assert db.session.get(UserSession, old2.id).is_active is False
    assert db.session.get(UserSession, current.id).is_active is True
    assert db.session.get(UserSession, old1.id).revoked_at is not None


def test_keeps_current_session_untouched(sample_user):
    uid, cid = sample_user.user_id, sample_user.client_id
    current = _make_session(uid, cid)

    revoked = enforce_session_limit(uid, current.session_id, max_sessions=1)
    db.session.commit()

    assert revoked == 0
    assert db.session.get(UserSession, current.id).is_active is True


def test_limit_2_keeps_newest_one_plus_current(sample_user):
    uid, cid = sample_user.user_id, sample_user.client_id
    oldest = _make_session(uid, cid, created_offset_min=-30)
    newer = _make_session(uid, cid, created_offset_min=-10)
    current = _make_session(uid, cid, created_offset_min=0)

    # max 2 => keep current + the single newest other (newer); revoke oldest only
    revoked = enforce_session_limit(uid, current.session_id, max_sessions=2)
    db.session.commit()

    assert revoked == 1
    assert db.session.get(UserSession, oldest.id).is_active is False
    assert db.session.get(UserSession, newer.id).is_active is True
    assert db.session.get(UserSession, current.id).is_active is True


def test_max_sessions_zero_disables_enforcement(sample_user):
    uid, cid = sample_user.user_id, sample_user.client_id
    other = _make_session(uid, cid, created_offset_min=-10)
    current = _make_session(uid, cid)

    revoked = enforce_session_limit(uid, current.session_id, max_sessions=0)
    db.session.commit()

    assert revoked == 0
    assert db.session.get(UserSession, other.id).is_active is True


def test_already_inactive_sessions_are_ignored(sample_user):
    uid, cid = sample_user.user_id, sample_user.client_id
    dead = _make_session(uid, cid, active=False, created_offset_min=-30)
    current = _make_session(uid, cid)

    revoked = enforce_session_limit(uid, current.session_id, max_sessions=1)
    db.session.commit()

    assert revoked == 0  # dead session was never active, not counted
    assert db.session.get(UserSession, dead.id).is_active is False
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m pytest tests/test_session_enforcement.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'utils.session_manager'`

- [ ] **Step 3: Write the minimal implementation**

Create `backend/utils/session_manager.py`:

```python
"""Concurrent-session enforcement.

Keeps the number of simultaneously-active sessions per user at or below a
configurable limit. When a new login arrives and the user is already at the
limit, the OLDEST active sessions are revoked so the newest device wins. The
revoked device is auto-logged-out on its next request via the SESSION_REVOKED
check in utils/auth_middleware.py.
"""
from datetime import datetime

from extensions import db
from models.session_model import UserSession


def enforce_session_limit(user_id, keep_session_id, max_sessions):
    """Revoke oldest active sessions so that, counting the session identified
    by ``keep_session_id``, at most ``max_sessions`` remain active for this user.

    Mutates the matched rows (sets ``is_active=False`` and ``revoked_at``) on the
    current db.session but does NOT commit — the caller commits as part of its
    own transaction so login stays atomic.

    Args:
        user_id: the user whose sessions are being trimmed.
        keep_session_id: the just-created session that must always survive.
        max_sessions: cap on simultaneous active sessions. 0 disables enforcement.

    Returns:
        int — number of sessions revoked.
    """
    if max_sessions <= 0:
        return 0

    # Active sessions for this user EXCEPT the one we keep, oldest first.
    others = (
        UserSession.query
        .filter_by(user_id=str(user_id), is_active=True)
        .filter(UserSession.session_id != keep_session_id)
        .order_by(UserSession.created_at.asc())
        .all()
    )

    # We keep the current session plus up to (max_sessions - 1) of the most
    # recent others. Everything older than that is revoked.
    keep_others = max(0, max_sessions - 1)
    to_revoke = others if keep_others == 0 else others[:-keep_others]

    now = datetime.utcnow()
    for s in to_revoke:
        s.is_active = False
        s.revoked_at = now

    return len(to_revoke)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && python -m pytest tests/test_session_enforcement.py -v`
Expected: PASS — all 5 tests green

- [ ] **Step 5: Commit**

```bash
cd /home/development1/Desktop/Valoryx
git add backend/utils/session_manager.py backend/tests/test_session_enforcement.py
git commit -m "feat(auth): add enforce_session_limit helper with tests"
```

---

### Task 3: Wire the helper into the password-login flow (TDD)

**Files:**
- Modify: `backend/routes/auth.py:321-325` (after `db.session.add(new_session)`, before the commit)
- Test: `backend/tests/test_session_enforcement.py` (append integration test)

- [ ] **Step 1: Write the failing integration test**

Append to `backend/tests/test_session_enforcement.py`:

```python
def test_second_login_revokes_first_session(http, sample_user, sample_client):
    """End-to-end: logging in twice leaves only the newest session active."""
    creds = {"email": sample_user.email, "password": "TestPass123!"}

    r1 = http.post("/api/auth/login", json=creds)
    assert r1.status_code == 200, r1.get_data(as_text=True)

    r2 = http.post("/api/auth/login", json=creds)
    assert r2.status_code == 200, r2.get_data(as_text=True)

    active = UserSession.query.filter_by(
        user_id=str(sample_user.user_id), is_active=True
    ).all()
    assert len(active) == 1, f"expected 1 active session, got {len(active)}"
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest tests/test_session_enforcement.py::test_second_login_revokes_first_session -v`
Expected: FAIL — `assert 2 == 1` (both sessions still active because enforcement isn't wired in)

- [ ] **Step 3: Add the import**

In `backend/routes/auth.py`, find the existing imports near the top (where `UserSession` is imported) and add:

```python
from utils.session_manager import enforce_session_limit
```

- [ ] **Step 4: Call the helper in the login flow**

In `backend/routes/auth.py`, locate this existing block (around line 321-325):

```python
        db.session.add(new_session)

        # OPTIMIZED: Single commit for last_login update and session record (non-blocking)
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()  # Don't fail login if last_login update fails
```

Replace it with:

```python
        db.session.add(new_session)

        # Single-device policy: revoke the user's other active sessions so the
        # newest login wins. Displaced devices auto-logout on their next request
        # via the SESSION_REVOKED check in auth_middleware.
        enforce_session_limit(
            user.user_id, session_id, Config.MAX_CONCURRENT_SESSIONS_PER_USER
        )

        # OPTIMIZED: Single commit for last_login update and session record (non-blocking)
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()  # Don't fail login if last_login update fails
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd backend && python -m pytest tests/test_session_enforcement.py -v`
Expected: PASS — all tests including the new integration test

- [ ] **Step 6: Run the broader auth suite for regressions**

Run: `cd backend && python -m pytest tests/test_auth.py tests/test_security.py -v`
Expected: PASS — no regressions

- [ ] **Step 7: Commit**

```bash
cd /home/development1/Desktop/Valoryx
git add backend/routes/auth.py backend/tests/test_session_enforcement.py
git commit -m "feat(auth): enforce single active session on password login"
```

---

### Task 4: Wire the helper into the Google OAuth login flow

**Files:**
- Modify: `backend/routes/oauth.py` (where `UserSession(...)` is created and committed, ~line 320-330)

- [ ] **Step 1: Read the OAuth session-creation block**

Run: `cd backend && grep -n "UserSession\|session_id\|db.session.commit\|^from\|^import" routes/oauth.py | head -40`
Expected: shows the import section, the `session_id` generation, the `UserSession(...)` construction, and the commit. Note the exact variable name used for the new session's `session_id` and the line of `db.session.add(...)`.

- [ ] **Step 2: Add the import**

In `backend/routes/oauth.py`, in the import section, add:

```python
from utils.session_manager import enforce_session_limit
```

- [ ] **Step 3: Call the helper before the commit**

In `backend/routes/oauth.py`, immediately after the line that does `db.session.add(<new_session_var>)` for the OAuth `UserSession`, and BEFORE the corresponding `db.session.commit()`, insert (substitute the actual user id and session_id variable names you found in Step 1 — they are the user object's `user_id` and the freshly-generated session id):

```python
        # Single-device policy: revoke other active sessions for this user.
        enforce_session_limit(
            user.user_id, session_id, Config.MAX_CONCURRENT_SESSIONS_PER_USER
        )
```

> If `oauth.py` does not already import `Config`, add `from config import Config` to the imports. Verify `Config` is referenced consistently with how the rest of the file accesses configuration.

- [ ] **Step 4: Verify import + syntax**

Run: `cd backend && python -c "import routes.oauth"`
Expected: no error (imports cleanly)

- [ ] **Step 5: Run the OAuth test suite**

Run: `cd backend && python -m pytest tests/test_oauth.py -v`
Expected: PASS — no regressions

- [ ] **Step 6: Commit**

```bash
cd /home/development1/Desktop/Valoryx
git add backend/routes/oauth.py
git commit -m "feat(auth): enforce single active session on Google OAuth login"
```

---

### Task 5: Frontend — distinct message for forced logout (TDD)

**Files:**
- Modify: `frontend-react/src/lib/api.ts:301-322` (the `401` branch of the response interceptor)
- Modify: `frontend-react/src/lib/__tests__/api.test.ts`

**Context:** Today every `401` clears auth and redirects silently. We want a displaced user to understand *why* they were logged out (account used on another device) vs. an ordinary token expiry. The backend already sends `{code: 'SESSION_REVOKED'}` on revoked sessions. We persist a one-shot flag in `sessionStorage` that the login page can read to show a message. (Reading it on the login page is out of scope for this task — we only set the signal; the login page can consume `localStorage.getItem('logout_reason')` later.)

- [ ] **Step 1: Write the failing test**

In `frontend-react/src/lib/__tests__/api.test.ts`, inside the existing `describe('401 response handling', ...)` block, add a new test:

```typescript
  it('flags SESSION_REVOKED logouts with a reason for the login page', async () => {
    server.use(
      http.get('*/api/anything', () =>
        HttpResponse.json(
          { error: 'Session has been revoked. Please login again.', code: 'SESSION_REVOKED' },
          { status: 401 }
        )
      )
    )

    await api.get('/api/anything').catch(() => {})

    expect(localStorage.getItem('token')).toBeNull()
    expect(localStorage.getItem('logout_reason')).toBe('session_revoked')
  })
```

> Note: match the import style/handlers already used in this test file (`server`, `http`, `HttpResponse` from MSW). If the existing tests use a different mock URL pattern than `*/api/anything`, reuse that same pattern.

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend-react && npx vitest run src/lib/__tests__/api.test.ts -t "SESSION_REVOKED"`
Expected: FAIL — `expected null to be 'session_revoked'` (flag not set yet)

- [ ] **Step 3: Set the reason flag in the 401 branch**

In `frontend-react/src/lib/api.ts`, find the start of the `401` branch:

```typescript
    if (error.response?.status === 401) {
      // Token expired or invalid
      // Clear auth keys only — billing draft stays so user sees it on next login
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      localStorage.removeItem('client')
```

Replace it with:

```typescript
    if (error.response?.status === 401) {
      // Distinguish a forced single-device logout from an ordinary token expiry,
      // so the login page can explain why the user was signed out.
      if (error.response?.data?.code === 'SESSION_REVOKED') {
        localStorage.setItem('logout_reason', 'session_revoked')
      }

      // Token expired or invalid
      // Clear auth keys only — billing draft stays so user sees it on next login
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      localStorage.removeItem('client')
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend-react && npx vitest run src/lib/__tests__/api.test.ts -t "SESSION_REVOKED"`
Expected: PASS

- [ ] **Step 5: Run the full api test file for regressions**

Run: `cd frontend-react && npx vitest run src/lib/__tests__/api.test.ts`
Expected: PASS — existing 401 tests still green

- [ ] **Step 6: Commit**

```bash
cd /home/development1/Desktop/Valoryx
git add frontend-react/src/lib/api.ts frontend-react/src/lib/__tests__/api.test.ts
git commit -m "feat(frontend): flag forced single-device logout reason on 401"
```

---

### Task 6 (OPTIONAL): Login page message + near-instant logout

Only do this if the product wants (a) a visible banner on the login screen and/or (b) the displaced device to log out within seconds even when idle. The core feature works without this — an idle displaced device logs out on its next API call, which for the POS happens constantly.

- [ ] **Step 6a (banner):** On the login page component, read `localStorage.getItem('logout_reason')`; if it equals `'session_revoked'`, render an info banner ("You were signed out because this account signed in on another device.") and then `localStorage.removeItem('logout_reason')`. Add a component test asserting the banner renders when the flag is set.

- [ ] **Step 6b (heartbeat):** Add a lightweight authenticated poll (e.g. reuse `GET /api/sessions` every 30–60s while the app is focused). Any `401 SESSION_REVOKED` from the poll runs through the existing interceptor → instant logout. Gate the interval behind a constant (no hardcoded magic number) and only poll while `document.visibilityState === 'visible'` to avoid waking idle tabs.

---

## Self-Review

**1. Spec coverage**
- "Only one user/device per account, auto-logout the other" → Tasks 2-4 (revoke-on-login) + existing `SESSION_REVOKED` middleware + existing frontend 401 redirect. ✅
- "Configurable, not hardcoded" → Task 1 (`MAX_CONCURRENT_SESSIONS_PER_USER`, env-overridable). ✅
- "Both login paths" → Task 3 (password) + Task 4 (OAuth). ✅
- "User understands why they were logged out" → Task 5 (reason flag) + optional Task 6a (banner). ✅
- "Near-instant logout (Netflix/Spotify feel)" → optional Task 6b (heartbeat). ✅ (explicitly optional)

**2. Placeholder scan** — All code steps contain complete code. Task 4 intentionally instructs reading exact variable names first (Step 1) because `oauth.py` was not fully quoted; this is a verification step, not a placeholder — the inserted code is fully specified.

**3. Type/name consistency** — Helper is `enforce_session_limit(user_id, keep_session_id, max_sessions)` everywhere (config Task 1, helper Task 2, callers Tasks 3-4). Revocation uses `is_active=False` + `revoked_at`, matching `models/session_model.py` and the existing `routes/sessions.py` revoke pattern. The middleware filter is `is_active=True`, which these revocations correctly flip.

**Edge case verified in tests:** `keep_others == 0` (limit 1) must revoke *all* others — guarded explicitly (`others if keep_others == 0 else others[:-keep_others]`) because Python's `list[:-0]` returns `[]`, which would have revoked nothing. Covered by `test_limit_1_revokes_all_other_active_sessions`.

---

# Phase 2 — Confirm-Takeover UX + Instant Heartbeat + Electron Quit

**Decided behavior (LAN deployment: one server + Electron tills):**
1. Till 2 logs in with an account already active on Till 1 → backend returns `409 {code: 'SESSION_EXISTS', active_session: {device, ip_address, last_seen}}` instead of completing login.
2. Till 2 sees a confirm dialog ("already logged in on another system — continue and log them out?"). On **Continue**, it re-posts login with `force_login: true` → login completes, Till 1's session revoked by `enforce_session_limit` (Phase 1).
3. Till 1 runs an app-wide heartbeat (poll `GET /api/auth/session-check` every 30s while visible). Once revoked, that request returns `401 SESSION_REVOKED` → the existing api.ts interceptor (Phase 1) clears auth, sets `logout_reason='session_revoked'`, and redirects to the login screen.
4. The login screen, on mount, sees `logout_reason==='session_revoked'` → shows a blocking modal ("you were logged out — account signed in on another system"). On **OK** → clears the flag and, in Electron, calls `electronAPI.quitApp()` to quit the app.

**Why this shape:** the heartbeat needs NO custom kill logic — it reuses the Phase 1 interceptor. The login screen is the single place that shows the forced-logout modal and quits. No race between heartbeat and interceptor.

**OAuth note:** the Google login path keeps simple newest-wins takeover (revoke-on-login from Phase 1). A mid-redirect confirm dialog isn't practical, and tills use email/password.

---

### Task 7: Backend — 409 conflict, force_login takeover, heartbeat endpoint

**Files:**
- Modify: `backend/routes/auth.py` (login handler: add conflict check before token issue; add `/session-check` route)
- Test: `backend/tests/test_session_enforcement.py` (update integration test for the new 409 flow; add heartbeat + force tests)

- [ ] **Step 1: Add the conflict check in `login()`**

In `backend/routes/auth.py`, AFTER credentials + any 2FA are fully validated and BEFORE the session id is generated (the line `session_id = _secrets.token_urlsafe(32)`), insert. (Confirm the request JSON variable name — it is `data` from `data = request.get_json()`. Confirm `Config` and `UserSession` and `datetime` are imported — they are.)

```python
        # Single-device policy: if the account already has an active session and
        # the caller hasn't explicitly chosen to take over, surface a 409 so the
        # UI can warn and confirm before displacing the other device.
        max_sessions = Config.MAX_CONCURRENT_SESSIONS_PER_USER
        force_login = bool(data.get('force_login'))
        if max_sessions > 0 and not force_login:
            existing_sessions = (
                UserSession.query
                .filter_by(user_id=str(user.user_id), is_active=True)
                .filter(UserSession.expires_at > datetime.utcnow())
                .order_by(UserSession.last_seen.desc())
                .all()
            )
            if len(existing_sessions) >= max_sessions:
                latest = existing_sessions[0]
                return jsonify({
                    'success': False,
                    'code': 'SESSION_EXISTS',
                    'error': 'This account is already logged in on another system.',
                    'active_session': {
                        'device': latest.device,
                        'ip_address': latest.ip_address,
                        'last_seen': latest.last_seen.isoformat() if latest.last_seen else None,
                    },
                }), 409
```

- [ ] **Step 2: Add the heartbeat route**

In `backend/routes/auth.py`, add a new route (near other routes; `authenticate` is already imported):

```python
@auth_bp.route('/session-check', methods=['GET'])
@authenticate
def session_check():
    """Lightweight authenticated ping for the client heartbeat. Returns 200 while
    the session is valid; auth_middleware returns 401 SESSION_REVOKED once the
    session has been revoked by a takeover login."""
    return jsonify({'success': True}), 200
```

- [ ] **Step 3: Update / add tests**

Replace `test_second_login_revokes_first_session` in `backend/tests/test_session_enforcement.py` with these three tests:

```python
def test_second_login_without_force_returns_409(http, sample_user):
    """Second login on an account with an active session must ask for confirmation."""
    creds = {"email": sample_user.email, "password": "TestPass123!"}

    r1 = http.post("/api/auth/login", json=creds)
    assert r1.status_code == 200, r1.get_data(as_text=True)

    r2 = http.post("/api/auth/login", json=creds)
    assert r2.status_code == 409, r2.get_data(as_text=True)
    body = r2.get_json()
    assert body["code"] == "SESSION_EXISTS"
    assert "active_session" in body
    # First session is untouched until the user confirms.
    active = UserSession.query.filter_by(
        user_id=str(sample_user.user_id), is_active=True
    ).count()
    assert active == 1


def test_force_login_takes_over_and_revokes_first(http, sample_user):
    """force_login=true completes the login and revokes the other session."""
    creds = {"email": sample_user.email, "password": "TestPass123!"}

    r1 = http.post("/api/auth/login", json=creds)
    assert r1.status_code == 200

    r2 = http.post("/api/auth/login", json={**creds, "force_login": True})
    assert r2.status_code == 200, r2.get_data(as_text=True)

    active = UserSession.query.filter_by(
        user_id=str(sample_user.user_id), is_active=True
    ).all()
    assert len(active) == 1


def test_session_check_returns_200_when_session_active(http, sample_user, sample_client):
    """The heartbeat endpoint returns 200 for a live session."""
    creds = {"email": sample_user.email, "password": "TestPass123!"}
    r1 = http.post("/api/auth/login", json=creds)
    assert r1.status_code == 200
    token = r1.get_json()["token"]

    r = http.get("/api/auth/session-check", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.get_json()["success"] is True
```

> Note: the Phase 1 `test_second_login_revokes_first_session` is removed because the behavior changed from silent-revoke to confirm-first. The takeover-revokes assertion now lives in `test_force_login_takes_over_and_revokes_first`.

- [ ] **Step 4: Run and verify**

Run: `cd backend && DB_MODE=offline python -m pytest tests/test_session_enforcement.py -v`
Expected: all tests pass (5 unit + 3 new integration).

---

### Task 8: Electron — quit-app IPC

**Files:**
- Modify: `electron/preload.js`
- Modify: `electron/main.js`

- [ ] **Step 1: Expose `quitApp` in preload**

In `electron/preload.js`, inside the `exposeInMainWorld('electronAPI', { ... })` object, add a line (e.g. after `getAppVersion`):

```javascript
  // Forced logout: quit the app when the account is taken over on another till.
  quitApp: () => ipcRenderer.invoke('quit-app'),
```

- [ ] **Step 2: Handle `quit-app` in main**

In `electron/main.js`, near the other `ipcMain.handle(...)` registrations, add:

```javascript
ipcMain.handle('quit-app', () => {
  app.quit();
});
```

- [ ] **Step 3: Verify syntax**

Run: `node --check electron/preload.js && node --check electron/main.js`
Expected: no output (both valid).

---

### Task 9: Frontend — confirm dialog, forced-logout modal, heartbeat

**Files:**
- Modify: `frontend-react/src/pages/auth/Login.tsx` (409 confirm + forced-logout modal on mount)
- Modify: `frontend-react/src/App.tsx` (heartbeat poller)

- [ ] **Step 1: 409 confirm in Login.tsx**

In the login `handleSubmit` error handler, detect `409 SESSION_EXISTS`, store the `active_session` info in state, and render a confirm panel. On confirm, re-post with `force_login: true`. Implementation detail (adapt to the file's existing state/JSX style; reuse the existing `api.post('/auth/login', ...)` call shape, including any 2FA fields already sent):

```typescript
// state
const [sessionConflict, setSessionConflict] = useState<null | {
  device?: string; ip_address?: string; last_seen?: string;
}>(null)

// inside handleSubmit catch:
if (err.response?.status === 409 && err.response?.data?.code === 'SESSION_EXISTS') {
  setSessionConflict(err.response.data.active_session || {})
  return
}

// confirm handler — re-submit forcing takeover:
const confirmTakeover = async () => {
  setSessionConflict(null)
  setError('')
  try {
    const response = await api.post('/auth/login', { email, password, force_login: true })
    // ...reuse the SAME success handling as the normal login path
    // (set client data / navigate). Extract that into a helper if needed to avoid duplication.
  } catch (e: any) {
    setError(e.response?.data?.error || 'Login failed')
  }
}
```

Render a modal when `sessionConflict` is set: message "This account is already logged in on another system (device, last active …). Continue and log them out?" with **Continue** (calls `confirmTakeover`) and **Cancel** (`setSessionConflict(null)`).

- [ ] **Step 2: Forced-logout modal on Login mount**

In `Login.tsx`, on mount read the flag set by the Phase 1 interceptor:

```typescript
const [forcedLogout, setForcedLogout] = useState(false)

useEffect(() => {
  if (localStorage.getItem('logout_reason') === 'session_revoked') {
    setForcedLogout(true)
  }
}, [])

const dismissForcedLogout = () => {
  localStorage.removeItem('logout_reason')
  setForcedLogout(false)
  const electronAPI = (window as any).electronAPI
  if (electronAPI?.isElectron && typeof electronAPI.quitApp === 'function') {
    electronAPI.quitApp()
  }
}
```

Render a blocking modal when `forcedLogout` is true: "You have been logged out because this account signed in on another system." with a single **OK** button calling `dismissForcedLogout`.

- [ ] **Step 3: App-wide heartbeat**

In `frontend-react/src/App.tsx`, add an effect that, while a token exists, pings the heartbeat on an interval only when the document is visible (constant, not a magic number):

```typescript
// near top of App component module
const SESSION_HEARTBEAT_MS = 30_000

// inside App component:
useEffect(() => {
  const ping = () => {
    if (document.visibilityState !== 'visible') return
    if (!localStorage.getItem('token')) return
    // 401 is handled globally by the api.ts interceptor (clears auth + redirect).
    api.get('/auth/session-check').catch(() => {})
  }
  const id = window.setInterval(ping, SESSION_HEARTBEAT_MS)
  return () => window.clearInterval(id)
}, [])
```

> Ensure `api` is imported in App.tsx (or import from `./lib/api`). If App.tsx already polls or has an auth-gate, mount the heartbeat only while authenticated to avoid 401 loops on the login screen — the `localStorage.getItem('token')` guard handles this.

- [ ] **Step 4: Verify build + existing tests**

Run: `cd frontend-react && npx tsc --noEmit && npx vitest run src/lib/__tests__/api.test.ts`
Expected: type-check passes; api tests still pass (pre-existing caching failures excepted).

---

## Phase 2 Self-Review

- Confirm-before-takeover (Q: "warn the second user first") → Task 7 Step 1 (409) + Task 9 Step 1 (confirm dialog). ✅
- Instant notice (Q: "instant heartbeat") → Task 7 Step 2 (endpoint) + Task 9 Step 3 (poller). ✅
- OK → close app, Electron (Q: "Electron desktop app") → Task 8 (quit IPC) + Task 9 Step 2 (modal → quitApp). ✅
- Different accounts unaffected → unchanged; `enforce_session_limit` and the 409 check both filter by `user_id`. ✅
- Contract consistency: backend emits `code: 'SESSION_EXISTS'` (409) and `code: 'SESSION_REVOKED'` (401); frontend keys off those exact strings; `force_login` boolean is the takeover flag end-to-end. ✅
- Phase 1 test that contradicts new behavior (`test_second_login_revokes_first_session`) is explicitly removed/replaced in Task 7 Step 3. ✅

---

## Phase 2 — Post-Review Fixes (applied 2026-06-10)

An adversarial code review surfaced issues; the following were fixed in the working tree:

- **C1 (Critical) — login fail-closed.** `login()` previously swallowed the session-commit failure (`except: rollback()`), but the JWT is minted before commit. A failed commit would hand out a token whose `UserSession` was rolled back → instant `SESSION_REVOKED` self-logout, and the old device never revoked. Fixed: on commit failure, log and return `500` without the token (`backend/routes/auth.py`, session-commit block). The session row is required state, not best-effort like `last_login`.
- **C2 (Critical) — login race.** Two near-simultaneous logins for one account could both pass the single-session gate and create two sessions. Fixed with a per-user `with_for_update()` lock acquired before the gate (Postgres row-lock held to commit; SQLite no-op since writes serialize). Caveat: the backup-code 2FA path commits mid-flow (`auth.py` ~line 200), which releases the lock early — a rare owner-only edge; the non-2FA (cashier) and TOTP paths are fully serialized.
- **I2 (Important) — verify-email auto-login.** `verify_email()` issues a token + creates a session but skipped enforcement. Fixed: added `enforce_session_limit(...)` before its commit.
- **I3 (Important) — stuck force flag.** In `Login.tsx`, a failed `confirmTakeover` left `forceLoginRef=true`, so a subsequent login on a *different* account could silently take over without a confirm prompt. Fixed: reset `forceLoginRef` in the takeover `catch` and on email-field change.

**Known/accepted, not changed:**
- **I1** — the 409 gate filters `is_active AND expires_at>now`, while `enforce_session_limit` filters only `is_active` (revokes expired-active rows too, which is harmless). Predicates intentionally left as-is.
- **I4** — `auth_middleware` writes `last_seen` on every request (no throttle in current code); the 30s heartbeat is ~2 writes/min/till — negligible at LAN scale. Raise the interval or skip `last_seen` on `/session-check` if it ever matters.
