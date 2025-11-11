-- Migration: Create stock_entry table with client_id isolation
-- Created: 2025-10-15
-- Description: Product inventory management with auto-sum and low stock alerts

-- UP Migration
CREATE TABLE IF NOT EXISTS stock_entry (
    product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES client_entry(client_id) ON DELETE CASCADE,
    product_name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    rate DECIMAL(10, 2) NOT NULL CHECK (rate >= 0),
    unit VARCHAR(20),
    low_stock_alert INTEGER,
    item_code VARCHAR(50),
    barcode VARCHAR(100),
    gst_percentage DECIMAL(5, 2),
    hsn_code VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_stock_client_id ON stock_entry(client_id);
CREATE INDEX IF NOT EXISTS idx_stock_product_name ON stock_entry(product_name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_client_product ON stock_entry(client_id, product_name);
CREATE INDEX IF NOT EXISTS idx_stock_low_alert ON stock_entry(client_id, quantity) WHERE quantity <= low_stock_alert;

-- Add comments
COMMENT ON TABLE stock_entry IS 'Product inventory with client isolation and auto-reduction on billing';
COMMENT ON COLUMN stock_entry.client_id IS 'MANDATORY - Stock isolated per client';
COMMENT ON COLUMN stock_entry.quantity IS 'Current available stock - reduces automatically on billing';
COMMENT ON COLUMN stock_entry.low_stock_alert IS 'Alert threshold when quantity falls below this value';

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_stock_entry_updated_at
    BEFORE UPDATE ON stock_entry
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE stock_entry ENABLE ROW LEVEL SECURITY;

-- Create RLS policy
CREATE POLICY stock_entry_client_isolation ON stock_entry
    FOR ALL
    USING (client_id = current_setting('app.current_client_id')::UUID);

-- DOWN Migration (Rollback)
-- DROP POLICY IF EXISTS stock_entry_client_isolation ON stock_entry;
-- DROP TRIGGER IF EXISTS update_stock_entry_updated_at ON stock_entry;
-- DROP FUNCTION IF EXISTS update_updated_at_column();
-- DROP INDEX IF EXISTS idx_stock_low_alert;
-- DROP INDEX IF EXISTS idx_stock_client_product;
-- DROP INDEX IF EXISTS idx_stock_product_name;
-- DROP INDEX IF EXISTS idx_stock_client_id;
-- DROP TABLE IF EXISTS stock_entry CASCADE;
