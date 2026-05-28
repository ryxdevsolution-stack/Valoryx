# Phase 1 — Permission Help Tooltips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `ⓘ` hover/tap tooltip to every permission row on `EditUser` and `CreateUser` admin pages, exposing a themed icon + plain-English example for each of the 86 permissions, and rewrite 12 ambiguous permission descriptions in both the seed and production DB.

**Architecture:** Frontend-side sparse `permissionMeta` lookup table feeds a reusable `PermissionHelpTooltip` component. Production description updates land via an idempotent inline migration `_m019_clarify_permission_descriptions` registered in [backend/migrations/runner.py](../../../backend/migrations/runner.py). The existing `position: fixed` tooltip pattern from [Sidebar.tsx:202-242](../../../frontend-react/src/components/Sidebar.tsx#L202-L242) is reused to avoid being clipped by the parent `overflow-y-auto` container.

**Tech Stack:** React 18 + TypeScript + Vite + Tailwind on the frontend; Flask + SQLAlchemy + SQLite (offline) / PostgreSQL (Supabase) on the backend. Tests: vitest + @testing-library/react on the frontend; pytest with SQLite `:memory:` on the backend.

**Reference spec:** [docs/superpowers/specs/2026-05-26-permission-help-and-templates-design.md](../specs/2026-05-26-permission-help-and-templates-design.md) — Feature 1 (sections 3.x) and parts of section 5 (touch behavior, migration safety).

**Files in this plan:**
- Modify: [backend/app.py:90-191](../../../backend/app.py#L90-L191) — update 12 description strings in `default_perms`
- Modify: [backend/tests/conftest.py](../../../backend/tests/conftest.py) (lines ~128-191 and ~458-521) — update the same 12 strings in both seed copies
- Modify: [backend/migrations/runner.py](../../../backend/migrations/runner.py) — add `_m019_clarify_permission_descriptions(db)`, register it, bump `CURRENT_SCHEMA_VERSION` 18 → 19
- Create: `backend/tests/test_migration_019.py` — migration unit tests (apply, idempotency)
- Create: `frontend-react/src/data/permissionMeta.ts` — sparse `Record<string, { icon, example }>` with 86 entries
- Create: `frontend-react/src/test/permissionMeta.test.ts` — asserts every backend-seeded `permission_name` has a `permissionMeta` entry
- Create: `frontend-react/src/components/admin/PermissionHelpTooltip.tsx` — reusable trigger + portal'd tooltip
- Create: `frontend-react/src/test/PermissionHelpTooltip.test.tsx` — component unit tests
- Modify: [frontend-react/src/pages/admin/EditUser.tsx:612-627](../../../frontend-react/src/pages/admin/EditUser.tsx#L612-L627) — render `<PermissionHelpTooltip>` next to each label
- Modify: [frontend-react/src/pages/admin/CreateUser.tsx:369-377](../../../frontend-react/src/pages/admin/CreateUser.tsx#L369-L377) — render `<PermissionHelpTooltip>` next to each label

---

## Task 1: Rewrite 12 description strings in the seed (no DB migration yet)

Update the description strings that ship with new installs. Production rows are untouched until Task 2's migration runs — that's intentional and safe.

**Files:**
- Modify: `backend/app.py` — 12 tuples in `default_perms` (approx lines 100, 102, 103, 105, 142, 155, 160, 164, 168, 177, 178, 190 — exact locations found via grep in Step 1)
- Modify: `backend/tests/conftest.py` — same 12 tuples appear twice (offline app seed around lines 128-235, online app seed around lines 458-547)

- [ ] **Step 1: Inspect conftest seed to confirm which of the 12 rewritten permissions are present**

Run: `grep -n "apply_discount\|set_tax_rate\|view_all_bills\|view_own_bills\|edit_bill_details\|edit_bill_price_audit\|manage_clients\|approve_bulk_order\|receive_bulk_order\|custom_report_filters\|assign_permissions\|manage_permissions\|view_audit_logs\|edit_tax_settings" backend/tests/conftest.py`

Expected: matches for most names appearing in two copies (around lines 134-191 and 458-521). Note any name that does NOT appear — the conftest list may be slightly shorter than `app.py`.

- [ ] **Step 2: Apply the 12 rewrites to `backend/app.py`**

In `default_perms` (currently at lines 90-191), replace the existing tuples for the 12 names below. Keep the order of the list intact — only swap the description string. The exact 12 changes:

```python
# Line 100 — was: ('set_tax_rate', 'Set custom tax/GST rates'),
('set_tax_rate', 'Override the tax/GST rate on individual bills at checkout'),

# Line 102 — was: ('view_all_bills', 'View all bills in the system'),
('view_all_bills', 'View bills created by every user'),

# Line 103 — was: ('view_own_bills', 'View only own created bills'),
('view_own_bills', 'View only bills this user personally created'),

# Line 105 — was: ('edit_bill_price_audit', 'Edit bill prices from the audit log'),
('edit_bill_price_audit', 'Correct historical bill prices from the audit-log view (power feature)'),

# Line 142 — was: ('custom_report_filters', 'Use custom filters in reports'),
('custom_report_filters', 'Build saved custom date/branch/category filters in reports'),

# Line 155 — was: ('assign_permissions', 'Assign permissions to users'),
('assign_permissions', 'Grant or revoke permissions on any user (on this screen)'),

# Line 160 — was: ('edit_tax_settings', 'Edit tax and GST settings'),
('edit_tax_settings', 'Edit company-wide default GST rates and tax configuration'),

# Line 164 — was: ('view_audit_logs', 'View audit trail logs'),
('view_audit_logs', 'View the audit-trail page showing who changed what and when'),

# Line 168 — was: ('manage_clients', 'Manage client organizations'),
('manage_clients', 'Manage other tenant organizations (super-admin only)'),

# Line 177 — was: ('approve_bulk_order', 'Approve bulk stock orders'),
('approve_bulk_order', 'Approve a bulk-order draft so it can be sent to the supplier'),

# Line 178 — was: ('receive_bulk_order', 'Mark bulk orders as received'),
('receive_bulk_order', 'Confirm physical receipt of stock and add it to inventory'),

# Line 190 — was: ('manage_permissions', 'Manage user permissions'),
('manage_permissions', 'Legacy alias for permission management — kept for backward compatibility'),
```

> **Heads-up:** line numbers above are at time of writing. If `app.py` has shifted since, use the `grep` from Step 1 to locate each tuple and edit by content.

- [ ] **Step 3: Apply the same rewrites to `backend/tests/conftest.py`**

The conftest has TWO copies of the seed list — one around lines 128-235 (offline app) and one around lines 458-547 (online app). All 12 rewritten permissions appear in BOTH copies. Edit BOTH copies — for each permission name, replace the description string with the new one from Step 2.

Quick way to confirm you've edited all 24 lines (12 perms × 2 copies):

```
grep -c "Set custom tax/GST rates\|View all bills in the system\|View only own created bills\|Edit bill prices from the audit log\|Use custom filters in reports\|Assign permissions to users\|Edit tax and GST settings\|View audit trail logs\|Manage client organizations\|Approve bulk stock orders\|Mark bulk orders as received\|Manage user permissions" backend/tests/conftest.py
```

Expected after editing: `0` (no old strings remain).

- [ ] **Step 4: Run the full backend test suite to confirm no test asserts on the old descriptions**

Run: `cd backend && pytest -x --tb=short 2>&1 | tail -40`
Expected: all tests pass. If any test fails with an assertion against an old description string, update that assertion to the new string.

- [ ] **Step 5: Commit**

```bash
git add backend/app.py backend/tests/conftest.py
git commit -m "feat(perms): rewrite 12 ambiguous permission descriptions in seed

Existing seed is INSERT-only, so this only affects fresh installs.
Migration v19 (next commit) updates production rows."
```

---

## Task 2: Add Migration v19 (idempotent description rewrites for production)

Write the failing test first. The migration must (a) update rows where description equals the old string, (b) be a no-op when run on already-updated rows, (c) leave rows with unrecognized descriptions alone.

**Files:**
- Create: `backend/tests/test_migration_019.py`
- Modify: `backend/migrations/runner.py` — add new function `_m019_clarify_permission_descriptions(db)` at end of file (after `_m018_stock_entry_created_by`), register in `MIGRATIONS`, bump `CURRENT_SCHEMA_VERSION` to 19

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_migration_019.py`:

```python
"""Test for Migration v19 — clarify permission descriptions."""
import uuid
import pytest
from sqlalchemy import text

# The 12 (old, new) pairs the migration rewrites.
REWRITES = [
    ('set_tax_rate',           'Set custom tax/GST rates',
                               'Override the tax/GST rate on individual bills at checkout'),
    ('view_all_bills',         'View all bills in the system',
                               'View bills created by every user'),
    ('view_own_bills',         'View only own created bills',
                               'View only bills this user personally created'),
    ('edit_bill_price_audit',  'Edit bill prices from the audit log',
                               'Correct historical bill prices from the audit-log view (power feature)'),
    ('custom_report_filters',  'Use custom filters in reports',
                               'Build saved custom date/branch/category filters in reports'),
    ('assign_permissions',     'Assign permissions to users',
                               'Grant or revoke permissions on any user (on this screen)'),
    ('edit_tax_settings',      'Edit tax and GST settings',
                               'Edit company-wide default GST rates and tax configuration'),
    ('view_audit_logs',        'View audit trail logs',
                               'View the audit-trail page showing who changed what and when'),
    ('manage_clients',         'Manage client organizations',
                               'Manage other tenant organizations (super-admin only)'),
    ('approve_bulk_order',     'Approve bulk stock orders',
                               'Approve a bulk-order draft so it can be sent to the supplier'),
    ('receive_bulk_order',     'Mark bulk orders as received',
                               'Confirm physical receipt of stock and add it to inventory'),
    ('manage_permissions',     'Manage user permissions',
                               'Legacy alias for permission management — kept for backward compatibility'),
]


@pytest.fixture
def db_with_old_descriptions(app):
    """Reset the 12 target rows to their OLD descriptions before the test runs."""
    from app import db
    with app.app_context():
        for perm_name, old_desc, _ in REWRITES:
            db.session.execute(
                text("UPDATE permissions SET description = :d WHERE permission_name = :n"),
                {'d': old_desc, 'n': perm_name}
            )
        # Insert missing rows so all 12 are present even if conftest doesn't seed them.
        for perm_name, old_desc, _ in REWRITES:
            existing = db.session.execute(
                text("SELECT 1 FROM permissions WHERE permission_name = :n"),
                {'n': perm_name}
            ).fetchone()
            if not existing:
                db.session.execute(
                    text("INSERT INTO permissions (permission_id, permission_name, description) "
                         "VALUES (:id, :n, :d)"),
                    {'id': str(uuid.uuid4()), 'n': perm_name, 'd': old_desc}
                )
        db.session.commit()
    return db


def test_m019_updates_all_old_descriptions(db_with_old_descriptions):
    from migrations.runner import _m019_clarify_permission_descriptions
    db = db_with_old_descriptions

    _m019_clarify_permission_descriptions(db)

    for perm_name, _, new_desc in REWRITES:
        row = db.session.execute(
            text("SELECT description FROM permissions WHERE permission_name = :n"),
            {'n': perm_name}
        ).fetchone()
        assert row is not None, f"{perm_name} missing after migration"
        assert row[0] == new_desc, f"{perm_name} description not updated"


def test_m019_is_idempotent(db_with_old_descriptions):
    """Running twice changes nothing on the second pass."""
    from migrations.runner import _m019_clarify_permission_descriptions
    db = db_with_old_descriptions

    _m019_clarify_permission_descriptions(db)
    # Snapshot after first run
    after_first = {
        r[0]: r[1] for r in db.session.execute(
            text("SELECT permission_name, description FROM permissions "
                 "WHERE permission_name IN :names"),
            {'names': tuple(n for n, _, _ in REWRITES)}
        )
    }
    _m019_clarify_permission_descriptions(db)
    after_second = {
        r[0]: r[1] for r in db.session.execute(
            text("SELECT permission_name, description FROM permissions "
                 "WHERE permission_name IN :names"),
            {'names': tuple(n for n, _, _ in REWRITES)}
        )
    }
    assert after_first == after_second


def test_m019_does_not_touch_unrelated_rows(db_with_old_descriptions):
    """A row with an unrecognized description string is left alone."""
    from migrations.runner import _m019_clarify_permission_descriptions
    db = db_with_old_descriptions

    custom_desc = 'CUSTOM EDITED DESCRIPTION — should not be touched'
    db.session.execute(
        text("UPDATE permissions SET description = :d WHERE permission_name = 'set_tax_rate'"),
        {'d': custom_desc}
    )
    db.session.commit()

    _m019_clarify_permission_descriptions(db)

    row = db.session.execute(
        text("SELECT description FROM permissions WHERE permission_name = 'set_tax_rate'")
    ).fetchone()
    assert row[0] == custom_desc, "Custom description was overwritten — migration is not safe"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && pytest tests/test_migration_019.py -v 2>&1 | tail -30`
Expected: 3 failures, all complaining `ImportError: cannot import name '_m019_clarify_permission_descriptions' from 'migrations.runner'`.

- [ ] **Step 3: Implement the migration in `backend/migrations/runner.py`**

At the end of the file (after `_m018_stock_entry_created_by` definition), add:

```python
def _m019_clarify_permission_descriptions(db):
    """v19: Rewrite 12 ambiguous permission descriptions.

    Idempotent: each UPDATE is guarded by WHERE description = '<old>',
    so re-running on already-updated rows is a no-op and admin-edited
    rows are not overwritten.
    """
    rewrites = [
        ('set_tax_rate',           'Set custom tax/GST rates',
                                   'Override the tax/GST rate on individual bills at checkout'),
        ('view_all_bills',         'View all bills in the system',
                                   'View bills created by every user'),
        ('view_own_bills',         'View only own created bills',
                                   'View only bills this user personally created'),
        ('edit_bill_price_audit',  'Edit bill prices from the audit log',
                                   'Correct historical bill prices from the audit-log view (power feature)'),
        ('custom_report_filters',  'Use custom filters in reports',
                                   'Build saved custom date/branch/category filters in reports'),
        ('assign_permissions',     'Assign permissions to users',
                                   'Grant or revoke permissions on any user (on this screen)'),
        ('edit_tax_settings',      'Edit tax and GST settings',
                                   'Edit company-wide default GST rates and tax configuration'),
        ('view_audit_logs',        'View audit trail logs',
                                   'View the audit-trail page showing who changed what and when'),
        ('manage_clients',         'Manage client organizations',
                                   'Manage other tenant organizations (super-admin only)'),
        ('approve_bulk_order',     'Approve bulk stock orders',
                                   'Approve a bulk-order draft so it can be sent to the supplier'),
        ('receive_bulk_order',     'Mark bulk orders as received',
                                   'Confirm physical receipt of stock and add it to inventory'),
        ('manage_permissions',     'Manage user permissions',
                                   'Legacy alias for permission management — kept for backward compatibility'),
    ]
    total_updated = 0
    for perm_name, old_desc, new_desc in rewrites:
        result = db.session.execute(
            text("UPDATE permissions SET description = :new "
                 "WHERE permission_name = :name AND description = :old"),
            {'new': new_desc, 'name': perm_name, 'old': old_desc}
        )
        total_updated += result.rowcount
    db.session.commit()
    logging.info(f"[Migration] v19: {total_updated} permission description(s) clarified")
```

In the same file, find `MIGRATIONS = [` (around line 1064) and append:

```python
    (19, _m019_clarify_permission_descriptions),
```

And at the top of the file (line 13), change:

```python
CURRENT_SCHEMA_VERSION = 18
```

to:

```python
CURRENT_SCHEMA_VERSION = 19
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && pytest tests/test_migration_019.py -v 2>&1 | tail -15`
Expected: 3 passed.

- [ ] **Step 5: Run the broader test suite to make sure nothing else broke**

Run: `cd backend && pytest -x --tb=short 2>&1 | tail -10`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/migrations/runner.py backend/tests/test_migration_019.py
git commit -m "feat(perms): migration v19 rewrites 12 ambiguous descriptions

Idempotent — guards each UPDATE by old-description match, so re-running
is a no-op and admin-edited rows are preserved. Bumps schema version
18 → 19."
```

---

## Task 3: Build the `permissionMeta.ts` lookup table

Add the frontend data file that pairs every backend permission with a themed icon and a one-line example sentence. Pure data, no React.

**Files:**
- Create: `frontend-react/src/data/permissionMeta.ts`

- [ ] **Step 1: Create the file with the full 70-permission table**

Create `frontend-react/src/data/permissionMeta.ts`:

```ts
/**
 * Per-permission visual help: a themed emoji + a one-line plain-English example.
 * Surfaced as a tooltip on the admin user-management screens.
 *
 * - Sparse on purpose: a permission missing from this map renders no (i) icon.
 * - Keys match `permission_name` exactly as seeded in backend/app.py.
 * - When the backend adds a new permission, add it here. The unit test in
 *   src/test/permissionMeta.test.ts will fail until you do.
 */
export type PermissionMeta = { icon: string; example: string }

export const permissionMeta: Record<string, PermissionMeta> = {
  // Dashboard
  view_dashboard:           { icon: '📊', example: 'See the main dashboard with sales, stock alerts, and quick stats.' },

  // Create Bill
  gst_billing:              { icon: '🧾', example: 'Issue a tax invoice with GSTIN to a registered buyer.' },
  non_gst_billing:          { icon: '🧾', example: 'Issue a plain (non-tax) bill — e.g. to a walk-in retail customer.' },
  apply_discount:           { icon: '🏷️', example: 'Cashier reduces the bill total by 10% at checkout.' },
  add_payment:              { icon: '💳', example: 'Split a bill into Cash + UPI on the payment screen.' },
  select_customer:          { icon: '🙋', example: 'Search a saved customer and attach them to the bill.' },
  add_products:             { icon: '📦', example: 'Scan or pick products from the catalog into the cart.' },
  set_tax_rate:             { icon: '⚙️', example: 'Override the GST % on a single bill (e.g. 5% for one line item).' },

  // Manage Bills
  view_all_bills:           { icon: '🗂️', example: 'See bills created by every user, not just this user.' },
  view_own_bills:           { icon: '👤', example: 'See only bills this user created — used to restrict cashiers.' },
  edit_bill_details:        { icon: '✏️', example: 'Fix the customer name or notes on an already-saved bill.' },
  edit_bill_price_audit:    { icon: '🔧', example: 'Power feature: correct the price on a historical bill from the audit log.' },
  delete_bills:             { icon: '🗑️', example: 'Permanently remove a bill from the system (logged in audit).' },
  print_bills:              { icon: '🖨️', example: 'Print a paper receipt to the configured printer.' },
  download_pdf:             { icon: '📄', example: 'Download a bill as a PDF for emailing or filing.' },
  send_email:               { icon: '📧', example: 'Email a copy of the bill to the customer.' },
  mark_paid:                { icon: '✅', example: 'Mark an unpaid/credit bill as paid once payment arrives.' },
  mark_cancelled:           { icon: '🚫', example: 'Cancel a bill — stays in records but no longer counted.' },
  duplicate_bill:           { icon: '📑', example: 'Create a new bill pre-filled from an existing one.' },
  search_bills:             { icon: '🔍', example: 'Search bills by number, customer, date or amount.' },
  show_no_exchange:         { icon: '🚷', example: 'Print "No Exchange Available" on the bill (final-sale items).' },

  // Customer Management
  view_customers:           { icon: '👥', example: 'Browse the customer list and individual customer pages.' },
  add_customer:             { icon: '➕', example: 'Save a new walk-in customer for future bills.' },
  edit_customer:            { icon: '✏️', example: 'Update a customer\'s phone, GSTIN, or address.' },
  delete_customer:          { icon: '🗑️', example: 'Remove a customer record (purchase history is preserved).' },
  view_purchase_history:    { icon: '🧾', example: 'See every bill this customer has been on, with totals.' },
  import_customers:         { icon: '📥', example: 'Bulk-import customers from a CSV file.' },
  export_customers:         { icon: '📤', example: 'Download the customer list as a CSV/Excel file.' },

  // Stock Management
  view_stock:               { icon: '📦', example: 'See the inventory list with quantities and reorder levels.' },
  add_product:              { icon: '➕', example: 'Add a new product/SKU to the catalog.' },
  edit_product_details:     { icon: '✏️', example: 'Change a product\'s name, category, barcode, or HSN code.' },
  edit_pricing:             { icon: '💰', example: 'Edit MRP and sale price (does not unlock cost price).' },
  edit_cost_price:          { icon: '💵', example: 'Sensitive: edit the cost/purchase price — affects profit reports.' },
  delete_product:           { icon: '🗑️', example: 'Remove a product from the catalog (historical bills keep the snapshot).' },
  adjust_quantity:          { icon: '🔢', example: 'Manually correct stock count after a physical recount.' },
  view_low_stock_alerts:    { icon: '⚠️', example: 'See the "Low Stock" banner and the at-risk SKU list.' },
  import_stock:             { icon: '📥', example: 'Bulk-import stock from a CSV (e.g. supplier delivery sheet).' },
  export_stock:             { icon: '📤', example: 'Download the full inventory as a CSV/Excel file.' },

  // Reports & Analytics
  view_sales_reports:       { icon: '📈', example: 'Open the sales report page with daily/weekly/monthly totals.' },
  view_revenue_reports:     { icon: '💸', example: 'See revenue breakdowns by branch, category, or payment type.' },
  view_profit_reports:      { icon: '📊', example: 'See profit and margin (requires cost price to be set).' },
  view_inventory_reports:   { icon: '📦', example: 'Inventory valuation, slow-movers, and reorder reports.' },
  view_customer_reports:    { icon: '👥', example: 'Top customers, churn, and customer-segment analytics.' },
  export_reports:           { icon: '📤', example: 'Download any report as CSV/Excel for accounting.' },
  print_reports:            { icon: '🖨️', example: 'Print a report directly from the report screen.' },
  custom_report_filters:    { icon: '🎛️', example: 'Build and save custom date/branch/category filters.' },

  // Payment Types
  view_payment_types:       { icon: '💳', example: 'See the list of configured payment methods (Cash, UPI, etc.).' },
  add_payment_type:         { icon: '➕', example: 'Add a new payment method like "Razorpay" or "Cheque".' },
  edit_payment_type:        { icon: '✏️', example: 'Rename a payment method or change its display order.' },
  delete_payment_type:      { icon: '🗑️', example: 'Remove a payment method (historical bills keep their original).' },
  set_default_payment:      { icon: '⭐', example: 'Pick the default payment method shown at checkout.' },

  // User Management
  view_users:               { icon: '👥', example: 'Open the Users admin page and see the team list.' },
  add_user:                 { icon: '➕', example: 'Create a new staff/cashier/admin user.' },
  edit_user:                { icon: '✏️', example: 'Edit a user\'s name, phone, or department.' },
  delete_user:              { icon: '🗑️', example: 'Permanently remove a user (their bills stay attributed).' },
  activate_deactivate_user: { icon: '🔌', example: 'Disable a user\'s login without deleting them (e.g. on leave).' },
  assign_permissions:       { icon: '🛡️', example: 'Grant or revoke permissions on any user (on this screen).' },

  // System Settings
  view_settings:            { icon: '⚙️', example: 'Open the Settings page and view current configuration.' },
  edit_company_settings:    { icon: '🏢', example: 'Edit company name, address, logo, and contact info.' },
  edit_billing_settings:    { icon: '🧾', example: 'Edit bill prefix/suffix, footer text, and print template.' },
  edit_tax_settings:        { icon: '⚖️', example: 'Edit company-wide default GST rates and tax configuration.' },
  edit_notification_settings:{ icon: '🔔', example: 'Edit email/Telegram notification preferences.' },
  edit_theme_settings:      { icon: '🎨', example: 'Edit theme colors, dark mode default, and branding.' },

  // Audit & Logs
  view_audit_logs:          { icon: '📜', example: 'View the audit-trail page showing who changed what and when.' },
  export_audit_logs:        { icon: '📤', example: 'Download audit logs as CSV (for compliance/accounting).' },
  view_system_logs:         { icon: '🐛', example: 'See backend error logs — used for diagnosing issues.' },

  // System Administration
  manage_clients:           { icon: '🏛️', example: 'Manage other tenant organizations (super-admin only).' },
  system_backup:            { icon: '💾', example: 'Trigger a one-time backup of the database to file.' },
  system_restore:           { icon: '♻️', example: 'Dangerous: restore the database from a backup file.' },
  maintenance_mode:         { icon: '🚧', example: 'Put the app into read-only mode while you work on it.' },

  // Bulk Orders
  view_bulk_orders:         { icon: '📋', example: 'See the list of pending and completed bulk supplier orders.' },
  create_bulk_order:        { icon: '➕', example: 'Draft a new bulk stock order to send to a supplier.' },
  edit_bulk_order:          { icon: '✏️', example: 'Change quantities or items on a draft bulk order.' },
  delete_bulk_order:        { icon: '🗑️', example: 'Delete a bulk-order draft before it\'s sent.' },
  approve_bulk_order:       { icon: '✅', example: 'Approve a bulk-order draft so it can be sent to the supplier.' },
  receive_bulk_order:       { icon: '📥', example: 'Confirm physical receipt of stock and add it to inventory.' },

  // Notes
  view_notes:               { icon: '📝', example: 'See your own notes from the Notes page.' },
  view_all_notes:           { icon: '👁️', example: 'Admin: see every user\'s notes, not just your own.' },
  create_notes:             { icon: '✏️', example: 'Write a new note (e.g. shift handover, customer request).' },
  edit_notes:               { icon: '✏️', example: 'Edit your existing notes.' },
  delete_notes:             { icon: '🗑️', example: 'Delete one of your notes.' },

  // Legacy / aliases
  manage_customers:         { icon: '👥', example: 'Legacy: combined create/edit/delete on customers — prefer granular perms.' },
  manage_payment_types:     { icon: '💳', example: 'Legacy: combined manage on payment types — prefer granular perms.' },
  manage_settings:          { icon: '⚙️', example: 'Legacy: combined manage on settings — prefer granular perms.' },
  manage_users:             { icon: '👥', example: 'Legacy: combined create/edit/delete on users — prefer granular perms.' },
  manage_permissions:       { icon: '🛡️', example: 'Legacy alias for assign_permissions — kept for backward compatibility.' },
}
```

- [ ] **Step 2: Commit (data only — no test yet, that comes next)**

```bash
git add frontend-react/src/data/permissionMeta.ts
git commit -m "feat(perms): add permissionMeta lookup for tooltip help"
```

---

## Task 4: Coverage test — every seeded permission has a `permissionMeta` entry

Prevent silent drift: if the backend adds a new permission, the frontend lookup must catch up.

**Files:**
- Create: `frontend-react/src/test/permissionMeta.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend-react/src/test/permissionMeta.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { permissionMeta } from '@/data/permissionMeta'

/**
 * The canonical list of permission_name values seeded by the backend
 * (mirrors backend/app.py:90-191). Update this list when adding new
 * permissions — keeping it in sync is the whole point of this test.
 */
const SEEDED_PERMISSION_NAMES = [
  'view_dashboard',
  'gst_billing', 'non_gst_billing', 'apply_discount', 'add_payment',
  'select_customer', 'add_products', 'set_tax_rate',
  'view_all_bills', 'view_own_bills', 'edit_bill_details', 'edit_bill_price_audit',
  'delete_bills', 'print_bills', 'download_pdf', 'send_email', 'mark_paid',
  'mark_cancelled', 'duplicate_bill', 'search_bills', 'show_no_exchange',
  'view_customers', 'add_customer', 'edit_customer', 'delete_customer',
  'view_purchase_history', 'import_customers', 'export_customers',
  'view_stock', 'add_product', 'edit_product_details', 'edit_pricing',
  'edit_cost_price', 'delete_product', 'adjust_quantity',
  'view_low_stock_alerts', 'import_stock', 'export_stock',
  'view_sales_reports', 'view_revenue_reports', 'view_profit_reports',
  'view_inventory_reports', 'view_customer_reports', 'export_reports',
  'print_reports', 'custom_report_filters',
  'view_payment_types', 'add_payment_type', 'edit_payment_type',
  'delete_payment_type', 'set_default_payment',
  'view_users', 'add_user', 'edit_user', 'delete_user',
  'activate_deactivate_user', 'assign_permissions',
  'view_settings', 'edit_company_settings', 'edit_billing_settings',
  'edit_tax_settings', 'edit_notification_settings', 'edit_theme_settings',
  'view_audit_logs', 'export_audit_logs', 'view_system_logs',
  'manage_clients', 'system_backup', 'system_restore', 'maintenance_mode',
  'view_bulk_orders', 'create_bulk_order', 'edit_bulk_order',
  'delete_bulk_order', 'approve_bulk_order', 'receive_bulk_order',
  'view_notes', 'view_all_notes', 'create_notes', 'edit_notes', 'delete_notes',
  'manage_customers', 'manage_payment_types', 'manage_settings',
  'manage_users', 'manage_permissions',
]

describe('permissionMeta', () => {
  it('has an entry for every seeded permission', () => {
    const missing = SEEDED_PERMISSION_NAMES.filter(n => !(n in permissionMeta))
    expect(missing).toEqual([])
  })

  it('every entry has a non-empty icon and example', () => {
    for (const [name, meta] of Object.entries(permissionMeta)) {
      expect(meta.icon, `${name} icon`).toBeTruthy()
      expect(meta.example, `${name} example`).toBeTruthy()
      expect(meta.example.length, `${name} example length`).toBeGreaterThan(10)
    }
  })
})
```

- [ ] **Step 2: Run the test**

Run: `cd frontend-react && npm run test -- permissionMeta.test 2>&1 | tail -15`
Expected: both tests pass (because Task 3 already filled in all 86 entries). If any are missing, fix `permissionMeta.ts` and re-run until green.

- [ ] **Step 3: Commit**

```bash
git add frontend-react/src/test/permissionMeta.test.ts
git commit -m "test(perms): coverage check — every seeded permission has metadata"
```

---

## Task 5: Build `PermissionHelpTooltip` component (TDD)

Reusable component: shows an `ⓘ` trigger, opens a tooltip card on hover (desktop) or click (everywhere), closes on Escape / outside-click / scroll. Returns `null` for unknown permissions.

**Files:**
- Create: `frontend-react/src/components/admin/PermissionHelpTooltip.tsx`
- Create: `frontend-react/src/test/PermissionHelpTooltip.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend-react/src/test/PermissionHelpTooltip.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PermissionHelpTooltip } from '@/components/admin/PermissionHelpTooltip'

describe('PermissionHelpTooltip', () => {
  it('renders nothing for an unknown permission_name', () => {
    const { container } = render(<PermissionHelpTooltip permissionName="bogus_perm_xyz" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the (i) trigger for a known permission', () => {
    render(<PermissionHelpTooltip permissionName="apply_discount" />)
    const trigger = screen.getByRole('button', { name: /more info about apply_discount/i })
    expect(trigger).toBeInTheDocument()
  })

  it('opens the tooltip card on trigger click and shows icon + name + example', () => {
    render(<PermissionHelpTooltip permissionName="apply_discount" />)
    const trigger = screen.getByRole('button', { name: /more info about apply_discount/i })
    fireEvent.click(trigger)

    const card = screen.getByRole('tooltip')
    expect(card).toHaveTextContent('🏷️')
    expect(card).toHaveTextContent('apply_discount')
    expect(card).toHaveTextContent(/cashier reduces the bill total by 10%/i)
  })

  it('closes the tooltip when Escape is pressed', () => {
    render(<PermissionHelpTooltip permissionName="apply_discount" />)
    fireEvent.click(screen.getByRole('button', { name: /more info about apply_discount/i }))
    expect(screen.getByRole('tooltip')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('closes the tooltip when clicking outside', () => {
    render(
      <div>
        <PermissionHelpTooltip permissionName="apply_discount" />
        <span data-testid="outside">click me</span>
      </div>
    )
    fireEvent.click(screen.getByRole('button', { name: /more info about apply_discount/i }))
    expect(screen.getByRole('tooltip')).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('toggles open/closed on repeated clicks', () => {
    render(<PermissionHelpTooltip permissionName="apply_discount" />)
    const trigger = screen.getByRole('button', { name: /more info about apply_discount/i })

    fireEvent.click(trigger)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    fireEvent.click(trigger)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend-react && npm run test -- PermissionHelpTooltip.test 2>&1 | tail -20`
Expected: all 6 fail with `Cannot find module '@/components/admin/PermissionHelpTooltip'`.

- [ ] **Step 3: Implement the component**

Create the directory if missing, then create the file:

```bash
mkdir -p frontend-react/src/components/admin
```

Create `frontend-react/src/components/admin/PermissionHelpTooltip.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'
import { permissionMeta } from '@/data/permissionMeta'

type Props = {
  permissionName: string
}

/**
 * Renders an (i) trigger next to a permission label. On click (or desktop hover),
 * opens a small tooltip card with a themed icon + plain-English example.
 *
 * Returns null when the permission is not documented in permissionMeta — the row
 * then renders normally with no (i) icon (graceful fallback).
 *
 * Anchoring strategy: captures the trigger's getBoundingClientRect() on open and
 * renders the card as position:fixed at those coordinates. Survives parent scroll
 * and overflow-y-auto without a popover library.
 */
export function PermissionHelpTooltip({ permissionName }: Props) {
  const meta = permissionMeta[permissionName]
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)

  const open = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    // Anchor to the bottom-right of the (i) icon; card flows downward.
    setAnchor({ top: rect.bottom + 6, left: rect.right })
  }, [])

  const close = useCallback(() => setAnchor(null), [])

  // Close on Escape, outside click, and scroll.
  useEffect(() => {
    if (!anchor) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (cardRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      close()
    }
    const onScroll = () => close()
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [anchor, close])

  if (!meta) return null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`More info about ${permissionName}`}
        aria-expanded={anchor !== null}
        onClick={() => (anchor ? close() : open())}
        onMouseEnter={open}
        onMouseLeave={(e) => {
          // On desktop hover-out, only close if the cursor isn't moving into the card.
          const next = e.relatedTarget as Node | null
          if (next && cardRef.current?.contains(next)) return
          // Delay a tick to allow mouseenter-on-card to fire.
          setTimeout(() => {
            if (!cardRef.current?.matches(':hover')) close()
          }, 60)
        }}
        className="ml-auto p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 opacity-0 group-hover:opacity-100 focus:opacity-100 hover-none:opacity-100 transition-opacity"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      {anchor && createPortal(
        <div
          ref={cardRef}
          role="tooltip"
          style={{ position: 'fixed', top: anchor.top, left: Math.max(8, anchor.left - 280), zIndex: 70 }}
          onMouseLeave={close}
          className="w-72 rounded-lg bg-gray-900 text-white shadow-2xl ring-1 ring-black/20 p-3 text-xs"
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base" aria-hidden="true">{meta.icon}</span>
            <span className="font-semibold">{permissionName}</span>
          </div>
          <p className="text-gray-200 leading-snug">{meta.example}</p>
        </div>,
        document.body
      )}
    </>
  )
}
```

> **Note on `hover-none:opacity-100`:** the project uses Tailwind. If `hover-none:` is not configured as a custom variant in `tailwind.config.js`, replace that class with an inline media-query approach (always-visible on touch is required by the spec). The fallback in step 4 covers this.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend-react && npm run test -- PermissionHelpTooltip.test 2>&1 | tail -20`
Expected: 6 passed.

If the `hover-none:opacity-100` class causes a Tailwind warning or no effect, edit the trigger's className to use a simpler always-visible-on-touch approach:

```tsx
// Replace the className above with:
className="ml-auto p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100 transition-opacity"
```

(Below the `md:` breakpoint — narrow viewports / mobile — the icon is always visible; from `md:` up the hover behavior kicks in.) Re-run tests to confirm still passing.

- [ ] **Step 5: Commit**

```bash
git add frontend-react/src/components/admin/PermissionHelpTooltip.tsx frontend-react/src/test/PermissionHelpTooltip.test.tsx
git commit -m "feat(perms): add PermissionHelpTooltip component"
```

---

## Task 6: Wire `<PermissionHelpTooltip>` into `EditUser.tsx`

Insert the tooltip next to each permission checkbox label. Add the `group` class to the row so the trigger's `group-hover:opacity-100` works.

**Files:**
- Modify: `frontend-react/src/pages/admin/EditUser.tsx:612-626`

- [ ] **Step 1: Add the import**

At the top of `frontend-react/src/pages/admin/EditUser.tsx` (near the other component imports), add:

```tsx
import { PermissionHelpTooltip } from '@/components/admin/PermissionHelpTooltip'
```

- [ ] **Step 2: Modify the permission row to render the tooltip**

Find the existing block at line ~612-626 (inside the `perms.map`):

```tsx
{(perms as any[]).map((perm: any) => (
  <label
    key={perm.permission_name}
    className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
  >
    <input
      type="checkbox"
      checked={selectedPermissions.includes(perm.permission_name)}
      onChange={() => togglePermission(perm.permission_name)}
      className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-gray-800 focus:ring-gray-400 cursor-pointer"
    />
    <span className="text-sm text-gray-700 dark:text-gray-300">
      {perm.description}
    </span>
  </label>
))}
```

Replace with (adds `group` class on the label and renders `<PermissionHelpTooltip>` after the span):

```tsx
{(perms as any[]).map((perm: any) => (
  <label
    key={perm.permission_name}
    className="group flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
  >
    <input
      type="checkbox"
      checked={selectedPermissions.includes(perm.permission_name)}
      onChange={() => togglePermission(perm.permission_name)}
      className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-gray-800 focus:ring-gray-400 cursor-pointer"
    />
    <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">
      {perm.description}
    </span>
    <PermissionHelpTooltip permissionName={perm.permission_name} />
  </label>
))}
```

(Changes: added `group` to the label className; added `flex-1` to the span so the tooltip is pushed to the right; rendered `<PermissionHelpTooltip>` after the span.)

- [ ] **Step 3: Smoke-check that the page still renders**

Run: `cd frontend-react && npm run build 2>&1 | tail -10`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add frontend-react/src/pages/admin/EditUser.tsx
git commit -m "feat(perms): show help tooltips on EditUser permission rows"
```

---

## Task 7: Wire `<PermissionHelpTooltip>` into `CreateUser.tsx`

Mirror the EditUser change on CreateUser.

**Files:**
- Modify: `frontend-react/src/pages/admin/CreateUser.tsx:369-377`

- [ ] **Step 1: Add the import**

At the top of `frontend-react/src/pages/admin/CreateUser.tsx` (near the other imports), add:

```tsx
import { PermissionHelpTooltip } from '@/components/admin/PermissionHelpTooltip'
```

- [ ] **Step 2: Modify the permission row**

Find the existing block at line ~369-377 (inside the `perms.map`):

```tsx
{(perms as any[]).map((perm: any) => (
  <label key={perm.permission_name} className="flex items-start gap-2 cursor-pointer py-1">
    <input type="checkbox"
      checked={selectedPermissions.includes(perm.permission_name)}
      onChange={() => handlePermissionToggle(perm.permission_name)}
      className="mt-0.5 rounded border-gray-300 text-blue-600" />
    <span className="text-sm text-gray-700">{perm.description || perm.permission_name}</span>
  </label>
))}
```

Replace with:

```tsx
{(perms as any[]).map((perm: any) => (
  <label key={perm.permission_name} className="group flex items-start gap-2 cursor-pointer py-1">
    <input type="checkbox"
      checked={selectedPermissions.includes(perm.permission_name)}
      onChange={() => handlePermissionToggle(perm.permission_name)}
      className="mt-0.5 rounded border-gray-300 text-blue-600" />
    <span className="text-sm text-gray-700 flex-1">{perm.description || perm.permission_name}</span>
    <PermissionHelpTooltip permissionName={perm.permission_name} />
  </label>
))}
```

(Changes: added `group` to the label className; added `flex-1` to the span; rendered `<PermissionHelpTooltip>` after the span.)

- [ ] **Step 3: Smoke-check that the build still passes**

Run: `cd frontend-react && npm run build 2>&1 | tail -10`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend-react/src/pages/admin/CreateUser.tsx
git commit -m "feat(perms): show help tooltips on CreateUser permission rows"
```

---

## Task 8: Manual verification + final cleanup

End-to-end test that admins can actually see and use the tooltips on a running app.

**Files:** none (verification only — no commit)

- [ ] **Step 1: Start the backend**

Run: `cd backend && python app.py`
Expected: server starts on port 5017. Logs include `[Migration] Schema v18 → v19. Running migrations…` on first start (then `[Migration] v19: N permission description(s) clarified`). On subsequent starts: `[Migration] Schema up to date (v19). Skipping all migration checks.`.

- [ ] **Step 2: Start the frontend**

Run: `cd frontend-react && npm run dev`
Expected: dev server on http://localhost:3002/frontend/.

- [ ] **Step 3: Log in as a super admin and open `/admin/users/<some-user-id>`**

In the browser, navigate to a user's edit page (the EditUser screen from the original screenshot).

- [ ] **Step 4: Hover and click `ⓘ` on at least 6 permissions across different categories**

Required checks:
- Hover a row in **Create Bill** category → `ⓘ` fades in on the right → hover the `ⓘ` → tooltip card appears below with emoji, name, example.
- Repeat for **Manage Bills**, **Customers**, **Stock**, **Reports**, **User Management**.
- Click outside the tooltip → it closes.
- Press Escape with a tooltip open → it closes.
- Scroll the permissions list while a tooltip is open → it closes.

- [ ] **Step 5: Mobile / narrow viewport sanity check**

Open browser devtools, switch to a 375×667 viewport (iPhone SE). Confirm:
- `ⓘ` icons are always visible (no hover required) on every row.
- Tapping a `ⓘ` opens the tooltip; tapping outside closes it.

- [ ] **Step 6: Confirm the description rewrites landed**

On the same EditUser page, find the **Override the tax/GST rate on individual bills at checkout** row (was *"Set custom tax/GST rates"*). Confirm it shows the new copy. Pick 2-3 other rewritten permissions to confirm.

- [ ] **Step 7: Repeat smoke test on `CreateUser`**

Navigate to `/admin/users/create` (super admin only). Confirm the same `ⓘ`/tooltip behavior on the Additional Permissions block. `gst_billing` and `non_gst_billing` are filtered out of this list and won't be tested here — that's correct.

- [ ] **Step 8: If anything is broken, fix in a follow-up commit**

Common issues to look for:
- Tooltip is clipped by the parent `overflow-y-auto` → check the `position: fixed` + portal is working; the card should always render inside `document.body`, never inside the scroll container.
- `ⓘ` icon doesn't fade in on row hover → check the parent `<label>` has the `group` class added in Tasks 6 / 7.
- Build warns about unknown Tailwind class `hover-none:opacity-100` → use the `md:opacity-0 md:group-hover:opacity-100` fallback from Task 5 Step 4.
- TypeScript error on `permissionMeta[permissionName]` returning a possibly-undefined → already handled with `if (!meta) return null`. Don't change.

---

## Done criteria

Phase 1 is shippable when ALL of these hold:

1. `cd backend && pytest -x` → all green.
2. `cd frontend-react && npm run test:run` → all green.
3. `cd frontend-react && npm run build` → success, no TS errors.
4. Manual verification (Task 8) passes on both EditUser and CreateUser, desktop and mobile viewports.
5. On the production-like DB, opening EditUser shows the rewritten descriptions for the 12 changed permissions.

Once shippable, this phase can merge independently of Phase 2 (built-in role templates) and Phase 3 (custom templates). Those phases will get their own plans.
