#!/usr/bin/env python3
"""
Direct database script to add granular permissions
This script connects directly to PostgreSQL without Flask dependencies
"""

import psycopg2
import uuid
from datetime import datetime
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Get database connection details
DB_URL = os.getenv('DB_URL')

# Comprehensive granular permissions
granular_permissions = [
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

def main():
    print("=" * 70)
    print("Granular Permissions Migration")
    print("=" * 70)
    print()

    try:
        # Connect to database
        print("Connecting to database...")
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        print("✓ Connected successfully")
        print()

        added_count = 0
        updated_count = 0

        print(f"Processing {len(granular_permissions)} permissions...")
        print()

        for perm_name, desc, category in granular_permissions:
            # Check if permission exists
            cur.execute(
                "SELECT permission_id FROM permissions WHERE permission_name = %s",
                (perm_name,)
            )
            existing = cur.fetchone()

            if not existing:
                # Insert new permission
                permission_id = str(uuid.uuid4())
                cur.execute("""
                    INSERT INTO permissions (permission_id, permission_name, description, category, created_at)
                    VALUES (%s, %s, %s, %s, %s)
                """, (
                    permission_id,
                    perm_name,
                    desc,
                    category,
                    datetime.utcnow()
                ))
                added_count += 1
                print(f"  ✓ Added: {perm_name}")
            else:
                # Update existing permission
                cur.execute("""
                    UPDATE permissions
                    SET description = %s, category = %s
                    WHERE permission_name = %s
                """, (desc, category, perm_name))
                updated_count += 1

        # Commit changes
        conn.commit()
        print()
        print("=" * 70)
        print(f"✓ Added {added_count} new permissions")
        print(f"✓ Updated {updated_count} existing permissions")
        print(f"✓ Total permissions in system: {len(granular_permissions)}")
        print("=" * 70)
        print()

        # Show category summary
        print("Permission Categories:")
        categories = {}
        for _, _, category in granular_permissions:
            categories[category] = categories.get(category, 0) + 1

        for cat, count in sorted(categories.items()):
            print(f"  - {cat}: {count} permissions")

        print()
        print("✅ Migration completed successfully!")
        print()
        print("Next steps:")
        print("1. Log in to the admin panel")
        print("2. Navigate to User Permissions")
        print("3. Assign granular permissions to users")

        # Close connection
        cur.close()
        conn.close()

    except Exception as e:
        print(f"❌ Error: {str(e)}")
        if conn:
            conn.rollback()
        return 1

    return 0

if __name__ == "__main__":
    exit(main())
