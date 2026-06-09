# Single-Session Enforcement (Anti Credential-Sharing)

**Status:** Implemented & reviewed · uncommitted in working tree · live Electron flow not yet manually tested
**Date:** 2026-06-10
**Implementation plan:** [superpowers/plans/2026-06-09-single-session-enforcement.md](superpowers/plans/2026-06-09-single-session-enforcement.md)

---

## 1. Why this exists

A customer buys a plan for N user seats, then shares **one** login among several staff to avoid paying for more seats. The existing per-plan seat limit ([backend/routes/team.py](../backend/routes/team.py)) only caps how many **accounts** can be *created* — it does nothing about one account being used on many devices at once.

This feature closes that gap: **one account can only be actively used on one device at a time.** Sharing a login no longer lets two people work simultaneously, so buying the extra seat becomes the only option.

### What it is NOT
- It does **not** affect different staff using different accounts. Ten staff on ten tills with ten logins all work at once — that is the intended, paid usage.
- It is **per account** (`user_id`), never per device or per IP. IP is unreliable (VPN/NAT) and is used only as an informational signal, never as a gate.

---

## 2. How it works

### Deployment assumption (LAN client-server)
One server in the department runs the backend + the single database. The cash tills (Electron desktop apps) connect to that one server. Because every till shares one `user_sessions` table, enforcement is global across all tills — online or offline.

```
   Server (backend + DB, one user_sessions table)
        ▲          ▲          ▲
      Till 1     Till 2     Till 3   ← Electron clients
```

### The flow
1. **Till 2 logs in with an account already active on Till 1** → backend returns `409 SESSION_EXISTS` (with the other device's info) instead of logging in.
2. Till 2 sees a confirm dialog: *"This account is already logged in on another system. Continue and log them out?"*
3. On **Continue**, Till 2 re-submits with `force_login: true` → it logs in and Till 1's session is revoked.
4. **Till 1**, via a 30-second background heartbeat (`GET /auth/session-check`), detects the revocation within seconds → its request returns `401 SESSION_REVOKED` → the app shows *"You have been logged out — this account signed in on another system"* → **OK quits the Electron app.**

### Key design points
- **Newest-wins, but confirmed.** The second device must explicitly confirm the takeover.
- **2FA-safe.** The conflict check runs **before** the 2FA step, so a takeover never re-consumes a one-time TOTP/backup code. (2FA only applies to self-registered owners, not admin-created cashier sub-users.)
- **Configurable.** `MAX_CONCURRENT_SESSIONS_PER_USER` (default `1`). Set higher to allow N devices per account; `0` disables enforcement entirely.

---

## 3. Configuration

`backend/.env` (or environment):

```
MAX_CONCURRENT_SESSIONS_PER_USER=1   # 1 = single device (default). 0 = disabled.
```

Defined in [backend/config.py](../backend/config.py).

---

## 4. Files changed

| File | Change |
|------|--------|
| `backend/config.py` | `MAX_CONCURRENT_SESSIONS_PER_USER` flag |
| `backend/utils/session_manager.py` | **new** — `enforce_session_limit()` revokes older sessions on takeover |
| `backend/routes/auth.py` | per-user login lock, `409 SESSION_EXISTS` confirm gate (before 2FA), `force_login` takeover, `/auth/session-check` heartbeat, fail-closed on session-commit failure, enforcement added to verify-email auto-login |
| `backend/routes/oauth.py` | Google login revokes older sessions (newest-wins) |
| `backend/tests/test_session_enforcement.py` | **new** — 8 tests |
| `frontend-react/src/lib/api.ts` | 401 interceptor flags `logout_reason=session_revoked` |
| `frontend-react/src/pages/auth/Login.tsx` | "Already signed in" confirm modal, "Signed out" modal → quits app, `force_login` threaded through password + TOTP steps |
| `frontend-react/src/App.tsx` | 30s heartbeat poll (only when visible + logged in) |
| `electron/preload.js`, `electron/main.js` | `quitApp()` IPC → `app.quit()` |

---

## 5. Test status

- Backend: **164 / 166 pass** (`DB_MODE=offline python -m pytest`). The 2 failures (`test_security_headers_present`, `test_stock.py::test_delete_product_success`) are **pre-existing on `main`** and unrelated — confirmed by re-running with this work stashed.
- New session tests: **8 / 8 pass** (`tests/test_session_enforcement.py`).
- Frontend: `tsc --noEmit` clean. (ESLint is not configured in this repo.)

Run them:
```bash
cd backend && DB_MODE=offline python -m pytest tests/test_session_enforcement.py -v
cd frontend-react && npx tsc --noEmit
```

---

## 6. Manual test still needed (Electron)

The live desktop flow cannot be unit-tested. Verify on real/two desktop instances:

1. Log account **A** into till 1 — confirm normal use.
2. Log account **A** into till 2 — confirm the **"Already signed in"** dialog appears with till 1's info.
3. Click **Continue** — confirm till 2 logs in.
4. Within ~30s, confirm till 1 shows the **"Signed out"** modal and **quits on OK**.
5. Log account **A** (till 1) and account **B** (till 2) at once — confirm **neither** is disturbed.

---

## 7. Known limitations / follow-ups

- **Race edge (minor):** the per-user login lock fully serializes the non-2FA (cashier) and TOTP paths. The rare backup-code 2FA path commits mid-flow and releases the lock early — an owner-only edge, low impact.
- **Heartbeat writes `last_seen` each ping** (no throttle in current middleware) ≈ 2 writes/min/till — negligible at LAN scale; raise the interval if it ever matters.
- **Pure offline desktop installs** (each till running its *own* local DB instead of connecting to the one server) are NOT covered — there is no shared session store. The LAN client-server topology above is required.

---

## 8. ⚠️ Unrelated but higher-priority: rotate leaked secrets

`backend/.env` is gitignored now, but its secrets are in **9 historical commits** (Supabase service-role key, `JWT_SECRET`, Razorpay, Gmail, Telegram). The exposed `JWT_SECRET` lets anyone forge tokens and bypass this entire session system, so **rotate all secrets** (and then scrub history) as the top security task. Rotating `JWT_SECRET` logs everyone out — convenient to pair with deploying this feature.
