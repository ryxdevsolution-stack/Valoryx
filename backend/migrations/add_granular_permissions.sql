-- ========================================
-- Granular Permissions Migration SQL
-- Run this directly in your PostgreSQL database
-- ========================================

-- Insert granular permissions (or update if they already exist)

-- Dashboard Permissions
INSERT INTO permissions (permission_id, permission_name, description, category, created_at)
VALUES
    (gen_random_uuid(), 'dashboard.view', 'View dashboard page', 'Dashboard', NOW()),
    (gen_random_uuid(), 'dashboard.view_analytics', 'View analytics and charts', 'Dashboard', NOW()),
    (gen_random_uuid(), 'dashboard.view_revenue', 'View revenue metrics', 'Dashboard', NOW()),
    (gen_random_uuid(), 'dashboard.view_sales', 'View sales statistics', 'Dashboard', NOW()),
    (gen_random_uuid(), 'dashboard.export_data', 'Export dashboard data', 'Dashboard', NOW())
ON CONFLICT (permission_name) DO UPDATE SET
    description = EXCLUDED.description,
    category = EXCLUDED.category;

-- Billing - View Permissions
INSERT INTO permissions (permission_id, permission_name, description, category, created_at)
VALUES
    (gen_random_uuid(), 'billing.view', 'View bills list page', 'Billing - View', NOW()),
    (gen_random_uuid(), 'billing.view_all', 'View all bills', 'Billing - View', NOW()),
    (gen_random_uuid(), 'billing.view_own', 'View own created bills only', 'Billing - View', NOW()),
    (gen_random_uuid(), 'billing.view_details', 'View bill details', 'Billing - View', NOW()),
    (gen_random_uuid(), 'billing.search', 'Search and filter bills', 'Billing - View', NOW())
ON CONFLICT (permission_name) DO UPDATE SET
    description = EXCLUDED.description,
    category = EXCLUDED.category;

-- Billing - Create Permissions
INSERT INTO permissions (permission_id, permission_name, description, category, created_at)
VALUES
    (gen_random_uuid(), 'billing.create', 'Access create bill page', 'Billing - Create', NOW()),
    (gen_random_uuid(), 'billing.create_bill', 'Create new bills', 'Billing - Create', NOW()),
    (gen_random_uuid(), 'billing.select_customer', 'Select customers for bills', 'Billing - Create', NOW()),
    (gen_random_uuid(), 'billing.add_products', 'Add products to bills', 'Billing - Create', NOW()),
    (gen_random_uuid(), 'billing.set_discount', 'Apply discounts to bills', 'Billing - Create', NOW()),
    (gen_random_uuid(), 'billing.set_tax', 'Apply tax to bills', 'Billing - Create', NOW())
ON CONFLICT (permission_name) DO UPDATE SET
    description = EXCLUDED.description,
    category = EXCLUDED.category;

-- Billing - Edit Permissions
INSERT INTO permissions (permission_id, permission_name, description, category, created_at)
VALUES
    (gen_random_uuid(), 'billing.edit', 'Edit existing bills', 'Billing - Edit', NOW()),
    (gen_random_uuid(), 'billing.edit_details', 'Edit bill details', 'Billing - Edit', NOW()),
    (gen_random_uuid(), 'billing.edit_products', 'Edit products in bills', 'Billing - Edit', NOW()),
    (gen_random_uuid(), 'billing.edit_amount', 'Edit bill amounts', 'Billing - Edit', NOW()),
    (gen_random_uuid(), 'billing.edit_status', 'Change bill status', 'Billing - Edit', NOW())
ON CONFLICT (permission_name) DO UPDATE SET
    description = EXCLUDED.description,
    category = EXCLUDED.category;

