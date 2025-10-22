-- Migration: Create customer table with client_id isolation
-- Created: 2025-10-22
-- Description: Dedicated customer management table for better data organization

-- UP Migration
CREATE TABLE IF NOT EXISTS customer (
    customer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES client_entry(client_id) ON DELETE CASCADE,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL,
    customer_email VARCHAR(255),
    customer_address TEXT,
    customer_gstin VARCHAR(15),
    customer_city VARCHAR(100),
    customer_state VARCHAR(100),
    customer_pincode VARCHAR(10),
    total_bills INTEGER DEFAULT 0,
    total_spent DECIMAL(15, 2) DEFAULT 0.00,
    last_purchase_date TIMESTAMP,
    first_purchase_date TIMESTAMP,
    status VARCHAR(20) CHECK (status IN ('active', 'inactive')) DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_customer_client_id ON customer(client_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_client_phone ON customer(client_id, customer_phone);
CREATE INDEX IF NOT EXISTS idx_customer_name ON customer(client_id, customer_name);
CREATE INDEX IF NOT EXISTS idx_customer_status ON customer(client_id, status);
CREATE INDEX IF NOT EXISTS idx_customer_last_purchase ON customer(client_id, last_purchase_date);

-- Add comments
COMMENT ON TABLE customer IS 'Customer master data - centralized customer management';
COMMENT ON COLUMN customer.client_id IS 'MANDATORY - Customer isolation per client';
COMMENT ON COLUMN customer.customer_phone IS 'Unique identifier per client - used for bill creation';
COMMENT ON COLUMN customer.total_bills IS 'Auto-updated count of bills';
COMMENT ON COLUMN customer.total_spent IS 'Auto-updated total spent amount';
COMMENT ON COLUMN customer.last_purchase_date IS 'Auto-updated from latest bill';
COMMENT ON COLUMN customer.status IS 'active = purchased in last 30 days, inactive = no recent purchases';

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_customer_updated_at
    BEFORE UPDATE ON customer
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE customer ENABLE ROW LEVEL SECURITY;

-- Create RLS policy
CREATE POLICY customer_client_isolation ON customer
    FOR ALL
    USING (client_id = current_setting('app.current_client_id')::UUID);

-- DOWN Migration (Rollback)
-- DROP POLICY IF EXISTS customer_client_isolation ON customer;
-- DROP TRIGGER IF EXISTS update_customer_updated_at ON customer;
-- DROP INDEX IF EXISTS idx_customer_last_purchase;
-- DROP INDEX IF EXISTS idx_customer_status;
-- DROP INDEX IF EXISTS idx_customer_name;
-- DROP INDEX IF EXISTS idx_customer_client_phone;
-- DROP INDEX IF EXISTS idx_customer_client_id;
-- DROP TABLE IF EXISTS customer CASCADE;
