# Valoryx — Full App Audit TODO
> Generated: 2026-03-23 | Chrome DevTools + backend route code review

---

## CRITICAL — App-breaking / Data Loss

### [C1] DB_MODE=online — All API calls are 1–7 seconds slow
**File:** `backend/.env`
**Root cause:** `DB_MODE=online` routes every SQLAlchemy query to remote Supabase over the network.
Previous session confirmed `DB_MODE=offline` (local SQLite at `~/.mj-billing/local.db`) gives 0.69ms vs 307ms.
**Fix:** Set `DB_MODE=offline` in `backend/.env`. Re-run sync if data is stale.
```
DB_MODE=offline
```

---

### [C2] `loyalty_points` column missing in Supabase → HTTP 500 on Customers page
**File:** `backend/routes/customer.py` line 138
**Root cause:**
```python
reg_rows = db.session.query(
    Customer.customer_phone, Customer.customer_code, Customer.loyalty_points  # ← column doesn't exist in Supabase
).filter_by(client_id=client_id).all()
```
The `loyalty_points` column was added to local SQLite schema but **never migrated to Supabase production DB**.
Result: `GET /api/customer/list` returns HTTP 500 when `DB_MODE=online`.
**Frontend impact:** Customers page silently shows "No customers found" — error is swallowed (see [M2]).
**Fix:** Run Supabase migration to add the column:
```sql
ALTER TABLE customer ADD COLUMN IF NOT EXISTS loyalty_points INTEGER DEFAULT 0;
```
Also add to `backend/migrations/` and `backend/database/apply_perf_indexes.py`.

---

### [C3] Payment type stored as JSON string — broken display everywhere
**Files:** `backend/routes/billing.py`, `backend/routes/analytics.py`
**Root cause:** The `payment_type` field in `gst_billing` / `non_gst_billing` tables stores raw JSON strings like:
```
[{"payment_type":"Cash","amount":500.0}]
```
But `get_payment_type_map()` tries to look this up as a UUID key. Result:
- **Analytics page:** `paymentPreferences` shows `"method": "Payment [{\"payme..."` (truncated JSON)
- **Billing list:** Filter chips show raw UUID like `391760D5-D21A-423F-AE6A-E343B206...`

**Fix options:**
1. Parse the JSON string before lookup in `get_payment_type_map()`:
   ```python
   import json
   if isinstance(pt, str) and pt.startswith('['):
       parsed = json.loads(pt)
       return parsed[0].get('payment_type', 'Unknown') if parsed else 'Unknown'
   ```
2. Normalize data at write time in `billing.py` — extract the payment method name before storing.

---

## HIGH — Performance (N+1 Queries)

### [H1] Stock Transfer: 4 queries per item (N+1 × 4)
**File:** `backend/routes/stock_transfer.py`
**Lines:** `_deduct_source()` (44–57), `_add_to_dest()` (62–79), `_sync_stock_totals()` (92–99)
**Root cause:**
```python
# _deduct_source — 1 query per item
for item in items:
    src = BranchInventory.query.filter_by(branch_id=..., product_id=item.product_id, ...)

# _add_to_dest — 1 query per item
for item in items:
    dest = BranchInventory.query.filter_by(branch_id=..., product_id=product_id, ...)

# _sync_stock_totals — 2 queries per product (SUM + StockEntry lookup)
for pid in product_ids:
    total = db.session.query(func.coalesce(func.sum(...))).filter_by(product_id=pid, ...)
    entry = StockEntry.query.filter_by(product_id=pid, ...)
```
**Impact:** 10-item transfer = 40+ Supabase round-trips ≈ 30–60 seconds.
**Fix:** Batch-fetch all `BranchInventory` records for the transfer's product_ids before the loop:
```python
product_ids = [item['product_id'] for item in items]
inventories = {
    inv.product_id: inv
    for inv in BranchInventory.query.filter(
        BranchInventory.branch_id == branch_id,
        BranchInventory.product_id.in_(product_ids),
        BranchInventory.client_id == client_id
    ).all()
}
# then look up from dict instead of querying per item
```
Do the same in `_add_to_dest` and `_sync_stock_totals`.

---

### [H2] Stock code generation — N+1 on high collision rate
**File:** `backend/routes/stock.py` — `generate_item_code()`
**Root cause:** Loop retries generate a new code and query DB on each collision. Low risk currently but degrades with stock volume.
**Fix:** Generate a batch of candidate codes, then check all at once:
```python
existing = {e.item_code for e in StockEntry.query.filter(StockEntry.item_code.in_(candidates)).all()}
return next(c for c in candidates if c not in existing)
```

