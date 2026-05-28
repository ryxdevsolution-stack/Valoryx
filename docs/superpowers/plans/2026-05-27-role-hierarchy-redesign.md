# Role Hierarchy Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **No-commit mode:** The user has instructed that subagents must NOT run `git add` or `git commit`. All "Step N: Commit" steps in this plan are intentionally OMITTED. After each task is implemented and tested, leave the working tree dirty for the user to review and stage manually.

**Goal:** Collapse the 5 role flat model (`owner`, `admin`, `manager`, `staff`, `cashier`) into a 3 role hierarchy (`owner` → `manager` → `staff`) with an explicit `reports_to_id` column, migrate existing data, reclassify 13+ route guards, and surface the result as a tree view on the Team page.

**Architecture:** Migration v23 atomically adds `users.reports_to_id` (FK → users.user_id, nullable), renames `admin`→`manager` and `cashier`→`staff`, backfills `reports_to_id` for existing users, normalizes `client_entry.role_quotas` JSON, and invalidates all sessions. Backend routes get role-guard updates (`('owner', 'admin')` → `('owner', 'manager')` for most; sessions stays owner-only). New `GET /api/team/tree` endpoint with caller-scoped response. Frontend role dropdowns drop admin/cashier; CreateClient/EditClient quotas shrink to 2 columns; TeamTab is rewritten as a tree. ~10 backend files, ~9 frontend files.

**Tech Stack:** Flask + SQLAlchemy + SQLite (offline) / PostgreSQL (Supabase). React 18 + TypeScript + Tailwind. Tests: pytest with SQLite `:memory:` + vitest.

**Reference spec:** [docs/superpowers/specs/2026-05-27-role-hierarchy-redesign.md](../specs/2026-05-27-role-hierarchy-redesign.md).

**Files in this plan:**

Backend (new):
- `backend/tests/test_migration_023.py` — migration tests
- `backend/tests/test_team_tree.py` — new tree endpoint tests

Backend (modified):
- `backend/migrations/runner.py` — add `_m023_role_hierarchy_redesign()`, bump `CURRENT_SCHEMA_VERSION` 22 → 23
- `backend/models/user_model.py` — add `reports_to_id` column + relationship
- `backend/routes/team.py` — shrink `ROLE_HIERARCHY`, prune `DEFAULT_ROLE_PERMISSIONS`, add tree endpoint, add auto-assign + subtree filter + pre-delete hook
- `backend/routes/admin.py` — shrink `allowed_quota_roles`
- `backend/routes/branches.py` — reclassify 4 route guards
- `backend/routes/invite.py` — reclassify 1 route guard
- `backend/routes/stock_transfer.py` — reclassify 1 helper
- `backend/routes/sessions.py` — reclassify 2 guards (owner-only)
- `backend/tests/conftest.py` — update fixture roles (admin/cashier → manager/staff)

Frontend (modified):
- `frontend-react/src/pages/admin/CreateUser.tsx` — role dropdown
- `frontend-react/src/pages/admin/EditUser.tsx` — role dropdown
- `frontend-react/src/pages/admin/CreateClient.tsx` — quota grid 4 → 2 columns
- `frontend-react/src/pages/admin/EditClient.tsx` — same
- `frontend-react/src/components/profile/TeamTab.tsx` — rewrite as tree view
- `frontend-react/src/components/profile/TeamMemberModal.tsx` — role dropdown
- `frontend-react/src/components/Sidebar.tsx` — `role === 'admin'` → `role === 'manager'`
- `frontend-react/src/components/BottomNav.tsx` — same
- `frontend-react/src/components/billing/ProfitSummaryBar.tsx` — same
- `frontend-react/src/pages/Salary.tsx` — same
- `frontend-react/src/pages/stock-transfer/BranchManagement.tsx` — role label + roleOrder array

---

## Task 1: Migration v23 — schema + data + sessions in one transaction (TDD)

Single migration handles ALL data changes atomically. Write the test first.

**Files:**
- Create: `backend/tests/test_migration_023.py`
- Modify: `backend/migrations/runner.py` — add `_m023_role_hierarchy_redesign(db)`, register in `MIGRATIONS`, bump `CURRENT_SCHEMA_VERSION` 22 → 23

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_migration_023.py`:

```python
"""Test for Migration v23 — role hierarchy redesign.

Atomic migration:
1. Add users.reports_to_id column (FK + index).
2. UPDATE roles: admin → manager, cashier → staff.
3. Backfill reports_to_id: managers/staff → their client's owner.user_id.
4. Normalize client_entry.role_quotas: fold admin into manager, cashier into staff.
5. Invalidate sessions (DELETE FROM user_sessions).
"""
import json
import uuid
import bcrypt
import pytest
from sqlalchemy import inspect, text


@pytest.fixture
def fresh_app(app):
    return app


def _make_client(db, name='C'):
    from models.client_model import ClientEntry
    c = ClientEntry(
        client_id=str(uuid.uuid4()),
        client_name=name,
        email=f'{name.lower()}-{uuid.uuid4().hex[:8]}@valoryx-test.invalid',
        phone='+9999',
        is_active=True,
    )
    db.session.add(c)
    db.session.commit()
    return c


def _make_user(db, client_id, role, name='U'):
    from models.user_model import User
    u = User(
        user_id=str(uuid.uuid4()),
        client_id=client_id,
        email=f'{name.lower()}-{uuid.uuid4().hex[:8]}@valoryx-test.invalid',
        password_hash=bcrypt.hashpw(b'x', bcrypt.gensalt()).decode(),
        full_name=name,
        role=role,
        is_super_admin=False,
        is_active=True,
        invite_accepted=True,
        totp_enabled=False,
    )
    db.session.add(u)
    db.session.commit()
    return u


def test_m023_adds_reports_to_id_column(fresh_app):
    from migrations.runner import _m023_role_hierarchy_redesign
    from extensions import db
    with fresh_app.app_context():
        try:
            db.session.execute(text("ALTER TABLE users DROP COLUMN reports_to_id"))
            db.session.commit()
        except Exception:
            db.session.rollback()
        _m023_role_hierarchy_redesign(db)
        cols = {c['name'] for c in inspect(db.engine).get_columns('users')}
        assert 'reports_to_id' in cols


def test_m023_renames_admin_to_manager_and_cashier_to_staff(fresh_app):
    from migrations.runner import _m023_role_hierarchy_redesign
    from extensions import db
    with fresh_app.app_context():
        c = _make_client(db)
        owner = _make_user(db, c.client_id, 'owner', 'O')
        admin_u = _make_user(db, c.client_id, 'admin', 'A')
        cashier_u = _make_user(db, c.client_id, 'cashier', 'C')

        _m023_role_hierarchy_redesign(db)

        db.session.refresh(admin_u)
        db.session.refresh(cashier_u)
        assert admin_u.role == 'manager'
        assert cashier_u.role == 'staff'


def test_m023_backfills_reports_to_id_for_non_owners(fresh_app):
    from migrations.runner import _m023_role_hierarchy_redesign
    from extensions import db
    with fresh_app.app_context():
        c = _make_client(db)
        owner = _make_user(db, c.client_id, 'owner', 'O')
        manager = _make_user(db, c.client_id, 'manager', 'M')
        staff = _make_user(db, c.client_id, 'staff', 'S')

        _m023_role_hierarchy_redesign(db)

        db.session.refresh(owner)
        db.session.refresh(manager)
        db.session.refresh(staff)
        assert owner.reports_to_id is None
        assert str(manager.reports_to_id) == str(owner.user_id)
        assert str(staff.reports_to_id) == str(owner.user_id)


def test_m023_normalizes_role_quotas_json(fresh_app):
    from migrations.runner import _m023_role_hierarchy_redesign
    from extensions import db
    from models.client_model import ClientEntry
    with fresh_app.app_context():
        c = _make_client(db)
        c.role_quotas = {'admin': 2, 'manager': 1, 'staff': 5, 'cashier': 3}
        db.session.commit()

        _m023_role_hierarchy_redesign(db)

        db.session.refresh(c)
        assert c.role_quotas == {'manager': 3, 'staff': 8}