-- Billing - Actions Permissions
INSERT INTO permissions (permission_id, permission_name, description, category, created_at)
VALUES
    (gen_random_uuid(), 'billing.delete', 'Delete bills', 'Billing - Actions', NOW()),
    (gen_random_uuid(), 'billing.print', 'Print bills', 'Billing - Actions', NOW()),
    (gen_random_uuid(), 'billing.download_pdf', 'Download bill as PDF', 'Billing - Actions', NOW()),
    (gen_random_uuid(), 'billing.send_email', 'Email bills to customers', 'Billing - Actions', NOW()),
    (gen_random_uuid(), 'billing.duplicate', 'Duplicate existing bills', 'Billing - Actions', NOW()),
    (gen_random_uuid(), 'billing.mark_paid', 'Mark bills as paid', 'Billing - Actions', NOW()),
    (gen_random_uuid(), 'billing.mark_cancelled', 'Cancel bills', 'Billing - Actions', NOW())
ON CONFLICT (permission_name) DO UPDATE SET
    description = EXCLUDED.description,
    category = EXCLUDED.category;

-- Customers - View Permissions
INSERT INTO permissions (permission_id, permission_name, description, category, created_at)
VALUES
    (gen_random_uuid(), 'customers.view', 'View customers page', 'Customers - View', NOW()),
    (gen_random_uuid(), 'customers.view_all', 'View all customers', 'Customers - View', NOW()),
    (gen_random_uuid(), 'customers.view_details', 'View customer details', 'Customers - View', NOW()),
    (gen_random_uuid(), 'customers.search', 'Search and filter customers', 'Customers - View', NOW()),
    (gen_random_uuid(), 'customers.view_history', 'View customer purchase history', 'Customers - View', NOW())
ON CONFLICT (permission_name) DO UPDATE SET
    description = EXCLUDED.description,
    category = EXCLUDED.category;

-- Customers - Manage Permissions
INSERT INTO permissions (permission_id, permission_name, description, category, created_at)
VALUES
    (gen_random_uuid(), 'customers.create', 'Create new customers', 'Customers - Manage', NOW()),
    (gen_random_uuid(), 'customers.edit', 'Edit customer information', 'Customers - Manage', NOW()),
    (gen_random_uuid(), 'customers.delete', 'Delete customers', 'Customers - Manage', NOW()),
    (gen_random_uuid(), 'customers.import', 'Import customers from file', 'Customers - Manage', NOW()),
    (gen_random_uuid(), 'customers.export', 'Export customers to file', 'Customers - Manage', NOW())
ON CONFLICT (permission_name) DO UPDATE SET
    description = EXCLUDED.description,
    category = EXCLUDED.category;

-- Stock - View Permissions
INSERT INTO permissions (permission_id, permission_name, description, category, created_at)
VALUES
    (gen_random_uuid(), 'stock.view', 'View stock page', 'Stock - View', NOW()),
    (gen_random_uuid(), 'stock.view_all', 'View all stock items', 'Stock - View', NOW()),
    (gen_random_uuid(), 'stock.view_details', 'View product details', 'Stock - View', NOW()),
    (gen_random_uuid(), 'stock.search', 'Search and filter stock', 'Stock - View', NOW()),
    (gen_random_uuid(), 'stock.view_levels', 'View stock levels', 'Stock - View', NOW()),
    (gen_random_uuid(), 'stock.view_low_stock', 'View low stock alerts', 'Stock - View', NOW())
ON CONFLICT (permission_name) DO UPDATE SET
    description = EXCLUDED.description,
    category = EXCLUDED.category;

-- Stock - Manage Permissions
INSERT INTO permissions (permission_id, permission_name, description, category, created_at)
VALUES
    (gen_random_uuid(), 'stock.create', 'Add new products', 'Stock - Manage', NOW()),
    (gen_random_uuid(), 'stock.edit', 'Edit product information', 'Stock - Manage', NOW()),
    (gen_random_uuid(), 'stock.edit_price', 'Edit product prices', 'Stock - Manage', NOW()),
    (gen_random_uuid(), 'stock.edit_mrp', 'Edit product MRP', 'Stock - Manage', NOW()),
    (gen_random_uuid(), 'stock.edit_cost', 'Edit product cost price', 'Stock - Manage', NOW()),
    (gen_random_uuid(), 'stock.delete', 'Delete products', 'Stock - Manage', NOW()),
    (gen_random_uuid(), 'stock.adjust_quantity', 'Adjust stock quantities', 'Stock - Manage', NOW()),
    (gen_random_uuid(), 'stock.import', 'Import stock from file', 'Stock - Manage', NOW()),
    (gen_random_uuid(), 'stock.export', 'Export stock to file', 'Stock - Manage', NOW())
