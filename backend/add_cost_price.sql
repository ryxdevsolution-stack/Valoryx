-- Add cost_price column to stock_entry table for profit calculation
ALTER TABLE stock_entry ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10, 2);

-- Add comment to explain the field
COMMENT ON COLUMN stock_entry.cost_price IS 'Cost price of the product (purchase/manufacturing cost) used for profit calculation';
