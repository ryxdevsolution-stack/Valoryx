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
  // Employees & Salary
  'view_employees', 'add_employee', 'edit_employee', 'delete_employee',
  'view_attendance', 'mark_attendance',
  'view_salary', 'manage_salary_cycles', 'record_advance', 'mark_salary_paid',
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
