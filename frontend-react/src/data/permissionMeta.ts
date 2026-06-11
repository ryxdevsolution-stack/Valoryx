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
  edit_bill_price_audit:    { icon: '🔧', example: 'Deprecated — audit corrections are now owner/manager only and cannot be granted via this permission.' },
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

  // Employees & Salary
  view_employees:        { icon: '👥', example: 'View the employee list and open any employee\'s profile.' },
  add_employee:          { icon: '➕', example: 'Onboard a new staff member with their job details.' },
  edit_employee:         { icon: '✏️', example: 'Update an employee\'s phone, salary, or job title.' },
  delete_employee:       { icon: '🗑️', example: 'Remove an employee (attendance/salary history is preserved).' },
  view_attendance:       { icon: '📅', example: 'See attendance records, check-in/check-out times, and absences.' },
  mark_attendance:       { icon: '⏰', example: 'Check employees in for the day or mark them as off.' },
  view_salary:           { icon: '💰', example: 'See the salary cycle, payment status, and advance history.' },
  manage_salary_cycles:  { icon: '📆', example: 'Open, freeze, or close a month\'s salary cycle for payroll.' },
  record_advance:        { icon: '💸', example: 'Record a cash advance given to an employee (deducted from salary).' },
  mark_salary_paid:      { icon: '✔️', example: 'Confirm an employee\'s salary for the cycle has been paid out.' },

  // Legacy / aliases
  manage_customers:         { icon: '👥', example: 'Legacy: combined create/edit/delete on customers — prefer granular perms.' },
  manage_payment_types:     { icon: '💳', example: 'Legacy: combined manage on payment types — prefer granular perms.' },
  manage_settings:          { icon: '⚙️', example: 'Legacy: combined manage on settings — prefer granular perms.' },
  manage_users:             { icon: '👥', example: 'Legacy: combined create/edit/delete on users — prefer granular perms.' },
  manage_permissions:       { icon: '🛡️', example: 'Legacy alias for assign_permissions — kept for backward compatibility.' },
}