ON CONFLICT (permission_name) DO UPDATE SET
    description = EXCLUDED.description,
    category = EXCLUDED.category;

-- Reports - Access Permissions
INSERT INTO permissions (permission_id, permission_name, description, category, created_at)
VALUES
    (gen_random_uuid(), 'reports.view', 'View reports page', 'Reports - Access', NOW()),
    (gen_random_uuid(), 'reports.view_sales', 'View sales reports', 'Reports - Access', NOW()),
    (gen_random_uuid(), 'reports.view_revenue', 'View revenue reports', 'Reports - Access', NOW()),
    (gen_random_uuid(), 'reports.view_profit', 'View profit reports', 'Reports - Access', NOW()),
    (gen_random_uuid(), 'reports.view_inventory', 'View inventory reports', 'Reports - Access', NOW()),
    (gen_random_uuid(), 'reports.view_customer', 'View customer reports', 'Reports - Access', NOW())
ON CONFLICT (permission_name) DO UPDATE SET
    description = EXCLUDED.description,
    category = EXCLUDED.category;

-- Reports - Actions Permissions
INSERT INTO permissions (permission_id, permission_name, description, category, created_at)
VALUES
    (gen_random_uuid(), 'reports.generate', 'Generate new reports', 'Reports - Actions', NOW()),
    (gen_random_uuid(), 'reports.export', 'Export reports to file', 'Reports - Actions', NOW()),
    (gen_random_uuid(), 'reports.print', 'Print reports', 'Reports - Actions', NOW()),
    (gen_random_uuid(), 'reports.schedule', 'Schedule automated reports', 'Reports - Actions', NOW()),
    (gen_random_uuid(), 'reports.custom_filters', 'Use custom date filters', 'Reports - Actions', NOW())
ON CONFLICT (permission_name) DO UPDATE SET
    description = EXCLUDED.description,
    category = EXCLUDED.category;

-- Audit Permissions
INSERT INTO permissions (permission_id, permission_name, description, category, created_at)
VALUES
    (gen_random_uuid(), 'audit.view', 'View audit logs page', 'Audit', NOW()),
    (gen_random_uuid(), 'audit.view_all', 'View all audit logs', 'Audit', NOW()),
    (gen_random_uuid(), 'audit.view_own', 'View own audit logs only', 'Audit', NOW()),
    (gen_random_uuid(), 'audit.search', 'Search audit logs', 'Audit', NOW()),
    (gen_random_uuid(), 'audit.export', 'Export audit logs', 'Audit', NOW())
ON CONFLICT (permission_name) DO UPDATE SET
    description = EXCLUDED.description,
    category = EXCLUDED.category;

-- Users - View Permissions
INSERT INTO permissions (permission_id, permission_name, description, category, created_at)
VALUES
    (gen_random_uuid(), 'users.view', 'View users page', 'Users - View', NOW()),
    (gen_random_uuid(), 'users.view_all', 'View all users in organization', 'Users - View', NOW()),
    (gen_random_uuid(), 'users.view_details', 'View user details', 'Users - View', NOW())
ON CONFLICT (permission_name) DO UPDATE SET
    description = EXCLUDED.description,
    category = EXCLUDED.category;

-- Users - Manage Permissions
INSERT INTO permissions (permission_id, permission_name, description, category, created_at)
VALUES
    (gen_random_uuid(), 'users.create', 'Create new users', 'Users - Manage', NOW()),
    (gen_random_uuid(), 'users.edit', 'Edit user information', 'Users - Manage', NOW()),
    (gen_random_uuid(), 'users.delete', 'Delete users', 'Users - Manage', NOW()),
    (gen_random_uuid(), 'users.change_role', 'Change user roles', 'Users - Manage', NOW()),
    (gen_random_uuid(), 'users.activate', 'Activate users', 'Users - Manage', NOW()),
    (gen_random_uuid(), 'users.deactivate', 'Deactivate users', 'Users - Manage', NOW())
