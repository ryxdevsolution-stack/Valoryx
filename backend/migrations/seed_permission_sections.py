"""
Seed permission_sections and link existing permissions to their sections.
Safe to run multiple times (idempotent) — uses ON CONFLICT DO NOTHING + UPDATE.

Cross-dialect SQL:
  - ON CONFLICT DO NOTHING works on PostgreSQL natively and on SQLite >= 3.24
    (which the project requires anyway). Replaces SQLite-only INSERT OR IGNORE.
  - CURRENT_TIMESTAMP is SQL-standard. Replaces SQLite-only datetime('now').
"""
from sqlalchemy import text
import uuid


SECTIONS = [
    ('Create Bill',           ['gst_billing', 'non_gst_billing', 'apply_discount', 'add_payment',
                               'select_customer', 'add_products', 'set_tax_rate']),
    ('Manage Bills',          ['view_all_bills', 'view_own_bills', 'edit_bill_details', 'delete_bills',
                               'print_bills', 'download_pdf', 'send_email', 'mark_paid',
                               'mark_cancelled', 'duplicate_bill', 'search_bills', 'show_no_exchange']),
    ('Customer Management',   ['view_customers', 'add_customer', 'edit_customer', 'delete_customer',
                               'view_purchase_history', 'import_customers', 'export_customers']),
    ('Stock Management',      ['view_stock', 'add_product', 'edit_product_details', 'edit_pricing',
                               'edit_cost_price', 'delete_product', 'adjust_quantity',
                               'view_low_stock_alerts', 'import_stock', 'export_stock']),
    ('Reports & Analytics',   ['view_dashboard', 'view_sales_reports', 'view_revenue_reports',
                               'view_profit_reports', 'view_inventory_reports', 'view_customer_reports',
                               'export_reports', 'print_reports', 'custom_report_filters']),
    ('Payment Types',         ['view_payment_types', 'add_payment_type', 'edit_payment_type',
                               'delete_payment_type', 'set_default_payment']),
    ('User Management',       ['view_users', 'add_user', 'edit_user', 'delete_user',
                               'activate_deactivate_user', 'assign_permissions']),
    ('System Settings',       ['view_settings', 'edit_company_settings', 'edit_billing_settings',
                               'edit_tax_settings', 'edit_notification_settings', 'edit_theme_settings']),
    ('Audit & Logs',          ['view_audit_logs', 'export_audit_logs', 'view_system_logs']),
    ('System Administration', ['manage_clients', 'system_backup', 'system_restore', 'maintenance_mode']),
    ('Bulk Orders',           ['view_bulk_orders', 'create_bulk_order', 'edit_bulk_order',
                               'delete_bulk_order', 'approve_bulk_order', 'receive_bulk_order']),
    ('Notes',                 ['view_notes', 'view_all_notes', 'create_notes', 'edit_notes', 'delete_notes']),
    ('Employees',             ['view_employees', 'add_employee', 'edit_employee', 'delete_employee',
                               'view_attendance', 'mark_attendance']),
    ('Payroll',               ['view_salary', 'manage_salary_cycles', 'record_advance', 'mark_salary_paid']),
    ('Expenses',              ['view_expenses', 'add_expense', 'edit_expense', 'delete_expense',
                               'manage_expense_categories']),
    ('Suppliers',             ['view_suppliers', 'add_supplier', 'edit_supplier', 'delete_supplier',
                               'manage_deliveries']),
    ('Branches',              ['view_branches', 'add_branch', 'edit_branch', 'delete_branch']),
    ('Stock Transfers',       ['view_stock_transfers', 'create_stock_transfer',
                               'approve_stock_transfer', 'receive_stock_transfer']),
    ('Shop Settings',         ['view_shop_settings', 'edit_shop_settings']),
]


def run(db):
    with db.engine.connect() as conn:
        added_sections = 0
        linked_perms = 0

        for i, (section_name, perm_names) in enumerate(SECTIONS):
            # Get existing section_id or create new one
            row = conn.execute(
                text("SELECT section_id FROM permission_sections WHERE section_name = :name"),
                {'name': section_name}
            ).fetchone()

            if row:
                section_id = str(row[0])
            else:
                section_id = str(uuid.uuid4())
                conn.execute(text(
                    "INSERT INTO permission_sections "
                    "(section_id, section_name, display_order, created_at) "
                    "VALUES (:id, :name, :order, CURRENT_TIMESTAMP) "
                    "ON CONFLICT DO NOTHING"
                ), {'id': section_id, 'name': section_name, 'order': i})
                added_sections += 1

            # Link all permissions in this section (update even if already assigned)
            for perm_name in perm_names:
                result = conn.execute(text(
                    "UPDATE permissions SET section_id = :sid "
                    "WHERE permission_name = :pname"
                ), {'sid': section_id, 'pname': perm_name})
                linked_perms += result.rowcount

        conn.commit()
        # Only log when something actually changed — avoids noisy "0 added, 80 linked" on every startup.
        # `linked_perms` increments on every UPDATE row matched (always > 0 once seeded), so it
        # is not a useful "did work happen?" signal. Use `added_sections` instead.
        if added_sections > 0:
            print(f"[Migration] permission_sections: {added_sections} section(s) added, {linked_perms} permission(s) linked")
