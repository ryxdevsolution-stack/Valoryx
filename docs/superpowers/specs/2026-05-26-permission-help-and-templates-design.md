# Permission Help Tooltips & Role Templates — Design

**Date:** 2026-05-26
**Status:** Approved scope, awaiting plan
**Surfaces:** `frontend-react/src/pages/admin/EditUser.tsx`, `frontend-react/src/pages/admin/CreateUser.tsx`
**Owner area:** super-admin user management

---

## 1. Background & problem

The user-management screens (`CreateUser`, `EditUser`) expose 86 individual permissions across 10+ categories as a flat grid of checkboxes. Two distinct sources of friction have been reported by the product owner:

**Problem A — Permissions are ambiguous from their description alone.**
The current rows render only the permission's description string (e.g. *"Set custom tax/GST rates"*). Many descriptions are difficult to disambiguate without product knowledge:
- *"Set custom tax/GST rates"* vs *"Edit tax and GST settings"* — per-bill override vs company-wide config? Unclear.
- *"Edit bill prices from the audit log"* — what does this unlock? When is it used?
- *"Approve bulk stock orders"* vs *"Mark bulk orders as received"* — separate workflow steps but the relationship is invisible.

Admins assigning permissions to a new staff member cannot tell what each toggle actually does, leading to either over-granting ("tick everything to be safe", a security risk) or anxious under-granting (calls to support).