def test_m023_leaves_role_quotas_alone_when_no_admin_or_cashier(fresh_app):
    from migrations.runner import _m023_role_hierarchy_redesign
    from extensions import db
    with fresh_app.app_context():
        c = _make_client(db)
        c.role_quotas = {'manager': 2, 'staff': 7}
        db.session.commit()

        _m023_role_hierarchy_redesign(db)

        db.session.refresh(c)
        assert c.role_quotas == {'manager': 2, 'staff': 7}


def test_m023_invalidates_all_sessions(fresh_app):
    from migrations.runner import _m023_role_hierarchy_redesign
    from extensions import db
    from models.session_model import UserSession
    with fresh_app.app_context():
        c = _make_client(db)
        owner = _make_user(db, c.client_id, 'owner', 'O')
        # Create a fake session row.
        db.session.execute(text(
            "INSERT INTO user_sessions (session_id, user_id, refresh_token_hash, created_at, expires_at, is_active) "
            "VALUES (:sid, :uid, 'hash', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)"
        ), {'sid': str(uuid.uuid4()), 'uid': owner.user_id})
        db.session.commit()
        assert UserSession.query.count() == 1

        _m023_role_hierarchy_redesign(db)

        assert UserSession.query.count() == 0


def test_m023_is_idempotent(fresh_app):
    from migrations.runner import _m023_role_hierarchy_redesign
    from extensions import db
    with fresh_app.app_context():
        c = _make_client(db)
        owner = _make_user(db, c.client_id, 'owner', 'O')
        manager = _make_user(db, c.client_id, 'manager', 'M')

        _m023_role_hierarchy_redesign(db)
        # Run a second time — should not raise and should not change anything.
        _m023_role_hierarchy_redesign(db)

        db.session.refresh(manager)
        assert str(manager.reports_to_id) == str(owner.user_id)
        assert manager.role == 'manager'
```

- [ ] **Step 2: Run the test to verify failure**

Run: `cd backend && pytest tests/test_migration_023.py -v 2>&1 | tail -15`
Expected: 7 failures with `ImportError: cannot import name '_m023_role_hierarchy_redesign'`.

- [ ] **Step 3: Implement the migration in `backend/migrations/runner.py`**

At the bottom of `backend/migrations/runner.py` (after the existing `_m022_create_permission_templates` function, before the `MIGRATIONS = [` registry), add:

```python
def _m023_role_hierarchy_redesign(db):
    """v23: Collapse 5 roles to 3 (owner/manager/staff), add reports_to_id, invalidate sessions.

    Atomic steps:
      1. ALTER TABLE users ADD COLUMN reports_to_id (FK users.user_id, nullable, indexed).
      2. UPDATE users SET role='manager' WHERE role='admin'.
      3. UPDATE users SET role='staff'   WHERE role='cashier'.
      4. For each client: backfill non-owner users.reports_to_id to that client's owner.user_id.
         Owner's own reports_to_id stays NULL.
      5. Normalize client_entry.role_quotas JSON: fold admin into manager, cashier into staff.
      6. DELETE FROM user_sessions — force everyone to re-log in (one-time UX friction in
         exchange for not keeping a backward-compat role-name shim forever).

    Idempotent — re-running on already-migrated data is a no-op.
    """
    import json as _json
    inspector = sa_inspect(db.engine)
    dialect = db.engine.dialect.name

    # 1. Add reports_to_id column (idempotent via guard).
    cols = {c['name'] for c in inspector.get_columns('users')}
    if 'reports_to_id' not in cols:
        col_def = 'UUID NULL' if dialect == 'postgresql' else 'VARCHAR(36) NULL'
        db.session.execute(text(f"ALTER TABLE users ADD COLUMN reports_to_id {col_def}"))
        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_users_reports_to_id ON users (reports_to_id)"
        ))

    # 2 + 3: Role renames.
    db.session.execute(text("UPDATE users SET role = 'manager' WHERE role = 'admin'"))
    db.session.execute(text("UPDATE users SET role = 'staff'   WHERE role = 'cashier'"))

    # 4: Backfill reports_to_id. For each client, find the owner, then set
    # every non-owner user in that client to point at the owner.
    owners = db.session.execute(text(
        "SELECT user_id, client_id FROM users WHERE role = 'owner'"
    )).fetchall()
    for owner_uid, client_id in owners:
        db.session.execute(text(
            "UPDATE users SET reports_to_id = :owner "
            "WHERE client_id = :cid AND role != 'owner' "
            "AND (reports_to_id IS NULL OR reports_to_id = '')"
        ), {'owner': str(owner_uid), 'cid': str(client_id)})

    # 5: Normalize role_quotas JSON.
    rows = db.session.execute(text(
        "SELECT client_id, role_quotas FROM client_entry "
        "WHERE role_quotas IS NOT NULL AND role_quotas != ''"
    )).fetchall()
    for client_id, quotas_raw in rows:
        try:
            quotas = quotas_raw if isinstance(quotas_raw, dict) else _json.loads(quotas_raw)
        except (TypeError, ValueError):
            continue
        if not isinstance(quotas, dict):
            continue
        if 'admin' not in quotas and 'cashier' not in quotas:
            continue  # nothing to normalize
        new_quotas = {
            'manager': (quotas.get('manager', 0) or 0) + (quotas.pop('admin', 0) or 0),
            'staff':   (quotas.get('staff', 0) or 0)   + (quotas.pop('cashier', 0) or 0),
        }
        # Keep only manager and staff in the final dict.
        new_quotas = {k: v for k, v in new_quotas.items() if v > 0}
        if dialect == 'postgresql':
            db.session.execute(text(
                "UPDATE client_entry SET role_quotas = CAST(:q AS JSONB) WHERE client_id = :cid"
            ), {'q': _json.dumps(new_quotas), 'cid': str(client_id)})
        else:
            db.session.execute(text(
                "UPDATE client_entry SET role_quotas = :q WHERE client_id = :cid"
            ), {'q': _json.dumps(new_quotas), 'cid': str(client_id)})

    # 6: Invalidate all sessions — one-time, forces re-login.
    db.session.execute(text("DELETE FROM user_sessions"))

    db.session.commit()
    logging.info(f"[Migration] v23: role hierarchy redesign applied (admin→manager, cashier→staff, reports_to_id backfilled, quotas normalized, sessions cleared)")
