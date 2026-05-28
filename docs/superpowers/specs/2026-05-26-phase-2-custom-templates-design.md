# Phase 2 — Custom Permission Templates + CreateClient Tooltip Extension

**Date:** 2026-05-26
**Status:** Approved scope, awaiting plan
**Surface:** `frontend-react/src/pages/admin/CreateClient.tsx` (super-admin onboarding page)
**Builds on:** Phase 1 (tooltips on EditUser/CreateUser), template fix (dot-notation → snake_case), super-admin perm leak fix

---

## 1. Background & problem

Phase 1 left the user-facing admin screens (EditUser, CreateUser) understandable with per-permission tooltips. The template fix corrected the broken business-template assignments. The leak fix closed the super-admin-only perm leak. What's still missing on the **CreateClient** screen — the page super admins use to onboard a new client organization — is the ability to save the current permission selection as a **named, reusable custom template**.

Today the 12 built-in business templates ([Dress Shop / Pharmacy / Restaurant / etc.](../../../backend/routes/admin.py#L839)) are hardcoded in `get_permission_templates()`. They cover common store types, but every Valoryx super admin invariably has slight variants they re-create by hand for every new client ("Cashier-plus-cost-price", "Manager-without-delete-perms", etc.). After a few months this becomes a measurable per-client overhead and a source of inconsistency (different admins set up similar clients with subtly different permission sets).

This phase also lands a small follow-up from Phase 1: **extending the `PermissionHelpTooltip` component to CreateClient's "Advanced: Customize Individual Permissions" section** — the same flat checkbox grid that EditUser and CreateUser already have tooltips on. The wire-up is mechanical and identical to Phase 1's Tasks 6 and 7.

---

## 2. Goals & non-goals

**Goals**
1. A super admin can save the current permission selection on CreateClient as a named custom template in a single click + a small modal.
2. Custom templates are shared across all super admins (collaborative library).
3. Any super admin can edit or delete any custom template inline from CreateClient (no separate management page).
4. Custom templates appear in the same grid as built-in templates, visually distinguished, with edit/delete affordances on hover.
5. CreateClient's "Advanced" section gets per-permission tooltips, matching the EditUser/CreateUser experience.

**Non-goals**
- No templating of `role_quotas`, `billing_type`, `branch_id`, or any other CreateClient field — only `permissions[]` is templated.
- No version history, change-log, or undo for template edits.
- No "import built-in as custom to modify" — built-ins remain immutable code.
- No cross-instance template export / import.
- No quotas or limits on the number of custom templates (small expected volume — single-digit per super admin).
- No role-based access within the super-admin tier — all super admins have equal CRUD rights on templates.
- No new management page or sidebar entry — everything lives on CreateClient.

---

## 3. Feature 1 — Custom permission templates

### 3.1 User-facing behavior

The CreateClient "Access Control" section gains four new UI elements:

1. **"💾 Save as template…" button** appears below the template grid, disabled until at least one permission is selected. Click opens the SaveTemplateDialog modal.
2. **Custom template cards** appear in the same `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` grid as built-ins. Built-ins render first in their existing order; custom templates render after, sorted by `created_at DESC` (newest custom template first — most likely to be the one the admin just made and wants to grab). Each custom card carries a small "Custom" tag and a "Created by: alice@valoryx.com" caption.
3. **Hover affordances on custom cards** (not on built-in cards): edit (✏️) and delete (🗑️) icons fade in at the top-right of the card. Same `group-hover:` pattern Phase 1 uses for `<PermissionHelpTooltip>`.
4. **Confirm-delete popover** appears inline next to the delete icon on click; not a separate modal. Avoids disrupting the larger client-creation flow.

**Save flow:**
- Click "Save as template…" → modal opens with two fields: **Name** (required, 3-40 chars), **Description** (optional, 0-200 chars), and a readonly "This template will save N permissions" caption based on the current `selectedPermissions` state.
- Submit → POSTs to `/admin/permission-templates/custom`. Server validates name length, uniqueness (case-insensitive across active templates), and that every permission exists in the seeded `permissions` table.
- On success: modal closes, template list re-fetches, the new template is auto-selected (`handleTemplateChange(template_id)`).
- On 400 validation error: error message shown inline next to the offending field.
- On 5xx: generic error banner inside the modal with a retry button.

**Edit flow:**
- Click ✏️ on a custom card → same SaveTemplateDialog opens in edit mode, pre-filled with current name/description and the template's permission count. Editing the permission set itself is done by first applying the template (clicking the card), modifying the perm checkboxes, then clicking save-as-template-edit again.
- Submit → PUTs to `/admin/permission-templates/custom/<id>`. Same validation as create; uniqueness check excludes the row being edited.
- On success: modal closes, list re-fetches, the edited template stays selected if it was.

**Delete flow:**
- Click 🗑️ on a custom card → small inline confirm popover (not a modal): "Delete this template?" with Cancel / Delete buttons.
- Confirm → DELETE to `/admin/permission-templates/custom/<id>` → soft delete (sets `deleted_at`).
- On success: card disappears with a short fade. If the deleted template was selected, `selectedPermissions` is cleared.

### 3.2 Data model

**New table** `permission_templates` (Migration v22):

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `template_id` | TEXT (SQLite) / UUID (Postgres) | PRIMARY KEY | UUID4 generated at insert |
| `name` | VARCHAR(40) | NOT NULL | 3-40 chars after trim |
| `description` | VARCHAR(200) | NULL | Optional, max 200 chars |
| `permissions` | TEXT | NOT NULL | JSON-encoded array of permission_name strings |
| `created_by` | TEXT/UUID | NOT NULL, FK → users.user_id | Super admin who created it |
| `created_at` | TIMESTAMP | NOT NULL DEFAULT CURRENT_TIMESTAMP | |
| `updated_at` | TIMESTAMP | NOT NULL DEFAULT CURRENT_TIMESTAMP | Refreshed on edit |
| `deleted_at` | TIMESTAMP | NULL | Soft-delete flag; non-null = excluded from API |

**Indexes:**
- `UNIQUE(LOWER(name)) WHERE deleted_at IS NULL` — case-insensitive uniqueness across active templates. SQLite supports this via partial-index syntax; PostgreSQL via the same. Migration emits the dialect-appropriate form via the existing `_normalize_col_def` helper or an explicit dialect branch.
- `INDEX(deleted_at)` — supports the soft-delete filter in `GET`.

**Why JSON-encoded `permissions` and not a junction table:**
- The grant always happens at user-create time, where each permission gets its own `UserPermission` row anyway. Templates are just a *recipe* — never directly queried by permission.
- Avoids an extra table + join on every GET.
- Editing a template is a single row UPDATE rather than DELETE-then-INSERT-many. Atomicity for free.

**Soft delete (not hard) because:**
- Audit logs may reference `template_id`; preserving the row keeps those references valid.
- Recoverable mistakes — "I just deleted the Cashier-plus template" is fixable by clearing `deleted_at` directly in SQL.
- Cheap — the table is tiny (single-digit rows expected).

### 3.3 Backend endpoints

All under `admin_bp` at [backend/routes/admin.py](../../../backend/routes/admin.py); all gated by `@authenticate + @require_super_admin`.

| Method | URL | Body | Response |
|---|---|---|---|
| `GET` | `/api/admin/permission-templates` | — | **Modified.** Returns `{templates: {<key>: {name, description, business_type, permissions, is_custom, ...}}}` merging built-ins and active custom templates. Built-ins keyed by their existing string key (`"dress_shop"`); custom keyed by `template_id` (UUID). Each entry has `is_custom: bool`; custom entries additionally have `created_by_email` and `created_at` |
| `POST` | `/api/admin/permission-templates/custom` | `{name, description?, permissions: string[]}` | `201 {template: {...}}` on success; `400 {error, field, message}` on validation failure |
| `PUT` | `/api/admin/permission-templates/custom/<template_id>` | Same as POST | `200 {template: {...}}` |
| `DELETE` | `/api/admin/permission-templates/custom/<template_id>` | — | `204` on success; `404` if not found |

**Validation rules (shared helper):**
- `name`: trimmed; length 3-40 chars; must be unique among active templates (LOWER comparison). On PUT, exclude the target row from the uniqueness check.
- `description`: trimmed; length 0-200 chars; may be empty/null.
- `permissions`: non-empty array; every entry must exist in the `permissions` table (single IN query); any entry that is in `SUPER_ADMIN_ONLY_PERMISSIONS` is silently stripped (matches the Phase 1.5 leak fix's defense-in-depth model).
- After stripping super-admin perms, if the list is empty, return `400 {field: 'permissions', message: 'Template must contain at least one assignable permission'}`.

**Authorization:** all four endpoints require `is_super_admin = true`. Any super admin can edit or delete any custom template (no "creator only" restriction — matches the "shared library" decision). This is intentional; small teams need collaborative cleanup. If we ever need to restrict to creator, we already have `created_by` on the row.

### 3.4 Architecture — files to create / modify

**New backend files**
- [backend/models/permission_template_model.py](../../../backend/models/permission_template_model.py) — `PermissionTemplate` SQLAlchemy model with `to_dict()` that includes `created_by_email` (joined from User) and `is_custom: True`.
- Migration `_m022_create_permission_templates(db)` in [backend/migrations/runner.py](../../../backend/migrations/runner.py) — creates the table with all columns + the partial unique index; bumps `CURRENT_SCHEMA_VERSION` 21 → 22.
- [backend/tests/test_permission_templates.py](../../../backend/tests/test_permission_templates.py) — coverage for all 4 endpoints + the validation rules.
- [backend/tests/test_migration_022.py](../../../backend/tests/test_migration_022.py) — verifies table exists, indexes work, idempotent re-run.

**Modified backend files**
- [backend/routes/admin.py](../../../backend/routes/admin.py) — extend `get_permission_templates` to merge custom templates; add three new endpoints (POST/PUT/DELETE) with shared validation helper.

**New frontend files**
- [frontend-react/src/services/permissionTemplateService.ts](../../../frontend-react/src/services/permissionTemplateService.ts) — typed wrapper for the 4 endpoints. Functions: `listTemplates()`, `createCustomTemplate(input)`, `updateCustomTemplate(id, input)`, `deleteCustomTemplate(id)`. Throws on non-2xx.
- [frontend-react/src/components/admin/SaveTemplateDialog.tsx](../../../frontend-react/src/components/admin/SaveTemplateDialog.tsx) — modal with name/description form. Props: `{open, mode: 'create' | 'edit', initialValues?, currentPermissions, onSaved, onClose}`. Handles validation errors inline.
- [frontend-react/src/components/admin/CustomTemplateActions.tsx](../../../frontend-react/src/components/admin/CustomTemplateActions.tsx) — small overlay rendered absolutely in the top-right of a custom-template card. Edit + delete buttons; inline confirm-delete popover. Visible only on parent hover (Tailwind `group/group-hover` pattern).
- [frontend-react/src/test/SaveTemplateDialog.test.tsx](../../../frontend-react/src/test/SaveTemplateDialog.test.tsx) — coverage.
- [frontend-react/src/test/permissionTemplateService.test.ts](../../../frontend-react/src/test/permissionTemplateService.test.ts) — MSW-based tests.

**Modified frontend files**
- [frontend-react/src/pages/admin/CreateClient.tsx](../../../frontend-react/src/pages/admin/CreateClient.tsx) — five integration points:
  1. State: `[showSaveDialog, setShowSaveDialog] = useState<'create' | { mode: 'edit', template: PermissionTemplate } | null>(null)`.
  2. Render "💾 Save as template…" button below the template grid; disabled when `selectedPermissions.length === 0`.
  3. Inside the existing `Object.entries(permissionTemplates).map(...)` loop: when `template.is_custom`, render `<CustomTemplateActions>` overlay + the "Created by" caption.
  4. Mount `<SaveTemplateDialog>` when `showSaveDialog` is non-null. On success: re-fetch templates, auto-select the new one, close dialog.
  5. **Tooltip extension** (separate, mechanical): in the `groupedPermissions.map(...)` block at line ~813, apply Phase 1's wire-up — add `group` class to label, `flex-1` to span, render `<PermissionHelpTooltip permissionName={perm.permission_name} />`.

**Type changes**
- Extend the existing `PermissionTemplate` type in CreateClient.tsx to include optional `template_id`, `is_custom`, `created_by_email`, `created_at` fields. Built-in templates omit these; custom templates include them.

---

## 4. Feature 2 — Tooltip extension to CreateClient

Mechanical extension of Phase 1. No design questions; mirrors [EditUser.tsx](../../../frontend-react/src/pages/admin/EditUser.tsx#L612-L627) Task 6 and [CreateUser.tsx](../../../frontend-react/src/pages/admin/CreateUser.tsx#L369-L378) Task 7.

**File modified:** `frontend-react/src/pages/admin/CreateClient.tsx`, the existing `groupedPermissions.map(...)` block around line 813.

**Changes:**
1. Add `import { PermissionHelpTooltip } from '@/components/admin/PermissionHelpTooltip'` at the top.
2. In the row label className, add `group ` prefix.
3. In the perm description span className, add ` flex-1`.
4. Render `<PermissionHelpTooltip permissionName={perm.permission_name} />` as the last child of the label.

That's the entirety of Feature 2. Falls within the same plan as Feature 1.

---

## 5. Cross-cutting concerns

### 5.1 Loading & error states

- **Initial template fetch** on CreateClient mount: built-ins are inline in the response (small, fast). Custom templates come from the new table. If the DB query fails, the response includes built-ins only with a `custom_templates_error: true` flag. Frontend shows a small inline warning above the grid with a Retry button.
- **SaveTemplateDialog**: submit button shows spinner while POST/PUT is in flight; disabled until both name and at least one selected permission are valid; server errors map to inline field errors (`{error, field, message}` shape).
- **Delete**: confirm popover blocks until DELETE completes; on failure shows error inline in the popover.

### 5.2 Defense in depth (super-admin-only perms)

The Phase 1.5 leak fix established that `SUPER_ADMIN_ONLY_PERMISSIONS` should never be granted to non-super-admin users. The same principle applies to templates:

- At **template save** time (POST/PUT): super-admin perms in the `permissions[]` are silently stripped before insert.
- At **client-creation apply** time: the existing `POST /admin/users` strip logic already removes them from the user's perm grant.

Result: a custom template can never accumulate super-admin perms even if a bug or future code path tries to add them.

### 5.3 Concurrency

Two super admins could try to save a custom template with the same name simultaneously. The `UNIQUE(LOWER(name))` index makes this an atomic DB-level constraint — whoever commits second gets a 400 from the conflict; the frontend shows the inline name-already-exists error.

### 5.4 Sync to Supabase — DEFERRED to follow-up

The project runs in offline mode and uses `sync_service` to push local SQLite changes back to Supabase. The new `permission_templates` table is **NOT** wired into the sync service in this phase because `sync_service` uses hand-coded per-table upload/download functions (not a simple allowlist), and writing those for templates is a substantial side-task that doesn't block the feature.

**Implication for v1:** custom templates created on one super admin's device do NOT automatically appear on another super admin's device. Workaround: re-create the template on the second device (single-digit row count makes this trivial). If multi-device template sharing becomes a real pain point, add a follow-up spec to write `_sync_permission_templates_up()` / `_sync_permission_templates_down()` functions in `sync_service.py` and register them in the upload/download table lists.

### 5.5 No frontend breaking change

The existing `permissionTemplates` shape (`Record<string, PermissionTemplate>`) is preserved — custom templates simply add new keys (their UUIDs). The existing `Object.entries(permissionTemplates).map(...)` loop in CreateClient continues to work. The only conditional logic added is `{template.is_custom && <CustomTemplateActions />}` per card.

---

## 6. Testing strategy

**Backend unit tests** (pytest, offline SQLite `:memory:`)
- `test_permission_templates.py`:
  - GET returns built-ins + active custom templates merged.
  - POST creates a row; rejects names shorter than 3 / longer than 40; rejects duplicate names (case-insensitive); rejects empty permissions list; silently strips super-admin perms.
  - PUT updates name/description/permissions; uniqueness check excludes the target row.
  - DELETE soft-deletes (row stays, `deleted_at` set); subsequent GET excludes it.
  - All four endpoints return 403 for non-super-admin callers.
  - Custom template referenced by user creation still applies its (non-super-admin) perms correctly.
- `test_migration_022.py`: applies migration to fresh DB, asserts table + indexes exist; re-run is a no-op.

**Frontend tests** (vitest + @testing-library/react)
- `SaveTemplateDialog.test.tsx`: validates name length client-side, submits expected payload, displays server errors, closes on success, pre-fills correctly in edit mode.
- `permissionTemplateService.test.ts`: each function hits the right URL with the right body (MSW handlers); throws on non-2xx.

**Manual verification (covered in plan's last task)**
- Save a custom template; verify it appears in the grid with a "Custom" tag and "Created by" caption.
- Edit it; verify the dialog pre-fills.
- Delete it; verify the inline confirm and the card disappears.
- Pick the new custom template, create a real client, log in as the new owner, confirm the perms work end-to-end.
- Hover/tap `ⓘ` on permissions in CreateClient's Advanced section — same behavior as EditUser/CreateUser.

---

## 7. Open questions

None at design-time. The plan author will resolve small implementation details (e.g., grid ordering for custom templates) inline.

---

## 8. Out of scope / future work

- **Per-permission "what this unlocks" breakdown inside the SaveTemplateDialog** — would let the admin sanity-check what they're saving. Useful but adds a sub-component; deferred.
- **Template apply on EditUser/CreateUser** — the original spec contemplated this but it's a separate UX surface; not bundled here.
- **Role presets ("Apply Cashier defaults" buttons on EditUser)** — separately scoped; not bundled here.
- **Templating role_quotas / billing_type / branch_id** — possibly useful, deferred until requested.
- **Cross-instance import/export of custom templates** — useful for franchise deployments; not requested.
- **Quotas/limits on number of templates** — not needed at expected volume.
- **Audit-log entries for template create/edit/delete** — would be sensible (these are administrative actions) but adds scope. Deferred to a small follow-up if needed.

---

## 9. Implementation order (recommendation for plan author)

Suggested sequencing keeps each commit independently testable:

1. **Migration v22** — create the table. Migration test verifies it.
2. **Model + service helper** — `PermissionTemplate` model with `to_dict()`.
3. **Backend endpoints** — TDD: write the four endpoint tests first, then implement.
4. **Modify `GET /admin/permission-templates`** — merge custom templates into the response. Test asserts merged shape.
5. **Frontend service** — typed wrapper + MSW tests.
6. **SaveTemplateDialog component** — TDD component tests + implementation.
7. **CustomTemplateActions component** — simple overlay, no separate tests needed (covered by integration in CreateClient).
8. **Wire into CreateClient** — Save button, modal mounting, hover overlays on custom cards, "Created by" captions.
9. **Tooltip extension** — single Edit on the existing groupedPermissions loop. Quick win.
10. ~~Sync allowlist~~ — deferred to a follow-up spec (see Section 5.4).
11. **Manual verification** — end-to-end flow in browser.

The plan should split steps 1-4 (backend) and steps 5-10 (frontend) so the plan executor can land one PR per side if desired.
