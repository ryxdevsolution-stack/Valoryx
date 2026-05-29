-- v25: Add optional percentage discount columns (Supabase / Postgres side).
-- Mirrors backend/migrations/runner.py::_m025_discount_columns for SQLite.
--
-- purchase_discount_percentage — supplier discount; used for profit calc only (cost_price stays gross)
-- selling_discount_percentage  — customer discount; auto-fills the bill line in CreateBill
--
-- All nullable, default 0 — zero-risk to existing rows.

-- Product master (read at billing time)
ALTER TABLE stock_entry ADD COLUMN IF NOT EXISTS purchase_discount_percentage NUMERIC(5, 2) DEFAULT 0;
ALTER TABLE stock_entry ADD COLUMN IF NOT EXISTS selling_discount_percentage  NUMERIC(5, 2) DEFAULT 0;
COMMENT ON COLUMN stock_entry.purchase_discount_percentage IS 'Supplier discount %; profit calc only (cost_price stays gross)';
COMMENT ON COLUMN stock_entry.selling_discount_percentage  IS 'Customer discount %; auto-applies to the bill line';

-- Supplier delivery items (per-delivery history)
ALTER TABLE supplier_delivery_items ADD COLUMN IF NOT EXISTS purchase_discount_percentage NUMERIC(5, 2) DEFAULT 0;
ALTER TABLE supplier_delivery_items ADD COLUMN IF NOT EXISTS selling_discount_percentage  NUMERIC(5, 2) DEFAULT 0;

-- Bulk stock order items (per-order history)
ALTER TABLE bulk_stock_order_item ADD COLUMN IF NOT EXISTS purchase_discount_percentage NUMERIC(5, 2) DEFAULT 0;
ALTER TABLE bulk_stock_order_item ADD COLUMN IF NOT EXISTS selling_discount_percentage  NUMERIC(5, 2) DEFAULT 0;
