# Phase 2 — Custom Permission Templates + CreateClient Tooltip Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **No-commit mode:** The user has instructed that subagents must NOT run `git add` or `git commit`. All "Step N: Commit" steps in this plan are intentionally OMITTED. After each task is implemented and tested, leave the working tree dirty for the user to review and stage manually. Skip the commit step everywhere it would normally appear.

**Goal:** Add CRUD on custom permission templates that any super admin can save / edit / delete from the CreateClient page, plus extend the existing `PermissionHelpTooltip` to CreateClient's "Advanced: Customize Individual Permissions" section.

**Architecture:** Backend stores templates in a new `permission_templates` table (Migration v22) with soft delete and case-insensitive unique names. 4 endpoints under `admin_bp` handle list (merged with built-ins), create, update, delete — all super-admin-only. Frontend adds a service wrapper, a `SaveTemplateDialog` modal, and a `CustomTemplateActions` hover overlay; the existing template grid keeps working because custom templates are merged into the same `permissionTemplates` dict and discriminated by an `is_custom` flag.

**Tech Stack:** Flask + SQLAlchemy + SQLite (offline) / PostgreSQL (Supabase) on backend. React 18 + TypeScript + Vite + Tailwind on frontend. Tests: pytest with SQLite `:memory:` + vitest + @testing-library/react + MSW.

**Reference spec:** [docs/superpowers/specs/2026-05-26-phase-2-custom-templates-design.md](../specs/2026-05-26-phase-2-custom-templates-design.md).

**Files in this plan:**

Backend (new):
- `backend/models/permission_template_model.py` — `PermissionTemplate` model
- `backend/tests/test_migration_022.py` — table-creation migration tests
- `backend/tests/test_permission_templates.py` — endpoint tests

Backend (modified):
- `backend/migrations/runner.py` — add `_m022_create_permission_templates`, bump `CURRENT_SCHEMA_VERSION` 21 → 22
- `backend/routes/admin.py` — extend `get_permission_templates` + add POST / PUT / DELETE endpoints

Frontend (new):
- `frontend-react/src/services/permissionTemplateService.ts` — typed wrapper for the 4 endpoints
- `frontend-react/src/components/admin/SaveTemplateDialog.tsx` — modal for create + edit
- `frontend-react/src/components/admin/CustomTemplateActions.tsx` — hover overlay with edit/delete buttons + inline confirm
- `frontend-react/src/test/SaveTemplateDialog.test.tsx` — component tests
- `frontend-react/src/test/permissionTemplateService.test.ts` — service tests with MSW

Frontend (modified):
- `frontend-react/src/pages/admin/CreateClient.tsx` — wire in Save button, dialog mount, per-card overlays, "Created by" caption, tooltip extension

---

## Task 1: Migration v22 — create `permission_templates` table

Add a new SQLAlchemy-managed table for custom permission templates. Idempotent via `CREATE TABLE IF NOT EXISTS`.

**Files:**
- Modify: `backend/migrations/runner.py` — add `_m022_create_permission_templates(db)` function + register in `MIGRATIONS` + bump `CURRENT_SCHEMA_VERSION` 21 → 22
- Create: `backend/tests/test_migration_022.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_migration_022.py`:

```python
"""Test for Migration v22 — create permission_templates table."""
import pytest
from sqlalchemy import inspect, text


@pytest.fixture
def fresh_app(app):
    """Use the existing app fixture (in-memory SQLite, schema already created)."""
    return app


def test_m022_creates_table_with_expected_columns(fresh_app):
    from migrations.runner import _m022_create_permission_templates
    from extensions import db

    with fresh_app.app_context():
        # Pre-drop in case a previous test left the table around.
        try:
            db.session.execute(text("DROP TABLE IF EXISTS permission_templates"))
            db.session.commit()
        except Exception:
            db.session.rollback()

        _m022_create_permission_templates(db)

        inspector = inspect(db.engine)
        assert 'permission_templates' in inspector.get_table_names()

        col_names = {c['name'] for c in inspector.get_columns('permission_templates')}
        assert col_names >= {
            'template_id', 'name', 'description', 'permissions',
            'created_by', 'created_at', 'updated_at', 'deleted_at',
        }, f"missing columns; have {col_names}"


def test_m022_is_idempotent(fresh_app):
    """Running twice on the same DB must be a no-op (no exception)."""
    from migrations.runner import _m022_create_permission_templates
    from extensions import db

    with fresh_app.app_context():
        _m022_create_permission_templates(db)
        # Should not raise on second call.
        _m022_create_permission_templates(db)


def test_m022_enforces_case_insensitive_name_uniqueness(fresh_app):
    """Two rows with names differing only in case must NOT both insert (active rows)."""
    from migrations.runner import _m022_create_permission_templates
    from extensions import db
    import uuid

    with fresh_app.app_context():
        _m022_create_permission_templates(db)

        db.session.execute(text(
            "INSERT INTO permission_templates "
            "(template_id, name, description, permissions, created_by) "
            "VALUES (:id, 'Cashier+', '', '[]', :uid)"
        ), {'id': str(uuid.uuid4()), 'uid': str(uuid.uuid4())})
        db.session.commit()

        with pytest.raises(Exception):  # IntegrityError
            db.session.execute(text(
                "INSERT INTO permission_templates "
                "(template_id, name, description, permissions, created_by) "
                "VALUES (:id, 'cashier+', '', '[]', :uid)"
            ), {'id': str(uuid.uuid4()), 'uid': str(uuid.uuid4())})
            db.session.commit()


def test_m022_allows_duplicate_name_when_one_is_soft_deleted(fresh_app):
    """The unique constraint must be partial: WHERE deleted_at IS NULL."""
    from migrations.runner import _m022_create_permission_templates
    from extensions import db
    import uuid
    from datetime import datetime

    with fresh_app.app_context():
        _m022_create_permission_templates(db)

        # First row — soft-deleted.
        db.session.execute(text(
            "INSERT INTO permission_templates "
            "(template_id, name, description, permissions, created_by, deleted_at) "
            "VALUES (:id, 'Manager+', '', '[]', :uid, :del)"
        ), {'id': str(uuid.uuid4()), 'uid': str(uuid.uuid4()), 'del': datetime.utcnow()})
        db.session.commit()

        # Second row — same name, but active. Should succeed.
        db.session.execute(text(
            "INSERT INTO permission_templates "
            "(template_id, name, description, permissions, created_by) "
            "VALUES (:id, 'Manager+', '', '[]', :uid)"
        ), {'id': str(uuid.uuid4()), 'uid': str(uuid.uuid4())})
        db.session.commit()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_migration_022.py -v 2>&1 | tail -15`
Expected: 4 failures with `ImportError: cannot import name '_m022_create_permission_templates'`.

- [ ] **Step 3: Implement the migration in `backend/migrations/runner.py`**

At the end of the file (after `_m021_revoke_super_admin_perms_from_regular_users`, before `MIGRATIONS = [`), add:

```python
def _m022_create_permission_templates(db):
    """v22: Create permission_templates table for custom (user-defined) templates.

    Stored as JSON-encoded permission_names list.
    Soft delete via deleted_at column.
    Partial UNIQUE(LOWER(name)) WHERE deleted_at IS NULL enforces case-insensitive
    name uniqueness across active templates only — soft-deleted rows don't block
    re-using the name.
    """
    inspector = sa_inspect(db.engine)
    dialect = db.engine.dialect.name

    if 'permission_templates' not in inspector.get_table_names():
        if dialect == 'postgresql':
            db.session.execute(text("""
                CREATE TABLE permission_templates (
                    template_id  UUID PRIMARY KEY,
                    name         VARCHAR(40) NOT NULL,
                    description  VARCHAR(200),
                    permissions  TEXT NOT NULL,
                    created_by   UUID NOT NULL,
                    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    deleted_at   TIMESTAMP
                )
            """))
        else:  # sqlite
            db.session.execute(text("""
                CREATE TABLE permission_templates (
                    template_id  VARCHAR(36) PRIMARY KEY,
                    name         VARCHAR(40) NOT NULL,
                    description  VARCHAR(200),
                    permissions  TEXT NOT NULL,
                    created_by   VARCHAR(36) NOT NULL,
                    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    deleted_at   TIMESTAMP
                )
            """))

        # Partial unique index on LOWER(name) — works in both SQLite and PostgreSQL.
        db.session.execute(text("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_permission_templates_name_unique
            ON permission_templates (LOWER(name))
            WHERE deleted_at IS NULL
        """))

        # Soft-delete filter helper.
        db.session.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_permission_templates_deleted_at
            ON permission_templates (deleted_at)
        """))

        db.session.commit()
        logging.info("[Migration] v22: permission_templates table created")
    else:
        logging.info("[Migration] v22: permission_templates table already exists, skipping")
```

In the `MIGRATIONS = [` registry, append:

```python
    (22, _m022_create_permission_templates),
```

At the top of the file, change `CURRENT_SCHEMA_VERSION = 21` to `CURRENT_SCHEMA_VERSION = 22`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_migration_022.py -v 2>&1 | tail -15`
Expected: 4 passed.

- [ ] **Step 5: Run the broader test suite to confirm nothing broke**

Run: `cd backend && pytest tests/test_migration_019.py tests/test_migration_021.py tests/test_permissions.py tests/test_billing.py -q 2>&1 | tail -10`
Expected: all pass.

- [ ] **Step 6: (skip — no-commit mode active)**

---

## Task 2: `PermissionTemplate` model

The model maps the new table. `to_dict()` joins to `users.email` to populate `created_by_email`. Uses `FlexibleUUID` and `FlexibleJSON` from `database.flexible_types` for cross-dialect support (matches the existing `permission_preset_model.py` pattern).

**Files:**
- Create: `backend/models/permission_template_model.py`

- [ ] **Step 1: Write the test (model-level)**

There's no separate model test file in this plan — the model is exercised by `test_permission_templates.py` in Task 3. Skip ahead to Step 2.

- [ ] **Step 2: Create the model file**

Create `backend/models/permission_template_model.py`:

```python
"""SQLAlchemy model for the permission_templates table (Migration v22).

Stores custom (user-defined) permission templates that super admins can save
from the CreateClient page and reuse across new client onboardings.

- Shared across all super admins (no client_id scoping).
- Soft delete via deleted_at column.
- permissions stored as JSON-encoded list of permission_name strings.
"""
import json
import uuid
from datetime import datetime

from extensions import db
from database.flexible_types import FlexibleUUID


class PermissionTemplate(db.Model):
    __tablename__ = 'permission_templates'

    template_id = db.Column(FlexibleUUID, primary_key=True, default=uuid.uuid4)
    name        = db.Column(db.String(40), nullable=False)
    description = db.Column(db.String(200), nullable=True)
    permissions = db.Column(db.Text, nullable=False)  # JSON-encoded list[str]
    created_by  = db.Column(FlexibleUUID, db.ForeignKey('users.user_id'), nullable=False)
    created_at  = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at  = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    deleted_at  = db.Column(db.DateTime, nullable=True)

    @property
    def permissions_list(self) -> list[str]:
        """Decode the JSON-encoded permissions column. Returns [] if invalid."""
        try:
            data = json.loads(self.permissions) if self.permissions else []
            return data if isinstance(data, list) else []
        except (json.JSONDecodeError, TypeError):
            return []

    def to_dict(self, created_by_email: str | None = None) -> dict:
        """Serialize to API response shape.

        created_by_email is passed in (rather than joined inside the model) so
        the caller can fetch all emails in a single batch query instead of N+1.
        """
        return {
            'template_id':       str(self.template_id),
            'name':              self.name,
            'description':       self.description or '',
            'permissions':       self.permissions_list,
            'is_custom':         True,
            'business_type':     'custom',
            'created_by':        str(self.created_by),
            'created_by_email':  created_by_email,
            'created_at':        self.created_at.isoformat() if self.created_at else None,
            'updated_at':        self.updated_at.isoformat() if self.updated_at else None,
        }
```

- [ ] **Step 3: Import the model in app.py so create_all picks it up**

Open `backend/app.py`. Find the block of model imports inside `create_app()` (currently around line 100-106, after `import models.permission_model`). Add:

```python
        import models.permission_template_model  # noqa: F401
```

Also add the same import in `backend/tests/conftest.py` — find the matching block (around line 100-106) and add the same line so test fixtures see the model.

- [ ] **Step 4: Verify the model loads without errors**

Run: `cd backend && python3 -c "from app import create_app; app = create_app(); print('OK')" 2>&1 | tail -5`
Expected: prints `OK`. Any ImportError means a typo in step 2 or 3.

- [ ] **Step 5: (skip — no-commit mode active)**

---

## Task 3: `POST /admin/permission-templates/custom` — create endpoint (TDD)

Write the test first, then implement. Endpoint creates a custom template after validating name length, uniqueness, and that every permission exists. Strips super-admin-only perms silently.

**Files:**
- Create: `backend/tests/test_permission_templates.py`
- Modify: `backend/routes/admin.py` — add the new endpoint

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_permission_templates.py`:

```python
"""Tests for /admin/permission-templates/custom endpoints (Phase 2)."""
import json
import uuid
import bcrypt
import pytest

from conftest import make_token, auth_hdr
from utils.permissions import SUPER_ADMIN_ONLY_PERMISSIONS


# ── Helper fixtures ──────────────────────────────────────────────────────────

@pytest.fixture
def super_admin_user(sample_client):
    """A super admin in sample_client; returns the User row."""
    from extensions import db
    from models.user_model import User

    with db.session.no_autoflush:
        sa = User(
            user_id=str(uuid.uuid4()),
            client_id=sample_client.client_id,
            email=f'sa-{uuid.uuid4().hex[:8]}@valoryx-test.invalid',
            password_hash=bcrypt.hashpw(b'x', bcrypt.gensalt()).decode(),
            full_name='Super Admin',
            role='owner',
            is_super_admin=True,
            is_active=True,
            invite_accepted=True,
            totp_enabled=False,
        )
        db.session.add(sa)
        db.session.commit()
    return sa


@pytest.fixture
def super_admin_headers(super_admin_user, sample_client):
    """Auth headers for the super admin."""
    tok = make_token(
        super_admin_user.user_id,
        sample_client.client_id,
        permissions=[],
        is_super_admin=True,
    )
    return auth_hdr(tok)


# ── POST: create custom template ──────────────────────────────────────────────

def test_post_creates_template(http, super_admin_headers):
    resp = http.post(
        '/api/admin/permission-templates/custom',
        json={
            'name': 'My Cashier Plus',
            'description': 'Cashier with cost-price visibility',
            'permissions': ['gst_billing', 'non_gst_billing', 'apply_discount'],
        },
        headers=super_admin_headers,
    )
    assert resp.status_code == 201, resp.get_json()
    body = resp.get_json()
    assert body['template']['name'] == 'My Cashier Plus'
    assert body['template']['is_custom'] is True
    assert set(body['template']['permissions']) == {'gst_billing', 'non_gst_billing', 'apply_discount'}


def test_post_rejects_short_name(http, super_admin_headers):
    resp = http.post(
        '/api/admin/permission-templates/custom',
        json={'name': 'AB', 'permissions': ['gst_billing']},
        headers=super_admin_headers,
    )
    assert resp.status_code == 400
    assert resp.get_json()['field'] == 'name'


def test_post_rejects_long_name(http, super_admin_headers):
    resp = http.post(
        '/api/admin/permission-templates/custom',
        json={'name': 'X' * 41, 'permissions': ['gst_billing']},
        headers=super_admin_headers,
    )
    assert resp.status_code == 400
    assert resp.get_json()['field'] == 'name'


def test_post_rejects_duplicate_name_case_insensitive(http, super_admin_headers):
    http.post(
        '/api/admin/permission-templates/custom',
        json={'name': 'Cashier+', 'permissions': ['gst_billing']},
        headers=super_admin_headers,
    )
    resp = http.post(
        '/api/admin/permission-templates/custom',
        json={'name': 'cashier+', 'permissions': ['gst_billing']},
        headers=super_admin_headers,
    )
    assert resp.status_code == 400
    assert resp.get_json()['field'] == 'name'


def test_post_rejects_empty_permissions(http, super_admin_headers):
    resp = http.post(
        '/api/admin/permission-templates/custom',
        json={'name': 'Empty', 'permissions': []},
        headers=super_admin_headers,
    )
    assert resp.status_code == 400
    assert resp.get_json()['field'] == 'permissions'


def test_post_rejects_unknown_permission(http, super_admin_headers):
    resp = http.post(
        '/api/admin/permission-templates/custom',
        json={'name': 'Bogus', 'permissions': ['gst_billing', 'this_perm_does_not_exist']},
        headers=super_admin_headers,
    )
    assert resp.status_code == 400
    assert resp.get_json()['field'] == 'permissions'


def test_post_strips_super_admin_perms_silently(http, super_admin_headers):
    """Super-admin-only perms must be stripped silently; if list becomes empty, reject."""
    resp = http.post(
        '/api/admin/permission-templates/custom',
        json={
            'name': 'Mixed',
            'permissions': ['gst_billing', 'manage_clients', 'system_backup'],
        },
        headers=super_admin_headers,
    )
    assert resp.status_code == 201
    body = resp.get_json()
    # manage_clients + system_backup are SUPER_ADMIN_ONLY — must be gone.
    assert 'manage_clients' not in body['template']['permissions']
    assert 'system_backup' not in body['template']['permissions']
    assert 'gst_billing' in body['template']['permissions']


def test_post_rejects_when_only_super_admin_perms(http, super_admin_headers):
    """If after stripping SUPER_ADMIN_ONLY the list is empty, return 400."""
    resp = http.post(
        '/api/admin/permission-templates/custom',
        json={'name': 'AllSA', 'permissions': list(SUPER_ADMIN_ONLY_PERMISSIONS)},
        headers=super_admin_headers,
    )
    assert resp.status_code == 400
    assert resp.get_json()['field'] == 'permissions'


def test_post_requires_super_admin(http, gst_headers):
    """gst_headers is a non-super-admin user. Must get 403."""
    resp = http.post(
        '/api/admin/permission-templates/custom',
        json={'name': 'Nope', 'permissions': ['gst_billing']},
        headers=gst_headers,
    )
    assert resp.status_code == 403
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && pytest tests/test_permission_templates.py -v 2>&1 | tail -25`
Expected: 9 failures, all 404 (endpoint doesn't exist yet) or import errors.

- [ ] **Step 3: Implement the POST endpoint + validation helper in `backend/routes/admin.py`**

At the very TOP of admin.py, near the other imports (after `from utils.permissions import SUPER_ADMIN_ONLY_PERMISSIONS`), add:

```python
from models.permission_template_model import PermissionTemplate
import json as _json
```

Then add this section to admin.py BEFORE the `# CLIENT MANAGEMENT ENDPOINTS FOR SUPER ADMIN` comment (around line 1121):

```python
# ── Custom Permission Templates (Phase 2) ────────────────────────────────────


def _validate_template_payload(data: dict, exclude_id: str | None = None) -> tuple[dict | None, tuple[dict, int] | None]:
    """Validate a custom-template create/update payload.

    Returns (clean_payload, None) on success or (None, (error_json, status)) on failure.
    exclude_id is the template_id to exclude from the uniqueness check (for PUT).
    """
    name = (data.get('name') or '').strip()
    description = (data.get('description') or '').strip()
    permissions = data.get('permissions') or []

    if not isinstance(name, str) or not (3 <= len(name) <= 40):
        return None, ({'error': 'Validation failed', 'field': 'name',
                       'message': 'Name must be 3-40 characters'}, 400)

    if len(description) > 200:
        return None, ({'error': 'Validation failed', 'field': 'description',
                       'message': 'Description must be 200 characters or fewer'}, 400)

    if not isinstance(permissions, list) or not permissions:
        return None, ({'error': 'Validation failed', 'field': 'permissions',
                       'message': 'Template must contain at least one permission'}, 400)

    # Strip super-admin-only perms silently (defense in depth — matches Phase 1.5).
    permissions = [p for p in permissions if p not in SUPER_ADMIN_ONLY_PERMISSIONS]
    if not permissions:
        return None, ({'error': 'Validation failed', 'field': 'permissions',
                       'message': 'Template must contain at least one assignable permission'}, 400)

    # Every remaining perm must exist in the seeded table (single IN query).
    existing_perms = {
        p.permission_name for p in Permission.query.filter(
            Permission.permission_name.in_(permissions)
        ).all()
    }
    missing = [p for p in permissions if p not in existing_perms]
    if missing:
        return None, ({'error': 'Validation failed', 'field': 'permissions',
                       'message': f'Unknown permissions: {", ".join(missing)}'}, 400)

    # Case-insensitive name uniqueness across active templates (excluding self on PUT).
    from sqlalchemy import func
    q = PermissionTemplate.query.filter(
        func.lower(PermissionTemplate.name) == name.lower(),
        PermissionTemplate.deleted_at.is_(None),
    )
    if exclude_id:
        q = q.filter(PermissionTemplate.template_id != exclude_id)
    if q.first():
        return None, ({'error': 'Validation failed', 'field': 'name',
                       'message': 'A template with this name already exists'}, 400)

    return {
        'name': name,
        'description': description or None,
        'permissions': sorted(set(permissions)),  # dedupe + stable order
    }, None


def _template_to_response(t: PermissionTemplate) -> dict:
    """Wrap a PermissionTemplate row in the API response shape (with email lookup)."""
    email = None
    if t.created_by:
        creator = User.query.filter_by(user_id=t.created_by).first()
        email = creator.email if creator else None
    return t.to_dict(created_by_email=email)


@admin_bp.route('/permission-templates/custom', methods=['POST'])
@authenticate
@require_super_admin
def create_custom_permission_template():
    """Create a custom (user-defined) permission template."""
    data = request.get_json() or {}
    clean, err = _validate_template_payload(data)
    if err:
        body, status = err
        return jsonify(body), status

    template = PermissionTemplate(
        template_id=str(uuid.uuid4()),
        name=clean['name'],
        description=clean['description'],
        permissions=_json.dumps(clean['permissions']),
        created_by=g.user['user_id'],
    )
    db.session.add(template)
    db.session.commit()

    return jsonify({'template': _template_to_response(template)}), 201
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && pytest tests/test_permission_templates.py -v 2>&1 | tail -20`
Expected: 9 passed.

- [ ] **Step 5: (skip — no-commit mode active)**

---

## Task 4: `PUT /admin/permission-templates/custom/<id>` — update endpoint (TDD)

**Files:**
- Modify: `backend/tests/test_permission_templates.py` — add PUT tests
- Modify: `backend/routes/admin.py` — add PUT endpoint

- [ ] **Step 1: Append PUT tests to `backend/tests/test_permission_templates.py`**

Append to the end of the file:

```python
# ── PUT: update custom template ───────────────────────────────────────────────

def _create_template(http, headers, name='Initial', perms=None):
    perms = perms or ['gst_billing']
    resp = http.post('/api/admin/permission-templates/custom',
                     json={'name': name, 'permissions': perms},
                     headers=headers)
    assert resp.status_code == 201
    return resp.get_json()['template']


def test_put_updates_name_and_description(http, super_admin_headers):
    template = _create_template(http, super_admin_headers, name='Original')
    resp = http.put(
        f'/api/admin/permission-templates/custom/{template["template_id"]}',
        json={'name': 'Renamed', 'description': 'New desc',
              'permissions': template['permissions']},
        headers=super_admin_headers,
    )
    assert resp.status_code == 200, resp.get_json()
    body = resp.get_json()
    assert body['template']['name'] == 'Renamed'
    assert body['template']['description'] == 'New desc'


def test_put_updates_permissions(http, super_admin_headers):
    template = _create_template(http, super_admin_headers,
                                name='ChangePerms',
                                perms=['gst_billing'])
    resp = http.put(
        f'/api/admin/permission-templates/custom/{template["template_id"]}',
        json={'name': 'ChangePerms', 'permissions': ['gst_billing', 'non_gst_billing']},
        headers=super_admin_headers,
    )
    assert resp.status_code == 200
    assert set(resp.get_json()['template']['permissions']) == {'gst_billing', 'non_gst_billing'}


def test_put_uniqueness_excludes_target_row(http, super_admin_headers):
    """Updating a template's own row with same name should succeed."""
    template = _create_template(http, super_admin_headers, name='Stable')
    resp = http.put(
        f'/api/admin/permission-templates/custom/{template["template_id"]}',
        json={'name': 'Stable', 'permissions': template['permissions']},
        headers=super_admin_headers,
    )
    assert resp.status_code == 200


def test_put_uniqueness_blocks_collision_with_other_row(http, super_admin_headers):
    """Updating to a name owned by ANOTHER template must fail."""
    a = _create_template(http, super_admin_headers, name='AAA')
    b = _create_template(http, super_admin_headers, name='BBB')
    resp = http.put(
        f'/api/admin/permission-templates/custom/{b["template_id"]}',
        json={'name': 'aaa', 'permissions': b['permissions']},
        headers=super_admin_headers,
    )
    assert resp.status_code == 400
    assert resp.get_json()['field'] == 'name'


def test_put_returns_404_for_missing(http, super_admin_headers):
    resp = http.put(
        f'/api/admin/permission-templates/custom/{uuid.uuid4()}',
        json={'name': 'Whatever', 'permissions': ['gst_billing']},
        headers=super_admin_headers,
    )
    assert resp.status_code == 404


def test_put_requires_super_admin(http, super_admin_headers, gst_headers):
    template = _create_template(http, super_admin_headers, name='Guarded')
    resp = http.put(
        f'/api/admin/permission-templates/custom/{template["template_id"]}',
        json={'name': 'Guarded', 'permissions': template['permissions']},
        headers=gst_headers,
    )
    assert resp.status_code == 403
```

- [ ] **Step 2: Run the new tests to verify failure**

Run: `cd backend && pytest tests/test_permission_templates.py::test_put_updates_name_and_description -v 2>&1 | tail -10`
Expected: 405 Method Not Allowed (PUT not defined yet).

- [ ] **Step 3: Add the PUT endpoint to `backend/routes/admin.py`**

Append immediately after `create_custom_permission_template`:

```python
@admin_bp.route('/permission-templates/custom/<template_id>', methods=['PUT'])
@authenticate
@require_super_admin
def update_custom_permission_template(template_id):
    """Update an existing custom permission template."""
    template = PermissionTemplate.query.filter_by(
        template_id=template_id, deleted_at=None
    ).first()
    if not template:
        return jsonify({'error': 'Template not found'}), 404

    data = request.get_json() or {}
    clean, err = _validate_template_payload(data, exclude_id=str(template.template_id))
    if err:
        body, status = err
        return jsonify(body), status

    template.name = clean['name']
    template.description = clean['description']
    template.permissions = _json.dumps(clean['permissions'])
    template.updated_at = datetime.utcnow()
    db.session.commit()

    return jsonify({'template': _template_to_response(template)}), 200
```

- [ ] **Step 4: Run all template tests to verify pass**

Run: `cd backend && pytest tests/test_permission_templates.py -v 2>&1 | tail -25`
Expected: 15 passed (9 from Task 3 + 6 new PUT tests).

- [ ] **Step 5: (skip — no-commit mode active)**

---

## Task 5: `DELETE /admin/permission-templates/custom/<id>` — soft-delete endpoint (TDD)

**Files:**
- Modify: `backend/tests/test_permission_templates.py` — add DELETE tests
- Modify: `backend/routes/admin.py` — add DELETE endpoint

- [ ] **Step 1: Append DELETE tests**

Append to `backend/tests/test_permission_templates.py`:

```python
# ── DELETE: soft delete ───────────────────────────────────────────────────────

def test_delete_soft_deletes_template(http, super_admin_headers):
    template = _create_template(http, super_admin_headers, name='ToDelete')
    resp = http.delete(
        f'/api/admin/permission-templates/custom/{template["template_id"]}',
        headers=super_admin_headers,
    )
    assert resp.status_code == 204

    # Soft-deleted: the row still exists in the DB but with deleted_at set.
    from models.permission_template_model import PermissionTemplate
    row = PermissionTemplate.query.filter_by(template_id=template['template_id']).first()
    assert row is not None, "soft delete must keep the row"
    assert row.deleted_at is not None, "deleted_at must be set"


def test_delete_returns_404_for_missing(http, super_admin_headers):
    resp = http.delete(
        f'/api/admin/permission-templates/custom/{uuid.uuid4()}',
        headers=super_admin_headers,
    )
    assert resp.status_code == 404


def test_delete_returns_404_for_already_deleted(http, super_admin_headers):
    template = _create_template(http, super_admin_headers, name='OnceOnly')
    http.delete(
        f'/api/admin/permission-templates/custom/{template["template_id"]}',
        headers=super_admin_headers,
    )
    resp = http.delete(
        f'/api/admin/permission-templates/custom/{template["template_id"]}',
        headers=super_admin_headers,
    )
    assert resp.status_code == 404


def test_delete_frees_name_for_reuse(http, super_admin_headers):
    template = _create_template(http, super_admin_headers, name='Reusable')
    http.delete(
        f'/api/admin/permission-templates/custom/{template["template_id"]}',
        headers=super_admin_headers,
    )
    # Should be able to create a new template with the same name now.
    resp = http.post(
        '/api/admin/permission-templates/custom',
        json={'name': 'Reusable', 'permissions': ['gst_billing']},
        headers=super_admin_headers,
    )
    assert resp.status_code == 201


def test_delete_requires_super_admin(http, super_admin_headers, gst_headers):
    template = _create_template(http, super_admin_headers, name='Protected')
    resp = http.delete(
        f'/api/admin/permission-templates/custom/{template["template_id"]}',
        headers=gst_headers,
    )
    assert resp.status_code == 403
```

- [ ] **Step 2: Run new tests to verify failure**

Run: `cd backend && pytest tests/test_permission_templates.py::test_delete_soft_deletes_template -v 2>&1 | tail -10`
Expected: 405 Method Not Allowed.

- [ ] **Step 3: Add the DELETE endpoint**

Append to `backend/routes/admin.py` immediately after `update_custom_permission_template`:

```python
@admin_bp.route('/permission-templates/custom/<template_id>', methods=['DELETE'])
@authenticate
@require_super_admin
def delete_custom_permission_template(template_id):
    """Soft-delete a custom permission template."""
    template = PermissionTemplate.query.filter_by(
        template_id=template_id, deleted_at=None
    ).first()
    if not template:
        return jsonify({'error': 'Template not found'}), 404

    template.deleted_at = datetime.utcnow()
    db.session.commit()

    return '', 204
```

- [ ] **Step 4: Run all template tests**

Run: `cd backend && pytest tests/test_permission_templates.py -v 2>&1 | tail -25`
Expected: 20 passed (15 from before + 5 new DELETE tests).

- [ ] **Step 5: (skip — no-commit mode active)**

---

## Task 6: Extend `GET /admin/permission-templates` to merge built-in + custom templates

The existing GET handler returns only the 12 built-in templates. Extend it to also fetch active custom templates and merge them into the same `templates` dict.

**Files:**
- Modify: `backend/tests/test_permission_templates.py` — add GET tests
- Modify: `backend/routes/admin.py:get_permission_templates` — fold in custom templates

- [ ] **Step 1: Append GET tests**

Append to `backend/tests/test_permission_templates.py`:

```python
# ── GET: list (merged built-in + custom) ──────────────────────────────────────

def test_get_returns_built_ins_when_no_custom_exist(http, super_admin_headers):
    resp = http.get('/api/admin/permission-templates', headers=super_admin_headers)
    assert resp.status_code == 200
    templates = resp.get_json()['templates']
    # The 12 built-ins are still keyed by their string keys.
    assert 'full_access' in templates
    assert 'dress_shop' in templates
    # Built-ins have is_custom: False.
    assert templates['dress_shop']['is_custom'] is False


def test_get_includes_custom_templates(http, super_admin_headers):
    template = _create_template(http, super_admin_headers, name='Mine')
    resp = http.get('/api/admin/permission-templates', headers=super_admin_headers)
    assert resp.status_code == 200
    templates = resp.get_json()['templates']
    # Custom template is keyed by its template_id.
    assert template['template_id'] in templates
    assert templates[template['template_id']]['is_custom'] is True


def test_get_excludes_soft_deleted_custom_templates(http, super_admin_headers):
    template = _create_template(http, super_admin_headers, name='Gone')
    http.delete(f'/api/admin/permission-templates/custom/{template["template_id"]}',
                headers=super_admin_headers)
    resp = http.get('/api/admin/permission-templates', headers=super_admin_headers)
    templates = resp.get_json()['templates']
    assert template['template_id'] not in templates


def test_get_custom_template_includes_creator_email(http, super_admin_headers, super_admin_user):
    template = _create_template(http, super_admin_headers, name='Tagged')
    resp = http.get('/api/admin/permission-templates', headers=super_admin_headers)
    templates = resp.get_json()['templates']
    assert templates[template['template_id']]['created_by_email'] == super_admin_user.email
```

- [ ] **Step 2: Run the new tests to confirm failure**

Run: `cd backend && pytest tests/test_permission_templates.py::test_get_includes_custom_templates -v 2>&1 | tail -10`
Expected: AssertionError — built-ins don't have `is_custom`, custom templates aren't merged in.

- [ ] **Step 3: Modify the GET handler in `backend/routes/admin.py`**

Find the `templates = { ... }` dict construction in `get_permission_templates`. After the closing `}` of the built-in templates dict (before `return jsonify({'templates': templates}), 200`), add this block:

```python
        # Tag built-ins with is_custom: False so the frontend can discriminate.
        for key, t in templates.items():
            t['is_custom'] = False

        # Merge in active custom templates (Phase 2).
        custom = PermissionTemplate.query.filter(
            PermissionTemplate.deleted_at.is_(None)
        ).all()

        # Batch-fetch creator emails (avoid N+1).
        creator_ids = {str(t.created_by) for t in custom}
        creators = (
            User.query.with_entities(User.user_id, User.email)
            .filter(User.user_id.in_(creator_ids))
            .all()
            if creator_ids else []
        )
        email_by_id = {str(uid): email for uid, email in creators}

        for t in custom:
            templates[str(t.template_id)] = t.to_dict(
                created_by_email=email_by_id.get(str(t.created_by))
            )
```

- [ ] **Step 4: Run all template tests**

Run: `cd backend && pytest tests/test_permission_templates.py -v 2>&1 | tail -30`
Expected: 24 passed (20 from Tasks 3-5 + 4 new GET tests).

- [ ] **Step 5: Run the broader backend test suite**

Run: `cd backend && pytest -x --tb=short 2>&1 | tail -10`
Expected: all green (only the pre-existing `test_security_headers_present` failure is acceptable).

- [ ] **Step 6: (skip — no-commit mode active)**

---

## Task 7: Frontend service wrapper — `permissionTemplateService.ts`

Typed wrapper for the 4 endpoints. No new tests in this task — coverage comes via the MSW-based tests in Task 8 and via component tests in Task 9.

**Files:**
- Create: `frontend-react/src/services/permissionTemplateService.ts`

- [ ] **Step 1: Create the service file**

```typescript
import api from '@/lib/api'

export type CustomTemplateInput = {
  name: string
  description?: string
  permissions: string[]
}

export type PermissionTemplate = {
  name: string
  description: string
  business_type: string
  permissions: string[]
  is_custom: boolean
  // Custom-template-only fields:
  template_id?: string
  created_by?: string
  created_by_email?: string | null
  created_at?: string
  updated_at?: string
}

export type TemplatesResponse = {
  templates: Record<string, PermissionTemplate>
}

export type SingleTemplateResponse = {
  template: PermissionTemplate
}

export const permissionTemplateService = {
  /**
   * List all permission templates (built-in + active custom), merged into a
   * single dict keyed by template key (built-ins) or template_id (custom).
   */
  list(): Promise<TemplatesResponse> {
    return api.get<TemplatesResponse>('/admin/permission-templates').then(r => r.data)
  },

  create(input: CustomTemplateInput): Promise<SingleTemplateResponse> {
    return api.post<SingleTemplateResponse>(
      '/admin/permission-templates/custom',
      input,
    ).then(r => r.data)
  },

  update(template_id: string, input: CustomTemplateInput): Promise<SingleTemplateResponse> {
    return api.put<SingleTemplateResponse>(
      `/admin/permission-templates/custom/${template_id}`,
      input,
    ).then(r => r.data)
  },

  delete(template_id: string): Promise<void> {
    return api.delete(`/admin/permission-templates/custom/${template_id}`).then(() => undefined)
  },
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend-react && npx tsc --noEmit 2>&1 | head -20`
Expected: no errors mentioning `permissionTemplateService.ts`.

- [ ] **Step 3: (skip — no-commit mode active)**

---

## Task 8: Service tests with MSW — `permissionTemplateService.test.ts`

Test the service wrapper by intercepting requests with MSW. Verifies URL, method, and body shape.

**Files:**
- Create: `frontend-react/src/test/permissionTemplateService.test.ts`
- Modify: `frontend-react/src/test/mocks/handlers.ts` — add handlers if needed (most likely the file uses a per-test setup; check existing patterns first)

- [ ] **Step 1: Inspect MSW setup**

Run: `cat frontend-react/src/test/mocks/handlers.ts | head -30`
Look for: do existing tests register handlers ad-hoc via `server.use(...)` or are they all in `handlers.ts`? The pattern we'll use is `server.use(rest.post(...))` per test — keeps the global handlers file lean.

- [ ] **Step 2: Write the test file**

Create `frontend-react/src/test/permissionTemplateService.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './mocks/server'
import { permissionTemplateService } from '@/services/permissionTemplateService'

describe('permissionTemplateService', () => {
  it('list() GETs /admin/permission-templates and returns templates dict', async () => {
    const fake = {
      templates: {
        dress_shop: { name: 'Dress Shop', is_custom: false, permissions: ['x'] },
        'uuid-1':   { name: 'Custom', is_custom: true,  template_id: 'uuid-1', permissions: ['y'] },
      },
    }
    server.use(
      http.get('*/api/admin/permission-templates', () => HttpResponse.json(fake)),
    )

    const result = await permissionTemplateService.list()
    expect(result.templates.dress_shop.name).toBe('Dress Shop')
    expect(result.templates['uuid-1'].is_custom).toBe(true)
  })

  it('create() POSTs the input and returns the created template', async () => {
    let receivedBody: any = null
    server.use(
      http.post('*/api/admin/permission-templates/custom', async ({ request }) => {
        receivedBody = await request.json()
        return HttpResponse.json({
          template: {
            template_id: 'new-uuid',
            name: receivedBody.name,
            is_custom: true,
            permissions: receivedBody.permissions,
          },
        }, { status: 201 })
      }),
    )

    const out = await permissionTemplateService.create({
      name: 'New', description: 'd', permissions: ['gst_billing'],
    })
    expect(receivedBody).toEqual({ name: 'New', description: 'd', permissions: ['gst_billing'] })
    expect(out.template.template_id).toBe('new-uuid')
  })

  it('update() PUTs to the right URL with the input', async () => {
    let receivedBody: any = null
    server.use(
      http.put('*/api/admin/permission-templates/custom/abc-123', async ({ request }) => {
        receivedBody = await request.json()
        return HttpResponse.json({
          template: { template_id: 'abc-123', name: receivedBody.name, is_custom: true, permissions: [] },
        })
      }),
    )

    await permissionTemplateService.update('abc-123', { name: 'Updated', permissions: ['x'] })
    expect(receivedBody.name).toBe('Updated')
  })

  it('delete() DELETEs to the right URL and resolves to void', async () => {
    server.use(
      http.delete('*/api/admin/permission-templates/custom/del-id', () =>
        new HttpResponse(null, { status: 204 }),
      ),
    )

    await expect(permissionTemplateService.delete('del-id')).resolves.toBeUndefined()
  })

  it('create() rejects on non-2xx with the error body accessible', async () => {
    server.use(
      http.post('*/api/admin/permission-templates/custom', () =>
        HttpResponse.json({ error: 'Validation failed', field: 'name', message: 'Too short' }, { status: 400 }),
      ),
    )

    try {
      await permissionTemplateService.create({ name: 'X', permissions: ['gst_billing'] })
      throw new Error('should have thrown')
    } catch (err: any) {
      expect(err.response?.status).toBe(400)
      expect(err.response?.data?.field).toBe('name')
    }
  })
})
```

- [ ] **Step 3: Run the tests**

Run: `cd frontend-react && npm run test -- permissionTemplateService.test 2>&1 | tail -15`
Expected: 5 passed.

- [ ] **Step 4: (skip — no-commit mode active)**

---

## Task 9: `SaveTemplateDialog` component (TDD)

Reusable modal for both create and edit. Validates name length client-side, displays server validation errors inline, shows spinner during save, closes on success.

**Files:**
- Create: `frontend-react/src/components/admin/SaveTemplateDialog.tsx`
- Create: `frontend-react/src/test/SaveTemplateDialog.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend-react/src/test/SaveTemplateDialog.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from './mocks/server'
import { SaveTemplateDialog } from '@/components/admin/SaveTemplateDialog'

describe('SaveTemplateDialog (create mode)', () => {
  it('renders the dialog with empty fields by default', () => {
    render(
      <SaveTemplateDialog
        open
        mode="create"
        currentPermissions={['gst_billing', 'apply_discount']}
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByLabelText(/template name/i)).toHaveValue('')
    expect(screen.getByLabelText(/description/i)).toHaveValue('')
    // The permission count is shown as a readonly caption.
    expect(screen.getByText(/2 permissions/i)).toBeInTheDocument()
  })

  it('blocks submit when name is too short', async () => {
    render(
      <SaveTemplateDialog
        open mode="create"
        currentPermissions={['gst_billing']}
        onSaved={vi.fn()} onClose={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText(/template name/i), { target: { value: 'AB' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(await screen.findByText(/3-40 characters/i)).toBeInTheDocument()
  })

  it('submits POST and calls onSaved on success', async () => {
    server.use(
      http.post('*/api/admin/permission-templates/custom', () =>
        HttpResponse.json({ template: { template_id: 't1', name: 'My Cashier', permissions: ['gst_billing'], is_custom: true } }, { status: 201 }),
      ),
    )
    const onSaved = vi.fn()
    const onClose = vi.fn()
    render(
      <SaveTemplateDialog
        open mode="create"
        currentPermissions={['gst_billing']}
        onSaved={onSaved} onClose={onClose}
      />,
    )
    fireEvent.change(screen.getByLabelText(/template name/i), { target: { value: 'My Cashier' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ template_id: 't1' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows server validation error inline next to the offending field', async () => {
    server.use(
      http.post('*/api/admin/permission-templates/custom', () =>
        HttpResponse.json({ error: 'Validation failed', field: 'name', message: 'A template with this name already exists' }, { status: 400 }),
      ),
    )
    render(
      <SaveTemplateDialog
        open mode="create"
        currentPermissions={['gst_billing']}
        onSaved={vi.fn()} onClose={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText(/template name/i), { target: { value: 'Cashier+' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(await screen.findByText(/already exists/i)).toBeInTheDocument()
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(
      <SaveTemplateDialog
        open mode="create"
        currentPermissions={['gst_billing']}
        onSaved={vi.fn()} onClose={onClose}
      />,
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})

describe('SaveTemplateDialog (edit mode)', () => {
  it('pre-fills name and description from initialValues', () => {
    render(
      <SaveTemplateDialog
        open mode="edit"
        initialValues={{ template_id: 't1', name: 'Existing', description: 'desc here' }}
        currentPermissions={['gst_billing']}
        onSaved={vi.fn()} onClose={vi.fn()}
      />,
    )
    expect(screen.getByLabelText(/template name/i)).toHaveValue('Existing')
    expect(screen.getByLabelText(/description/i)).toHaveValue('desc here')
  })

  it('submits PUT to the right URL', async () => {
    let receivedUrl = ''
    server.use(
      http.put('*/api/admin/permission-templates/custom/:id', ({ request, params }) => {
        receivedUrl = request.url
        return HttpResponse.json({ template: { template_id: params.id as string, name: 'Edited', permissions: ['gst_billing'], is_custom: true } })
      }),
    )
    const onSaved = vi.fn()
    render(
      <SaveTemplateDialog
        open mode="edit"
        initialValues={{ template_id: 'edit-id', name: 'Existing' }}
        currentPermissions={['gst_billing']}
        onSaved={onSaved} onClose={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText(/template name/i), { target: { value: 'Edited' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(receivedUrl).toContain('/permission-templates/custom/edit-id')
  })
})
```

- [ ] **Step 2: Run the tests to confirm failure**

Run: `cd frontend-react && npm run test -- SaveTemplateDialog.test 2>&1 | tail -15`
Expected: 7 failures, all `Cannot find module '@/components/admin/SaveTemplateDialog'`.

- [ ] **Step 3: Implement the component**

Create `frontend-react/src/components/admin/SaveTemplateDialog.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { X, Save, Loader2 } from 'lucide-react'
import {
  permissionTemplateService,
  PermissionTemplate,
} from '@/services/permissionTemplateService'

type Mode = 'create' | 'edit'

type InitialValues = {
  template_id: string
  name: string
  description?: string
}

type Props = {
  open: boolean
  mode: Mode
  initialValues?: InitialValues
  currentPermissions: string[]
  onSaved: (template: PermissionTemplate) => void
  onClose: () => void
}

/**
 * Modal for creating or editing a custom permission template.
 *
 * - Validates name length client-side (3-40 chars).
 * - Maps server validation errors (400 with {field, message}) to inline errors.
 * - The permissions list is currentPermissions at the moment Save is clicked —
 *   the caller (CreateClient) is responsible for keeping that prop in sync with
 *   the user's checkbox selections.
 */
export function SaveTemplateDialog({
  open, mode, initialValues, currentPermissions, onSaved, onClose,
}: Props) {
  const [name, setName] = useState(initialValues?.name ?? '')
  const [description, setDescription] = useState(initialValues?.description ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [permError, setPermError] = useState<string | null>(null)
  const [generalError, setGeneralError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)

  // Reset when opened with new initialValues (e.g. switching from create to edit).
  useEffect(() => {
    if (open) {
      setName(initialValues?.name ?? '')
      setDescription(initialValues?.description ?? '')
      setNameError(null)
      setPermError(null)
      setGeneralError(null)
    }
  }, [open, initialValues])

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const validateClient = (): boolean => {
    setNameError(null); setPermError(null); setGeneralError(null)
    const trimmed = name.trim()
    if (trimmed.length < 3 || trimmed.length > 40) {
      setNameError('Name must be 3-40 characters')
      return false
    }
    if (currentPermissions.length === 0) {
      setPermError('Select at least one permission first')
      return false
    }
    return true
  }

  const handleSubmit = async () => {
    if (!validateClient()) return
    setSubmitting(true)
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        permissions: currentPermissions,
      }
      const res = mode === 'create'
        ? await permissionTemplateService.create(payload)
        : await permissionTemplateService.update(initialValues!.template_id, payload)
      onSaved(res.template)
      onClose()
    } catch (err: any) {
      const body = err?.response?.data
      if (body?.field === 'name')         setNameError(body.message || 'Invalid name')
      else if (body?.field === 'permissions') setPermError(body.message || 'Invalid permissions')
      else                                 setGeneralError(body?.error || body?.message || 'Save failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'create' ? 'Save template' : 'Edit template'}
        className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {mode === 'create' ? 'Save as template' : 'Edit template'}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor="template-name" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Template name <span className="text-red-500">*</span>
            </label>
            <input
              id="template-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={40}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Cashier-Plus"
              autoFocus
            />
            {nameError && <p className="text-xs text-red-600 mt-1">{nameError}</p>}
          </div>

          <div>
            <label htmlFor="template-description" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description <span className="text-gray-400">(optional)</span>
            </label>
            <input
              id="template-description"
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              maxLength={200}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              placeholder="What's this template for?"
            />
          </div>

          <p className="text-xs text-gray-500">
            This template will save <strong>{currentPermissions.length} permissions</strong>.
          </p>

          {permError && <p className="text-xs text-red-600">{permError}</p>}
          {generalError && <p className="text-xs text-red-600">{generalError}</p>}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests**

Run: `cd frontend-react && npm run test -- SaveTemplateDialog.test 2>&1 | tail -15`
Expected: 7 passed.

- [ ] **Step 5: (skip — no-commit mode active)**

---

## Task 10: `CustomTemplateActions` overlay component

Small overlay with edit + delete buttons; shown on hover via Tailwind `group-hover`. Inline delete confirmation popover. No separate component tests — covered by integration in Task 11.

**Files:**
- Create: `frontend-react/src/components/admin/CustomTemplateActions.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { permissionTemplateService, PermissionTemplate } from '@/services/permissionTemplateService'

type Props = {
  template: PermissionTemplate
  onEdit: (template: PermissionTemplate) => void
  /** Called after a successful delete (so the caller can re-fetch the list). */
  onDeleted: (template_id: string) => void
}

/**
 * Overlay rendered absolutely-positioned in the top-right of a custom template
 * card. Edit and Delete buttons fade in on parent hover via Tailwind
 * `group-hover` (the parent card must have `group` in its className).
 *
 * Delete uses an inline confirm popover (not a modal) so the user's larger
 * client-creation flow isn't disrupted.
 */
export function CustomTemplateActions({ template, onEdit, onDeleted }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async () => {
    if (!template.template_id) return
    setDeleting(true)
    setError(null)
    try {
      await permissionTemplateService.delete(template.template_id)
      onDeleted(template.template_id)
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        type="button"
        aria-label={`Edit template ${template.name}`}
        onClick={(e) => { e.stopPropagation(); onEdit(template) }}
        className="p-1 rounded bg-white/80 hover:bg-white text-gray-600 hover:text-blue-600 shadow-sm"
      >
        <Pencil className="h-3 w-3" />
      </button>
      <button
        type="button"
        aria-label={`Delete template ${template.name}`}
        onClick={(e) => { e.stopPropagation(); setConfirming(true) }}
        className="p-1 rounded bg-white/80 hover:bg-white text-gray-600 hover:text-red-600 shadow-sm"
      >
        <Trash2 className="h-3 w-3" />
      </button>

      {confirming && (
        <div
          role="dialog"
          aria-label="Confirm delete"
          className="absolute top-7 right-0 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-10 whitespace-nowrap"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-xs text-gray-700 mb-2">Delete &quot;{template.name}&quot;?</p>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="px-2 py-0.5 text-xs border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="px-2 py-0.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles + build still passes**

Run: `cd frontend-react && npm run build 2>&1 | tail -10`
Expected: build succeeds.

- [ ] **Step 3: (skip — no-commit mode active)**

---

## Task 11: Wire `SaveTemplateDialog` + `CustomTemplateActions` into CreateClient

Five integration points in CreateClient.tsx: state for the dialog, the Save button, the per-card overlay, the "Created by" caption, and the save/delete refetch logic.

**Files:**
- Modify: `frontend-react/src/pages/admin/CreateClient.tsx`

- [ ] **Step 1: Add imports**

At the top of `frontend-react/src/pages/admin/CreateClient.tsx`, near the other component imports, add:

```tsx
import { SaveTemplateDialog } from '@/components/admin/SaveTemplateDialog'
import { CustomTemplateActions } from '@/components/admin/CustomTemplateActions'
import { Save as SaveIcon } from 'lucide-react'  // (if not already imported via lucide-react)
```

If `Save` is already imported as `Save` from lucide-react (it likely is, given existing components), use that. Otherwise use the alias above.

- [ ] **Step 2: Add state for the dialog**

Find the existing state block (around lines 102-106 with `selectedPermissions`, `availablePermissions`, `permissionTemplates`, `selectedTemplate`, `showPassword`). Add a new state line:

```tsx
const [saveDialog, setSaveDialog] = useState<
  | { mode: 'create' }
  | { mode: 'edit'; template: PermissionTemplate }
  | null
>(null);
```

`PermissionTemplate` here refers to the existing local type in CreateClient — extend it (find the `type PermissionTemplate` declaration in the file) to add the optional custom-template fields. Currently it has `name`, `description`, `business_type`, `permissions`. Change to:

```tsx
type PermissionTemplate = {
  name: string
  description: string
  business_type: string
  permissions: string[]
  is_custom?: boolean
  template_id?: string
  created_by?: string
  created_by_email?: string | null
  created_at?: string
}
```

- [ ] **Step 3: Render the Save button below the template grid**

Find the existing template grid (`<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">`, around line 714). After the closing `</div>` of that grid AND after the existing `{selectedTemplate && (...)}` info block, add:

```tsx
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setSaveDialog({ mode: 'create' })}
                disabled={selectedPermissions.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 text-white rounded-lg text-sm hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <SaveIcon className="h-4 w-4" />
                Save as template…
              </button>
            </div>
```

- [ ] **Step 4: Render per-card overlay + "Created by" caption inside the template grid map**

Find the existing `{Object.entries(permissionTemplates).map(([key, template]) => { ... })}` block (around line 715). The inner `<button>` that renders each card already has nested divs. Two changes:

(a) Add `group relative` to the button's className. Currently the className is something like `p-4 rounded-lg border-2 text-left transition-all ${isSelected ? ...}`. Make it:

```tsx
className={`group relative p-4 rounded-lg border-2 text-left transition-all ${
  isSelected
    ? 'border-blue-600 bg-blue-50 shadow-md'
    : 'border-gray-200 hover:border-blue-300 hover:shadow-sm'
}`}
```

(b) Inside the `<button>`, after the existing `<div className="flex items-start gap-3">...</div>` content, add:

```tsx
                    {template.is_custom && (
                      <>
                        <CustomTemplateActions
                          template={template}
                          onEdit={(t) => setSaveDialog({ mode: 'edit', template: t })}
                          onDeleted={() => {
                            fetchPermissionTemplates()
                            if (selectedTemplate === key) {
                              setSelectedTemplate('')
                              setSelectedPermissions([])
                            }
                          }}
                        />
                        {template.created_by_email && (
                          <p className="text-[10px] text-gray-400 mt-2">
                            Created by: {template.created_by_email}
                          </p>
                        )}
                      </>
                    )}
```

- [ ] **Step 5: Mount the dialog at the end of the form**

Just before the form's closing `</form>` tag, or near the bottom of the JSX return, mount:

```tsx
        {saveDialog && (
          <SaveTemplateDialog
            open
            mode={saveDialog.mode}
            initialValues={saveDialog.mode === 'edit' ? {
              template_id: saveDialog.template.template_id!,
              name: saveDialog.template.name,
              description: saveDialog.template.description,
            } : undefined}
            currentPermissions={selectedPermissions}
            onSaved={(newTemplate) => {
              fetchPermissionTemplates()
              if (saveDialog.mode === 'create' && newTemplate.template_id) {
                setSelectedTemplate(newTemplate.template_id)
                setSelectedPermissions(newTemplate.permissions)
              }
            }}
            onClose={() => setSaveDialog(null)}
          />
        )}
```

- [ ] **Step 6: Verify the build passes**

Run: `cd frontend-react && npm run build 2>&1 | tail -10`
Expected: build succeeds. If TypeScript complains about `PermissionTemplate` shape, double-check Step 2's type extension.

- [ ] **Step 7: Manual smoke check (read-only)**

Skim the changed file with grep to confirm all five pieces landed:

```
grep -n "saveDialog\|CustomTemplateActions\|SaveTemplateDialog\|Save as template\|created_by_email" frontend-react/src/pages/admin/CreateClient.tsx
```

Expected: 8+ matches across state, button, map block, and dialog mount.

- [ ] **Step 8: (skip — no-commit mode active)**

---

## Task 12: Extend `PermissionHelpTooltip` to CreateClient's Advanced section

Mechanical mirror of Phase 1's Task 6/7. Single small edit.

**Files:**
- Modify: `frontend-react/src/pages/admin/CreateClient.tsx` — the `groupedPermissions.map` block around line 813

- [ ] **Step 1: Add the import**

At the top of `frontend-react/src/pages/admin/CreateClient.tsx`, add:

```tsx
import { PermissionHelpTooltip } from '@/components/admin/PermissionHelpTooltip'
```

(May already be imported via a previous task's edit — if so, skip.)

- [ ] **Step 2: Modify the perm row in the Advanced section**

Find the block (around line 805-816):

```tsx
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {(permissions as any[]).map((perm: any) => (
                        <label key={perm.permission_name} className="flex items-center gap-2 hover:bg-gray-50 p-1 rounded">
                          <input
                            type="checkbox"
                            checked={selectedPermissions.includes(perm.permission_name)}
                            onChange={() => handlePermissionToggle(perm.permission_name)}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">{perm.description}</span>
                        </label>
                      ))}
                    </div>
```

Replace with:

```tsx
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {(permissions as any[]).map((perm: any) => (
                        <label key={perm.permission_name} className="group flex items-center gap-2 hover:bg-gray-50 p-1 rounded">
                          <input
                            type="checkbox"
                            checked={selectedPermissions.includes(perm.permission_name)}
                            onChange={() => handlePermissionToggle(perm.permission_name)}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700 flex-1">{perm.description}</span>
                          <PermissionHelpTooltip permissionName={perm.permission_name} />
                        </label>
                      ))}
                    </div>
```

(Changes: added `group` to label className; added `flex-1` to span; rendered `<PermissionHelpTooltip>` after the span.)

- [ ] **Step 3: Verify build**

Run: `cd frontend-react && npm run build 2>&1 | tail -5`
Expected: build succeeds.

- [ ] **Step 4: (skip — no-commit mode active)**

---

## Task 13: Manual end-to-end verification

No code changes. Real browser test of the complete flow.

- [ ] **Step 1: Start the backend**

Run: `cd backend && python app.py`
Expected: on first start, logs `[Migration] Schema v21 → v22. Running migrations…` then `[Migration] v22: permission_templates table created`. On subsequent starts: `[Migration] Schema up to date (v22)`.

- [ ] **Step 2: Start the frontend**

Run: `cd frontend-react && npm run dev`
Expected: dev server on http://localhost:3002/frontend/.

- [ ] **Step 3: Log in as super admin and navigate to `/admin/clients/create`**

The CreateClient page should load with the 13 built-in templates in the grid.

- [ ] **Step 4: Save a custom template**

- Click any built-in template (e.g. "Cashier") to populate the perm checkboxes.
- Tweak a few perms in the Advanced section.
- Click "💾 Save as template…" at the bottom of the template grid.
- Enter name "Test Cashier+" and description "manual verification".
- Click Save.

Expected: modal closes, the new "Test Cashier+" card appears in the grid with a "Custom" tag and "Created by: <your email>" caption, and is auto-selected (blue border).

- [ ] **Step 5: Edit the custom template**

- Hover over the "Test Cashier+" card.
- Edit (✏️) and delete (🗑️) icons fade in at the top-right.
- Click edit. Modal opens with name pre-filled.
- Change the name to "Test Cashier++".
- Click Save.

Expected: modal closes, card title updates.

- [ ] **Step 6: Delete the custom template**

- Hover, click 🗑️.
- Inline confirm popover appears with "Delete \"Test Cashier++\"?".
- Click Delete.

Expected: card disappears.

- [ ] **Step 7: Verify tooltip on Advanced section**

- Open the "Advanced: Customize Individual Permissions" expander.
- Hover any permission row.
- An `ⓘ` icon fades in on the right.
- Hover/click the `ⓘ`.

Expected: tooltip card appears with the themed emoji, permission name, and example sentence — identical to EditUser/CreateUser tooltips.

- [ ] **Step 8: Mobile viewport check**

- Open browser devtools, switch to a 375×667 viewport (iPhone SE).
- Re-open the CreateClient page.

Expected: `ⓘ` icons always visible on touch; tapping opens tooltip; tapping outside closes. Custom-template edit/delete icons are visible on touch (no hover state required) — adjust the `opacity-100 md:opacity-0 md:group-hover:opacity-100` pattern from Phase 1 if needed.

- [ ] **Step 9: End-to-end client creation with a custom template**

- Apply the custom template you just made (or create a new one).
- Fill in client + user details, click "Create Client".
- Log out, log in as the new client owner (without super_admin).
- Try to use a feature granted by the template (e.g. create a bill).

Expected: works without permission-denied errors. This proves the entire chain — template → /admin/users with permissions[] → UserPermission rows → route guards — all aligned.

---

## Done criteria

Phase 2 is shippable when ALL of these hold:

1. `cd backend && pytest -x` → all green (or only the known pre-existing `test_security_headers_present` failure).
2. `cd frontend-react && npm run test:run` → all green.
3. `cd frontend-react && npm run build` → success, no TS errors.
4. Manual verification (Task 13) passes for save, edit, delete, tooltip, mobile, and the end-to-end client creation flow.
5. The CreateClient grid shows built-in + custom templates merged, with the Custom tag on user-defined ones.

Once shippable, the user can review the working tree and stage/commit at their discretion. The "deferred to follow-up" Supabase sync work (Section 5.4 of the spec) can be scheduled separately.