ON CONFLICT (permission_name) DO UPDATE SET
    description = EXCLUDED.description,
    category = EXCLUDED.category;

-- Permission Management Permissions
INSERT INTO permissions (permission_id, permission_name, description, category, created_at)
VALUES
    (gen_random_uuid(), 'permissions.view', 'View permissions page', 'Permissions', NOW()),
    (gen_random_uuid(), 'permissions.manage', 'Manage user permissions', 'Permissions', NOW()),
    (gen_random_uuid(), 'permissions.grant', 'Grant permissions to users', 'Permissions', NOW()),
    (gen_random_uuid(), 'permissions.revoke', 'Revoke permissions from users', 'Permissions', NOW()),
    (gen_random_uuid(), 'permissions.view_all', 'View all available permissions', 'Permissions', NOW())
ON CONFLICT (permission_name) DO UPDATE SET
    description = EXCLUDED.description,
    category = EXCLUDED.category;

-- Client Management Permissions (Super Admin)
INSERT INTO permissions (permission_id, permission_name, description, category, created_at)
VALUES
    (gen_random_uuid(), 'clients.view', 'View client management page', 'Clients - Super Admin', NOW()),
    (gen_random_uuid(), 'clients.view_all', 'View all clients', 'Clients - Super Admin', NOW()),
    (gen_random_uuid(), 'clients.create', 'Create new clients', 'Clients - Super Admin', NOW()),
    (gen_random_uuid(), 'clients.edit', 'Edit client information', 'Clients - Super Admin', NOW()),
    (gen_random_uuid(), 'clients.delete', 'Delete clients', 'Clients - Super Admin', NOW()),
    (gen_random_uuid(), 'clients.activate', 'Activate clients', 'Clients - Super Admin', NOW()),
    (gen_random_uuid(), 'clients.deactivate', 'Deactivate clients', 'Clients - Super Admin', NOW())
ON CONFLICT (permission_name) DO UPDATE SET
    description = EXCLUDED.description,
    category = EXCLUDED.category;

-- Settings Permissions
INSERT INTO permissions (permission_id, permission_name, description, category, created_at)
VALUES
    (gen_random_uuid(), 'settings.view', 'View settings page', 'Settings', NOW()),
    (gen_random_uuid(), 'settings.edit_company', 'Edit company information', 'Settings', NOW()),
    (gen_random_uuid(), 'settings.edit_billing', 'Edit billing settings', 'Settings', NOW()),
    (gen_random_uuid(), 'settings.edit_tax', 'Edit tax settings', 'Settings', NOW()),
    (gen_random_uuid(), 'settings.edit_notifications', 'Edit notification settings', 'Settings', NOW()),
    (gen_random_uuid(), 'settings.edit_theme', 'Edit theme settings', 'Settings', NOW())
ON CONFLICT (permission_name) DO UPDATE SET
    description = EXCLUDED.description,
    category = EXCLUDED.category;

-- System Permissions
INSERT INTO permissions (permission_id, permission_name, description, category, created_at)
VALUES
    (gen_random_uuid(), 'system.backup', 'Create system backups', 'System', NOW()),
    (gen_random_uuid(), 'system.restore', 'Restore from backups', 'System', NOW()),
    (gen_random_uuid(), 'system.view_logs', 'View system logs', 'System', NOW()),
    (gen_random_uuid(), 'system.maintenance', 'Access maintenance mode', 'System', NOW())
ON CONFLICT (permission_name) DO UPDATE SET
    description = EXCLUDED.description,
    category = EXCLUDED.category;

-- ========================================
-- Summary
-- ========================================
SELECT
    category,
    COUNT(*) as permission_count
FROM permissions
WHERE category IS NOT NULL
GROUP BY category
ORDER BY category;

-- Show total count
SELECT COUNT(*) as total_permissions FROM permissions;

-- ========================================
-- DONE! All granular permissions added.
-- ========================================
