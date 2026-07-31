# Google identity as an alternative proof for Electron first-run setup

**Date:** 2026-07-31
**Status:** Approved, ready for implementation

## Problem

On a fresh Windows install, the Electron app shows the **"Connect Your Account"**
screen ([`ElectronSetup.tsx`](../../../frontend-react/src/pages/ElectronSetup.tsx))
before login. It accepts email + password only, and `POST /api/electron/setup`
verifies that password with bcrypt against the Supabase `users` table.

Users who signed up with Google have no password they know: `google_callback`
stores a random 32-byte bcrypt hash for them, because the column is `NOT NULL`
(`backend/routes/oauth.py`, the `dummy_pw` assignment). They therefore cannot
pass the setup screen at all, and there is no Google button and no
password-reset link on it. This is a hard first-install blocker.

Verified on a fresh empty SQLite: `GET /api/electron/needs-setup` returns
`{"needs_setup": true}`, so the screen does render — the blockage is purely the
credential requirement.

The desktop Google login machinery already exists and works in production
(confirmed by the product owner for v1.1.24): PKCE generation and the
`valoryx://` deep link in `electron/main.js`, and `POST /api/oauth/desktop-login`
on the local backend. Its only unusable-at-first-run property is that it
requires the user to **already exist locally** — it returns 403 "not set up on
this device yet" otherwise, which is exactly the fresh-install state.

## Principle

Setup needs *proof the caller controls the account's email*. Today the only
accepted proof is a bcrypt password. We add a second proof of equal strength —
a cloud-signed, PKCE-bound Google assertion — without changing what setup then
does (fetch from Supabase, import into local SQLite).

## Decisions

1. **Setup stays sync-only.** It does not mint a session. After a successful
   Google-verified sync the user lands on the normal login screen and clicks
   "Continue with Google" once more, which now succeeds because the local user
   exists. Two clicks total, seconds apart, since the browser has already
   consented. Rejected alternative: auto-sign-in, which would make
   `ElectronSetup` an auth surface that must duplicate `ClientContext`'s
   localStorage handling from outside the provider.
2. **Transport logic is shared** between the login and setup screens via one
   hook, and the setup screen inherits the manual paste-the-code fallback.

## Architecture

### 1. `backend/routes/oauth.py` — extract, don't duplicate

Extract the assertion-verification block out of `desktop_login` into a public

```python
verify_desktop_handoff(assertion: str, verifier: str) -> tuple[dict | None, dict | None, int]
```

returning `(payload, error_body, status)`. It owns signature and expiry checks,
the single-use nonce, the PKCE match, and the actionable error messages
(`expired`, `bad_signature`, `replayed`, `not_configured`, `no_verifier`,
`pkce_mismatch`). `desktop_login` becomes a caller rather than the owner.

Both endpoints going through one function keeps `_desktop_nonce_cache` genuinely
shared: an assertion consumed by setup cannot be replayed against login, and
vice versa.

### 2. `backend/routes/electron.py` — a second identity path

`POST /api/electron/setup` branches on the request body:

- `{assertion, verifier}` present → Google path
- otherwise → existing `{email, password}` path, behaviour unchanged

`_authenticate_supabase` splits into:

- `_fetch_supabase_user(engine, email)` — the query plus active/deleted checks,
  now also selecting `google_id`
- `_authenticate_supabase(engine, email, password)` — bcrypt, unchanged contract
- `_authenticate_supabase_google(engine, email, google_id)` — the Google guard

Everything downstream (`_fetch_from_supabase`, `_import_data`) is untouched.

**Google guard:** reject if the Supabase row's `google_id` is set and differs
from the assertion's. An empty `google_id` proceeds — the cloud only mints
assertions for Google-*verified* emails, the same trust boundary the web
auto-link already relies on.

**Supabase stays read-only.** Setup does not write `google_id` back to the cloud;
the local link already happens in `desktop_login` on first sign-in.

`GET /api/electron/needs-setup` additionally returns
`google_enabled: bool(Config.DESKTOP_OAUTH_SECRET)` so the button never renders
as a dead end on a build shipped without the shared secret.

The existing `@rate_limit(max_requests=5, window_seconds=300)` covers both paths,
since it decorates the endpoint.

### 3. `frontend-react/src/hooks/useDesktopGoogleHandoff.ts` — new, shared

Owns **transport only**: `start()` → `electronAPI.loginWithGoogle()`, the
`onDesktopOAuth` deep-link listener, the cold-start `getPendingOAuth()` pull, and
the paste-code fallback via `redeemOAuthCode()`.

Returns `{ available, waiting, setWaiting, start, pastedCode, setPastedCode,
redeeming, submitCode }` and invokes a caller-supplied callback with
`{assertion, verifier}`. It deliberately does not know which endpoint the
handoff is spent at — that is the caller's concern.

### 4. The two screens

- `Login.tsx` keeps `processAssertion` (→ `/oauth/desktop-login` → navigate) and
  drops its now-duplicated state, effect and `submitPastedCode`. The web
  (non-Electron) Google path is untouched.
- `ElectronSetup.tsx` gains a "Continue with Google" button and the paste-code
  fallback, spending the handoff at `/electron/setup`. `googleEnabled` arrives as
  a prop from `App.tsx`, which already holds the `needs-setup` response — no
  second request.
- The dead `server_url` field is dropped from the setup request body; the backend
  has never read it.

## Data flow (first install, Google user)

```
Setup screen → loginWithGoogle() → system browser → Google consent
  → cloud mints assertion (PKCE challenge embedded)
  → valoryx:// deep link → main.js pairs it with the verifier it alone holds
  → POST /electron/setup {assertion, verifier}
  → verify_desktop_handoff → Supabase lookup by email → fetch → import
  → onComplete() → login screen → "Continue with Google" (now works)
```

## Error handling

Assertion failures reuse the six existing messages verbatim. New cases:

- unknown email → `No Valoryx account found for <email>.`
- `google_id` mismatch → account-mismatch message

Both name the cause, consistent with `desktop_login`'s documented reasoning: a
loopback-only backend talking to its own renderer leaks nothing to a remote
attacker and saves a support round-trip.

Adjacent 3-line fix folded in: `ElectronSetup.tsx` currently reports "Setup
failed. Check your credentials." for *any* error lacking `err.response`, which
would be actively wrong on the Google path. The credential wording becomes
specific to 401s. This is a partial touch only — the separate 30-second axios
timeout issue on large imports is explicitly **out of scope** here.

## Testing

New `backend/tests/test_electron_setup.py`:

- Google happy path with a mocked Supabase engine
- expired / replayed / PKCE-mismatch assertions → 401
- `google_id` mismatch and unknown email → their own status codes
- `google_enabled` present in `needs-setup`
- regression: the email + password path behaves identically

Plus a hook test under `frontend-react/src/hooks/__tests__/`.

**Cannot be verified in this environment:** the real Electron `valoryx://`
deep-link round trip needs a Windows build. It must be smoke-tested manually on
a fresh install before release.

## Out of scope

- The 30s axios timeout vs. large-account imports
- The silent `.catch(() => {})` on the `needs-setup` check in `App.tsx`
- Rate-limit interaction with retries
