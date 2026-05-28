# Audit Log Bill Price Edit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Edit price" action on bills in the Auditor Reports page that lets owners (and users they grant the new `edit_bill_price_audit` permission to) correct line-item pricing, optionally also updating the master product rate for future bills. All changes are logged in the audit trail.

**Architecture:** New permission `edit_bill_price_audit` added to the existing permission system. The existing `PUT /billing/<bill_id>` endpoint is widened to accept either the new permission or the existing `edit_bill_details`, with a new `?update_master` query param that propagates rate changes to `StockEntry`. Frontend gets a two-step edit flow (edit modal → save-scope confirm) on the Auditor Reports page.

**Tech Stack:** Flask + SQLAlchemy + pytest (backend) · React + TypeScript + Vite + Vitest + MSW (frontend)

**Spec:** [`docs/superpowers/specs/2026-05-25-audit-log-bill-price-edit-design.md`](../specs/2026-05-25-audit-log-bill-price-edit-design.md)

---

## File Structure

**Backend — new files:**
- `backend/utils/owner_permission_sync.py` — idempotent owner auto-grant helper

**Backend — modified files:**
- `backend/app.py` — add permission to both seed lists (line ~104 and ~1322), call owner-sync at startup
- `backend/routes/billing.py` — change `PUT /billing/<bill_id>` auth, add `update_master` query param, master-rate sync logic, field whitelist
- `backend/tests/test_billing.py` — new tests for endpoint behavior
- `backend/tests/test_permissions.py` — new tests for seed + owner auto-grant

**Frontend — new files:**
- `frontend-react/src/utils/billCalc.ts` — shared bill arithmetic util
- `frontend-react/src/services/billingService.ts` — bill API wrapper (incl. `updateBillFromAudit`)
- `frontend-react/src/components/audit/SaveScopeDialog.tsx` — three-button save-scope confirm
- `frontend-react/src/components/audit/EditBillPriceDialog.tsx` — line-item editor modal
- `frontend-react/src/test/billCalc.test.ts` — unit tests for shared util
- `frontend-react/src/test/EditBillPriceDialog.test.tsx` — component test

**Frontend — modified files:**
- `frontend-react/src/pages/Audit.tsx` — add Edit button per row (permission-gated), wire dialog
- `frontend-react/src/pages/billing/CreateBill.tsx` — refactor to use shared `billCalc.ts`
- `frontend-react/src/types/billing.ts` — add `BillEditPayload` type (if not already exported elsewhere)

---

## Task 1: Add `edit_bill_price_audit` permission to the seed list

**Files:**
- Modify: `backend/app.py` (two seed locations — line ~104 and line ~1322)

There are two identical permission seed lists in `app.py` (the seeder runs in two contexts — `seed_permissions` on startup, and the migration/fallback at line 1322). The new permission MUST be added to both to keep them in sync.

- [ ] **Step 1: Locate the first seed list**

Open `backend/app.py` and find the tuple list around line 104. Look for the line:

```python
('edit_bill_details', 'Edit bill information and details'),
```

It lives under a `# Manage Bills` comment block.

- [ ] **Step 2: Add new permission right below `edit_bill_details` (first location)**

In `backend/app.py` around line 105, change:

```python
('edit_bill_details', 'Edit bill information and details'),
('delete_bills', 'Delete bills from the system'),
```

to:

```python
('edit_bill_details', 'Edit bill information and details'),
('edit_bill_price_audit', 'Edit bill prices from the audit log'),
('delete_bills', 'Delete bills from the system'),
```

- [ ] **Step 3: Locate the second seed list (around line 1322)**

Search again for the same `('edit_bill_details', ...)` line further down the file (~line 1322). Confirm it's a separate occurrence, not the same one you just edited.

- [ ] **Step 4: Add the same line in the second seed list**

Apply the same edit in the second occurrence:

```python
('edit_bill_details', 'Edit bill information and details'),
('edit_bill_price_audit', 'Edit bill prices from the audit log'),
('delete_bills', 'Delete bills from the system'),
```

- [ ] **Step 5: Commit**

```bash
git add backend/app.py
git commit -m "feat(permissions): seed edit_bill_price_audit"
```

---

## Task 2: Test that the new permission is seeded

**Files:**
- Modify: `backend/tests/test_permissions.py`

- [ ] **Step 1: Open `backend/tests/test_permissions.py` and inspect the existing pattern**

Run:
```bash
grep -n "def test_\|Permission\.query" backend/tests/test_permissions.py | head -20
```

You're looking for an existing test that queries the `Permission` table after seeding — copy that pattern.

- [ ] **Step 2: Add a regression test for the new permission**

Append this test to `backend/tests/test_permissions.py`. Note: `app_ctx` is an autouse fixture from conftest (line 306), so Flask app context is already pushed for every test — no need to request it explicitly. Inspect an existing test in `test_permissions.py` to see whether tests use the `http` fixture or just rely on autouse context.

```python
def test_edit_bill_price_audit_permission_is_seeded(http):
    """The new audit-log bill edit permission must be present in the seeded table."""
    from models.permission_model import Permission
    perm = Permission.query.filter_by(permission_name="edit_bill_price_audit").first()
    assert perm is not None, "edit_bill_price_audit permission was not seeded"
    assert perm.description == "Edit bill prices from the audit log"
    assert perm.is_active is True
```