---

### [H3] Admin actions fire extra `db.session.commit()` per action
**File:** `backend/routes/admin.py` line 47
**Root cause:**
```python
def log_admin_action(...):
    db.session.add(audit_log)
    db.session.commit()   # ← standalone commit on every admin action
```
This is a separate Supabase round-trip on every admin user/client mutation.
**Fix:** Remove the standalone `commit()` in `log_admin_action`. Let the caller commit once at the end of the request (the existing `db.session.commit()` in each route already handles this).

---

## HIGH — Correctness Bugs

### [H4] `last_login` written twice per login
**File:** `backend/routes/auth.py` lines 250 and 299 (approx)
**Root cause:** `user.last_login = datetime.utcnow()` appears in two places — once before the session is created and once after. Second write always overwrites the first with a slightly later timestamp. Extra DB write.
**Fix:** Remove the first assignment, keep only the post-commit one.

---

### [H5] Login redirects to `/billing/create` instead of `/dashboard`
**File:** `frontend-react/src/router.tsx` or auth flow
**Root cause:** After successful login, app navigates to `/billing/create` (or whichever is the first protected route). There is no explicit `navigate('/dashboard')` after login.
**Fix:** In the login success handler, redirect explicitly:
```ts
navigate('/dashboard')
```

---

### [H6] No route at `/login` — blank page
**File:** `frontend-react/src/router.tsx`
**Root cause:** Login route is registered at `/auth/login`, not `/login`. Navigating to `/login` shows "No routes matched location" blank page with no redirect.
**Fix:** Add a redirect or alias:
```tsx
{ path: '/login', element: <Navigate to="/auth/login" replace /> }
```

---

## MEDIUM — Frontend Error Handling

### [M1] Frontend shows "No customers found" instead of error on 500
**File:** `frontend-react/src/pages/` (customers list component)
**Root cause:** The API call to `/api/customer/list` returns HTTP 500 (when `loyalty_points` column is missing), but the frontend catches the error and renders the empty state as if there are just no customers.
**Fix:** Distinguish between empty results and errors:
```ts
if (!response.ok) {
  setError('Failed to load customers. Please try again.')
  return
}
```
Show a proper error message/toast on API failures.

---

### [M2] All pages: no visible error state on API failure
**Root cause:** Several pages (customers, analytics, reports) catch exceptions and silently render empty/zero states.
**Fix:** Add a global API error boundary or per-page error state that shows a user-facing message when any API call returns 5xx.

---

## MEDIUM — Data / Query Issues

### [M3] Audit page: `billing/list?limit=1000` — unbounded large fetch
**File:** `backend/routes/audit.py` (or frontend audit page)
**Observed:** `GET /api/billing/list?type=gst&date_from=2026-02-21&date_to=2026-03-23&limit=1000`
**Root cause:** Fetches up to 1000 bills for the audit log display with no pagination.
**Fix:** Add server-side pagination. Load 50 records at a time with infinite scroll or page controls.

---

### [M4] Reports page: `billing/list?limit=500` — large unbounded fetch
**File:** `backend/routes/report.py`
**Observed:** Loads up to 500 bills for in-memory report generation.
**Fix:** Move report aggregation to the database (SQL GROUP BY) rather than fetching raw rows to Python for in-memory calculation. This reduces data transfer from ~500 rows to a single aggregated result.

---

### [M5] Session validation extra DB query on cold cache
**File:** `backend/utils/auth_middleware.py`
**Root cause:** On first request after login, `session_valid:{session_id}` cache miss triggers a `UserSession.query.filter_by(...)` DB query. Cached for 60s after first hit.
**Impact:** First request after a new login = 1 extra Supabase round-trip on top of the user/client queries.
**Fix:** Already cached for 60s — acceptable. But consider extending TTL to 5 minutes since session invalidation is rare.

---

## MEDIUM — Security / Reliability

### [M6] In-memory login rate limiter lost on restart
**File:** `backend/routes/auth.py` — `_LOGIN_FAIL_STORE`
**Root cause:** Failed login attempts are tracked in a Python dict (`_LOGIN_FAIL_STORE`). This is cleared on every backend restart. An attacker can brute-force by restarting or waiting for a deploy.
**Fix:** Move rate limiting to Redis/cache layer using the existing `CacheManager`:
```python
key = f"login_fail:{ip}:{email}"
fails = cache.get(key) or 0
cache.set(key, fails + 1, ttl=900)  # 15 min window
```

