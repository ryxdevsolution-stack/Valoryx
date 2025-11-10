"""
Migration: Add Permissions System
Description: Adds is_super_admin to users table and creates permission-related tables
Date: 2025-10-27
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import uuid
from datetime import datetime
from extensions import db
from models.user_model import User
from models.permission_model import Permission, UserPermission

def upgrade():
    """Add permission system to database"""

    # 1. Add is_super_admin column to users table if not exists
    with db.engine.connect() as conn:
        # Check if column exists
        result = conn.execute("""
            SELECT COUNT(*)
            FROM information_schema.columns
            WHERE table_name='users' AND column_name='is_super_admin'
        """)

        if result.scalar() == 0:
            conn.execute("""
                ALTER TABLE users
                ADD COLUMN is_super_admin BOOLEAN DEFAULT FALSE
            """)
            conn.commit()
            print("✓ Added is_super_admin column to users table")

    # 2. Create permissions table
    with db.engine.connect() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS permissions (
                permission_id VARCHAR(36) PRIMARY KEY,
                permission_name VARCHAR(100) UNIQUE NOT NULL,
                description VARCHAR(255),
                category VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
        print("✓ Created permissions table")

    # 3. Create user_permissions table
    with db.engine.connect() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_permissions (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                permission_id VARCHAR(36) NOT NULL,
                granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                granted_by VARCHAR(36),
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
                FOREIGN KEY (permission_id) REFERENCES permissions(permission_id) ON DELETE CASCADE,
                FOREIGN KEY (granted_by) REFERENCES users(user_id) ON DELETE SET NULL,
                UNIQUE KEY unique_user_permission (user_id, permission_id)
            )
        """)
        conn.commit()
        print("✓ Created user_permissions table")

    # 4. Seed granular permissions for complete control
    default_permissions = [
        # ==================== DASHBOARD PERMISSIONS ====================
        ('dashboard.view', 'View dashboard page', 'Dashboard'),
        ('dashboard.view_analytics', 'View analytics and charts', 'Dashboard'),
        ('dashboard.view_revenue', 'View revenue metrics', 'Dashboard'),
        ('dashboard.view_sales', 'View sales statistics', 'Dashboard'),
        ('dashboard.export_data', 'Export dashboard data', 'Dashboard'),

        # ==================== BILLING PERMISSIONS ====================
        # Bill Viewing
        ('billing.view', 'View bills list page', 'Billing - View'),
        ('billing.view_all', 'View all bills', 'Billing - View'),
        ('billing.view_own', 'View own created bills only', 'Billing - View'),
        ('billing.view_details', 'View bill details', 'Billing - View'),
        ('billing.search', 'Search and filter bills', 'Billing - View'),

        # Bill Creation
        ('billing.create', 'Access create bill page', 'Billing - Create'),
        ('billing.create_bill', 'Create new bills', 'Billing - Create'),
        ('billing.select_customer', 'Select customers for bills', 'Billing - Create'),
        ('billing.add_products', 'Add products to bills', 'Billing - Create'),
        ('billing.set_discount', 'Apply discounts to bills', 'Billing - Create'),
        ('billing.set_tax', 'Apply tax to bills', 'Billing - Create'),

        # Bill Editing
        ('billing.edit', 'Edit existing bills', 'Billing - Edit'),
        ('billing.edit_details', 'Edit bill details', 'Billing - Edit'),
        ('billing.edit_products', 'Edit products in bills', 'Billing - Edit'),
        ('billing.edit_amount', 'Edit bill amounts', 'Billing - Edit'),
        ('billing.edit_status', 'Change bill status', 'Billing - Edit'),

        # Bill Actions
        ('billing.delete', 'Delete bills', 'Billing - Actions'),
        ('billing.print', 'Print bills', 'Billing - Actions'),
        ('billing.download_pdf', 'Download bill as PDF', 'Billing - Actions'),
        ('billing.send_email', 'Email bills to customers', 'Billing - Actions'),
        ('billing.duplicate', 'Duplicate existing bills', 'Billing - Actions'),
        ('billing.mark_paid', 'Mark bills as paid', 'Billing - Actions'),
        ('billing.mark_cancelled', 'Cancel bills', 'Billing - Actions'),

        # ==================== CUSTOMER PERMISSIONS ====================
        # Customer Viewing
        ('customers.view', 'View customers page', 'Customers - View'),
        ('customers.view_all', 'View all customers', 'Customers - View'),
        ('customers.view_details', 'View customer details', 'Customers - View'),
        ('customers.search', 'Search and filter customers', 'Customers - View'),
        ('customers.view_history', 'View customer purchase history', 'Customers - View'),

        # Customer Management
        ('customers.create', 'Create new customers', 'Customers - Manage'),
        ('customers.edit', 'Edit customer information', 'Customers - Manage'),
        ('customers.delete', 'Delete customers', 'Customers - Manage'),
        ('customers.import', 'Import customers from file', 'Customers - Manage'),
        ('customers.export', 'Export customers to file', 'Customers - Manage'),

        # ==================== STOCK PERMISSIONS ====================
        # Stock Viewing
        ('stock.view', 'View stock page', 'Stock - View'),
        ('stock.view_all', 'View all stock items', 'Stock - View'),
        ('stock.view_details', 'View product details', 'Stock - View'),
        ('stock.search', 'Search and filter stock', 'Stock - View'),
        ('stock.view_levels', 'View stock levels', 'Stock - View'),
        ('stock.view_low_stock', 'View low stock alerts', 'Stock - View'),

        # Stock Management
        ('stock.create', 'Add new products', 'Stock - Manage'),
        ('stock.edit', 'Edit product information', 'Stock - Manage'),
        ('stock.edit_price', 'Edit product prices', 'Stock - Manage'),
        ('stock.edit_mrp', 'Edit product MRP', 'Stock - Manage'),
        ('stock.edit_cost', 'Edit product cost price', 'Stock - Manage'),
        ('stock.delete', 'Delete products', 'Stock - Manage'),
        ('stock.adjust_quantity', 'Adjust stock quantities', 'Stock - Manage'),
        ('stock.import', 'Import stock from file', 'Stock - Manage'),
        ('stock.export', 'Export stock to file', 'Stock - Manage'),

        # ==================== REPORTS PERMISSIONS ====================
        # Report Access
        ('reports.view', 'View reports page', 'Reports - Access'),
        ('reports.view_sales', 'View sales reports', 'Reports - Access'),
        ('reports.view_revenue', 'View revenue reports', 'Reports - Access'),
        ('reports.view_profit', 'View profit reports', 'Reports - Access'),
        ('reports.view_inventory', 'View inventory reports', 'Reports - Access'),
        ('reports.view_customer', 'View customer reports', 'Reports - Access'),

        # Report Actions
        ('reports.generate', 'Generate new reports', 'Reports - Actions'),
        ('reports.export', 'Export reports to file', 'Reports - Actions'),
        ('reports.print', 'Print reports', 'Reports - Actions'),
        ('reports.schedule', 'Schedule automated reports', 'Reports - Actions'),
        ('reports.custom_filters', 'Use custom date filters', 'Reports - Actions'),

        # ==================== AUDIT PERMISSIONS ====================
        ('audit.view', 'View audit logs page', 'Audit'),
        ('audit.view_all', 'View all audit logs', 'Audit'),
        ('audit.view_own', 'View own audit logs only', 'Audit'),
        ('audit.search', 'Search audit logs', 'Audit'),
        ('audit.export', 'Export audit logs', 'Audit'),

        # ==================== USER MANAGEMENT PERMISSIONS ====================
        # User Viewing
        ('users.view', 'View users page', 'Users - View'),
        ('users.view_all', 'View all users in organization', 'Users - View'),
        ('users.view_details', 'View user details', 'Users - View'),

        # User Management
        ('users.create', 'Create new users', 'Users - Manage'),
        ('users.edit', 'Edit user information', 'Users - Manage'),
        ('users.delete', 'Delete users', 'Users - Manage'),
        ('users.change_role', 'Change user roles', 'Users - Manage'),
        ('users.activate', 'Activate users', 'Users - Manage'),
        ('users.deactivate', 'Deactivate users', 'Users - Manage'),

        # ==================== PERMISSION MANAGEMENT ====================
        ('permissions.view', 'View permissions page', 'Permissions'),
        ('permissions.manage', 'Manage user permissions', 'Permissions'),
        ('permissions.grant', 'Grant permissions to users', 'Permissions'),
        ('permissions.revoke', 'Revoke permissions from users', 'Permissions'),
        ('permissions.view_all', 'View all available permissions', 'Permissions'),

        # ==================== CLIENT MANAGEMENT (Super Admin) ====================
        ('clients.view', 'View client management page', 'Clients - Super Admin'),
        ('clients.view_all', 'View all clients', 'Clients - Super Admin'),
        ('clients.create', 'Create new clients', 'Clients - Super Admin'),
        ('clients.edit', 'Edit client information', 'Clients - Super Admin'),
        ('clients.delete', 'Delete clients', 'Clients - Super Admin'),
        ('clients.activate', 'Activate clients', 'Clients - Super Admin'),
        ('clients.deactivate', 'Deactivate clients', 'Clients - Super Admin'),

        # ==================== SETTINGS PERMISSIONS ====================
        ('settings.view', 'View settings page', 'Settings'),
        ('settings.edit_company', 'Edit company information', 'Settings'),
        ('settings.edit_billing', 'Edit billing settings', 'Settings'),
        ('settings.edit_tax', 'Edit tax settings', 'Settings'),
        ('settings.edit_notifications', 'Edit notification settings', 'Settings'),
        ('settings.edit_theme', 'Edit theme settings', 'Settings'),

        # ==================== SYSTEM PERMISSIONS ====================
        ('system.backup', 'Create system backups', 'System'),
        ('system.restore', 'Restore from backups', 'System'),
        ('system.view_logs', 'View system logs', 'System'),
        ('system.maintenance', 'Access maintenance mode', 'System'),
    ]

    with db.engine.connect() as conn:
        for perm_name, desc, category in default_permissions:
            # Check if permission already exists
            result = conn.execute(
                "SELECT COUNT(*) FROM permissions WHERE permission_name = %s",
                (perm_name,)
            )

            if result.scalar() == 0:
                conn.execute("""
                    INSERT INTO permissions (permission_id, permission_name, description, category, created_at)
                    VALUES (%s, %s, %s, %s, %s)
                """, (
                    str(uuid.uuid4()),
                    perm_name,
                    desc,
                    category,
                    datetime.utcnow()
                ))

        conn.commit()
        print("✓ Seeded default permissions")

    # 5. Set first user as super admin (optional - you can manually set this)
    with db.engine.connect() as conn:
        # Get the first admin/owner user
        result = conn.execute("""
            SELECT user_id, email FROM users
            WHERE role IN ('admin', 'owner')
            ORDER BY created_at ASC
            LIMIT 1
        """)

        first_admin = result.fetchone()
        if first_admin:
            conn.execute("""
                UPDATE users
                SET is_super_admin = TRUE
                WHERE user_id = %s
            """, (first_admin[0],))
            conn.commit()
            print(f"✓ Set {first_admin[1]} as super admin")

    print("\n✅ Permission system migration completed successfully!")
    print("\nIMPORTANT: Remember to manually set is_super_admin=TRUE for RYX founder accounts in the database")

def downgrade():
    """Remove permission system from database"""
    with db.engine.connect() as conn:
        # Drop tables in reverse order due to foreign keys
        conn.execute("DROP TABLE IF EXISTS user_permissions")
        conn.execute("DROP TABLE IF EXISTS permissions")

        # Remove column from users table
        conn.execute("ALTER TABLE users DROP COLUMN IF EXISTS is_super_admin")

        conn.commit()
        print("✓ Removed permission system from database")

if __name__ == "__main__":
    print("Running permission system migration...")
    upgrade()