(The `http` fixture pulls in `app`, which triggers the seeder via `create_app()`. If the existing tests in `test_permissions.py` don't use `http`, copy whichever fixture they DO use — the important thing is that the seeder has run before this test asserts.)

- [ ] **Step 3: Run the test and confirm it PASSES**

Run:
```bash
cd backend && pytest tests/test_permissions.py::test_edit_bill_price_audit_permission_is_seeded -v
```

Expected: PASS (Task 1 already added the seed entry, so this is a regression guard, not a TDD red phase).

If it fails with "permission not seeded", the seed in Task 1 was incomplete — go back and verify both locations.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_permissions.py
git commit -m "test(permissions): verify edit_bill_price_audit is seeded"
```

---

## Task 3: Write the idempotent owner auto-grant helper

**Files:**
- Create: `backend/utils/owner_permission_sync.py`
- Modify: `backend/tests/test_permissions.py`

This module grants `edit_bill_price_audit` to every existing `role='owner'` user, idempotently. Called once at app startup.

- [ ] **Step 1: Write a failing test for the helper**

Add to `backend/tests/test_permissions.py`. (Reuses the `sample_client` fixture from conftest; manually creates owner + staff users using the same field set as the `sample_user` fixture.)

```python
def test_owner_auto_grant_inserts_for_owners(http, sample_client):
    """Owner auto-grant inserts UserPermission rows for owners only."""
    from extensions import db
    from models.user_model import User
    from models.permission_model import Permission, UserPermission
    from utils.owner_permission_sync import grant_audit_edit_to_owners
    import uuid, bcrypt

    pw = bcrypt.hashpw(b"x", bcrypt.gensalt()).decode()
    owner = User(
        user_id=str(uuid.uuid4()),
        client_id=sample_client.client_id,
        role="owner",
        email=f"owner-{uuid.uuid4().hex[:8]}@valoryx-test.invalid",
        password_hash=pw,
        full_name="Test Owner",
        is_active=True,
        is_super_admin=False,
        invite_accepted=True,
        totp_enabled=False,
    )
    staff = User(
        user_id=str(uuid.uuid4()),
        client_id=sample_client.client_id,
        role="staff",
        email=f"staff-{uuid.uuid4().hex[:8]}@valoryx-test.invalid",
        password_hash=pw,
        full_name="Test Staff",
        is_active=True,
        is_super_admin=False,
        invite_accepted=True,
        totp_enabled=False,
    )
    db.session.add_all([owner, staff])
    db.session.commit()

    perm = Permission.query.filter_by(permission_name="edit_bill_price_audit").first()
    assert perm is not None

    inserted = grant_audit_edit_to_owners()
    assert inserted >= 1

    owner_perm = UserPermission.query.filter_by(
        user_id=owner.user_id, permission_id=perm.permission_id
    ).first()
    assert owner_perm is not None, "owner should have been granted edit_bill_price_audit"

    staff_perm = UserPermission.query.filter_by(
        user_id=staff.user_id, permission_id=perm.permission_id
    ).first()
    assert staff_perm is None, "staff should NOT have been granted"


def test_owner_auto_grant_is_idempotent(http, sample_client):
    """Running owner auto-grant twice must not duplicate rows."""
    from extensions import db
    from models.user_model import User
    from models.permission_model import Permission, UserPermission
    from utils.owner_permission_sync import grant_audit_edit_to_owners
    import uuid, bcrypt

    owner = User(
        user_id=str(uuid.uuid4()),
        client_id=sample_client.client_id,
        role="owner",
        email=f"owner2-{uuid.uuid4().hex[:8]}@valoryx-test.invalid",
        password_hash=bcrypt.hashpw(b"x", bcrypt.gensalt()).decode(),
        full_name="Owner 2",
        is_active=True,
        is_super_admin=False,
        invite_accepted=True,
        totp_enabled=False,
    )
    db.session.add(owner)
    db.session.commit()

    grant_audit_edit_to_owners()
    grant_audit_edit_to_owners()

    perm = Permission.query.filter_by(permission_name="edit_bill_price_audit").first()
    count = UserPermission.query.filter_by(
        user_id=owner.user_id, permission_id=perm.permission_id
    ).count()
    assert count == 1, f"expected 1 grant row, got {count}"
```

- [ ] **Step 2: Run the tests to confirm they FAIL**

Run:
```bash
cd backend && pytest tests/test_permissions.py::test_owner_auto_grant_inserts_for_owners tests/test_permissions.py::test_owner_auto_grant_is_idempotent -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'utils.owner_permission_sync'`.

- [ ] **Step 3: Create the helper module**

Create `backend/utils/owner_permission_sync.py`:

```python
"""
Idempotently grant the edit_bill_price_audit permission to every existing
user with role='owner'. Called once at app startup after the permission
seeder has run.

Idempotent: skips users that already have the grant.
Safe to call from every gunicorn worker (concurrent inserts are protected
by the (user_id, permission_id) unique constraint on user_permissions).
"""
import logging
from extensions import db
from models.user_model import User
from models.permission_model import Permission, UserPermission

logger = logging.getLogger(__name__)

PERMISSION_KEY = 'edit_bill_price_audit'


def grant_audit_edit_to_owners() -> int:
    """
    Grant the audit-log edit permission to every owner who doesn't have it yet.
    Returns the number of rows inserted.
    """
    perm = Permission.query.filter_by(permission_name=PERMISSION_KEY).first()
    if not perm:
        logger.warning(
            "grant_audit_edit_to_owners: permission %s not seeded yet, skipping",
            PERMISSION_KEY,
        )
        return 0

    owners = User.query.filter_by(role='owner').all()
    if not owners:
        return 0

    owner_ids = [o.user_id for o in owners]
    already_granted = {
        up.user_id for up in UserPermission.query.filter(
            UserPermission.permission_id == perm.permission_id,
            UserPermission.user_id.in_(owner_ids),
        ).all()
    }

    inserted = 0
    for owner in owners:
        if owner.user_id in already_granted:
            continue
        db.session.add(UserPermission(
            user_id=owner.user_id,
            permission_id=perm.permission_id,
        ))
        inserted += 1

    if inserted:
        try:
            db.session.commit()
            logger.info("Granted %s to %d owner(s)", PERMISSION_KEY, inserted)
        except Exception as e:
            db.session.rollback()
            logger.warning("Owner auto-grant commit failed (likely concurrent worker): %s", e)
            return 0

    return inserted
```

- [ ] **Step 4: Run the tests to confirm they PASS**

Run:
```bash
cd backend && pytest tests/test_permissions.py::test_owner_auto_grant_inserts_for_owners tests/test_permissions.py::test_owner_auto_grant_is_idempotent -v
```

Expected: PASS for both.

- [ ] **Step 5: Wire owner auto-grant into app startup**

Open `backend/app.py` and find where `seed_permissions()` (or equivalent permission seeding) is called. Add the auto-grant call immediately after.

Search for the seed call:
```bash
grep -n "seed_permission\|seed_data" backend/app.py | head -5
```

Locate the call (likely inside the `create_app()` factory after permission seeding). Add right after it:

```python
from utils.owner_permission_sync import grant_audit_edit_to_owners
grant_audit_edit_to_owners()
```

If the seeder is wrapped in a `with app.app_context():` block, place the call inside that same block.

- [ ] **Step 6: Smoke-run the backend to confirm no startup errors**

Run:
```bash
cd backend && DB_MODE=offline python -c "from app import create_app; app = create_app(); print('App boot OK')"
```

Expected output: `App boot OK` with no traceback. If you see `permission not seeded yet, skipping`, the seeder didn't run before the grant — check ordering.

- [ ] **Step 7: Commit**

```bash
git add backend/utils/owner_permission_sync.py backend/app.py backend/tests/test_permissions.py
git commit -m "feat(permissions): auto-grant edit_bill_price_audit to owners at startup"
```

---

## Task 4: Widen `PUT /api/billing/<bill_id>` to accept the new permission

**Files:**
- Modify: `backend/routes/billing.py` (function `update_bill`, around line 1130)
- Modify: `backend/tests/conftest.py` (add `audit_only_headers` fixture + bill creation helper)
- Modify: `backend/tests/test_billing.py` (add tests)

The current handler uses `@require_permission('edit_bill_details')`. We're replacing it with `@require_any_permission` so EITHER permission works. The `require_any_permission` decorator already exists in `backend/utils/permission_middleware.py`.

**Note on test fixtures used by Tasks 4–6:** the codebase already provides `http` (test client), `sample_client`, `sample_user`, `sample_stock`, `gst_headers`, and helper functions `make_token` and `auth_hdr` in `backend/tests/conftest.py`. Bills are created in tests via `POST /api/billing/gst` (not via a fixture). We'll add ONE new fixture: `audit_only_headers`.

- [ ] **Step 1: Add the `audit_only_headers` fixture to conftest.py**

In `backend/tests/conftest.py`, near the existing `gst_headers` fixture (around line 559), append:

```python
@pytest.fixture
def audit_only_headers(sample_user, sample_client):
    """Auth headers for a user who has ONLY edit_bill_price_audit, NOT edit_bill_details."""
    token = make_token(
        sample_user.user_id,
        sample_client.client_id,
        permissions=["edit_bill_price_audit"],
    )
    return auth_hdr(token)
```

- [ ] **Step 2: Add a helper to create a GST bill in tests**

In `backend/tests/test_billing.py`, near the top (after the `_gst_body` helper), add:

```python
def _create_gst_bill(http, sample_stock, gst_headers):
    """Create a GST bill and return its bill_id."""
    body = _gst_body(sample_stock.product_id)
    resp = http.post(
        "/api/billing/gst",
        data=json.dumps(body),
        content_type="application/json",
        headers=gst_headers,
    )
    assert resp.status_code == 201, resp.get_json()
    return resp.get_json()["bill_id"], body
```

- [ ] **Step 3: Write a failing test for the new authorization**

Add to `backend/tests/test_billing.py`:

```python
def test_update_bill_accepts_edit_bill_price_audit_permission(http, sample_stock, gst_headers, audit_only_headers):
    """A user with ONLY edit_bill_price_audit (no edit_bill_details) can call PUT /api/billing/<id>."""
    bill_id, body = _create_gst_bill(http, sample_stock, gst_headers)
    resp = http.put(
        f"/api/billing/{bill_id}",
        data=json.dumps({
            "items": body["items"],
            "subtotal": body["subtotal"],
            "gst_percentage": body["gst_percentage"],
            "payment_type": body["payment_type"],
        }),
        content_type="application/json",
        headers=audit_only_headers,
    )
    assert resp.status_code == 200, resp.get_json()
    assert resp.get_json()["success"] is True
```

- [ ] **Step 4: Run the test to confirm it FAILS with 403**

Run:
```bash
cd backend && pytest tests/test_billing.py::test_update_bill_accepts_edit_bill_price_audit_permission -v
```

Expected: FAIL with `403 Forbidden — Permission "edit_bill_details" required`.

- [ ] **Step 5: Swap the decorator on `update_bill`**

In `backend/routes/billing.py` around line 1130, change:

```python
@billing_bp.route('/<bill_id>', methods=['PUT'])
@authenticate
@require_permission('edit_bill_details')
def update_bill(bill_id):
```

to:

```python
@billing_bp.route('/<bill_id>', methods=['PUT'])
@authenticate
@require_any_permission('edit_bill_details', 'edit_bill_price_audit')
def update_bill(bill_id):
```

Update the import at the top of `backend/routes/billing.py`. Find the line:

```python
from utils.permission_middleware import require_permission
```

Change to:

```python
from utils.permission_middleware import require_permission, require_any_permission
```

- [ ] **Step 6: Run the test to confirm it PASSES**

Run:
```bash
cd backend && pytest tests/test_billing.py::test_update_bill_accepts_edit_bill_price_audit_permission -v
```

Expected: PASS.

- [ ] **Step 7: Run the full billing test suite as a regression check**

Run:
```bash
cd backend && pytest tests/test_billing.py -v
```

Expected: all tests pass. If anything fails, the auth widening shouldn't have broken existing behavior — investigate the failure rather than reverting.

- [ ] **Step 8: Commit**

```bash
git add backend/routes/billing.py backend/tests/test_billing.py backend/tests/conftest.py
git commit -m "feat(billing): allow edit_bill_price_audit permission for PUT /api/billing/<id>"
```

---

## Task 5: Add the field whitelist for `edit_bill_price_audit`-only callers

**Files:**
- Modify: `backend/routes/billing.py` (function `update_bill`)

When the caller has ONLY `edit_bill_price_audit` (not `edit_bill_details`), they may only edit pricing fields. Customer info, payment type, dates must be rejected.

- [ ] **Step 1: Write a failing test for the whitelist**

Add to `backend/tests/test_billing.py`:

```python
def test_audit_only_user_cannot_edit_customer_name(http, sample_stock, gst_headers, audit_only_headers):
    """A user with ONLY edit_bill_price_audit cannot change customer_name."""
    bill_id, body = _create_gst_bill(http, sample_stock, gst_headers)
    resp = http.put(
        f"/api/billing/{bill_id}",
        data=json.dumps({
            "items": body["items"],
            "customer_name": "EVIL HACKER",  # not allowed
            "subtotal": body["subtotal"],
            "gst_percentage": body["gst_percentage"],
            "payment_type": body["payment_type"],
        }),
        content_type="application/json",
        headers=audit_only_headers,
    )
    assert resp.status_code == 400, resp.get_json()
    assert "pricing fields" in resp.get_json().get("error", "").lower()


def test_audit_only_user_can_edit_pricing_fields(http, sample_stock, gst_headers, audit_only_headers):
    """A user with ONLY edit_bill_price_audit CAN edit item rate."""
    bill_id, body = _create_gst_bill(http, sample_stock, gst_headers)
    items = [dict(i) for i in body["items"]]
    items[0]["rate"] = float(items[0]["rate"]) + 10.0
    resp = http.put(
        f"/api/billing/{bill_id}",
        data=json.dumps({
            "items": items,
            "subtotal": body["subtotal"],
            "gst_percentage": body["gst_percentage"],
            "payment_type": body["payment_type"],
        }),
        content_type="application/json",
        headers=audit_only_headers,
    )
    assert resp.status_code == 200, resp.get_json()
```

- [ ] **Step 2: Run the tests to confirm they FAIL**

Run:
```bash
cd backend && pytest tests/test_billing.py::test_audit_only_user_cannot_edit_customer_name tests/test_billing.py::test_audit_only_user_can_edit_pricing_fields -v
```

Expected: the first test FAILS (returns 200 not 400 — whitelist not enforced yet). The second may pass.

- [ ] **Step 3: Add field whitelist enforcement at the top of `update_bill`**

In `backend/routes/billing.py`, immediately after `data = request.get_json()` inside `update_bill`, add:

```python
# Field whitelist for audit-only callers
PRICING_ONLY_FIELDS = {'items', 'subtotal', 'gst_percentage', 'gst_amount',
                       'final_amount', 'total_amount', 'discount_percentage'}
user_permissions = set(g.user.get('permissions', []))
is_super_admin = g.user.get('is_super_admin', False)
has_broad_edit = is_super_admin or 'edit_bill_details' in user_permissions

if not has_broad_edit:
    # Caller has only edit_bill_price_audit — reject non-pricing fields
    submitted_fields = set(data.keys())
    non_pricing = submitted_fields - PRICING_ONLY_FIELDS
    if non_pricing:
        return jsonify({
            'success': False,
            'error': f'Only pricing fields are editable with audit permission. Forbidden: {sorted(non_pricing)}'
        }), 400
```

Note: this block runs AFTER `@require_any_permission` has already confirmed the caller has at least one of the two permissions. We only inspect which one(s) here to decide field scope.

- [ ] **Step 4: Run the tests to confirm they PASS**

Run:
```bash
cd backend && pytest tests/test_billing.py::test_audit_only_user_cannot_edit_customer_name tests/test_billing.py::test_audit_only_user_can_edit_pricing_fields -v
```

Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/billing.py backend/tests/test_billing.py
git commit -m "feat(billing): enforce pricing-only field whitelist for audit-edit callers"
```

---

## Task 6: Add `?update_master=true` master-rate sync logic

**Files:**
- Modify: `backend/routes/billing.py` (function `update_bill`)

When `update_master=true`, after a successful bill update, propagate each line item's rate to the corresponding `StockEntry.rate`. Log each as a separate `UPDATE` audit row.

- [ ] **Step 1: Write a failing test for master-rate update**

Add to `backend/tests/test_billing.py`:

```python
def test_update_master_propagates_rate_to_stock(http, sample_stock, gst_headers, audit_only_headers):
    """With ?update_master=true, the new item rate is written to StockEntry."""
    from models.stock_model import StockEntry

    bill_id, body = _create_gst_bill(http, sample_stock, gst_headers)
    items = [dict(i) for i in body["items"]]
    new_rate = float(items[0]["rate"]) + 25.0
    items[0]["rate"] = new_rate
    product_id = items[0]["product_id"]

    resp = http.put(
        f"/api/billing/{bill_id}?update_master=true",
        data=json.dumps({
            "items": items,
            "subtotal": body["subtotal"],
            "gst_percentage": body["gst_percentage"],
            "payment_type": body["payment_type"],
        }),
        content_type="application/json",
        headers=audit_only_headers,
    )
    assert resp.status_code == 200, resp.get_json()
    assert resp.get_json().get("master_rates_updated") == 1

    stock = StockEntry.query.filter_by(product_id=product_id).first()
    assert stock is not None
    assert float(stock.rate) == new_rate, f"expected master rate {new_rate}, got {stock.rate}"


def test_update_master_default_false_does_not_touch_stock(http, sample_stock, gst_headers, audit_only_headers):
    """Without update_master, stock rate is unchanged even if bill rate changes."""
    from models.stock_model import StockEntry

    bill_id, body = _create_gst_bill(http, sample_stock, gst_headers)
    items = [dict(i) for i in body["items"]]
    product_id = items[0]["product_id"]

    stock_before = StockEntry.query.filter_by(product_id=product_id).first()
    rate_before = float(stock_before.rate)

    items[0]["rate"] = rate_before + 99.0
    resp = http.put(
        f"/api/billing/{bill_id}",
        data=json.dumps({
            "items": items,
            "subtotal": body["subtotal"],
            "gst_percentage": body["gst_percentage"],
            "payment_type": body["payment_type"],
        }),
        content_type="application/json",
        headers=audit_only_headers,
    )
    assert resp.status_code == 200

    stock_after = StockEntry.query.filter_by(product_id=product_id).first()
    assert float(stock_after.rate) == rate_before, "stock rate must be unchanged without update_master"
```

- [ ] **Step 2: Run the tests to confirm they FAIL**

Run:
```bash
cd backend && pytest tests/test_billing.py::test_update_master_propagates_rate_to_stock tests/test_billing.py::test_update_master_default_false_does_not_touch_stock -v
```

Expected: the first FAILS (`stock.rate` unchanged because feature not implemented); the second may pass (default behavior is no master change).

- [ ] **Step 3: Add master-rate sync logic**

In `backend/routes/billing.py`, inside `update_bill`, locate the block immediately BEFORE `db.session.commit()` (search for `existing_bill.updated_at = get_current_time()` — the commit is shortly after). Insert this block just before the commit:

```python
# Master-rate sync (when ?update_master=true)
update_master = request.args.get('update_master', 'false').lower() == 'true'
master_rate_updates = []  # for audit logging after commit

if update_master:
    # Build old-rate map from old_items for diff detection
    old_rate_map = {str(item['product_id']): float(item.get('rate', 0)) for item in old_items}

    for new_item in new_items:
        pid = str(new_item['product_id'])
        new_rate = float(new_item.get('rate', 0))
        old_rate = old_rate_map.get(pid)
        if old_rate is None or new_rate == old_rate:
            continue  # no change for this item

        product = product_map.get(pid)
        if not product:
            continue  # service line or missing stock — skip silently

        master_rate_updates.append({
            'stock_id': str(product.product_id),
            'product_name': new_item.get('product_name'),
            'old_rate': old_rate,
            'new_rate': new_rate,
        })
        product.rate = new_rate
```

Then, AFTER `db.session.commit()` and after the existing `log_action('UPDATE', 'gst_billing' ...)` call, add:

```python
# Log each master-rate update as its own audit row
for update in master_rate_updates:
    log_action(
        'UPDATE',
        'stock',
        update['stock_id'],
        old_data={'rate': update['old_rate']},
        new_data={
            'rate': update['new_rate'],
            'source': 'audit_log_edit',
            'triggered_by_bill_id': bill_id,
            'product_name': update['product_name'],
        },
        auto_commit=True,
    )
```

(`auto_commit=True` here because `log_action` by default joins the caller's transaction, which we've already committed. Per `backend/utils/audit_logger.py:40`, `auto_commit=True` is the right flag for standalone logs.)

- [ ] **Step 4: Update the response body to indicate master updates**

In the existing return statement of `update_bill`, extend the JSON to expose the master update count:

```python
return jsonify({
    'success': True,
    'message': 'Bill updated successfully',
    'bill': existing_bill.to_dict(),
    'master_rates_updated': len(master_rate_updates) if update_master else 0,
})
```

(The existing return probably already has `'bill': existing_bill.to_dict()` — just add the new `master_rates_updated` key. If the existing return has a different shape, preserve everything that's already there and only add the new key.)

- [ ] **Step 5: Run the tests to confirm they PASS**

Run:
```bash
cd backend && pytest tests/test_billing.py::test_update_master_propagates_rate_to_stock tests/test_billing.py::test_update_master_default_false_does_not_touch_stock -v
```

Expected: both PASS.

- [ ] **Step 6: Add a test for service-line tolerance (no stock entry)**

This test verifies that if a bill contains a line item whose `product_id` has no corresponding `StockEntry` (e.g., a manually-typed service line), the master-rate sync silently skips it instead of 404-ing.

Because the existing `POST /api/billing/gst` validates that every item must have a real stock entry, we cannot create such a bill via the API. Instead, after creating a normal bill via `_create_gst_bill`, we mutate the bill's `items` JSON directly in the DB to add a service-line entry with a fake product_id.

Append to `backend/tests/test_billing.py`:

```python
def test_update_master_skips_lines_with_no_stock(http, sample_stock, gst_headers, audit_only_headers):
    """A service line with no StockEntry must not 404 the request when update_master=true."""
    from extensions import db
    from models.billing_model import GSTBilling
    import uuid as _uuid

    # Create a regular bill, then inject a synthetic service-line item directly into items JSON
    bill_id, body = _create_gst_bill(http, sample_stock, gst_headers)
    bill = GSTBilling.query.filter_by(bill_id=bill_id).first()
    fake_pid = str(_uuid.uuid4())
    service_line = {
        "product_id": fake_pid,
        "product_name": "Manual service",
        "quantity": 1,
        "rate": 50.0,
    }
    new_items = list(bill.items) + [service_line]
    bill.items = new_items
    db.session.commit()

    # Now PUT with master update — the service line has no StockEntry to update
    items = [dict(i) for i in new_items]
    items[-1]["rate"] = 55.0  # try to update the synthetic service line

    resp = http.put(
        f"/api/billing/{bill_id}?update_master=true",
        data=json.dumps({
            "items": items,
            "subtotal": body["subtotal"],
            "gst_percentage": body["gst_percentage"],
            "payment_type": body["payment_type"],
        }),
        content_type="application/json",
        headers=audit_only_headers,
    )
    assert resp.status_code == 200, resp.get_json()
```

Run:
```bash
cd backend && pytest tests/test_billing.py::test_update_master_skips_lines_with_no_stock -v
```

Expected: PASS (the `if not product: continue` line covers this).

- [ ] **Step 7: Commit**

```bash
git add backend/routes/billing.py backend/tests/test_billing.py backend/tests/conftest.py
git commit -m "feat(billing): add ?update_master option to PUT /billing/<id>"
```

---

## Task 7: Extract shared bill arithmetic into `billCalc.ts`

**Files:**
- Create: `frontend-react/src/utils/billCalc.ts`
- Create: `frontend-react/src/test/billCalc.test.ts`
- Modify: `frontend-react/src/pages/billing/CreateBill.tsx`

We need bill math in TWO places (CreateBill and the new EditBillPriceDialog). Per the project's DRY rule (CLAUDE.md), extract once, use twice.

- [ ] **Step 1: Find the existing bill arithmetic in `CreateBill.tsx`**

Run:
```bash
grep -n "subtotal\|gst_amount\|final_amount\|reduce\|item\.rate.*item\.quantity" frontend-react/src/pages/billing/CreateBill.tsx | head -20
```

Identify the function(s) that compute line totals and bill totals. Copy the exact formula — do not rewrite.

- [ ] **Step 2: Write failing unit tests for the shared util**

Create `frontend-react/src/test/billCalc.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { calcLine, calcBillTotals } from '@/utils/billCalc';

describe('calcLine', () => {
  it('computes subtotal, tax, and total for a simple line', () => {
    const result = calcLine({ rate: 100, quantity: 2, discount: 0, tax_percent: 18 });
    expect(result.line_subtotal).toBe(200);
    expect(result.line_discount_amount).toBe(0);
    expect(result.line_taxable).toBe(200);
    expect(result.line_tax_amount).toBe(36);
    expect(result.line_total).toBe(236);
  });

  it('applies percentage discount before tax', () => {
    const result = calcLine({ rate: 100, quantity: 1, discount: 10, tax_percent: 18 });
    expect(result.line_subtotal).toBe(100);
    expect(result.line_discount_amount).toBe(10);
    expect(result.line_taxable).toBe(90);
    expect(result.line_tax_amount).toBeCloseTo(16.2, 2);
    expect(result.line_total).toBeCloseTo(106.2, 2);
  });

  it('handles zero quantity', () => {
    const result = calcLine({ rate: 100, quantity: 0, discount: 0, tax_percent: 18 });
    expect(result.line_total).toBe(0);
  });
});

describe('calcBillTotals', () => {
  it('aggregates multiple lines', () => {
    const totals = calcBillTotals([
      { rate: 100, quantity: 2, discount: 0, tax_percent: 18 },
      { rate: 50, quantity: 1, discount: 0, tax_percent: 18 },
    ]);
    expect(totals.bill_subtotal).toBe(250);
    expect(totals.bill_tax).toBeCloseTo(45, 2);
    expect(totals.bill_total).toBeCloseTo(295, 2);
  });

  it('returns zeros for an empty bill', () => {
    const totals = calcBillTotals([]);
    expect(totals.bill_subtotal).toBe(0);
    expect(totals.bill_total).toBe(0);
  });
});
```

- [ ] **Step 3: Run tests to confirm they FAIL**

Run:
```bash
cd frontend-react && npx vitest run src/test/billCalc.test.ts
```

Expected: FAIL with module not found.

- [ ] **Step 4: Create the util**

Create `frontend-react/src/utils/billCalc.ts`:

```typescript
export interface LineInput {
  rate: number;
  quantity: number;
  discount: number;       // percentage 0-100
  tax_percent: number;    // percentage 0-100
}

export interface LineTotals extends LineInput {
  line_subtotal: number;
  line_discount_amount: number;
  line_taxable: number;
  line_tax_amount: number;
  line_total: number;
}

export interface BillTotals {
  bill_subtotal: number;
  bill_discount: number;
  bill_tax: number;
  bill_total: number;
}

export function calcLine(input: LineInput): LineTotals {
  const line_subtotal = (input.rate || 0) * (input.quantity || 0);
  const line_discount_amount = line_subtotal * ((input.discount || 0) / 100);
  const line_taxable = line_subtotal - line_discount_amount;
  const line_tax_amount = line_taxable * ((input.tax_percent || 0) / 100);
  const line_total = line_taxable + line_tax_amount;
  return {
    ...input,
    line_subtotal,
    line_discount_amount,
    line_taxable,
    line_tax_amount,
    line_total,
  };
}

export function calcBillTotals(lines: LineInput[]): BillTotals {
  return lines.reduce<BillTotals>(
    (acc, line) => {
      const t = calcLine(line);
      return {
        bill_subtotal: acc.bill_subtotal + t.line_subtotal,
        bill_discount: acc.bill_discount + t.line_discount_amount,
        bill_tax: acc.bill_tax + t.line_tax_amount,
        bill_total: acc.bill_total + t.line_total,
      };
    },
    { bill_subtotal: 0, bill_discount: 0, bill_tax: 0, bill_total: 0 },
  );
}
```

- [ ] **Step 5: Run tests to confirm they PASS**

Run:
```bash
cd frontend-react && npx vitest run src/test/billCalc.test.ts
```

Expected: all 5 PASS.

- [ ] **Step 6: Refactor `CreateBill.tsx` to use the shared util**

Open `frontend-react/src/pages/billing/CreateBill.tsx`. Locate the inline bill-math (identified in Step 1). Replace it with imports and calls to `calcLine` / `calcBillTotals`.

Concrete steps:
1. Add at the top: `import { calcLine, calcBillTotals } from '@/utils/billCalc';`
2. Wherever the file currently computes `line_total` / `subtotal` / `gst_amount` inline, replace with a call to the util.
3. Be careful: `CreateBill.tsx` may use different variable names (e.g., `gst_percentage` instead of `tax_percent`). When calling the util, map field names at the call site. Do NOT rename fields in the util — keep the util generic.

- [ ] **Step 7: Run the existing CreateBill flow manually**

Smoke test:
```bash
cd frontend-react && npm run dev
```

Open `http://localhost:3002/frontend/billing/create`, create a bill with one item, verify the GST / total looks right.

- [ ] **Step 8: Run the full frontend test suite as a regression check**

Run:
```bash
cd frontend-react && npx vitest run
```

Expected: all tests pass. If a CreateBill-related test fails because of the refactor, fix the call-site mapping in CreateBill — do NOT change the util's API.

- [ ] **Step 9: Commit**

```bash
git add frontend-react/src/utils/billCalc.ts frontend-react/src/test/billCalc.test.ts frontend-react/src/pages/billing/CreateBill.tsx
git commit -m "refactor(billing): extract shared bill arithmetic into billCalc util"
```

---

## Task 8: Add `billingService.ts` with `updateBillFromAudit`

**Files:**
- Create: `frontend-react/src/services/billingService.ts`

There is no existing billing service file (other services like `shopSettingsService.ts`, `teamService.ts` exist — follow that pattern).

- [ ] **Step 1: Inspect an existing service for the pattern**

Run:
```bash
head -40 frontend-react/src/services/shopSettingsService.ts
```

Note: imports of the shared `api` axios instance, exported async functions, return types.

- [ ] **Step 2: Create the service**

Create `frontend-react/src/services/billingService.ts`:

```typescript
import api from '@/lib/api';

export interface BillLineEdit {
  product_id: string;
  product_name: string;
  rate: number;
  quantity: number;
  discount?: number;
  tax_percent?: number;
}

export interface BillUpdatePayload {
  items: BillLineEdit[];
  subtotal: number;
  gst_percentage?: number;
  total_amount?: number;
  payment_type: string;
}

export interface BillUpdateResponse {
  success: boolean;
  message: string;
  bill: Record<string, unknown>;
  master_rates_updated: number;
}

/**
 * Update a bill from the Auditor Reports edit flow.
 * @param billId   The bill_id to update.
 * @param payload  Pricing-field-only update payload.
 * @param opts     updateMaster: also propagate new rates to StockEntry.
 */
export async function updateBillFromAudit(
  billId: string,
  payload: BillUpdatePayload,
  opts: { updateMaster: boolean },
): Promise<BillUpdateResponse> {
  const params = new URLSearchParams();
  if (opts.updateMaster) params.set('update_master', 'true');
  const url = `/billing/${billId}${params.toString() ? `?${params}` : ''}`;
  const { data } = await api.put<BillUpdateResponse>(url, payload);
  return data;
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend-react/src/services/billingService.ts
git commit -m "feat(services): add billingService.updateBillFromAudit"
```

---

## Task 9: Create `SaveScopeDialog` component

**Files:**
- Create: `frontend-react/src/components/audit/SaveScopeDialog.tsx`

The three-button dialog that appears when the user clicks Save in the edit modal.

- [ ] **Step 1: Inspect an existing modal/dialog pattern**

Run:
```bash
grep -rln "useState.*open\|Dialog\|Modal" frontend-react/src/components/ | head -10
```

Pick the most similar existing modal — copy the styling/structure conventions (Tailwind classes, focus management, backdrop, escape-to-close, etc).

- [ ] **Step 2: Create the component**

Create `frontend-react/src/components/audit/SaveScopeDialog.tsx`:

```tsx
import { useEffect, useRef } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  onChoice: (choice: 'this_bill_only' | 'update_master') => void;
  itemCount: number;       // number of edited lines, for the body copy
}

export default function SaveScopeDialog({ open, onClose, onChoice, itemCount }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-scope-title"
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800"
      >
        <h2 id="save-scope-title" className="text-lg font-semibold text-gray-900 dark:text-white">
          Where should this save?
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          You edited {itemCount} line item{itemCount === 1 ? '' : 's'}. Choose how to apply the change:
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => onChoice('this_bill_only')}
            className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Save for this bill only
          </button>
          <button
            type="button"
            onClick={() => onChoice('update_master')}
            className="rounded-md bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700"
          >
            Save &amp; update master rate
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend-react/src/components/audit/SaveScopeDialog.tsx
git commit -m "feat(audit): add SaveScopeDialog component"
```

---

## Task 10: Create `EditBillPriceDialog` component

**Files:**
- Create: `frontend-react/src/components/audit/EditBillPriceDialog.tsx`
- Create: `frontend-react/src/test/EditBillPriceDialog.test.tsx`

The main edit modal — shows line items in an editable table, recomputes totals live, opens the SaveScopeDialog on Save.

- [ ] **Step 1: Write a failing component test**

Create `frontend-react/src/test/EditBillPriceDialog.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EditBillPriceDialog from '@/components/audit/EditBillPriceDialog';

const sampleBill = {
  bill_id: 'bill-1',
  bill_number: 1001,
  customer_name: 'Acme Corp',
  items: [
    { product_id: 'p1', product_name: 'Widget', rate: 100, quantity: 2, discount: 0, tax_percent: 18 },
  ],
  gst_percentage: 18,
  payment_type: 'cash',
  subtotal: 200,
};

describe('EditBillPriceDialog', () => {
  it('renders line items and recomputes total when rate changes', () => {
    render(<EditBillPriceDialog open bill={sampleBill as any} onClose={vi.fn()} onSaved={vi.fn()} />);
    const rateInput = screen.getByLabelText(/rate.*widget/i) as HTMLInputElement;
    expect(rateInput.value).toBe('100');

    fireEvent.change(rateInput, { target: { value: '150' } });

    // line total: 150 * 2 = 300, +18% tax = 354
    expect(screen.getByTestId('bill-total').textContent).toContain('354');
  });

  it('opens SaveScopeDialog on Save click', () => {
    render(<EditBillPriceDialog open bill={sampleBill as any} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(screen.getByText(/where should this save/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to confirm they FAIL**

Run:
```bash
cd frontend-react && npx vitest run src/test/EditBillPriceDialog.test.tsx
```

Expected: FAIL with module not found.

- [ ] **Step 3: Create the component**

Create `frontend-react/src/components/audit/EditBillPriceDialog.tsx`:

```tsx
import { useState, useMemo, useEffect } from 'react';
import { calcLine, calcBillTotals, LineInput } from '@/utils/billCalc';
import { updateBillFromAudit, BillLineEdit } from '@/services/billingService';
import SaveScopeDialog from './SaveScopeDialog';
import { toast } from '@/utils/toast';

interface BillItemInput extends LineInput {
  product_id: string;
  product_name: string;
}

interface Bill {
  bill_id: string;
  bill_number: number;
  customer_name: string;
  items: Array<{
    product_id: string;
    product_name: string;
    rate: number | string;
    quantity: number | string;
    discount?: number;
    tax_percent?: number;
  }>;
  gst_percentage: number;
  payment_type: string;
  subtotal: number | string;
}

interface Props {
  open: boolean;
  bill: Bill | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditBillPriceDialog({ open, bill, onClose, onSaved }: Props) {
  const [items, setItems] = useState<BillItemInput[]>([]);
  const [showScope, setShowScope] = useState(false);
  const [saving, setSaving] = useState(false);

  // Seed editable items whenever the bill changes
  useEffect(() => {
    if (!bill) { setItems([]); return; }
    setItems(bill.items.map(i => ({
      product_id: i.product_id,
      product_name: i.product_name,
      rate: Number(i.rate),
      quantity: Number(i.quantity),
      discount: Number(i.discount ?? 0),
      tax_percent: Number(i.tax_percent ?? bill.gst_percentage ?? 0),
    })));
  }, [bill]);

  const totals = useMemo(() => calcBillTotals(items), [items]);

  const setField = (idx: number, field: keyof LineInput, value: number) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };

  const handleSaveClick = () => setShowScope(true);

  const handleScopeChoice = async (choice: 'this_bill_only' | 'update_master') => {
    if (!bill) return;
    setShowScope(false);
    setSaving(true);
    try {
      const payload = {
        items: items as BillLineEdit[],
        subtotal: totals.bill_subtotal,
        gst_percentage: bill.gst_percentage,
        payment_type: bill.payment_type,
      };
      const result = await updateBillFromAudit(bill.bill_id, payload, {
        updateMaster: choice === 'update_master',
      });
      toast.success(
        result.master_rates_updated > 0
          ? `Bill #${bill.bill_number} updated. ${result.master_rates_updated} master rate${result.master_rates_updated === 1 ? '' : 's'} updated.`
          : `Bill #${bill.bill_number} updated.`,
      );
      onSaved();
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to update bill';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!open || !bill) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
      <div role="dialog" aria-modal="true" className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Edit prices — Bill #{bill.bill_number}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{bill.customer_name}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-700" aria-label="Close">✕</button>
        </div>

        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th>Item</th>
              <th>Rate</th>
              <th>Qty</th>
              <th>Disc %</th>
              <th>Tax %</th>
              <th className="text-right">Line total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const t = calcLine(item);
              return (
                <tr key={item.product_id} className="border-t">
                  <td className="py-2">{item.product_name}</td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      aria-label={`Rate for ${item.product_name}`}
                      value={item.rate}
                      onChange={e => setField(idx, 'rate', Number(e.target.value))}
                      className="w-24 rounded border px-2 py-1"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="1"
                      aria-label={`Quantity for ${item.product_name}`}
                      value={item.quantity}
                      onChange={e => setField(idx, 'quantity', Number(e.target.value))}
                      className="w-20 rounded border px-2 py-1"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      aria-label={`Discount for ${item.product_name}`}
                      value={item.discount}
                      onChange={e => setField(idx, 'discount', Number(e.target.value))}
                      className="w-20 rounded border px-2 py-1"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      aria-label={`Tax for ${item.product_name}`}
                      value={item.tax_percent}
                      onChange={e => setField(idx, 'tax_percent', Number(e.target.value))}
                      className="w-20 rounded border px-2 py-1"
                    />
                  </td>
                  <td className="text-right font-medium">{t.line_total.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="mt-6 border-t pt-4 text-right">
          <div className="text-sm text-gray-600 dark:text-gray-300">Subtotal: {totals.bill_subtotal.toFixed(2)}</div>
          <div className="text-sm text-gray-600 dark:text-gray-300">Tax: {totals.bill_tax.toFixed(2)}</div>
          <div className="text-lg font-bold text-gray-900 dark:text-white" data-testid="bill-total">
            Total: ₹{totals.bill_total.toFixed(2)}
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded border px-4 py-2">Cancel</button>
          <button
            type="button"
            onClick={handleSaveClick}
            disabled={saving}
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        <SaveScopeDialog
          open={showScope}
          onClose={() => setShowScope(false)}
          onChoice={handleScopeChoice}
          itemCount={items.length}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the component tests to confirm they PASS**

Run:
```bash
cd frontend-react && npx vitest run src/test/EditBillPriceDialog.test.tsx
```

Expected: both tests PASS. If MSW complains about an unhandled PUT, that's only a problem for the second test if it actually clicks the choice buttons — in our test it stops at opening the scope dialog, so it should be fine.

- [ ] **Step 5: Commit**

```bash
git add frontend-react/src/components/audit/EditBillPriceDialog.tsx frontend-react/src/test/EditBillPriceDialog.test.tsx
git commit -m "feat(audit): add EditBillPriceDialog component"
```

---

## Task 11: Wire the Edit button into `Audit.tsx`

**Files:**
- Modify: `frontend-react/src/pages/Audit.tsx`

Add a permission-gated Edit button to every bill row that opens `EditBillPriceDialog`.

- [ ] **Step 1: Inspect `PermissionGate` usage**

Run:
```bash
head -50 frontend-react/src/components/PermissionGate.tsx
```

Confirm the prop name (`permission` per the spec).

- [ ] **Step 2: Add imports and state to `Audit.tsx`**

In `frontend-react/src/pages/Audit.tsx`, add at the top with the other imports:

```tsx
import PermissionGate from '@/components/PermissionGate';
import EditBillPriceDialog from '@/components/audit/EditBillPriceDialog';
```

Inside the component, add state for the dialog:

```tsx
const [editingBill, setEditingBill] = useState<GSTBill | null>(null);
```

(Place this near the other `useState` calls.)

- [ ] **Step 3: Add Edit button to the bill row**

Locate the table-row JSX (around line 354 — `{gstBills.map((bill, index) => (`). Inside the row, find the last `<td>` or add a new one at the end:

```tsx
<td className="py-2">
  <PermissionGate permission="edit_bill_price_audit">
    <button
      type="button"
      disabled={bill.status === 'cancelled'}
      title={bill.status === 'cancelled' ? 'Cancelled bills cannot be edited' : 'Edit prices'}
      onClick={() => setEditingBill(bill)}
      className="rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      Edit
    </button>
  </PermissionGate>
</td>
```

If the page also renders a card view (around line 422), add the same button there inside the card body.

- [ ] **Step 4: Extract the bills fetch into a named callback**

Currently the bills fetch in `Audit.tsx` (around line 83) lives inside a `useEffect`. Refactor it so the same logic is reachable as a callback we can re-invoke after a successful edit. Pattern:

```tsx
const loadBills = useCallback(async (pageNum: number = page) => {
  setLoading(true);
  try {
    const response = await api.get('/billing/list', {
      params: { type: 'gst', status: 'final', date_from: startDate, date_to: endDate, limit: 50, page: pageNum }
    });
    const bills = response.data?.data?.bills ?? response.data?.bills ?? [];
    setGstBills(bills.filter((b: any) => b.type === 'gst'));
  } finally {
    setLoading(false);
  }
}, [startDate, endDate, page]);

useEffect(() => { loadBills(); }, [loadBills]);
```

Adapt the exact shape of the response handling to whatever the current code does. The goal is: `loadBills` is now a callable function that re-fetches.

- [ ] **Step 5: Mount the dialog at the bottom of the component's JSX**

Just before the closing `</DashboardLayout>` (or whatever the outermost wrapper is), add:

```tsx
<EditBillPriceDialog
  open={!!editingBill}
  bill={editingBill}
  onClose={() => setEditingBill(null)}
  onSaved={() => {
    setEditingBill(null);
    loadBills();
  }}
/>
```

- [ ] **Step 6: Smoke test in browser**

Run:
```bash
cd frontend-react && npm run dev
```

Login as an owner. Navigate to the Auditor Reports page. Confirm:
1. Edit button appears next to each GST bill.
2. Clicking it opens the dialog with the bill's items.
3. Changing a rate updates the displayed total live.
4. Clicking Save opens the scope dialog.
5. Choosing "Save for this bill only" closes both dialogs and shows a toast.
6. The bill list refreshes (re-fetches).

Then login as a staff user WITHOUT the new permission. Confirm:
- Edit button is NOT visible.

Then grant `edit_bill_price_audit` to the staff user via the existing permissions UI. Re-login (JWT tokens cache permissions). Confirm:
- Edit button IS now visible.

- [ ] **Step 7: Commit**

```bash
git add frontend-react/src/pages/Audit.tsx
git commit -m "feat(audit): add permission-gated price edit button to Auditor Reports"
```

---

## Task 12: End-to-end verification

**Files:** None modified. Pure verification.

- [ ] **Step 1: Run the full backend test suite**

Run:
```bash
cd backend && pytest -v
```

Expected: all tests pass.

- [ ] **Step 2: Run the full frontend test suite**

Run:
```bash
cd frontend-react && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Audit-log verification**

With the dev backend running:
1. Login as owner.
2. Edit a GST bill from the Auditor Reports page with `Save & update master rate`.
3. Open the Admin Audit page (`/admin/audit`).
4. Confirm there is **one** `UPDATE` row on `gst_billing` for the bill, with `old_data` showing the old item rate and `new_data` showing the new one.
5. Confirm there is **one** `UPDATE` row on `stock` per edited line item, with `new_data.source = 'audit_log_edit'` and `new_data.triggered_by_bill_id = <bill_id>`.

- [ ] **Step 4: Manual permission revoke test**

1. Grant `edit_bill_price_audit` to a staff user, confirm Edit button appears.
2. Revoke the permission via the permissions UI.
3. Re-login as the staff user — Edit button must disappear.
4. Bonus: with the staff still authenticated (old token in browser), manually `curl PUT /billing/<id>` — the backend must still 403 because the token's permissions claim is stale, but the DB check inside `require_any_permission` catches it.

- [ ] **Step 5: Cancelled bill test**

1. Create a GST bill, cancel it (existing flow).
2. Open Auditor Reports.
3. Confirm the Edit button is disabled on that row with tooltip "Cancelled bills cannot be edited".
4. Bonus: bypass the UI with `curl PUT /billing/<id>` — backend must return 400 "Cannot edit a cancelled bill" (existing behavior preserved).

- [ ] **Step 6: Commit a verification record (optional)**

If your team likes commit-trail records:

```bash
git commit --allow-empty -m "chore(audit): verify end-to-end audit log edit flow"
```

---

## Out of Scope (reminder)

Per the spec, these are NOT covered by this plan:
- Optimistic locking / concurrent-edit conflict detection
- Bulk edit across multiple bills
- Editing fields other than rate / quantity / discount / tax percent
- Editing cancelled bills
- UI changes to the AdminAudit page
- In-app undo button (audit history is the record)