---

### [M7] React Router v7 future flag warnings
**File:** `frontend-react/src/router.tsx` or `main.tsx`
**Root cause:** React Router v6 prints deprecation warnings about future v7 behavior changes.
**Fix:** Add future flags to router:
```ts
createBrowserRouter(routes, {
  future: {
    v7_startTransition: true,
    v7_relativeSplatPath: true,
  }
})
```

---

## LOW — Code Quality

### [L1] `log_admin_action` not called on failed operations
**File:** `backend/routes/admin.py`
**Root cause:** Audit log is only written on success paths. Failed mutations are not logged, making it hard to audit attempted unauthorized changes.
**Fix:** Log failures too, with `action_type='FAILED_UPDATE'` or similar.

---

### [L2] Customer model queried 3 separate times on `/customer/list`
**File:** `backend/routes/customer.py` lines 49–139
**Root cause:** Three separate query blocks — `gst_sub`, `nongst_sub` via UNION ALL, then `walkin_gst`, `walkin_nongst`, then `reg_rows`. The UNION ALL is good, but the walk-in queries are separate.
**Impact:** 4 DB queries per customer list load (low, but could be 3 with further batching).

---

### [L3] Branch cache TTL too short (2 minutes)
**File:** `backend/routes/branches.py` line 13 — `BRANCH_CACHE_TTL = 120`
**Root cause:** Branches change very rarely (maybe once per month). 2-minute TTL means it re-fetches from Supabase 30 times per hour unnecessarily.
**Fix:** Increase to at least 10 minutes:
```python
BRANCH_CACHE_TTL = 600  # 10 minutes
```
Cache is already busted on `create_branch`, `update_branch`, `delete_branch`.

---

### [L4] `g.user['role']` role check inconsistency
**File:** Multiple routes (`branches.py`, `stock_transfer.py`, `shop_settings.py`)
**Root cause:** Some routes check `role in ('owner', 'admin')`, others check `role in ('owner', 'manager', 'admin', 'super admin')`. No single source of truth for role hierarchy.
**Fix:** Centralize role checks in `auth_middleware.py` or a `roles.py` helper with named constants:
```python
OWNER_ADMIN_ROLES = {'owner', 'admin'}
MANAGER_ROLES = {'owner', 'admin', 'manager'}
```

---

## Page-by-Page API Call Summary

| Page | API Calls Observed | Status | Notes |
|------|--------------------|--------|-------|
| `/dashboard` | `/api/analytics`, `/api/billing/list` | 200 | Analytics 3-7s on online mode |
| `/billing/create` | `/api/stock`, `/api/customers/search` | 200 | Stock fetched twice (deduped in code) |
| `/billing` (list) | `/api/billing/list` | 200 | Filter chip shows raw UUID for payment_type |
| `/stock` | `/api/stock` | 200 | OK |
| `/customers` | `/api/customer/list` | **500** | `loyalty_points` missing in Supabase |
| `/reports` | `/api/billing/list?limit=500` | 200 | Large unbounded fetch |
| `/audit` | `/api/billing/list?limit=1000` | 200 | Very large fetch, no pagination |
| `/shop-settings` | `/api/shop-settings` | 200 | OK — cached 5 min |
| `/stock-transfer` | `/api/branches` | 200 | OK |
| `/stock-transfer/branches` | `/api/branches` | 200 | OK |

---

## Priority Order to Fix

1. **[C1]** Switch `DB_MODE=offline` — instant 450× speedup, zero code change
2. **[C2]** Add `loyalty_points` Supabase migration — fixes customers 500 error
3. **[C3]** Fix payment_type JSON string display — fixes analytics + billing filter chips
4. **[H1]** Batch stock transfer DB queries — fixes potential 60-second transfers
5. **[H5]** Fix post-login redirect to `/dashboard`
6. **[H6]** Add `/login` → `/auth/login` redirect
7. **[M1]** Show real error on API failure in customers page
8. **[H4]** Remove duplicate `last_login` write
9. **[H3]** Remove extra `db.session.commit()` in `log_admin_action`
10. **[M6]** Move rate limiter to Redis/cache
11. **[M3/M4]** Paginate audit and reports endpoints
12. **[L3]** Increase branch cache TTL to 10 min
