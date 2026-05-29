-- ============================================================
-- ADD MISSING PERMISSIONS (Employees, Payroll, Expenses,
-- Suppliers, Branches, Stock Transfers, Shop Settings)
--
-- Run this in the Supabase SQL Editor.
-- Mirrors the data inserted by runner.py::_m026_add_missing_permissions
-- so SQLite (offline) and Supabase (online) stay in sync.
--
-- Safe to re-run: every INSERT is guarded by ON CONFLICT DO NOTHING.
-- ============================================================

-- ── Sections ────────────────────────────────────────────────
INSERT INTO permission_sections (section_name, description, display_order, icon) VALUES
    ('Employees',       'Permissions for employee management',  6,  'Users'),
    ('Payroll',         'Permissions for salary and payroll',   7,  'Wallet'),
    ('Expenses',        'Permissions for expense tracking',     8,  'Receipt'),
    ('Suppliers',       'Permissions for supplier management',  9,  'Truck'),
    ('Branches',        'Permissions for branch management',    10, 'Store'),
    ('Stock Transfers', 'Permissions for stock transfers',      11, 'ArrowLeftRight'),
    ('Shop Settings',   'Permissions for shop settings',        12, 'Settings')
ON CONFLICT (section_name) DO UPDATE
    SET description  = EXCLUDED.description,
        display_order = EXCLUDED.display_order,
        icon         = EXCLUDED.icon;


-- ── Employees ───────────────────────────────────────────────
INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'view_employees',  'View employee list',           section_id, 1
FROM permission_sections WHERE section_name = 'Employees'
ON CONFLICT (permission_name) DO NOTHING;

INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'add_employee',    'Add new employees',             section_id, 2
FROM permission_sections WHERE section_name = 'Employees'
ON CONFLICT (permission_name) DO NOTHING;

INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'edit_employee',   'Edit employee details',         section_id, 3
FROM permission_sections WHERE section_name = 'Employees'
ON CONFLICT (permission_name) DO NOTHING;

INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'delete_employee', 'Delete / deactivate employees', section_id, 4
FROM permission_sections WHERE section_name = 'Employees'
ON CONFLICT (permission_name) DO NOTHING;

INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'view_attendance', 'View attendance records',       section_id, 5
FROM permission_sections WHERE section_name = 'Employees'
ON CONFLICT (permission_name) DO NOTHING;

INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'mark_attendance', 'Mark / edit attendance',        section_id, 6
FROM permission_sections WHERE section_name = 'Employees'
ON CONFLICT (permission_name) DO NOTHING;


-- ── Payroll ─────────────────────────────────────────────────
INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'view_salary',          'View salary cycles',                section_id, 1
FROM permission_sections WHERE section_name = 'Payroll'
ON CONFLICT (permission_name) DO NOTHING;

INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'manage_salary_cycles', 'Open / close / edit salary cycles', section_id, 2
FROM permission_sections WHERE section_name = 'Payroll'
ON CONFLICT (permission_name) DO NOTHING;

INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'record_advance',       'Record salary advances',            section_id, 3
FROM permission_sections WHERE section_name = 'Payroll'
ON CONFLICT (permission_name) DO NOTHING;

INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'mark_salary_paid',     'Mark cycle as paid',                section_id, 4
FROM permission_sections WHERE section_name = 'Payroll'
ON CONFLICT (permission_name) DO NOTHING;


-- ── Expenses ────────────────────────────────────────────────
INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'view_expenses',             'View expense entries',      section_id, 1
FROM permission_sections WHERE section_name = 'Expenses'
ON CONFLICT (permission_name) DO NOTHING;

INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'add_expense',               'Add new expense',           section_id, 2
FROM permission_sections WHERE section_name = 'Expenses'
ON CONFLICT (permission_name) DO NOTHING;

INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'edit_expense',              'Edit expense entries',      section_id, 3
FROM permission_sections WHERE section_name = 'Expenses'
ON CONFLICT (permission_name) DO NOTHING;

INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'delete_expense',            'Delete expense entries',    section_id, 4
FROM permission_sections WHERE section_name = 'Expenses'
ON CONFLICT (permission_name) DO NOTHING;

INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'manage_expense_categories', 'Manage expense categories', section_id, 5
FROM permission_sections WHERE section_name = 'Expenses'
ON CONFLICT (permission_name) DO NOTHING;


-- ── Suppliers ───────────────────────────────────────────────
INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'view_suppliers',    'View supplier list',            section_id, 1
FROM permission_sections WHERE section_name = 'Suppliers'
ON CONFLICT (permission_name) DO NOTHING;

INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'add_supplier',      'Add new suppliers',             section_id, 2
FROM permission_sections WHERE section_name = 'Suppliers'
ON CONFLICT (permission_name) DO NOTHING;

INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'edit_supplier',     'Edit supplier details',         section_id, 3
FROM permission_sections WHERE section_name = 'Suppliers'
ON CONFLICT (permission_name) DO NOTHING;

INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'delete_supplier',   'Delete / deactivate suppliers', section_id, 4
FROM permission_sections WHERE section_name = 'Suppliers'
ON CONFLICT (permission_name) DO NOTHING;

INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'manage_deliveries', 'Manage supplier deliveries',    section_id, 5
FROM permission_sections WHERE section_name = 'Suppliers'
ON CONFLICT (permission_name) DO NOTHING;


-- ── Branches ────────────────────────────────────────────────
INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'view_branches', 'View branches',       section_id, 1
FROM permission_sections WHERE section_name = 'Branches'
ON CONFLICT (permission_name) DO NOTHING;

INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'add_branch',    'Add new branches',    section_id, 2
FROM permission_sections WHERE section_name = 'Branches'
ON CONFLICT (permission_name) DO NOTHING;

INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'edit_branch',   'Edit branch details', section_id, 3
FROM permission_sections WHERE section_name = 'Branches'
ON CONFLICT (permission_name) DO NOTHING;

INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'delete_branch', 'Delete branches',     section_id, 4
FROM permission_sections WHERE section_name = 'Branches'
ON CONFLICT (permission_name) DO NOTHING;


-- ── Stock Transfers ─────────────────────────────────────────
INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'view_stock_transfers',    'View stock transfer list',     section_id, 1
FROM permission_sections WHERE section_name = 'Stock Transfers'
ON CONFLICT (permission_name) DO NOTHING;

INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'create_stock_transfer',   'Create / request transfers',   section_id, 2
FROM permission_sections WHERE section_name = 'Stock Transfers'
ON CONFLICT (permission_name) DO NOTHING;

INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'approve_stock_transfer',  'Approve transfer requests',    section_id, 3
FROM permission_sections WHERE section_name = 'Stock Transfers'
ON CONFLICT (permission_name) DO NOTHING;

INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'receive_stock_transfer',  'Confirm receipt of transfers', section_id, 4
FROM permission_sections WHERE section_name = 'Stock Transfers'
ON CONFLICT (permission_name) DO NOTHING;


-- ── Shop Settings ───────────────────────────────────────────
INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'view_shop_settings', 'View shop settings', section_id, 1
FROM permission_sections WHERE section_name = 'Shop Settings'
ON CONFLICT (permission_name) DO NOTHING;

INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'edit_shop_settings', 'Edit shop settings', section_id, 2
FROM permission_sections WHERE section_name = 'Shop Settings'
ON CONFLICT (permission_name) DO NOTHING;


-- ── Bump _schema_version so the app's migration runner skips v16 ─
-- (Optional — safe even if you let the app run v16 too; it's idempotent.)
INSERT INTO _schema_version (version) VALUES (16);


-- ── Verify ──────────────────────────────────────────────────
SELECT
    ps.section_name,
    p.permission_name,
    p.description,
    p.display_order
FROM permissions p
JOIN permission_sections ps ON p.section_id = ps.section_id
WHERE ps.section_name IN (
    'Employees', 'Payroll', 'Expenses', 'Suppliers',
    'Branches', 'Stock Transfers', 'Shop Settings'
)
ORDER BY ps.display_order, p.display_order;

SELECT 'Total permissions in DB:' AS info, COUNT(*) AS total FROM permissions;
