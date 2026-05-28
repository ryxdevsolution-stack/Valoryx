# Role Hierarchy Redesign — Owner → Manager → Staff

**Date:** 2026-05-27
**Status:** Approved scope, awaiting plan
**Surfaces:** `backend/routes/team.py`, `backend/routes/admin.py`, `backend/routes/branches.py`, `backend/routes/invite.py`, `backend/routes/stock_transfer.py`, `backend/routes/sessions.py`, `backend/migrations/runner.py`, `backend/models/user_model.py`, plus 4-5 frontend files (CreateUser, EditUser, CreateClient, EditClient, Team page)
**Supersedes:** the flat 5-role model (`owner`, `admin`, `manager`, `staff`, `cashier`)

---

## 1. Background & problem

Today Valoryx has five user roles defined as a flat set: `owner`, `admin`, `manager`, `staff`, `cashier`. The `ROLE_HIERARCHY` constant in [team.py:47](../../../backend/routes/team.py#L47) ranks them for "can this user manage that user" checks, but there is **no explicit parent-child link** between any two users — every team member is a peer at the data layer, only ranked by role label. Two concrete problems result:

1. **The `admin` and `cashier` roles add complexity without earning their keep.** `admin` mostly behaves like a co-owner (it's bundled with `owner` in 13+ route guards across [branches.py](../../../backend/routes/branches.py), [invite.py](../../../backend/routes/invite.py), [stock_transfer.py](../../../backend/routes/stock_transfer.py), [sessions.py](../../../backend/routes/sessions.py), and [team.py](../../../backend/routes/team.py)). `cashier` has no distinct behavior at all — it's only mentioned in the quota allowlist alongside the other three subordinate roles. Both roles add noise to dropdowns and migration paths without giving the owner clearer authority delegation.

2. **There's no way to see who manages whom.** When the owner hires a new manager and asks them to bring on three staff, the resulting users all sit at the same flat level in the database. The owner can't ask "show me Bob's team" or "Bob is leaving — reassign his three staff to Frank" without manual database surgery. Managers can't see their own team without the owner doing manual filtering.

This spec collapses the role list to three (`owner`, `manager`, `staff`), adds a `reports_to_id` column to track the explicit reporting chain, and surfaces the result as a tree view on the Team page. Managers see only their own subtree; the owner sees the full tree.

---

## 2. Goals & non-goals

**Goals**
1. Drop `admin` and `cashier` from the role list everywhere — code, schema, UI, route guards.
2. Add a `users.reports_to_id` column that explicitly tracks the chain: each non-owner user points at the user they report to.
3. Migrate existing production data: `admin` → `manager`, `cashier` → `staff`; backfill `reports_to_id` for every existing user.
4. Re-decide each of the 13+ `('owner', 'admin')` route guards as either `('owner', 'manager')` or `('owner',)` based on the operation's sensitivity.
5. Add a tree view on the Team page; managers see only their subtree, owner sees the full structure.
6. Auto-assign `reports_to_id` server-side when a manager creates a staff (they can't put their staff under another manager).
7. Update the Team Member Quotas section on CreateClient/EditClient to show only Manager and Staff columns; fold old admin/cashier quota numbers into manager/staff.
8. Pre-delete hook: when a manager is removed, re-parent their staff to the manager's own `reports_to_id` (typically the owner) so the tree stays connected.

**Non-goals**
- No multi-level manager chains (manager managing another manager). Managers always report directly to the owner; staff always report to a manager OR directly to the owner. Strict 3 levels.
- No cross-tenant visibility (super admin tree across clients). Each tenant's tree is self-contained.
- No new permissions added; no permissions removed. Permission-level access is orthogonal to the role+reports_to chain.
- No new email/notification flow when a user gets re-parented.
- No audit log entries for re-parenting events in v1 (can be added later if needed).
- No bulk re-parenting UI ("move all of Bob's staff to Frank") — owner must re-assign each user individually for now.
- The super admin role is unchanged. `is_super_admin = True` continues to be a per-user boolean and is orthogonal to the new hierarchy. Super admins are not visualized in the tree.

---

## 3. Feature 1 — Data model

### 3.1 Schema change

New column on `users`:

| Column | Type | Constraints |
|---|---|---|
| `reports_to_id` | FlexibleUUID (UUID on PostgreSQL, VARCHAR(36) on SQLite) | NULL, FK → `users.user_id` ON DELETE SET NULL, indexed |

The FK uses `ON DELETE SET NULL` as a defensive default, but the pre-delete hook in the application layer (section 5.3) will re-parent properly before the row is deleted, so the FK action almost never fires.

### 3.2 Semantics of `reports_to_id`

- **Owner**: `reports_to_id = NULL`. The owner is the top of the tenant tree; they don't report to anyone within the tenant. (They sit below the platform's super admin, but super admin is not modeled as a user-to-user link.)
- **Manager**: `reports_to_id = the owner's user_id`. Explicit and always set. Since managers always report to the owner in this model, this is enforced server-side at create time.
- **Staff**: `reports_to_id = the user_id of either their manager OR the owner` (the latter when the owner creates a staff directly without going through a manager).

The naming is deliberate: the column means "who do you report to?". Owner having NULL is semantically correct (they don't report to anyone within the tenant). Renaming from a `manager_id` proposal during brainstorming made this cleaner because `manager_id` on an owner row would have been misleading.

### 3.3 Migration v23 (atomic combined migration)

A single migration handles three things in one transaction:

1. `ALTER TABLE users ADD COLUMN reports_to_id <type>` + the FK + index.
2. `UPDATE users SET role = 'manager' WHERE role = 'admin'` and `UPDATE users SET role = 'staff' WHERE role = 'cashier'`.
3. Backfill `reports_to_id`:
   - For each client: find the owner (`role = 'owner'`, scoped by `client_id`).
   - Set `reports_to_id = NULL` for the owner (no change, that's the default).
   - Set `reports_to_id = owner.user_id` for every manager in that client.
   - Set `reports_to_id = owner.user_id` for every staff in that client (no historical manager assignment exists; the owner can re-parent staff to specific managers via the UI later).
4. Normalize `client_entry.role_quotas` JSON: if a row has `admin` or `cashier` keys, fold them into `manager` and `staff` respectively (additive). Example: `{admin: 2, manager: 1, staff: 5, cashier: 3}` → `{manager: 3, staff: 8}`. Rows with no admin/cashier keys are untouched. Rows with no `role_quotas` at all are untouched.

The migration runs at startup via the existing `migrations/runner.py` infrastructure. `CURRENT_SCHEMA_VERSION` bumps from 22 to 23.

### 3.4 Models & relationships

The `User` SQLAlchemy model gets the new field plus an optional relationship for ORM convenience:

```python
reports_to_id = db.Column(FlexibleUUID, db.ForeignKey('users.user_id'), nullable=True, index=True)
reports_to    = db.relationship('User', remote_side='User.user_id', foreign_keys=[reports_to_id], backref='direct_reports', uselist=False)
```

`user.direct_reports` becomes the natural way to list a manager's staff in code.

---

## 4. Feature 2 — Route guard reclassification

The thirteen-plus route guards previously using `role IN ('owner', 'admin')` are reclassified per the table below. The blanket rule from brainstorming was "owner+manager mostly, sensitive ones owner-only."

| Route file | Operation | New gate | Reasoning |
|---|---|---|---|
| [branches.py:98,186,249,288](../../../backend/routes/branches.py#L98) | Branch CRUD | `('owner', 'manager')` | Managers run day-to-day branch ops |
| [invite.py:216](../../../backend/routes/invite.py#L216) | Send team invites | `('owner', 'manager')` | Managers invite their own staff |
| [stock_transfer.py:20](../../../backend/routes/stock_transfer.py#L20) | Initiate transfer | `('owner', 'manager')` | Inventory ops are manager territory |
| [team.py:282,373,597,715,773,841](../../../backend/routes/team.py#L282) | Team CRUD endpoints | `('owner', 'manager')` + subtree filter (section 5.2) | Managers manage their own subtree only |
| [sessions.py:112,135](../../../backend/routes/sessions.py#L112) | Revoke user sessions | `('owner',)` only | Sensitive — kicks people out of the app |

After this change, no `@require_role` decorator anywhere in the codebase contains the literal string `'admin'`. Verify with `grep -rn "'admin'" backend/routes` after the change — only `is_super_admin` references and string-formatting contexts should remain.

`ROLE_HIERARCHY` in [team.py:47](../../../backend/routes/team.py#L47) shrinks from 5 entries to 3: `{'staff': 0, 'manager': 1, 'owner': 2}`. The existing hierarchy check (lower-rank users can't manage equal/higher rank) still works with the smaller set.

`DEFAULT_ROLE_PERMISSIONS` dict in [team.py:91+](../../../backend/routes/team.py#L91) loses its `admin` and `cashier` entries. The remaining three (`owner`, `manager`, `staff`) keep their existing permission lists. Any code that looked up `DEFAULT_ROLE_PERMISSIONS['admin']` or `['cashier']` after a `role` value is fixed by the migration data step (they no longer exist).

The `allowed_quota_roles` set in [admin.py:1195](../../../backend/routes/admin.py#L1195) and [admin.py:1358](../../../backend/routes/admin.py#L1358) changes from `{'admin','manager','staff','cashier'}` to `{'manager','staff'}`. Quota POST/PUT handlers reject keys outside that set with a 400.

---

## 5. Feature 3 — Tree API + visibility scope + auto-assign

### 5.1 New endpoint: `GET /api/team/tree`

Added to `team_bp` in [team.py](../../../backend/routes/team.py), gated by `@require_role(['owner', 'manager'])`. Staff calling this endpoint get a 403.

**Response when the caller is an owner:**

```json
{
  "owner": {
    "user_id": "alice-uuid",
    "full_name": "Alice", "email": "alice@valoryx",
    "role": "owner"
  },
  "managers": [
    {
      "user_id": "bob-uuid", "full_name": "Bob", "email": "bob@valoryx",
      "role": "manager",
      "staff": [
        { "user_id": "charlie-uuid", "full_name": "Charlie", "email": "charlie@…", "role": "staff" },
        { "user_id": "dave-uuid",    "full_name": "Dave",    "email": "dave@…",    "role": "staff" }
      ]
    },
    { "user_id": "frank-uuid", "full_name": "Frank", "role": "manager", "staff": [ … ] }
  ],
  "direct_reports": [
    { "user_id": "eve-uuid", "full_name": "Eve", "role": "staff" }
  ]
}
```

`direct_reports` is the list of staff whose `reports_to_id = owner.user_id` (owner-created, not under any manager). The owner UI renders them as siblings of the manager cards.

**Response when the caller is a manager:**

```json
{
  "self": {
    "user_id": "bob-uuid", "full_name": "Bob", "role": "manager"
  },
  "staff": [
    { "user_id": "charlie-uuid", "full_name": "Charlie", "role": "staff" },
    { "user_id": "dave-uuid",    "full_name": "Dave",    "role": "staff" }
  ]
}
```

The manager never sees the owner, other managers, or other managers' staff. Single SQL query: `SELECT * FROM users WHERE reports_to_id = <caller.user_id> AND client_id = <caller.client_id>`.

### 5.2 Auto-assign + subtree filter on team CRUD

The existing `POST /api/team/users` ([team.py:486](../../../backend/routes/team.py#L486)) starts enforcing hierarchy server-side. The endpoint accepts an optional `reports_to_id` in the request body, but the server overrides per these rules:

- **If caller is `manager`** and is creating a `staff` user:
  - `reports_to_id` is forced to `caller.user_id` (the client value is ignored). Managers can't put new staff under someone else.
  - Creating a `manager` or `owner` is rejected with 403 (managers can only create staff).
- **If caller is `owner`** and is creating a `staff` user:
  - `reports_to_id` defaults to `owner.user_id` (owner-created direct staff) unless the request explicitly sets it to a specific manager's user_id within the same client.
  - The server validates: if a `reports_to_id` is provided, the target user must exist, belong to the same `client_id`, and have `role = 'manager'`. Otherwise 400.
- **If caller is `owner`** and is creating a `manager` user:
  - `reports_to_id` is forced to `owner.user_id`. Managers always report to the owner.
- **If caller is `owner`** and is creating another `owner`:
  - Rejected with 400. There is exactly one owner per client (existing constraint).

The existing `PUT /api/team/users/<id>` ([team.py:658](../../../backend/routes/team.py#L658)) follows analogous rules for re-parenting:

- **Owner** can change any user's `reports_to_id` to any valid value within the same client.
- **Manager** can only edit users where the target's current `reports_to_id == caller.user_id` (their own staff). They cannot move their staff to another manager (only the owner can re-parent across teams). If a manager tries to PUT with a `reports_to_id` value, the server ignores that field for non-owner callers.

All Team CRUD endpoints (`GET`, `PUT`, `DELETE`, `POST`) add a **subtree filter** for manager callers: an extra `WHERE reports_to_id = caller.user_id` clause when listing, and a permission check before single-record operations (manager can only operate on users they manage).

### 5.3 Pre-delete hook (orphan handling)

When `DELETE /api/team/users/<id>` runs against a `manager` who has direct reports:

```python
# Pseudo-code; runs inside the existing transaction
if target.role == 'manager':
    direct_reports = User.query.filter_by(reports_to_id=target.user_id).all()
    for staff in direct_reports:
        staff.reports_to_id = target.reports_to_id  # bubble up one level (typically the owner)
    db.session.flush()
# Then proceed with the actual delete
```

The bubble-up rule means orphaned staff inherit the manager's parent. In this model that's always the owner. After deletion the tree stays connected: the deleted manager's staff now appear as `direct_reports` under the owner (or under whichever manager the owner later re-parents them to manually).

For non-manager deletions (owner can't delete themselves; staff has no direct reports), no special handling is needed — the FK's `ON DELETE SET NULL` is the safety net.

---

## 6. Feature 4 — Frontend changes

### 6.1 Files modified

- `frontend-react/src/pages/admin/CreateUser.tsx` — role dropdown loses `admin` and `cashier`
- `frontend-react/src/pages/admin/EditUser.tsx` — same
- `frontend-react/src/pages/admin/CreateClient.tsx` — Team Member Quotas drops Admin + Cashier columns
- `frontend-react/src/pages/admin/EditClient.tsx` — same
- Team page (path to be confirmed during implementation — likely `frontend-react/src/pages/Team.tsx` or similar) — replace flat list with tree view

### 6.2 Role dropdowns

After this change, the role `<select>` options on CreateUser, EditUser, and the Team page's create-user dialog become:

- **Owner role is not user-pickable.** Reserved for client creation (set automatically by `admin.py:create_client`).
- **Manager** and **Staff** are the only dropdown options.

On the Team page specifically, the role dropdown's option list is filtered by the caller:
- **Owner caller** sees both Manager and Staff.
- **Manager caller** sees only Staff.

### 6.3 Team Member Quotas (CreateClient + EditClient)

The current 4-column grid (Admin / Manager / Staff / Cashier) shrinks to a 2-column grid (Manager / Staff). The helper text updates from "Example: Admin = 1, Manager = 2, Staff = 5, Cashier = 3" to "Example: Manager = 3, Staff = 10". The submit handler payload shape doesn't change — it's still `{ manager: number, staff: number }` (with `admin` and `cashier` keys absent).

### 6.4 Tree view on the Team page

Replace the current flat list view with a nested ASCII-style hierarchy rendered as Tailwind cards (no diagramming library; plain JSX with conditional indentation).

**Owner-view layout sketch:**

```
┌─ Your Team (8 members) ─────────────────────────────────────┐
│                                                              │
│  👑 Alice (You)               owner    alice@valoryx         │
│  │                                                           │
│  ├─ 👤 Bob              manager  bob@valoryx     3 staff    │
│  │   ├─ Charlie         staff    charlie@…      [✎][🗑️]    │
│  │   ├─ Dave            staff    dave@…         [✎][🗑️]    │
│  │   └─ Eve             staff    eve@…          [✎][🗑️]    │
│  │   [+ Add staff under Bob]                                │
│  │                                                           │
│  ├─ 👤 Frank            manager  frank@valoryx   1 staff   │
│  │   └─ Grace           staff    grace@…        [✎][🗑️]   │
│  │   [+ Add staff under Frank]                              │
│  │                                                           │
│  └─ 👨 Henry            staff (direct)  henry@…             │
│                                                              │
│  [+ Add manager]   [+ Add staff (direct to you)]             │
└──────────────────────────────────────────────────────────────┘
```

**Manager-view layout sketch (Bob viewing his own subtree):**

```
┌─ Your Team (3 staff) ───────────────────────────────────────┐
│                                                              │
│  👤 Bob (You)        manager   bob@valoryx                  │
│  │                                                           │
│  ├─ Charlie          staff     charlie@…    [✎][🗑️]        │
│  ├─ Dave             staff     dave@…       [✎][🗑️]        │
│  └─ Eve              staff     eve@…        [✎][🗑️]        │
│                                                              │
│  [+ Add staff to my team]                                   │
└──────────────────────────────────────────────────────────────┘
```

### 6.5 Tree rendering details

- Plain JSX. Each row is a flex container with `pl-X` proportional to its depth.
- The connecting tree lines (├, └, │) are rendered as Tailwind `border-l` + `border-b` strokes on absolutely-positioned `::before` pseudo-elements OR as actual unicode characters in a `<pre>`-like span. Implementation detail; whichever is simpler.
- Each row's Edit / Delete buttons reuse the existing Team CRUD dialogs from the current page (no new modals).
- Add buttons (`[+ Add staff under Bob]`, etc.) open the existing create-user dialog pre-populated with `reports_to_id = <selected manager's user_id>`.
- The tree fetches `GET /api/team/tree` on mount and re-fetches after any successful create / edit / delete.

### 6.6 Empty states

- Owner with no managers: tree shows just the owner row + an empty placeholder: *"No managers yet — click '+ Add manager' to start building your team."*
- Owner with managers but no staff anywhere: tree shows owner + manager rows, each manager card says "(0 staff)".
- Manager with no staff: tree shows just themselves + *"No staff yet — click '+ Add staff' to assign your first."*

---

## 7. Cross-cutting concerns

### 7.1 Backward compatibility

- **Existing user grants are untouched.** Permissions (`UserPermission` rows) are independent of the role-and-reports-to system. Migrating `admin` → `manager` doesn't change what permissions that user has.
- **Sessions and tokens:** all existing JWT sessions are invalidated at deploy time. The migration v23 includes a `DELETE FROM user_sessions` step so that everyone is forced to re-log in. This is intentional — keeping a backward-compat shim that translates the old `'admin'` role claim into `'manager'` would add dead code to the auth middleware for a one-time event. The deploy notes call out the brief re-login requirement; small UX friction in exchange for clean code.

### 7.2 Sync to Supabase

Schema changes (new column) and data updates (role / reports_to_id values) must propagate to Supabase via the existing sync infrastructure. The migration's column addition is handled by Supabase's own schema sync (or a one-time manual ALTER). The data updates flow through `sync_service` like any other user update.

### 7.3 Defense in depth

- **Frontend `<select>` doesn't include `admin` or `cashier`.** Even if the dropdown is bypassed, the server-side `allowed_quota_roles` set rejects those keys with a 400. The role field on user creation/update is similarly validated against `ROLE_HIERARCHY` keys.
- **A manager can't set `reports_to_id` to anything but themselves** (the server overrides regardless of client payload). This prevents a compromised manager from re-parenting themselves to escape the subtree filter.

### 7.4 Pre-existing salary perms gap (deferred)

The 10 salary perms (`view_employees`, `mark_attendance`, etc.) referenced by route guards but not seeded is a separate paused todo. This redesign does not touch it. After this redesign lands, the salary fix resumes as its own small task.

---

## 8. Testing strategy

### 8.1 Backend tests

- **Migration v23 tests** (`backend/tests/test_migration_023.py`):
  - Applies migration to a DB pre-seeded with one admin, one cashier, one manager, one staff. Asserts that after migration: admin's role becomes manager, cashier's role becomes staff, every non-owner has `reports_to_id` set to the owner's user_id, and the owner's `reports_to_id` is NULL.
  - Idempotency: re-running the migration on already-migrated data is a no-op (no admins/cashiers left to rename, reports_to_id values stable).
  - Quota normalization: a client with `role_quotas = {admin: 2, manager: 1, staff: 5, cashier: 3}` becomes `{manager: 3, staff: 8}`. A client with no admin/cashier keys is untouched.

- **Tree endpoint tests** (`backend/tests/test_team_tree.py`):
  - Owner caller gets full tree shape (owner + managers + direct_reports).
  - Manager caller gets only their subtree (self + staff).
  - Staff caller gets 403.
  - Each manager's `staff` array only contains users with `reports_to_id == that manager`.
  - `direct_reports` only contains staff with `reports_to_id == owner.user_id`.
  - Cross-tenant isolation: an owner from client A never sees client B's users.

- **Auto-assign tests** (extend `backend/tests/test_permissions.py` or a new file):
  - Manager creates a staff user → server-side `reports_to_id = caller.user_id` regardless of the request body's value.
  - Manager attempts to create another manager → 403.
  - Owner creates a manager → server-side `reports_to_id = owner.user_id`.
  - Owner creates a staff with explicit `reports_to_id = some_manager.user_id` → respected.
  - Owner creates a staff with explicit `reports_to_id = some_user_in_other_client.user_id` → 400 (cross-tenant validation).
  - Owner attempts to create a second owner → 400.

- **Subtree filter tests:**
  - Manager A lists team users → only sees themselves + their staff.
  - Manager A attempts to PUT manager B's staff → 403.
  - Owner can PUT any user's `reports_to_id` to re-parent.

- **Delete cascade tests:**
  - Delete a manager who has 3 staff → all 3 staff's `reports_to_id` becomes the manager's `reports_to_id` (i.e., the owner's user_id). Deletion succeeds.

- **Route-guard tests:**
  - Each of the 13+ reclassified routes is hit with (a) owner token, (b) manager token, (c) staff token. Asserts the correct allow / deny per the table in section 4.
  - Sessions revocation specifically rejects manager callers (401 expected, since `sessions.py` is now owner-only).

- **Existing tests update:** Any test fixture creating a user with `role='admin'` or `role='cashier'` is updated to use `manager` or `staff`. The conftest.py user fixtures are the main source.

### 8.2 Frontend tests

- **Role dropdown rendering:** unit-test that CreateUser/EditUser and the Team page's create dialog render exactly 2 options (Manager, Staff) for owner callers, and exactly 1 option (Staff) for manager callers.
- **Team Member Quotas:** unit-test that CreateClient/EditClient render exactly 2 quota inputs (Manager, Staff).
- **Tree view shape:** snapshot test of the tree component with a fixture covering owner + 2 managers (one with staff, one empty) + 1 direct-report staff.

### 8.3 Manual verification

- Migrate a copy of production data. Spot-check: a known admin user becomes a manager; a known cashier becomes staff; their permissions are unchanged; their reports_to_id points at the right owner.
- Log in as the owner → see full tree.
- Log in as a manager → see only their subtree.
- Create a new staff as a manager → verify the new user's `reports_to_id` is the manager's user_id.
- Delete a manager with staff → verify staff appear under `direct_reports` of the owner.

---

## 9. Open questions

None at design-time. The plan author verifies the Team page path (likely `frontend-react/src/pages/Team.tsx` but to be confirmed) and whether the Team page already has its own create-user dialog or shares the admin one.

---

## 10. Out of scope / future work

- Multi-level chains (manager → sub-manager → staff).
- Audit log entries for re-parenting.
- Bulk re-parenting ("move all of Bob's staff to Frank in one click").
- Cross-tenant super-admin tree visualization.
- Email notifications when a user is re-parented.
- "Acting manager" / temporary delegation.
- The salary perms gap (10 perms not seeded, paused on a separate todo).

---

## 11. Implementation order (recommendation for plan author)

1. **Migration v23** (data + schema in one transaction) — covered by `test_migration_023.py`. Run on a copy of prod data before merging.
2. **Model update** — add `reports_to_id` column + relationship to `User`.
3. **Route guards reclassification** — purely mechanical, one Edit per route. Tests for the new gate behavior.
4. **`POST /api/team/users` auto-assign + role validation** — TDD: tests first asserting the rules from section 5.2, then implementation.
5. **`PUT /api/team/users/<id>` re-parenting rules** — same TDD pattern.
6. **`DELETE /api/team/users/<id>` pre-delete hook** — TDD.
7. **`GET /api/team/tree` endpoint** — TDD with the response shapes from section 5.1.
8. **Quota normalization** in admin.py (`allowed_quota_roles` shrink + key handling).
9. **Frontend role dropdowns** — drop admin/cashier from CreateUser, EditUser, Team page dialog.
10. **Frontend Team Member Quotas** — drop Admin and Cashier columns on CreateClient + EditClient.
11. **Frontend tree view** — rewrite the Team page's flat list as the tree component described in section 6.4.
12. **Manual verification** — end-to-end flows in browser, including migrating a snapshot of prod data.

The plan should split into roughly 12 TDD tasks, each with a failing test → implementation → green test cycle. No commits per the user's standing constraint.
