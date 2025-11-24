-- ============================================================
-- PERMISSION SYSTEM RESTRUCTURE
-- Complete redesign with section-based, user-friendly structure
-- ============================================================

-- Step 1: Create permission_sections table
CREATE TABLE IF NOT EXISTS permission_sections (
    section_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    section_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    display_order INTEGER NOT NULL,
    icon VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Step 2: Drop existing permissions (clean slate)
TRUNCATE TABLE user_permissions CASCADE;
TRUNCATE TABLE permissions CASCADE;

-- Step 3: Alter permissions table to add section support
ALTER TABLE permissions
ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES permission_sections(section_id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

-- Drop category column if it exists
ALTER TABLE permissions DROP COLUMN IF EXISTS category;

-- Step 4: Insert permission sections
INSERT INTO permission_sections (section_name, description, display_order, icon) VALUES
('Create Bill', 'Permissions for creating new bills and invoices', 1, 'PlusSquare'),
('Manage Bills', 'Permissions for viewing, editing, and managing existing bills', 2, 'FileText'),
('Customer Management', 'Permissions for managing customer data', 3, 'Users'),
('Stock Management', 'Permissions for managing inventory and products', 4, 'Package'),
('Reports & Analytics', 'Permissions for viewing reports and analytics', 5, 'TrendingUp'),
('Payment Types', 'Permissions for managing payment methods', 6, 'CreditCard'),
('User Management', 'Permissions for managing system users', 7, 'UserCog'),
('System Settings', 'Permissions for configuring system settings', 8, 'Settings'),
('Audit & Logs', 'Permissions for viewing system logs and audit trails', 9, 'Search'),
('System Administration', 'Super admin permissions for system management', 10, 'Shield');

-- Step 5: Insert new permissions with section-based structure

-- Section 1: Create Bill
INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'gst_billing', 'Create bills with GST', section_id, 1 FROM permission_sections WHERE section_name = 'Create Bill'
UNION ALL
SELECT uuid_generate_v4(), 'non_gst_billing', 'Create bills without GST', section_id, 2 FROM permission_sections WHERE section_name = 'Create Bill'
UNION ALL
SELECT uuid_generate_v4(), 'apply_discount', 'Apply discounts to bills', section_id, 3 FROM permission_sections WHERE section_name = 'Create Bill'
UNION ALL
SELECT uuid_generate_v4(), 'add_payment', 'Add payment methods to bills', section_id, 4 FROM permission_sections WHERE section_name = 'Create Bill'
UNION ALL
SELECT uuid_generate_v4(), 'select_customer', 'Select and assign customers to bills', section_id, 5 FROM permission_sections WHERE section_name = 'Create Bill'
UNION ALL
SELECT uuid_generate_v4(), 'add_products', 'Add products to bills', section_id, 6 FROM permission_sections WHERE section_name = 'Create Bill'
UNION ALL
SELECT uuid_generate_v4(), 'set_tax_rate', 'Set custom tax/GST rates', section_id, 7 FROM permission_sections WHERE section_name = 'Create Bill';

-- Section 2: Manage Bills
INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'view_all_bills', 'View all bills in the system', section_id, 1 FROM permission_sections WHERE section_name = 'Manage Bills'
UNION ALL
SELECT uuid_generate_v4(), 'view_own_bills', 'View only own created bills', section_id, 2 FROM permission_sections WHERE section_name = 'Manage Bills'
UNION ALL
SELECT uuid_generate_v4(), 'edit_bill_details', 'Edit bill information and details', section_id, 3 FROM permission_sections WHERE section_name = 'Manage Bills'
UNION ALL
SELECT uuid_generate_v4(), 'delete_bills', 'Delete bills from the system', section_id, 4 FROM permission_sections WHERE section_name = 'Manage Bills'
UNION ALL
SELECT uuid_generate_v4(), 'print_bills', 'Print bills', section_id, 5 FROM permission_sections WHERE section_name = 'Manage Bills'
UNION ALL
SELECT uuid_generate_v4(), 'download_pdf', 'Download bills as PDF', section_id, 6 FROM permission_sections WHERE section_name = 'Manage Bills'
UNION ALL
SELECT uuid_generate_v4(), 'send_email', 'Send bills via email', section_id, 7 FROM permission_sections WHERE section_name = 'Manage Bills'
UNION ALL
SELECT uuid_generate_v4(), 'mark_paid', 'Mark bills as paid', section_id, 8 FROM permission_sections WHERE section_name = 'Manage Bills'
UNION ALL
SELECT uuid_generate_v4(), 'mark_cancelled', 'Mark bills as cancelled', section_id, 9 FROM permission_sections WHERE section_name = 'Manage Bills'
UNION ALL
SELECT uuid_generate_v4(), 'duplicate_bill', 'Duplicate existing bills', section_id, 10 FROM permission_sections WHERE section_name = 'Manage Bills'
UNION ALL
SELECT uuid_generate_v4(), 'search_bills', 'Search and filter bills', section_id, 11 FROM permission_sections WHERE section_name = 'Manage Bills';

-- Section 3: Customer Management
INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'view_customers', 'View customer list and details', section_id, 1 FROM permission_sections WHERE section_name = 'Customer Management'
UNION ALL
SELECT uuid_generate_v4(), 'add_customer', 'Add new customers', section_id, 2 FROM permission_sections WHERE section_name = 'Customer Management'
UNION ALL
SELECT uuid_generate_v4(), 'edit_customer', 'Edit customer information', section_id, 3 FROM permission_sections WHERE section_name = 'Customer Management'
UNION ALL
SELECT uuid_generate_v4(), 'delete_customer', 'Delete customers', section_id, 4 FROM permission_sections WHERE section_name = 'Customer Management'
UNION ALL
SELECT uuid_generate_v4(), 'view_purchase_history', 'View customer purchase history', section_id, 5 FROM permission_sections WHERE section_name = 'Customer Management'
UNION ALL
SELECT uuid_generate_v4(), 'import_customers', 'Import customers from file', section_id, 6 FROM permission_sections WHERE section_name = 'Customer Management'
UNION ALL
SELECT uuid_generate_v4(), 'export_customers', 'Export customer data', section_id, 7 FROM permission_sections WHERE section_name = 'Customer Management';

-- Section 4: Stock Management
INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'view_stock', 'View stock and inventory', section_id, 1 FROM permission_sections WHERE section_name = 'Stock Management'
UNION ALL
SELECT uuid_generate_v4(), 'add_product', 'Add new products to inventory', section_id, 2 FROM permission_sections WHERE section_name = 'Stock Management'
UNION ALL
SELECT uuid_generate_v4(), 'edit_product_details', 'Edit product information', section_id, 3 FROM permission_sections WHERE section_name = 'Stock Management'
UNION ALL
SELECT uuid_generate_v4(), 'edit_pricing', 'Edit product MRP and sale price', section_id, 4 FROM permission_sections WHERE section_name = 'Stock Management'
UNION ALL
SELECT uuid_generate_v4(), 'edit_cost_price', 'Edit product cost price', section_id, 5 FROM permission_sections WHERE section_name = 'Stock Management'
UNION ALL
SELECT uuid_generate_v4(), 'delete_product', 'Delete products from inventory', section_id, 6 FROM permission_sections WHERE section_name = 'Stock Management'
UNION ALL
SELECT uuid_generate_v4(), 'adjust_quantity', 'Adjust stock quantities', section_id, 7 FROM permission_sections WHERE section_name = 'Stock Management'
UNION ALL
SELECT uuid_generate_v4(), 'view_low_stock_alerts', 'View low stock alerts', section_id, 8 FROM permission_sections WHERE section_name = 'Stock Management'
UNION ALL
SELECT uuid_generate_v4(), 'import_stock', 'Import stock from file', section_id, 9 FROM permission_sections WHERE section_name = 'Stock Management'
UNION ALL
SELECT uuid_generate_v4(), 'export_stock', 'Export stock data', section_id, 10 FROM permission_sections WHERE section_name = 'Stock Management';

-- Section 5: Reports & Analytics
INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'view_dashboard', 'Access main dashboard', section_id, 1 FROM permission_sections WHERE section_name = 'Reports & Analytics'
UNION ALL
SELECT uuid_generate_v4(), 'view_sales_reports', 'View sales reports', section_id, 2 FROM permission_sections WHERE section_name = 'Reports & Analytics'
UNION ALL
SELECT uuid_generate_v4(), 'view_revenue_reports', 'View revenue reports', section_id, 3 FROM permission_sections WHERE section_name = 'Reports & Analytics'
UNION ALL
SELECT uuid_generate_v4(), 'view_profit_reports', 'View profit and margin reports', section_id, 4 FROM permission_sections WHERE section_name = 'Reports & Analytics'
UNION ALL
SELECT uuid_generate_v4(), 'view_inventory_reports', 'View inventory reports', section_id, 5 FROM permission_sections WHERE section_name = 'Reports & Analytics'
UNION ALL
SELECT uuid_generate_v4(), 'view_customer_reports', 'View customer analytics', section_id, 6 FROM permission_sections WHERE section_name = 'Reports & Analytics'
UNION ALL
SELECT uuid_generate_v4(), 'export_reports', 'Export reports to file', section_id, 7 FROM permission_sections WHERE section_name = 'Reports & Analytics'
UNION ALL
SELECT uuid_generate_v4(), 'print_reports', 'Print reports', section_id, 8 FROM permission_sections WHERE section_name = 'Reports & Analytics'
UNION ALL
SELECT uuid_generate_v4(), 'custom_report_filters', 'Use custom filters in reports', section_id, 9 FROM permission_sections WHERE section_name = 'Reports & Analytics';

-- Section 6: Payment Types
INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'view_payment_types', 'View payment types', section_id, 1 FROM permission_sections WHERE section_name = 'Payment Types'
UNION ALL
SELECT uuid_generate_v4(), 'add_payment_type', 'Add new payment types', section_id, 2 FROM permission_sections WHERE section_name = 'Payment Types'
UNION ALL
SELECT uuid_generate_v4(), 'edit_payment_type', 'Edit payment types', section_id, 3 FROM permission_sections WHERE section_name = 'Payment Types'
UNION ALL
SELECT uuid_generate_v4(), 'delete_payment_type', 'Delete payment types', section_id, 4 FROM permission_sections WHERE section_name = 'Payment Types'
UNION ALL
SELECT uuid_generate_v4(), 'set_default_payment', 'Set default payment type', section_id, 5 FROM permission_sections WHERE section_name = 'Payment Types';

-- Section 7: User Management
INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'view_users', 'View system users', section_id, 1 FROM permission_sections WHERE section_name = 'User Management'
UNION ALL
SELECT uuid_generate_v4(), 'add_user', 'Add new users', section_id, 2 FROM permission_sections WHERE section_name = 'User Management'
UNION ALL
SELECT uuid_generate_v4(), 'edit_user', 'Edit user information', section_id, 3 FROM permission_sections WHERE section_name = 'User Management'
UNION ALL
SELECT uuid_generate_v4(), 'delete_user', 'Delete users', section_id, 4 FROM permission_sections WHERE section_name = 'User Management'
UNION ALL
SELECT uuid_generate_v4(), 'activate_deactivate_user', 'Activate or deactivate users', section_id, 5 FROM permission_sections WHERE section_name = 'User Management'
UNION ALL
SELECT uuid_generate_v4(), 'assign_permissions', 'Assign permissions to users', section_id, 6 FROM permission_sections WHERE section_name = 'User Management';

-- Section 8: System Settings
INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'view_settings', 'View system settings', section_id, 1 FROM permission_sections WHERE section_name = 'System Settings'
UNION ALL
SELECT uuid_generate_v4(), 'edit_company_settings', 'Edit company information', section_id, 2 FROM permission_sections WHERE section_name = 'System Settings'
UNION ALL
SELECT uuid_generate_v4(), 'edit_billing_settings', 'Edit billing configuration', section_id, 3 FROM permission_sections WHERE section_name = 'System Settings'
UNION ALL
SELECT uuid_generate_v4(), 'edit_tax_settings', 'Edit tax and GST settings', section_id, 4 FROM permission_sections WHERE section_name = 'System Settings'
UNION ALL
SELECT uuid_generate_v4(), 'edit_notification_settings', 'Edit notification preferences', section_id, 5 FROM permission_sections WHERE section_name = 'System Settings'
UNION ALL
SELECT uuid_generate_v4(), 'edit_theme_settings', 'Edit theme and appearance', section_id, 6 FROM permission_sections WHERE section_name = 'System Settings';

-- Section 9: Audit & Logs
INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'view_audit_logs', 'View audit trail logs', section_id, 1 FROM permission_sections WHERE section_name = 'Audit & Logs'
UNION ALL
SELECT uuid_generate_v4(), 'export_audit_logs', 'Export audit logs', section_id, 2 FROM permission_sections WHERE section_name = 'Audit & Logs'
UNION ALL
SELECT uuid_generate_v4(), 'view_system_logs', 'View system error logs', section_id, 3 FROM permission_sections WHERE section_name = 'Audit & Logs';

-- Section 10: System Administration (Super Admin Only)
INSERT INTO permissions (permission_id, permission_name, description, section_id, display_order)
SELECT uuid_generate_v4(), 'manage_clients', 'Manage client organizations', section_id, 1 FROM permission_sections WHERE section_name = 'System Administration'
UNION ALL
SELECT uuid_generate_v4(), 'system_backup', 'Create system backups', section_id, 2 FROM permission_sections WHERE section_name = 'System Administration'
UNION ALL
SELECT uuid_generate_v4(), 'system_restore', 'Restore from backups', section_id, 3 FROM permission_sections WHERE section_name = 'System Administration'
UNION ALL
SELECT uuid_generate_v4(), 'maintenance_mode', 'Enable maintenance mode', section_id, 4 FROM permission_sections WHERE section_name = 'System Administration';

-- Step 6: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_permissions_section_id ON permissions(section_id);
CREATE INDEX IF NOT EXISTS idx_permissions_section_order ON permissions(section_id, display_order);
CREATE INDEX IF NOT EXISTS idx_sections_display_order ON permission_sections(display_order);

-- Step 7: Verify the migration
SELECT
    ps.section_name,
    ps.display_order as section_order,
    COUNT(p.permission_id) as permission_count
FROM permission_sections ps
LEFT JOIN permissions p ON ps.section_id = p.section_id
GROUP BY ps.section_name, ps.display_order
ORDER BY ps.display_order;

-- Expected Result: 10 sections with total of 70 permissions
SELECT COUNT(*) as total_permissions FROM permissions;
SELECT COUNT(*) as total_sections FROM permission_sections;