```

In the `MIGRATIONS = [` registry, append `(23, _m023_role_hierarchy_redesign),` after the existing `(22, _m022_create_permission_templates),` line.

At the top of the file, change `CURRENT_SCHEMA_VERSION = 22` to `CURRENT_SCHEMA_VERSION = 23`.

- [ ] **Step 4: Run the test to verify pass**

Run: `cd backend && pytest tests/test_migration_023.py -v 2>&1 | tail -15`
Expected: 7 passed.

- [ ] **Step 5: Run broader test sweep**

Run: `cd backend && pytest tests/test_migration_023.py tests/test_migration_022.py tests/test_migration_019.py tests/test_permissions.py tests/test_billing.py -q 2>&1 | tail -10`
Expected: all pass.

- [ ] **Step 6: (skip — no-commit mode active)**

---

## Task 2: User model — add `reports_to_id` column + relationship

The SQLAlchemy model needs to know about the new column so ORM queries can use `user.reports_to` and `user.direct_reports`.

**Files:**
- Modify: `backend/models/user_model.py`

- [ ] **Step 1: Add the column + self-referential relationship**

Open `backend/models/user_model.py`. Find the existing column declarations (after `branch_id` around line 35). Add:

```python
    reports_to_id = db.Column(
        FlexibleUUID,
        db.ForeignKey('users.user_id'),
        nullable=True,
        index=True,
    )
    reports_to = db.relationship(
        'User',
        remote_side='User.user_id',
        foreign_keys=[reports_to_id],
        backref='direct_reports',
        uselist=False,
    )
```

In the `to_dict()` method (or equivalent serializer), add the field after `branch_id`:

```python
            'reports_to_id': str(self.reports_to_id) if self.reports_to_id else None,
```

- [ ] **Step 2: Verify the model loads + tests still pass**

Run: `cd backend && python3 -c "from app import create_app; app = create_app(); print('OK')" 2>&1 | tail -3`
Expected: prints `OK`.

Run: `cd backend && pytest tests/test_migration_023.py tests/test_permissions.py -q 2>&1 | tail -10`
Expected: all pass.

- [ ] **Step 3: (skip — no-commit mode active)**

---

## Task 3: Update test conftest fixtures (role admin/cashier → manager/staff)

`backend/tests/conftest.py` creates test users; some have `role='admin'` or `role='cashier'`. After Task 1 those roles no longer exist. Update fixtures to use `manager`/`staff` so tests don't accidentally seed invalid roles.

**Files:**
- Modify: `backend/tests/conftest.py`

- [ ] **Step 1: Find and update role references**

Run: `grep -nE "role=.admin.|role=.cashier.|role.*=.*['\"]admin['\"]|role.*=.*['\"]cashier['\"]" backend/tests/conftest.py | head -10`

For each match, change `'admin'` → `'manager'` and `'cashier'` → `'staff'`.

- [ ] **Step 2: Run the full backend test suite**

Run: `cd backend && pytest -x --tb=short 2>&1 | tail -10`
Expected: all pass (or only the known pre-existing `test_security_headers_present` failure).

- [ ] **Step 3: (skip — no-commit mode active)**

---

## Task 4: Reclassify the 13+ route guards (mechanical mass-edit)

All routes currently gated by `('owner', 'admin')` or `['owner', 'admin']` get reclassified per the spec's section 4 table. Sessions becomes owner-only; everything else becomes owner+manager.

**Files:**
- Modify: `backend/routes/branches.py` (4 guards)
- Modify: `backend/routes/invite.py` (1 guard)
- Modify: `backend/routes/stock_transfer.py` (1 helper function)
- Modify: `backend/routes/sessions.py` (2 guards → owner-only)
- Modify: `backend/routes/team.py` (6 guards)

- [ ] **Step 1: branches.py — 4 guards owner+admin → owner+manager**

In `backend/routes/branches.py`, find each line matching `if user_role not in ('owner', 'admin'):` (4 occurrences around lines 98, 186, 249, 288). Change every one to:

```python
if user_role not in ('owner', 'manager'):
```

- [ ] **Step 2: invite.py — 1 guard**

In `backend/routes/invite.py` around line 216, find:
```python
@require_role(['owner', 'admin'])
```
Change to:
```python
@require_role(['owner', 'manager'])
```

- [ ] **Step 3: stock_transfer.py — 1 helper**

In `backend/routes/stock_transfer.py` around line 20, find:
```python
return user.get('role') in ('owner', 'admin') or user.get('is_super_admin')
```
Change to:
```python
return user.get('role') in ('owner', 'manager') or user.get('is_super_admin')
```

- [ ] **Step 4: sessions.py — 2 guards owner+admin → owner-only**

In `backend/routes/sessions.py` around lines 112 and 135, find:
```python
@require_role(['owner', 'admin'])
```
Change BOTH to:
```python
@require_role(['owner'])
```

- [ ] **Step 5: team.py — 6 guards (and shrink ROLE_HIERARCHY + DEFAULT_ROLE_PERMISSIONS)**

In `backend/routes/team.py`:

(a) Replace `ROLE_HIERARCHY` (around line 47):
```python
ROLE_HIERARCHY = {'staff': 0, 'manager': 1, 'owner': 2}
```

(b) Find all 6 occurrences of `@require_role(['owner', 'admin'])` (around lines 282, 373, 597, 715, 773, 841). Change each to:
```python
@require_role(['owner', 'manager'])
```

(c) In `DEFAULT_ROLE_PERMISSIONS` (starts around line 91): delete the entire `'admin': [...]` entry AND the entire `'cashier': [...]` entry. Keep only `owner`, `manager`, `staff`. Use the Read tool to view the current state, then Edit each block out.

- [ ] **Step 6: Verify with grep that no `'admin'` role-string remains in route guards**

Run: `grep -rn "'admin'" backend/routes/ | grep -v "admin_email\|is_super_admin\|/admin/\|admin_bp\|admin =" | head -10`
Expected: 0 matches.

Run: `grep -rn "'cashier'" backend/routes/ | head -5`
Expected: 0 matches.

- [ ] **Step 7: Run backend tests**

Run: `cd backend && pytest -x --tb=short 2>&1 | tail -10`
Expected: all pass.

- [ ] **Step 8: (skip — no-commit mode active)**

---

## Task 5: Shrink `allowed_quota_roles` in admin.py

Quota POST/PUT handlers accept only `manager` and `staff` keys.

**Files:**
- Modify: `backend/routes/admin.py`

- [ ] **Step 1: Update both occurrences**

In `backend/routes/admin.py`, find the two lines:

```python
allowed_quota_roles = {'admin', 'manager', 'staff', 'cashier'}
```

(around lines 1195 and 1358 — verify with `grep -n "allowed_quota_roles" backend/routes/admin.py`)

Replace both with:
```python
allowed_quota_roles = {'manager', 'staff'}
```

- [ ] **Step 2: Verify**

Run: `grep -n "allowed_quota_roles" backend/routes/admin.py`
Expected: both lines show the 2-key set.

Run: `cd backend && pytest tests/test_permissions.py tests/test_billing.py -q 2>&1 | tail -5`
Expected: all pass.

- [ ] **Step 3: (skip — no-commit mode active)**

---

## Task 6: `POST /api/team/users` — auto-assign + role validation (TDD)

The endpoint accepts an optional `reports_to_id` but enforces hierarchy server-side.

**Files:**
- Create: `backend/tests/test_team_hierarchy.py`
- Modify: `backend/routes/team.py` — the existing `create_user` handler (around line 482)

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_team_hierarchy.py`:

```python
"""Tests for the role-hierarchy auto-assignment rules on POST /api/team/users."""
import uuid
import bcrypt
import pytest

from conftest import make_token, auth_hdr


@pytest.fixture
def owner_user_in(sample_client):
    """Create an owner user in sample_client; return the User."""
    from extensions import db
    from models.user_model import User
    u = User(
        user_id=str(uuid.uuid4()),
        client_id=sample_client.client_id,
        email=f'owner-{uuid.uuid4().hex[:8]}@valoryx-test.invalid',
        password_hash=bcrypt.hashpw(b'x', bcrypt.gensalt()).decode(),
        full_name='O',
        role='owner',
        is_super_admin=False,
        is_active=True,
        invite_accepted=True,
        totp_enabled=False,
    )
    db.session.add(u)
    db.session.commit()
    return u


@pytest.fixture
def manager_user_in(sample_client, owner_user_in):
    from extensions import db
    from models.user_model import User
    u = User(
        user_id=str(uuid.uuid4()),
        client_id=sample_client.client_id,
        email=f'mgr-{uuid.uuid4().hex[:8]}@valoryx-test.invalid',
        password_hash=bcrypt.hashpw(b'x', bcrypt.gensalt()).decode(),
        full_name='M',
        role='manager',
        reports_to_id=owner_user_in.user_id,
        is_super_admin=False,
        is_active=True,
        invite_accepted=True,
        totp_enabled=False,
    )
    db.session.add(u)
    db.session.commit()
    return u


def _hdr(user, client, perms=()):
    return auth_hdr(make_token(user.user_id, client.client_id, permissions=list(perms)))


def test_manager_creating_staff_auto_sets_reports_to_id_to_self(http, sample_client, manager_user_in):
    """When a manager creates a staff, server forces reports_to_id = manager.user_id."""
    resp = http.post(
        '/api/team/users',
        json={
            'email': f'newstaff-{uuid.uuid4().hex[:8]}@x.com',
            'password': 'pw12345',
            'role': 'staff',
            'full_name': 'NewStaff',
            'reports_to_id': str(uuid.uuid4()),  # client tries to set a bogus value
        },
        headers=_hdr(manager_user_in, sample_client),
    )
    assert resp.status_code == 201, resp.get_json()
    # Verify the row in DB has reports_to_id == manager.user_id, not the bogus UUID.
    from models.user_model import User
    new_user = User.query.filter_by(email=resp.get_json()['user']['email']).first()
    assert str(new_user.reports_to_id) == str(manager_user_in.user_id)


def test_manager_cannot_create_manager(http, sample_client, manager_user_in):
    resp = http.post(
        '/api/team/users',
        json={'email': f'm2-{uuid.uuid4().hex[:8]}@x.com', 'password': 'pw12345', 'role': 'manager', 'full_name': 'X'},
        headers=_hdr(manager_user_in, sample_client),
    )
    assert resp.status_code == 403


def test_owner_creating_manager_sets_reports_to_owner(http, sample_client, owner_user_in):
    resp = http.post(
        '/api/team/users',
        json={'email': f'm-{uuid.uuid4().hex[:8]}@x.com', 'password': 'pw12345', 'role': 'manager', 'full_name': 'NewMgr'},
        headers=_hdr(owner_user_in, sample_client),
    )
    assert resp.status_code == 201
    from models.user_model import User
    new_mgr = User.query.filter_by(email=resp.get_json()['user']['email']).first()
    assert str(new_mgr.reports_to_id) == str(owner_user_in.user_id)


def test_owner_creating_staff_with_explicit_manager_respects_it(http, sample_client, owner_user_in, manager_user_in):
    resp = http.post(
        '/api/team/users',
        json={
            'email': f's-{uuid.uuid4().hex[:8]}@x.com', 'password': 'pw12345', 'role': 'staff', 'full_name': 'S',
            'reports_to_id': str(manager_user_in.user_id),
        },
        headers=_hdr(owner_user_in, sample_client),
    )
    assert resp.status_code == 201
    from models.user_model import User
    new_s = User.query.filter_by(email=resp.get_json()['user']['email']).first()
    assert str(new_s.reports_to_id) == str(manager_user_in.user_id)


def test_owner_creating_staff_with_invalid_reports_to_fails(http, sample_client, owner_user_in):
    """If reports_to_id points to a user that doesn't exist or isn't a manager, reject."""
    resp = http.post(
        '/api/team/users',
        json={
            'email': f's-{uuid.uuid4().hex[:8]}@x.com', 'password': 'pw12345', 'role': 'staff', 'full_name': 'S',
            'reports_to_id': str(uuid.uuid4()),  # bogus UUID
        },
        headers=_hdr(owner_user_in, sample_client),
    )
    assert resp.status_code == 400


def test_owner_cannot_create_second_owner(http, sample_client, owner_user_in):
    resp = http.post(
        '/api/team/users',
        json={'email': f'o2-{uuid.uuid4().hex[:8]}@x.com', 'password': 'pw12345', 'role': 'owner', 'full_name': 'O2'},
        headers=_hdr(owner_user_in, sample_client),
    )
    assert resp.status_code == 400
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd backend && pytest tests/test_team_hierarchy.py -v 2>&1 | tail -15`
Expected: 6 failures or errors (handler doesn't enforce these rules yet).

- [ ] **Step 3: Modify the create-user handler in `backend/routes/team.py`**

Find `def create_team_user(...)` (or similar — around line 482, the POST `/users` handler). After it extracts `role` and `reports_to_id` from `data`, insert the validation block before the row is created:

```python
        # ── Role-hierarchy enforcement (Phase: hierarchy redesign) ───────
        caller_role = g.user['role']
        target_role = data.get('role', 'staff')

        # Owner role is never user-creatable.
        if target_role == 'owner':
            return jsonify({'error': 'Cannot create another owner — only one per client'}), 400

        # Manager can only create staff, never another manager.
        if caller_role == 'manager' and target_role != 'staff':
            return jsonify({'error': 'Managers can only create staff users'}), 403

        # Resolve reports_to_id based on caller + target.
        from models.user_model import User as _U
        owner_in_client = _U.query.filter_by(client_id=g.user['client_id'], role='owner').first()

        if caller_role == 'manager':
            # Manager creating staff → always reports to this manager. Ignore any client-supplied value.
            resolved_reports_to = g.user['user_id']
        elif caller_role == 'owner' and target_role == 'manager':
            # Owner creating manager → manager reports to owner.
            resolved_reports_to = g.user['user_id']
        elif caller_role == 'owner' and target_role == 'staff':
            # Owner creating staff → defaults to owner, unless client picks a specific manager.
            requested = data.get('reports_to_id')
            if requested:
                target_mgr = _U.query.filter_by(
                    user_id=requested,
                    client_id=g.user['client_id'],
                    role='manager',
                ).first()
                if not target_mgr:
                    return jsonify({'error': 'reports_to_id must reference a manager in this client'}), 400
                resolved_reports_to = requested
            else:
                resolved_reports_to = g.user['user_id']
        else:
            # Fallback — shouldn't reach here given the @require_role guard.
            resolved_reports_to = None
```

Then in the `User(...)` constructor call, change `branch_id=data.get('branch_id') or None,` (or wherever the user fields are listed) to ALSO include:

```python
            reports_to_id=resolved_reports_to,
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd backend && pytest tests/test_team_hierarchy.py -v 2>&1 | tail -15`
Expected: 6 passed.

- [ ] **Step 5: Run broader sweep**

Run: `cd backend && pytest -x --tb=short 2>&1 | tail -10`
Expected: all pass.

- [ ] **Step 6: (skip — no-commit mode active)**

---

## Task 7: `PUT /api/team/users/<id>` — re-parenting rules (TDD)

Owner can change any user's `reports_to_id`; manager can only edit their own staff (and cannot change `reports_to_id`).

**Files:**
- Modify: `backend/tests/test_team_hierarchy.py` — append PUT tests
- Modify: `backend/routes/team.py` — the existing PUT handler (around line 658)

- [ ] **Step 1: Append PUT tests**

Append to `backend/tests/test_team_hierarchy.py`:

```python
# ── PUT re-parenting rules ──────────────────────────────────────────────────

def _create_staff_under(http, hdr, manager_id):
    """Helper: create a staff via the API and return the row."""
    from models.user_model import User
    resp = http.post(
        '/api/team/users',
        json={
            'email': f'staff-{uuid.uuid4().hex[:8]}@x.com',
            'password': 'pw12345',
            'role': 'staff',
            'full_name': 'X',
            'reports_to_id': str(manager_id),
        },
        headers=hdr,
    )
    assert resp.status_code == 201, resp.get_json()
    return User.query.filter_by(email=resp.get_json()['user']['email']).first()


def test_owner_can_reparent_staff_to_different_manager(http, sample_client, owner_user_in, manager_user_in):
    from extensions import db
    from models.user_model import User
    import bcrypt as _b
    # Create a second manager.
    mgr2 = User(
        user_id=str(uuid.uuid4()), client_id=sample_client.client_id,
        email=f'm2-{uuid.uuid4().hex[:8]}@x.com',
        password_hash=_b.hashpw(b'x', _b.gensalt()).decode(),
        full_name='M2', role='manager', reports_to_id=owner_user_in.user_id,
        is_super_admin=False, is_active=True, invite_accepted=True, totp_enabled=False,
    )
    db.session.add(mgr2); db.session.commit()

    # Owner creates a staff under manager 1.
    staff = _create_staff_under(http, _hdr(owner_user_in, sample_client), manager_user_in.user_id)

    # Owner re-parents to manager 2.
    resp = http.put(
        f'/api/team/users/{staff.user_id}',
        json={'reports_to_id': str(mgr2.user_id)},
        headers=_hdr(owner_user_in, sample_client),
    )
    assert resp.status_code == 200, resp.get_json()
    db.session.refresh(staff)
    assert str(staff.reports_to_id) == str(mgr2.user_id)


def test_manager_cannot_reparent_own_staff(http, sample_client, owner_user_in, manager_user_in):
    from extensions import db
    from models.user_model import User
    import bcrypt as _b
    mgr2 = User(
        user_id=str(uuid.uuid4()), client_id=sample_client.client_id,
        email=f'm2-{uuid.uuid4().hex[:8]}@x.com',
        password_hash=_b.hashpw(b'x', _b.gensalt()).decode(),
        full_name='M2', role='manager', reports_to_id=owner_user_in.user_id,
        is_super_admin=False, is_active=True, invite_accepted=True, totp_enabled=False,
    )
    db.session.add(mgr2); db.session.commit()

    staff = _create_staff_under(http, _hdr(manager_user_in, sample_client), manager_user_in.user_id)

    # Manager tries to re-parent their own staff to manager 2 — reports_to_id field is ignored.
    resp = http.put(
        f'/api/team/users/{staff.user_id}',
        json={'reports_to_id': str(mgr2.user_id), 'full_name': 'Renamed'},
        headers=_hdr(manager_user_in, sample_client),
    )
    assert resp.status_code == 200
    db.session.refresh(staff)
    assert str(staff.reports_to_id) == str(manager_user_in.user_id), "reports_to_id must not change"
    assert staff.full_name == 'Renamed'  # other fields still updated


def test_manager_cannot_edit_another_managers_staff(http, sample_client, owner_user_in, manager_user_in):
    from extensions import db
    from models.user_model import User
    import bcrypt as _b
    mgr2 = User(
        user_id=str(uuid.uuid4()), client_id=sample_client.client_id,
        email=f'm2-{uuid.uuid4().hex[:8]}@x.com',
        password_hash=_b.hashpw(b'x', _b.gensalt()).decode(),
        full_name='M2', role='manager', reports_to_id=owner_user_in.user_id,
        is_super_admin=False, is_active=True, invite_accepted=True, totp_enabled=False,
    )
    db.session.add(mgr2); db.session.commit()

    # Owner creates staff under manager 2.
    staff_of_mgr2 = _create_staff_under(http, _hdr(owner_user_in, sample_client), mgr2.user_id)

    # Manager 1 tries to edit staff that belongs to manager 2.
    resp = http.put(
        f'/api/team/users/{staff_of_mgr2.user_id}',
        json={'full_name': 'HostileEdit'},
        headers=_hdr(manager_user_in, sample_client),
    )
    assert resp.status_code == 403
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd backend && pytest tests/test_team_hierarchy.py -k 'reparent or another' -v 2>&1 | tail -15`
Expected: failures.

- [ ] **Step 3: Modify the PUT handler in `backend/routes/team.py`**

Find `def update_team_user(...)` or similar (around line 658). Near the top of the handler, after the target user is fetched but before fields are updated, add:

```python
        caller_role = g.user['role']

        # Subtree filter: manager can only edit users whose reports_to_id is themselves.
        if caller_role == 'manager':
            if str(user.reports_to_id or '') != str(g.user['user_id']):
                return jsonify({'error': 'Manager can only edit users they manage'}), 403

        # Only owner can change reports_to_id; ignore the field for non-owner callers.
        if 'reports_to_id' in data and caller_role != 'owner':
            data.pop('reports_to_id', None)

        # If owner is changing reports_to_id, validate the target is a manager in the same client.
        if caller_role == 'owner' and 'reports_to_id' in data and data['reports_to_id']:
            from models.user_model import User as _U
            target_mgr = _U.query.filter_by(
                user_id=data['reports_to_id'],
                client_id=g.user['client_id'],
                role='manager',
            ).first()
            if not target_mgr:
                return jsonify({'error': 'reports_to_id must reference a manager in this client'}), 400
```

Then add the actual field-set in the same handler (find the existing `if 'branch_id' in data:` block as a sibling pattern and add):

```python
        if 'reports_to_id' in data:
            user.reports_to_id = data['reports_to_id'] or None
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd backend && pytest tests/test_team_hierarchy.py -v 2>&1 | tail -15`
Expected: all PUT tests + earlier POST tests pass.

- [ ] **Step 5: (skip — no-commit mode active)**

---

## Task 8: `DELETE /api/team/users/<id>` — pre-delete bubble-up hook (TDD)

When a manager is deleted, their staff's `reports_to_id` bubbles up to the manager's own `reports_to_id` (the owner).

**Files:**
- Modify: `backend/tests/test_team_hierarchy.py` — append DELETE tests
- Modify: `backend/routes/team.py` — DELETE handler (find with grep)

- [ ] **Step 1: Append DELETE tests**

Append to `backend/tests/test_team_hierarchy.py`:

```python
# ── DELETE pre-delete bubble-up ─────────────────────────────────────────────

def test_deleting_manager_reparents_staff_to_owner(http, sample_client, owner_user_in, manager_user_in):
    from extensions import db
    s1 = _create_staff_under(http, _hdr(owner_user_in, sample_client), manager_user_in.user_id)
    s2 = _create_staff_under(http, _hdr(owner_user_in, sample_client), manager_user_in.user_id)
    db.session.refresh(s1); db.session.refresh(s2)
    assert str(s1.reports_to_id) == str(manager_user_in.user_id)
    assert str(s2.reports_to_id) == str(manager_user_in.user_id)

    # Owner deletes the manager.
    resp = http.delete(
        f'/api/team/users/{manager_user_in.user_id}',
        headers=_hdr(owner_user_in, sample_client),
    )
    assert resp.status_code in (200, 204)

    # Both staff should now report to the owner.
    db.session.refresh(s1); db.session.refresh(s2)
    assert str(s1.reports_to_id) == str(owner_user_in.user_id)
    assert str(s2.reports_to_id) == str(owner_user_in.user_id)


def test_deleting_staff_with_no_reports_is_simple(http, sample_client, owner_user_in, manager_user_in):
    staff = _create_staff_under(http, _hdr(owner_user_in, sample_client), manager_user_in.user_id)
    resp = http.delete(
        f'/api/team/users/{staff.user_id}',
        headers=_hdr(owner_user_in, sample_client),
    )
    assert resp.status_code in (200, 204)
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd backend && pytest tests/test_team_hierarchy.py -k 'reparent_staff_to_owner' -v 2>&1 | tail -10`
Expected: failure (staff still point at deleted manager_id, FK orphan).

- [ ] **Step 3: Implement the pre-delete bubble-up in `backend/routes/team.py`**

Find the DELETE handler (search for `methods=['DELETE']` in team.py — around line 770 or so). Inside the handler, after the target `user` is fetched but BEFORE `db.session.delete(user)`, add:

```python
        # Pre-delete bubble-up: if target is a manager with direct reports,
        # bubble those reports up to the manager's own reports_to_id (typically the owner).
        if user.role == 'manager':
            from models.user_model import User as _U
            new_parent = user.reports_to_id  # typically the owner.user_id
            _U.query.filter_by(reports_to_id=user.user_id).update(
                {'reports_to_id': new_parent},
                synchronize_session='fetch',
            )
            db.session.flush()
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd backend && pytest tests/test_team_hierarchy.py -v 2>&1 | tail -15`
Expected: all 9 hierarchy tests pass (6 POST + 2 PUT + 2 DELETE — adjust count if my totals are off).

- [ ] **Step 5: (skip — no-commit mode active)**

---

## Task 9: `GET /api/team/tree` — new endpoint (TDD)

Returns the team as a nested structure scoped to the caller's role.

**Files:**
- Create: `backend/tests/test_team_tree.py`
- Modify: `backend/routes/team.py` — add the new endpoint

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_team_tree.py`:

```python
"""Tests for GET /api/team/tree."""
import uuid
import bcrypt
import pytest
from conftest import make_token, auth_hdr


def _u(db, client, role, name, reports_to=None):
    from models.user_model import User
    u = User(
        user_id=str(uuid.uuid4()), client_id=client.client_id,
        email=f'{name.lower()}-{uuid.uuid4().hex[:8]}@x.com',
        password_hash=bcrypt.hashpw(b'x', bcrypt.gensalt()).decode(),
        full_name=name, role=role,
        reports_to_id=reports_to,
        is_super_admin=False, is_active=True, invite_accepted=True, totp_enabled=False,
    )
    db.session.add(u); db.session.commit()
    return u


def _hdr(user, client, perms=()):
    return auth_hdr(make_token(user.user_id, client.client_id, permissions=list(perms)))


def test_owner_sees_full_tree(http, sample_client):
    from extensions import db
    owner = _u(db, sample_client, 'owner', 'Alice')
    mgr1  = _u(db, sample_client, 'manager', 'Bob',   reports_to=owner.user_id)
    mgr2  = _u(db, sample_client, 'manager', 'Frank', reports_to=owner.user_id)
    s1    = _u(db, sample_client, 'staff',   'Charlie', reports_to=mgr1.user_id)
    s2    = _u(db, sample_client, 'staff',   'Dave',    reports_to=mgr1.user_id)
    s3    = _u(db, sample_client, 'staff',   'Grace',   reports_to=mgr2.user_id)
    direct= _u(db, sample_client, 'staff',   'Henry',   reports_to=owner.user_id)

    resp = http.get('/api/team/tree', headers=_hdr(owner, sample_client))
    assert resp.status_code == 200, resp.get_json()
    body = resp.get_json()

    assert body['owner']['user_id'] == str(owner.user_id)
    mgr_ids = {m['user_id'] for m in body['managers']}
    assert mgr_ids == {str(mgr1.user_id), str(mgr2.user_id)}

    bob = next(m for m in body['managers'] if m['user_id'] == str(mgr1.user_id))
    assert {s['user_id'] for s in bob['staff']} == {str(s1.user_id), str(s2.user_id)}

    frank = next(m for m in body['managers'] if m['user_id'] == str(mgr2.user_id))
    assert {s['user_id'] for s in frank['staff']} == {str(s3.user_id)}

    assert {s['user_id'] for s in body['direct_reports']} == {str(direct.user_id)}


def test_manager_sees_only_subtree(http, sample_client):
    from extensions import db
    owner = _u(db, sample_client, 'owner', 'Alice')
    bob   = _u(db, sample_client, 'manager', 'Bob',   reports_to=owner.user_id)
    frank = _u(db, sample_client, 'manager', 'Frank', reports_to=owner.user_id)
    s1    = _u(db, sample_client, 'staff',   'Charlie', reports_to=bob.user_id)
    s2    = _u(db, sample_client, 'staff',   'Dave',    reports_to=bob.user_id)
    s3    = _u(db, sample_client, 'staff',   'Grace',   reports_to=frank.user_id)

    resp = http.get('/api/team/tree', headers=_hdr(bob, sample_client))
    assert resp.status_code == 200
    body = resp.get_json()

    assert body['self']['user_id'] == str(bob.user_id)
    assert {s['user_id'] for s in body['staff']} == {str(s1.user_id), str(s2.user_id)}
    # Frank, frank's staff, and the owner are NOT in the response.
    assert 'managers' not in body
    assert 'owner' not in body


def test_staff_gets_403(http, sample_client):
    from extensions import db
    owner = _u(db, sample_client, 'owner', 'Alice')
    mgr   = _u(db, sample_client, 'manager', 'Bob', reports_to=owner.user_id)
    staff = _u(db, sample_client, 'staff',   'Charlie', reports_to=mgr.user_id)

    resp = http.get('/api/team/tree', headers=_hdr(staff, sample_client))
    assert resp.status_code == 403


def test_cross_tenant_isolation(http, sample_client, second_client):
    from extensions import db
    a_owner = _u(db, sample_client, 'owner', 'AOwner')
    b_owner = _u(db, second_client, 'owner', 'BOwner')
    b_mgr   = _u(db, second_client, 'manager', 'BMgr', reports_to=b_owner.user_id)

    resp = http.get('/api/team/tree', headers=_hdr(a_owner, sample_client))
    assert resp.status_code == 200
    body = resp.get_json()
    # Client B's manager must not appear in client A's tree.
    mgr_ids = {m['user_id'] for m in body['managers']}
    assert str(b_mgr.user_id) not in mgr_ids
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd backend && pytest tests/test_team_tree.py -v 2>&1 | tail -10`
Expected: 4 failures, all 404 (endpoint doesn't exist).

- [ ] **Step 3: Add the endpoint to `backend/routes/team.py`**

Near the other GET endpoints in team.py (e.g. near the `/permissions/all` handler), add:

```python
@team_bp.route('/tree', methods=['GET'])
@authenticate
@require_role(['owner', 'manager'])
def get_team_tree():
    """Return the team hierarchy scoped to the caller's role.

    Owner: full {owner, managers[], direct_reports[]}.
    Manager: {self, staff[]} (only their own subtree).
    Staff: 403 (handled by @require_role).
    """
    from models.user_model import User
    client_id = g.user['client_id']
    caller_role = g.user['role']

    def _serialize(u):
        return {
            'user_id': str(u.user_id),
            'full_name': u.full_name,
            'email': u.email,
            'role': u.role,
        }

    if caller_role == 'manager':
        staff = User.query.filter_by(
            client_id=client_id,
            reports_to_id=g.user['user_id'],
        ).order_by(User.full_name).all()
        self_user = User.query.filter_by(user_id=g.user['user_id']).first()
        return jsonify({
            'self': _serialize(self_user),
            'staff': [_serialize(s) for s in staff],
        }), 200

    # owner branch
    owner = User.query.filter_by(client_id=client_id, role='owner').first()
    if not owner:
        return jsonify({'error': 'Owner not found for this client'}), 500
    managers = User.query.filter_by(
        client_id=client_id, role='manager',
    ).order_by(User.full_name).all()

    # Batch-fetch all staff in this client to assemble manager-keyed lists in one query.
    all_staff = User.query.filter_by(client_id=client_id, role='staff').order_by(User.full_name).all()
    staff_by_parent = {}
    direct_reports = []
    for s in all_staff:
        parent = str(s.reports_to_id) if s.reports_to_id else None
        if parent == str(owner.user_id):
            direct_reports.append(s)
        else:
            staff_by_parent.setdefault(parent, []).append(s)

    return jsonify({
        'owner': _serialize(owner),
        'managers': [
            {
                **_serialize(m),
                'staff': [_serialize(s) for s in staff_by_parent.get(str(m.user_id), [])],
            }
            for m in managers
        ],
        'direct_reports': [_serialize(s) for s in direct_reports],
    }), 200
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd backend && pytest tests/test_team_tree.py -v 2>&1 | tail -10`
Expected: 4 passed.

- [ ] **Step 5: Broader sweep**

Run: `cd backend && pytest -x --tb=short 2>&1 | tail -10`
Expected: all pass.

- [ ] **Step 6: (skip — no-commit mode active)**

---

## Task 10: Frontend role dropdowns + Quota grid + role-string cleanup

Six small frontend files: 5 with role-string updates, 1 with the quota grid change.

**Files:**
- Modify: `frontend-react/src/pages/admin/CreateUser.tsx`
- Modify: `frontend-react/src/pages/admin/EditUser.tsx`
- Modify: `frontend-react/src/pages/admin/CreateClient.tsx`
- Modify: `frontend-react/src/pages/admin/EditClient.tsx`
- Modify: `frontend-react/src/components/profile/TeamMemberModal.tsx`
- Modify: `frontend-react/src/components/Sidebar.tsx`
- Modify: `frontend-react/src/components/BottomNav.tsx`
- Modify: `frontend-react/src/components/billing/ProfitSummaryBar.tsx`
- Modify: `frontend-react/src/pages/Salary.tsx`
- Modify: `frontend-react/src/pages/stock-transfer/BranchManagement.tsx`
- Modify: `frontend-react/src/components/profile/TeamTab.tsx` (the `ALL_ROLES` and `ROLE_OPTIONS` arrays and any role-comparison logic; full tree-view rewrite happens in Task 11)

- [ ] **Step 1: Role dropdowns in CreateUser + EditUser**

In `frontend-react/src/pages/admin/CreateUser.tsx`, find the `<select>` for role (around line 280-287). Currently:

```tsx
<option value="staff">Staff</option>
<option value="cashier">Cashier</option>
<option value="manager">Manager</option>
<option value="admin">Admin</option>
```

Change to:

```tsx
<option value="staff">Staff</option>
<option value="manager">Manager</option>
```

Do the same for `frontend-react/src/pages/admin/EditUser.tsx` — locate the role `<select>` and remove the `<option value="admin">` and `<option value="cashier">` lines.

- [ ] **Step 2: Quota grid in CreateClient + EditClient (4 columns → 2)**

In `frontend-react/src/pages/admin/CreateClient.tsx`, find the Team Member Quotas grid. The current pattern is a `(['admin', 'manager', 'staff', 'cashier'] as const).map(...)` rendering 4 inputs.

Change the array to `(['manager', 'staff'] as const)` so only 2 inputs render. Update the grid CSS from `md:grid-cols-4` to `md:grid-cols-2` if needed.

Update the `roleQuotas` initial state object to drop `admin` and `cashier` keys: keep only `{ manager: '', staff: '' }`.

Update the helper text under the heading from "Example: Admin = 1, Manager = 2, Staff = 5, Cashier = 3..." to "Example: Manager = 3, Staff = 10. The owner cannot exceed these limits when adding team members."

Do the same in `frontend-react/src/pages/admin/EditClient.tsx`.

- [ ] **Step 3: TeamMemberModal — `ALL_ROLES` array**

In `frontend-react/src/components/profile/TeamMemberModal.tsx`, find line 46:

```tsx
const ALL_ROLES = ['owner', 'admin', 'manager', 'staff', 'cashier']
```

Change to:

```tsx
const ALL_ROLES = ['owner', 'manager', 'staff']
```

Find line 186: `const canCreateBranch = currentUser?.role === 'owner' || currentUser?.role === 'admin'`. Change `'admin'` to `'manager'`.

- [ ] **Step 4: TeamTab — `ROLE_OPTIONS` array + role comparison logic**

In `frontend-react/src/components/profile/TeamTab.tsx`, find line 37:

```tsx
const ROLE_OPTIONS = ['', 'owner', 'admin', 'manager', 'staff', 'cashier']
```

Change to:

```tsx
const ROLE_OPTIONS = ['', 'owner', 'manager', 'staff']
```

Find line 250: `if (user.role === 'admin') return ['manager', 'staff', 'cashier'].includes(member.role)`. This logic is now obsolete (admin no longer exists). Delete or replace with manager-equivalent: `if (user.role === 'manager') return ['staff'].includes(member.role)` — confirm semantics with the surrounding code first.

- [ ] **Step 5: Sidebar.tsx + BottomNav.tsx — `role === 'admin'` → `role === 'manager'`**

In `frontend-react/src/components/Sidebar.tsx` line 75 and `frontend-react/src/components/BottomNav.tsx` line 84, find:

```tsx
user.role === 'owner' || user.role === 'admin'
```

Change to:

```tsx
user.role === 'owner' || user.role === 'manager'
```

- [ ] **Step 6: ProfitSummaryBar.tsx — drop `admin` from the allowed-roles array**

In `frontend-react/src/components/billing/ProfitSummaryBar.tsx` line 17, find:

```tsx
if (!['owner', 'manager', 'admin'].includes(userRole)) return null
```

Change to:

```tsx
if (!['owner', 'manager'].includes(userRole)) return null
```

- [ ] **Step 7: Salary.tsx — `role === 'admin'` → `role === 'manager'`**

In `frontend-react/src/pages/Salary.tsx` line 134, find `user?.role === 'admin' ||` and change to `user?.role === 'manager' ||` (or delete that branch if it duplicates an adjacent `=== 'manager'` check — verify first).

- [ ] **Step 8: BranchManagement.tsx — `roleOrder` array + display label**

In `frontend-react/src/pages/stock-transfer/BranchManagement.tsx`:

Line 458: change `const roleOrder = ['owner', 'admin', 'manager']` to `const roleOrder = ['owner', 'manager']`.
Line 509: find `: member.role === 'admin'` — delete that branch (it's a display label fallback that's now unreachable).

- [ ] **Step 9: Verify with grep — no `'admin'` role string remains in frontend (other than super_admin/admin_email/admin_bp references)**

Run:
```
grep -rn "'admin'\|\"admin\"" frontend-react/src --include="*.tsx" --include="*.ts" | grep -v "is_super_admin\|admin_email\|admin_bp\|/admin/\|adminNav\|adminBp\|AdminAudit\|AdminUsers\|AdminClients\|AdminDashboard\|AdminSettings\|AdminCreateUser\|AdminEditUser\|AdminCreateClient\|AdminEditClient\|AdminImpersonate\|AdminSubscriptions"
```
Expected: 0 matches (or only fall-through display labels that you've verified are dead code).

Run:
```
grep -rn "'cashier'\|\"cashier\"" frontend-react/src --include="*.tsx" --include="*.ts"
```
Expected: 0 matches.

- [ ] **Step 10: Verify build**

Run: `cd frontend-react && npm run build 2>&1 | tail -10`
Expected: build succeeds with no TS errors.

- [ ] **Step 11: (skip — no-commit mode active)**

---

## Task 11: Rewrite TeamTab.tsx as the tree view

Replace the existing flat-list view in TeamTab with a tree component that calls `GET /api/team/tree` and renders the response per the layouts in spec section 6.4.

**Files:**
- Modify: `frontend-react/src/components/profile/TeamTab.tsx`

- [ ] **Step 1: Read the current TeamTab to understand its data flow + dialogs**

Run:
```
wc -l frontend-react/src/components/profile/TeamTab.tsx
grep -nE "useState|useEffect|api\.get|api\.post|api\.put|api\.delete|openModal|TeamMemberModal" frontend-react/src/components/profile/TeamTab.tsx | head -25
```

Note where the current flat-list fetch lives and what dialogs are already mounted. The rewrite should reuse them.

- [ ] **Step 2: Replace the flat-list rendering with a tree fetcher + nested cards**

Edit `frontend-react/src/components/profile/TeamTab.tsx`:

(a) Add a state for the tree response:
```tsx
type TreeOwnerView = {
  owner: { user_id: string; full_name: string; email: string; role: string }
  managers: Array<{
    user_id: string; full_name: string; email: string; role: string
    staff: Array<{ user_id: string; full_name: string; email: string; role: string }>
  }>
  direct_reports: Array<{ user_id: string; full_name: string; email: string; role: string }>
}

type TreeManagerView = {
  self: { user_id: string; full_name: string; email: string; role: string }
  staff: Array<{ user_id: string; full_name: string; email: string; role: string }>
}

type TreeResponse = TreeOwnerView | TreeManagerView

const [tree, setTree] = useState<TreeResponse | null>(null)

const fetchTree = useCallback(async () => {
  try {
    const res = await api.get<TreeResponse>('/team/tree')
    setTree(res.data)
  } catch (err) {
    console.error('Failed to load team tree:', err)
  }
}, [])

useEffect(() => { fetchTree() }, [fetchTree])
```

(b) Replace the existing flat-list render block with a `tree`-driven render:

```tsx
{tree && 'owner' in tree && (
  <div className="space-y-3">
    {/* Owner row */}
    <div className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-700">
      <span className="text-lg" aria-hidden>👑</span>
      <div className="flex-1">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {tree.owner.full_name} (You) <span className="text-xs text-gray-400">owner</span>
        </p>
        <p className="text-xs text-gray-500">{tree.owner.email}</p>
      </div>
    </div>

    {/* Each manager + their staff */}
    {tree.managers.map(mgr => (
      <div key={mgr.user_id} className="pl-6 border-l-2 border-gray-200 dark:border-gray-700 space-y-2">
        <div className="flex items-center gap-3 py-2">
          <span className="text-base" aria-hidden>👤</span>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {mgr.full_name} <span className="text-xs text-gray-400">manager · {mgr.staff.length} staff</span>
            </p>
            <p className="text-xs text-gray-500">{mgr.email}</p>
          </div>
          {/* Edit/Delete buttons reuse existing handlers (find and wire to openEditModal(mgr) / openDeleteModal(mgr)) */}
        </div>
        {mgr.staff.length > 0 && (
          <div className="pl-6 border-l-2 border-gray-100 dark:border-gray-800 space-y-1">
            {mgr.staff.map(s => (
              <div key={s.user_id} className="flex items-center gap-3 py-1">
                <span className="text-sm">👨</span>
                <div className="flex-1">
                  <p className="text-sm text-gray-800 dark:text-gray-200">{s.full_name}</p>
                  <p className="text-xs text-gray-500">{s.email}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        <button type="button" onClick={() => openCreateModal({ role: 'staff', reports_to_id: mgr.user_id })}
          className="ml-6 text-xs text-blue-600 hover:underline">
          + Add staff under {mgr.full_name}
        </button>
      </div>
    ))}

    {/* Staff directly under owner */}
    {tree.direct_reports.length > 0 && (
      <div className="pl-6 border-l-2 border-gray-200 dark:border-gray-700 space-y-1 mt-3">
        <p className="text-xs text-gray-400 uppercase">Staff directly under you</p>
        {tree.direct_reports.map(s => (
          <div key={s.user_id} className="flex items-center gap-3 py-1">
            <span>👨</span>
            <div className="flex-1">
              <p className="text-sm">{s.full_name}</p>
              <p className="text-xs text-gray-500">{s.email}</p>
            </div>
          </div>
        ))}
      </div>
    )}

    <div className="flex gap-2 pt-3 border-t border-gray-100 dark:border-gray-700">
      <button type="button" onClick={() => openCreateModal({ role: 'manager' })}
        className="px-3 py-1.5 bg-gray-800 text-white rounded-lg text-sm hover:bg-gray-700">
        + Add manager
      </button>
      <button type="button" onClick={() => openCreateModal({ role: 'staff' })}
        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
        + Add staff (direct)
      </button>
    </div>
  </div>
)}

{tree && 'self' in tree && (
  <div className="space-y-3">
    <div className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-700">
      <span className="text-lg">👤</span>
      <div className="flex-1">
        <p className="text-sm font-semibold">{tree.self.full_name} (You) <span className="text-xs text-gray-400">manager</span></p>
        <p className="text-xs text-gray-500">{tree.self.email}</p>
      </div>
    </div>
    {tree.staff.length === 0 && (
      <p className="text-sm text-gray-400 italic">No staff yet — click '+ Add staff' to assign your first.</p>
    )}
    {tree.staff.map(s => (
      <div key={s.user_id} className="pl-6 border-l-2 border-gray-200 dark:border-gray-700 flex items-center gap-3 py-1">
        <span>👨</span>
        <div className="flex-1">
          <p className="text-sm">{s.full_name}</p>
          <p className="text-xs text-gray-500">{s.email}</p>
        </div>
      </div>
    ))}
    <button type="button" onClick={() => openCreateModal({ role: 'staff' })}
      className="px-3 py-1.5 bg-gray-800 text-white rounded-lg text-sm hover:bg-gray-700">
      + Add staff to my team
    </button>
  </div>
)}
```

(c) Update the existing create-user handler so the `openCreateModal({ role, reports_to_id? })` shape is honored: when the user submits the modal, pass `reports_to_id` to the POST body so the server knows which manager to file this staff under (the server validates it).

(d) After any successful create / edit / delete, call `fetchTree()` to refresh.

- [ ] **Step 3: Verify build**

Run: `cd frontend-react && npm run build 2>&1 | tail -10`
Expected: build succeeds. If TypeScript complains about prop types on the existing create dialog, adjust those types (or add an optional `reports_to_id?: string` prop to the dialog).

- [ ] **Step 4: Run frontend tests to confirm nothing broke**

Run: `cd frontend-react && npm run test -- --run 2>&1 | tail -15`
Expected: tests pass (or only the 3 known pre-existing failures from earlier in the session).

- [ ] **Step 5: (skip — no-commit mode active)**

---

## Task 12: Manual end-to-end verification (user-driven)

The user runs this in the browser after all dispatchable tasks are done.

- [ ] **Step 1: Start backend**

Run: `cd backend && python app.py`
Expected on first startup: logs `[Migration] Schema v22 → v23. Running migrations…` then `[Migration] v23: role hierarchy redesign applied …`. All existing sessions are now invalid.

- [ ] **Step 2: Start frontend**

Run: `cd frontend-react && npm run dev`

- [ ] **Step 3: Re-log in (sessions were invalidated by Task 1)**

Log in as the owner / super admin. Confirm you're not getting a 401 or stale role claim.

- [ ] **Step 4: Verify role migration**

Open `/admin/clients/<id>` → look at the user list. Any user previously with role 'admin' now reads 'manager'. Any cashier reads 'staff'.

- [ ] **Step 5: Verify Team Member Quotas**

Open CreateClient (or EditClient on an existing client). The Quotas section shows only Manager and Staff columns. Existing quotas have been folded (e.g. an existing client with Admin=2, Manager=1 now shows Manager=3).

- [ ] **Step 6: Verify the role dropdowns**

On CreateUser, EditUser, and the Team tab's create-team-member dialog: the role `<select>` shows only Owner / Manager / Staff (or only Manager / Staff if Owner is auto-set elsewhere). No "Admin" or "Cashier" option.

- [ ] **Step 7: Verify the tree view (owner side)**

Open the Profile → Team tab. The view is a nested tree, not a flat list. Owner at top, each manager indented below with their staff under them, "+ Add staff under <Name>" buttons next to each manager.

- [ ] **Step 8: Verify the tree view (manager side)**

Log out, log in as a manager. Open Profile → Team. The tree shows only the manager (You) and their own staff. The owner and other managers are not visible.

- [ ] **Step 9: Create staff as a manager**

While logged in as manager, click "+ Add staff to my team", fill in the new staff's details. After save, the new staff appears in the manager's subtree. Server-side, the new user's `reports_to_id` is the manager's user_id (confirm by inspecting the response or by hitting `/api/team/tree` directly).

- [ ] **Step 10: Re-parent a staff as the owner**

Log back in as owner. Open the Team tab. Click edit on a staff who belongs to manager A. Change their `reports_to_id` to manager B. After save, the tree re-renders showing the staff now under manager B.

- [ ] **Step 11: Delete a manager with staff**

Log in as owner. Delete a manager who has 2-3 staff under them. After confirmation, the manager card disappears and the staff now appear under "Staff directly under you" (the `direct_reports` array).

- [ ] **Step 12: Verify owner-only routes (sessions)**

As a manager, try to revoke someone's session via the UI (or directly via `POST /api/users/<id>/sessions/revoke`). Should get 403.

- [ ] **Step 13: Verify owner+manager routes (branches, invites)**

As a manager, try to create a branch or send a team invite. Should succeed (previously was owner-only via `('owner', 'admin')` — now also accepts manager).

---

## Done criteria

The hierarchy redesign is shippable when ALL of these hold:

1. `cd backend && pytest -x` → all green (or only the known pre-existing `test_security_headers_present` failure).
2. `cd frontend-react && npm run build` → success, no TS errors.
3. `cd frontend-react && npm run test:run` → all green (or only the 3 known pre-existing failures from earlier in this session).
4. Manual verification (Task 12) passes all 13 sub-steps.
5. `grep -rn "'admin'\|'cashier'" backend/routes/ frontend-react/src/components/ frontend-react/src/pages/` returns no matches in role-string contexts (after filtering super_admin/admin_email/admin_bp/AdminXxx component imports).

Once shippable, the user can review the working tree and stage/commit at their discretion. The paused "Salary perms gap" todo resumes after this lands.
