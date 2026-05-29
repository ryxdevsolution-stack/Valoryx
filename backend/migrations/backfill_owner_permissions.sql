-- ============================================================
-- BACKFILL: grant the 30 new permissions to all existing OWNERS
--
-- Run this in the Supabase SQL Editor AFTER add_missing_permissions.sql,
-- ideally right BEFORE deploying the PR 2 backend (the one that adds
-- @require_permission decorators).
--
-- Why: existing owners signed up before these permissions existed, so
-- their user_permissions rows don't include them. Without this backfill,
-- every owner gets 403 on Employees / Expenses / Suppliers / Branches /
-- Stock Transfers / Shop Settings the moment PR 2 ships.
--
-- After this runs, owners can cascade the new perms to their staff via
-- /api/team/<user_id>/permissions (subject to no-escalation check).
--
-- Idempotent: ON CONFLICT DO NOTHING — re-running grants nothing new.
-- ============================================================

INSERT INTO user_permissions (id, user_id, permission_id, granted_by, granted_at, updated_at)
SELECT
    uuid_generate_v4(),
    u.user_id,
    p.permission_id,
    u.user_id,                -- self-grant (matches the trial-signup pattern)
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM users u
CROSS JOIN permissions p
WHERE u.role = 'owner'
  AND u.deleted_at IS NULL
  AND p.permission_name IN (
      -- Employees
      'view_employees', 'add_employee', 'edit_employee', 'delete_employee',
      'view_attendance', 'mark_attendance',
      -- Payroll
      'view_salary', 'manage_salary_cycles', 'record_advance', 'mark_salary_paid',
      -- Expenses
      'view_expenses', 'add_expense', 'edit_expense', 'delete_expense',
      'manage_expense_categories',
      -- Suppliers
      'view_suppliers', 'add_supplier', 'edit_supplier', 'delete_supplier',
      'manage_deliveries',
      -- Branches
      'view_branches', 'add_branch', 'edit_branch', 'delete_branch',
      -- Stock Transfers
      'view_stock_transfers', 'create_stock_transfer',
      'approve_stock_transfer', 'receive_stock_transfer',
      -- Shop Settings
      'view_shop_settings', 'edit_shop_settings'
  )
ON CONFLICT (user_id, permission_id) DO NOTHING;


-- ── Verify: show how many of the 30 new perms each owner now holds ──
SELECT
    u.email,
    u.full_name,
    COUNT(DISTINCT up.permission_id) AS new_perms_granted
FROM users u
LEFT JOIN user_permissions up ON up.user_id = u.user_id
LEFT JOIN permissions p ON p.permission_id = up.permission_id
    AND p.permission_name IN (
        'view_employees','add_employee','edit_employee','delete_employee',
        'view_attendance','mark_attendance',
        'view_salary','manage_salary_cycles','record_advance','mark_salary_paid',
        'view_expenses','add_expense','edit_expense','delete_expense','manage_expense_categories',
        'view_suppliers','add_supplier','edit_supplier','delete_supplier','manage_deliveries',
        'view_branches','add_branch','edit_branch','delete_branch',
        'view_stock_transfers','create_stock_transfer','approve_stock_transfer','receive_stock_transfer',
        'view_shop_settings','edit_shop_settings'
    )
WHERE u.role = 'owner' AND u.deleted_at IS NULL
GROUP BY u.user_id, u.email, u.full_name
ORDER BY u.email;

-- Each owner should now show 30 new_perms_granted.