**Problem B — Role selection is decorative; there is no working template system.**
On `CreateUser` ([CreateUser.tsx:278-287](../../../frontend-react/src/pages/admin/CreateUser.tsx#L278-L287)) the Role dropdown (Staff / Cashier / Manager / Admin) is a label-only field; selecting "Cashier" grants **zero** permissions. The admin still has to hand-pick from ~68 checkboxes for every new hire. The only working pre-set today is the Billing Type button group ([CreateUser.tsx:334-352](../../../frontend-react/src/pages/admin/CreateUser.tsx#L334-L352)), which toggles `gst_billing`/`non_gst_billing` based on the chosen mode. The product owner liked this pattern and wants it extended to the full permission set, plus the ability to save custom permission combinations as reusable templates.

These two problems share the same UI surface and the same data (the permissions catalog), so they are addressed in a single spec.

---

## 2. Goals & non-goals

**Goals**
1. Admins can understand what any permission unlocks without leaving the screen.
2. Admins can configure a new user's permissions for a common role (Cashier, Manager, Admin, Accountant) in one click rather than ticking 20+ boxes.
3. Super admins can save the organization's preferred permission bundles as reusable named templates.
4. The Role dropdown actually does something — picking a role pre-fills the permission set so the field is no longer decorative.

**Non-goals**
- No per-permission visual screenshots, GIFs, or live mini-previews (decided in brainstorm: icon + one-line example is sufficient).
- No backend schema field for permission metadata (icon, example). All visual content lives in the frontend.
- No template versioning, no template change-log, no template-import-from-other-clients.
- No template-based bulk-update of existing users (i.e. applying a template to an existing user updates only their checkbox UI; there is no "apply this template to all cashiers" cross-user operation).
- No role presets at the backend level (the user's `role` column remains a label; the *defaults* applied when the role is selected come from a frontend template).

---

## 3. Feature 1 — Permission help tooltips

### 3.1 User-facing behavior

Each permission row in the `Additional Permissions` block (both `EditUser` and `CreateUser`) gains:
- A small `ⓘ` icon at the far right of the row.
- Desktop: icon fades in on row hover; hovering the icon opens the tooltip card.
- Touch devices: icon is always visible; tapping it opens the tooltip card.
- Keyboard: the icon is a focusable button; Enter/Space opens; Escape closes; clicking outside closes.

The tooltip card contains exactly three elements:
1. A themed emoji (e.g. 🏷️ for discounts, 💳 for payments) — visual anchor.
2. The permission's human-readable name as a bold header.
3. A one-line plain-English example sentence — the disambiguator (e.g. *"Cashier types 10% in the discount field at checkout — total drops by ₹50."*).

The tooltip uses `position: fixed` with viewport coordinates so it is never clipped by the parent `overflow-y-auto` scroll container (same approach as the existing pattern at [Sidebar.tsx:202-242](../../../frontend-react/src/components/Sidebar.tsx#L202-L242)).

### 3.2 Coverage

All 86 seeded permissions get a tooltip entry in v1. The lookup is sparse — permissions added by future migrations that are not yet documented simply render without the `ⓘ` icon (graceful fallback). A unit test asserts coverage so the table cannot silently fall behind.

### 3.3 Description rewrites (Track B)

Twelve permission descriptions are rewritten for clarity. The new strings are baked into both:
- The seed list in [backend/app.py](../../../backend/app.py#L90-L191) (so future fresh installs get the good copy).
- The matching list in [backend/tests/conftest.py](../../../backend/tests/conftest.py).

Because the existing seed at [app.py:192-206](../../../backend/app.py#L192-L206) is **insert-only** (`if perm_name not in existing_names`), production rows already in the `permissions` table will not pick up the new copy without explicit action. A one-time idempotent migration handles this.

| permission_name | Old description | New description |
|---|---|---|
| `set_tax_rate` | Set custom tax/GST rates | Override the tax/GST rate on individual bills at checkout |
| `edit_tax_settings` | Edit tax and GST settings | Edit company-wide default GST rates and tax configuration |
| `edit_bill_price_audit` | Edit bill prices from the audit log | Correct historical bill prices from the audit-log view (power feature) |
| `view_all_bills` | View all bills in the system | View bills created by every user |
| `view_own_bills` | View only own created bills | View only bills this user personally created |
| `manage_clients` | Manage client organizations | Manage other tenant organizations (super-admin only) |
| `approve_bulk_order` | Approve bulk stock orders | Approve a bulk-order draft so it can be sent to the supplier |
| `receive_bulk_order` | Mark bulk orders as received | Confirm physical receipt of stock and add it to inventory |
| `custom_report_filters` | Use custom filters in reports | Build saved custom date/branch/category filters in reports |
| `assign_permissions` | Assign permissions to users | Grant or revoke permissions on any user (on this screen) |
| `manage_permissions` | Manage user permissions | Legacy alias for permission management — kept for backward compatibility |
| `view_audit_logs` | View audit trail logs | View the audit-trail page showing who changed what and when |

### 3.4 Architecture

**New frontend files**
- `frontend-react/src/data/permissionMeta.ts`
  - Exports `permissionMeta: Record<string, { icon: string; example: string }>`
  - Keyed by `permission_name`; covers all 86 known permissions
  - Pure data, no React import; tree-shakable
- `frontend-react/src/components/admin/PermissionHelpTooltip.tsx`
  - Props: `{ permissionName: string }`
  - Looks up `permissionMeta[permissionName]`; returns `null` when missing
  - Manages anchor state with `useState<DOMRect | null>(null)`
  - Renders the `ⓘ` trigger inline + a portal'd tooltip card positioned at the anchor's viewport coordinates
  - Closes on Escape, outside-click, and scroll

**Edits to existing frontend files**
- `frontend-react/src/pages/admin/EditUser.tsx` — at [line ~613](../../../frontend-react/src/pages/admin/EditUser.tsx#L613) inside the `perms.map`, add `<PermissionHelpTooltip permissionName={perm.permission_name} />` as a sibling of the label.
- `frontend-react/src/pages/admin/CreateUser.tsx` — at [line ~370](../../../frontend-react/src/pages/admin/CreateUser.tsx#L370) inside the matching `perms.map`, the same insertion.

**New backend files**
- `backend/migrations/runner.py` — new inline function `_m019_clarify_permission_descriptions(db)` registered in `MIGRATIONS` tuple at the bottom of the file (project convention: migrations live as functions in `runner.py`, not as separate version files).
  - Idempotent: each `UPDATE` is guarded by `WHERE description = '<old>'`, so re-running the migration on already-updated rows is a no-op.
  - Logs the count of rows actually changed.

**Edits to existing backend files**
- `backend/app.py` — update the description strings in `default_perms` (lines 90-191) so fresh installs get the new copy directly.
- `backend/tests/conftest.py` — update the matching list at lines ~134 and ~461 so test fixtures stay aligned.
- `backend/migrations/runner.py` — bump `CURRENT_SCHEMA_VERSION` from 18 to 19 and register the new function in `MIGRATIONS`.

---

## 4. Feature 2 — Role templates (built-in + custom)

### 4.1 User-facing behavior

The `Additional Permissions` block gains a new "Apply template" toolbar at the top:

```
┌── Additional Permissions ──────────────────────────────────────────┐
│ Apply template:  [🧾 Cashier] [📋 Manager] [🛡️ Admin] [📊 Accountant] │
│                  [+ Custom Template ▾]   [💾 Save as template…]   [🧹 Clear all] │
│ ───────────────────────────────────────────────────────────────── │
│ ☑ Create Bill                                                      │
│   ☑ Create bills with GST                            ⓘ            │
│   ☑ Apply discounts to bills                         ⓘ            │
│   ...                                                              │
└────────────────────────────────────────────────────────────────────┘
```

- Clicking a built-in template (🧾/📋/🛡️/📊) **replaces** the current checkbox selection with that template's permission set. A toast confirms: *"Applied Cashier template — 12 permissions selected."*
- Clicking the `[+ Custom Template ▾]` dropdown lists the client's saved custom templates; selecting one replaces the current selection the same way.
- Clicking `[💾 Save as template…]` opens a modal: name (required, 3-40 chars), description (optional, 0-200 chars). The current checkbox selection is captured as the template's permission set.
- Clicking `[🧹 Clear all]` unchecks every permission in the Additional Permissions block and also sets Billing Type to `none` (so the two widgets stay coherent).
- Picking a value from the existing Role dropdown ([CreateUser.tsx:278-287](../../../frontend-react/src/pages/admin/CreateUser.tsx#L278-L287)) auto-applies the matching built-in template. A toast confirms: *"Pre-filled 12 permissions for Cashier."* This fixes the long-standing confusion where the Role dropdown did nothing.
- On `EditUser`, applying a template **previews** the change in the checkboxes only — the user must still click the existing **Save** button to commit. This matches the page's existing per-section save model.

### 4.2 Built-in templates (frontend data)

Four built-in templates ship in v1. Each is a curated permission set chosen to match common store-floor roles:

| Template | Icon | Approximate count | Includes (high level) |
|---|---|---|---|
| Cashier | 🧾 | ~12 perms | Create bills (GST/non-GST), apply discounts, add payment methods, select customers, add products, view stock, view customers, print/download/email bills, mark paid |
| Manager | 📋 | ~30 perms | Everything Cashier has + edit bills, manage customers, view all bills, manage payment types, view reports, view audit logs |
| Admin | 🛡️ | ~55 perms | Everything Manager has + user management, settings, bulk orders, system administration (excluding super-admin-only items like `manage_clients`) |
| Accountant | 📊 | ~15 perms | View-only: view all bills, view reports (all kinds), export reports, view audit logs, view stock, view customers |

The exact permission lists are defined in `frontend-react/src/data/permissionTemplates.ts` and reviewed during implementation. The lists must be stable across both pages (CreateUser and EditUser apply identical templates).

### 4.3 Custom templates (backend feature)

**Storage** — new SQLite table `permission_templates`:
- `template_id` TEXT PK (UUID4)
- `client_id` TEXT NOT NULL, FK → `client_entry.client_id`, indexed
- `name` TEXT NOT NULL (3-40 chars)
- `description` TEXT NULL (0-200 chars)
- `permission_names` TEXT NOT NULL (JSON-encoded array of permission_name strings)
- `created_by` TEXT NOT NULL (user_id of the super admin who created it)
- `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
- `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
- Unique index on `(client_id, name)` — no two templates in the same client can share a name.

Custom templates are **client-scoped** (shared across all super admins in the same client). They are not private per creator.

**Endpoints** — all under `/permission-templates`, all require super-admin auth:
- `GET  /permission-templates` — list all templates for the caller's client. Response: `{ success, templates: [{template_id, name, description, permission_names, created_by_email, created_at}] }`.
- `POST /permission-templates` — create. Body: `{ name, description, permission_names: [string] }`. Validates name length, uniqueness within client, that every permission_name exists in the `permissions` table.
- `PUT  /permission-templates/<template_id>` — update name, description, or permission_names. Same validations.
- `DELETE /permission-templates/<template_id>` — soft-delete (set `deleted_at`) so audit logs still reference it. Excluded from `GET` results.

**Authorization** — only users with `is_super_admin = true` may create, update, or delete templates. Any super admin in the client may apply any template (built-in or custom) from the user-management screens.

**Validation rules**
- Name: 3-40 chars, trimmed, must be unique per client (case-insensitive).
- Description: optional, max 200 chars.
- `permission_names`: must be a non-empty array; each entry must exist in the `permissions` table; duplicates within the array are silently deduplicated.

### 4.4 Architecture

**New frontend files**
- `frontend-react/src/data/permissionTemplates.ts` — exports the four built-in templates as `Record<TemplateId, { name, icon, description, permissionNames: string[] }>`.
- `frontend-react/src/components/admin/TemplateApplyBar.tsx` — renders the built-in buttons, the custom-template dropdown, the Save and Clear buttons. Props: `{ currentPermissions: string[]; onApply: (perms: string[]) => void; onClear: () => void; }`.
- `frontend-react/src/components/admin/SaveTemplateDialog.tsx` — modal with name/description form; POSTs to the API; calls `onSaved`.
- `frontend-react/src/services/permissionTemplateService.ts` — typed wrapper for the four endpoints; matches existing service-layer pattern.

**Edits to existing frontend files**
- `frontend-react/src/pages/admin/CreateUser.tsx`:
  - Mount `<TemplateApplyBar />` at the top of the Additional Permissions block.
  - Wire the existing Role dropdown's `onChange` to call `onApply(permissionTemplates[role].permissionNames)` and show a toast.
- `frontend-react/src/pages/admin/EditUser.tsx`:
  - Mount `<TemplateApplyBar />` at the top of its Additional Permissions block.
  - No Role dropdown here today; out of scope to add one.

**New backend files**
- `backend/models/permission_template_model.py` — `PermissionTemplate` SQLAlchemy model.
- `backend/routes/permission_templates.py` — blueprint with the four endpoints.
- `backend/migrations/runner.py` — new inline function `_m020_create_permission_templates(db)` registered in `MIGRATIONS` tuple. Creates the table with all columns, indexes, and soft-delete column.

**Edits to existing backend files**
- `backend/app.py` — register the new blueprint.
- `backend/migrations/runner.py` — bump `CURRENT_SCHEMA_VERSION` from 19 to 20 and register the new function in `MIGRATIONS`.

---

## 5. Cross-cutting concerns

### 5.0 Templates and the Billing Type widget

`gst_billing` and `non_gst_billing` are filtered out of the Additional Permissions list ([CreateUser.tsx:179-180](../../../frontend-react/src/pages/admin/CreateUser.tsx#L179-L180)) and managed by the four Billing Type buttons. The existing two-way sync in `handleBillingTypeChange` / `handlePermissionToggle` keeps the two in lock-step. Templates must respect this:

- A template's `permissionNames` list **does** include `gst_billing` and/or `non_gst_billing` when the role needs them (Cashier and Manager templates include both; Accountant includes neither).
- When a template is applied, the page derives `billing_type` from whether `gst_billing` and `non_gst_billing` appear in the template's list (`both` / `gst` / `non_gst` / `none`) and updates the Billing Type buttons to match.
- Applying a template thus replaces *both* the Additional Permissions checkboxes and the Billing Type selection in a single coherent operation.

The same rule applies on both `CreateUser` and `EditUser` (`EditUser` has its own Billing Type editor at [EditUser.tsx:466-524](../../../frontend-react/src/pages/admin/EditUser.tsx#L466-L524)).

### 5.1 Loading & error states

- `permissionTemplateService.listTemplates()` is called on `CreateUser` and `EditUser` mount alongside `fetchPermissions()`. A failure to load custom templates does **not** block the page — built-in templates still work; the custom-templates dropdown shows *"(failed to load — try refresh)"*.
- `Save as template…` shows a spinner on the submit button while the POST is in flight; on success, the dropdown refreshes and a toast confirms.

### 5.2 Toast / notification system

Both pages currently use ad-hoc inline `success`/`error` state ([CreateUser.tsx:212-223](../../../frontend-react/src/pages/admin/CreateUser.tsx#L212-L223), [EditUser.tsx](../../../frontend-react/src/pages/admin/EditUser.tsx)). The implementation will reuse the same inline pattern for template apply/save messages — no new toast library introduced.

### 5.3 Touch / mobile

- The `ⓘ` tooltip icon must be always-visible on touch devices (no hover state). Detection: media query `(hover: none)` or `pointer: coarse`.
- The TemplateApplyBar buttons wrap to multiple lines on narrow viewports — they are not horizontally scrolled.

### 5.4 Migration safety

- Migration 019 (description rewrites) is idempotent and read-mostly: it only updates rows whose description still matches the old string. Re-running it on production with already-new descriptions is a no-op.
- Migration 020 (new table) is `CREATE TABLE IF NOT EXISTS` — re-running on an existing install is a no-op.
- Both migrations have a documented `down` operation in case of rollback, though the runner does not currently auto-rollback.

### 5.5 Sync to Supabase

The project runs in offline mode (`DB_MODE=offline`) and uses `sync_service` to push local SQLite changes back to Supabase. The new `permission_templates` table must be added to the sync allowlist so custom templates created on one device propagate to others when sync runs. See [backend/services/sync_service.py](../../../backend/services/sync_service.py) for the allowlist.

---

## 6. Testing strategy

**Frontend unit tests** (vitest)
- `permissionMeta.test.ts` — every permission in the seed list has a matching entry in `permissionMeta`. Prevents silent drift when new permissions are added.
- `PermissionHelpTooltip.test.tsx` — opens on click and hover, closes on Escape and outside-click, returns `null` when permissionName is unknown, has correct ARIA attributes.
- `TemplateApplyBar.test.tsx` — clicking a built-in button calls `onApply` with the correct permission list; clicking a custom template calls `onApply` with that template's permissions; clicking Clear calls `onClear`.
- `SaveTemplateDialog.test.tsx` — validates name length, submits POST with correct body, displays server errors, closes on success.
- `permissionTemplates.test.ts` — every permission referenced by every built-in template exists in `permissionMeta` (which exists in the backend seed). No phantom permissions.

**Backend unit tests** (pytest)
- `test_permission_templates.py` — covers all four endpoints: super-admin-only access (403 for non-super-admins), validation rules (name length, uniqueness per client, valid permission_names), CRUD round-trip, soft-delete semantics, that templates from one client are invisible to other clients.
- `test_migration_017.py` — apply migration to a DB with the old descriptions; assert exactly the 12 rows are updated; run migration twice; assert second run updates zero rows.
- `test_migration_018.py` — apply migration to a fresh DB; assert table and indexes exist; run twice; assert no error.

**Manual verification**
- Create a fresh staff user via CreateUser; pick role "Cashier"; verify the right ~12 permissions are pre-ticked and the toast appears.
- On EditUser, click a custom template; verify checkboxes update; click Save; verify the user record is updated correctly.
- Hover/tap `ⓘ` on at least 5 permissions of each category and confirm the tooltip content is correct.
- Test on a phone-width viewport (375px) and confirm tooltip and template buttons behave.

---

## 7. Open questions

None at design-time. All scope decisions have been made in brainstorming. Implementation may surface details to be resolved — the implementation plan will track them.

---

## 8. Out of scope / future work

- **Apply template across many existing users in bulk** — useful but a distinct feature with its own UX (which users to update, what happens to their currently-extra permissions).
- **Template change-log / version history** — currently we only store the latest version of each template. No audit trail of who edited a template and what changed.
- **Importing built-in templates as custom templates so they can be edited** — for now the four built-ins are immutable code; if the user wants a tweaked Cashier template, they save a new custom one.
- **Per-permission visual screenshots, GIFs, live mini-previews** — rejected in brainstorming as too high-maintenance for too little incremental clarity over a one-line example.
- **Sharing custom templates across clients** — explicitly out: every client gets their own template list, even on multi-tenant deployments.
- **Auto-suggesting a template based on selected permissions** ("looks like a Cashier — apply that template?") — possible future enhancement once usage data exists.

---

## 9. Implementation order (recommendation for plan author)

The two features are independent and can ship in either order. A pragmatic sequencing:

1. **Phase 1 (tooltips)** — pure frontend work + idempotent migration 017. Smallest blast radius. Ships visible improvement in 1-2 days.
2. **Phase 2 (built-in templates only)** — pure frontend; adds the TemplateApplyBar with built-in templates only; wires the Role dropdown. Ships the biggest UX win for almost no backend work.
3. **Phase 3 (custom templates)** — backend table, endpoints, frontend Save dialog, dropdown population. Largest scope; backend changes require careful testing and a deploy that runs migrations.

The implementation plan should sequence these as three separate change batches with their own verification, rather than landing as one mega-PR.
