-- =====================================================
-- CUSTOMER TABLE MIGRATION FOR SUPABASE
-- =====================================================
-- Run this in Supabase SQL Editor to add customer management
-- Created: 2025-10-22
-- =====================================================

-- Step 1: Create update_updated_at_column function (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Step 2: Create customer table
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

-- Step 3: Create indexes for customer table
CREATE INDEX IF NOT EXISTS idx_customer_client_id ON customer(client_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_client_phone ON customer(client_id, customer_phone);
CREATE INDEX IF NOT EXISTS idx_customer_name ON customer(client_id, customer_name);
CREATE INDEX IF NOT EXISTS idx_customer_status ON customer(client_id, status);
CREATE INDEX IF NOT EXISTS idx_customer_last_purchase ON customer(client_id, last_purchase_date);

-- Step 4: Add comments to customer table
COMMENT ON TABLE customer IS 'Customer master data - centralized customer management';
COMMENT ON COLUMN customer.client_id IS 'MANDATORY - Customer isolation per client';
COMMENT ON COLUMN customer.customer_phone IS 'Unique identifier per client - used for bill creation';
COMMENT ON COLUMN customer.total_bills IS 'Auto-updated count of bills';
COMMENT ON COLUMN customer.total_spent IS 'Auto-updated total spent amount';

-- Step 5: Create trigger for customer updated_at
CREATE TRIGGER update_customer_updated_at
    BEFORE UPDATE ON customer
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Step 6: Enable RLS for customer table
ALTER TABLE customer ENABLE ROW LEVEL SECURITY;

-- Step 7: Create RLS policy for customer
DROP POLICY IF EXISTS customer_client_isolation ON customer;
CREATE POLICY customer_client_isolation ON customer
    FOR ALL
    USING (client_id = current_setting('app.current_client_id', true)::UUID);

-- Step 8: Add customer fields to gst_billing table
ALTER TABLE gst_billing
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customer(customer_id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS customer_address TEXT,
ADD COLUMN IF NOT EXISTS customer_gstin VARCHAR(15);

-- Step 9: Add customer fields to non_gst_billing table
ALTER TABLE non_gst_billing
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customer(customer_id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS customer_address TEXT;

-- Step 10: Create indexes for billing customer_id
CREATE INDEX IF NOT EXISTS idx_gst_billing_customer_id ON gst_billing(customer_id);
CREATE INDEX IF NOT EXISTS idx_non_gst_billing_customer_id ON non_gst_billing(customer_id);

-- Step 11: Migrate existing customer data from billing tables to customer table
-- This creates customer records from existing bills
INSERT INTO customer (
    client_id,
    customer_name,
    customer_phone,
    customer_email,
    customer_address,
    customer_gstin,
    total_bills,
    total_spent,
    last_purchase_date,
    first_purchase_date,
    status,
    created_at
)
SELECT
    client_id,
    customer_name,
    customer_phone,
    MAX(customer_email) as customer_email,
    MAX(customer_address) as customer_address,
    MAX(customer_gstin) as customer_gstin,
    COUNT(*) as total_bills,
    SUM(final_amount) as total_spent,
    MAX(created_at) as last_purchase_date,
    MIN(created_at) as first_purchase_date,
    CASE
        WHEN MAX(created_at) >= NOW() - INTERVAL '30 days' THEN 'active'
        ELSE 'inactive'
    END as status,
    MIN(created_at) as created_at
FROM gst_billing
WHERE customer_phone IS NOT NULL
GROUP BY client_id, customer_name, customer_phone
ON CONFLICT (client_id, customer_phone) DO UPDATE SET
    customer_email = COALESCE(EXCLUDED.customer_email, customer.customer_email),
    customer_address = COALESCE(EXCLUDED.customer_address, customer.customer_address),
    customer_gstin = COALESCE(EXCLUDED.customer_gstin, customer.customer_gstin),
    total_bills = customer.total_bills + EXCLUDED.total_bills,
    total_spent = customer.total_spent + EXCLUDED.total_spent,
    last_purchase_date = GREATEST(customer.last_purchase_date, EXCLUDED.last_purchase_date),
    first_purchase_date = LEAST(customer.first_purchase_date, EXCLUDED.first_purchase_date);

-- Step 12: Add Non-GST customers
INSERT INTO customer (
    client_id,
    customer_name,
    customer_phone,
    customer_email,
    customer_address,
    total_bills,
    total_spent,
    last_purchase_date,
    first_purchase_date,
    status,
    created_at
)
SELECT
    client_id,
    customer_name,
    customer_phone,
    MAX(customer_email) as customer_email,
    MAX(customer_address) as customer_address,
    COUNT(*) as total_bills,
    SUM(total_amount) as total_spent,
    MAX(created_at) as last_purchase_date,
    MIN(created_at) as first_purchase_date,
    CASE
        WHEN MAX(created_at) >= NOW() - INTERVAL '30 days' THEN 'active'
        ELSE 'inactive'
    END as status,
    MIN(created_at) as created_at
FROM non_gst_billing
WHERE customer_phone IS NOT NULL
GROUP BY client_id, customer_name, customer_phone
ON CONFLICT (client_id, customer_phone) DO UPDATE SET
    customer_email = COALESCE(EXCLUDED.customer_email, customer.customer_email),
    customer_address = COALESCE(EXCLUDED.customer_address, customer.customer_address),
    total_bills = customer.total_bills + EXCLUDED.total_bills,
    total_spent = customer.total_spent + EXCLUDED.total_spent,
    last_purchase_date = GREATEST(customer.last_purchase_date, EXCLUDED.last_purchase_date),
    first_purchase_date = LEAST(customer.first_purchase_date, EXCLUDED.first_purchase_date);

-- Step 13: Update customer_id in gst_billing
UPDATE gst_billing gb
SET customer_id = c.customer_id
FROM customer c
WHERE gb.client_id = c.client_id
  AND gb.customer_phone = c.customer_phone
  AND gb.customer_id IS NULL;

-- Step 14: Update customer_id in non_gst_billing
UPDATE non_gst_billing ngb
SET customer_id = c.customer_id
FROM customer c
WHERE ngb.client_id = c.client_id
  AND ngb.customer_phone = c.customer_phone
  AND ngb.customer_id IS NULL;

-- =====================================================
-- MIGRATION COMPLETE!
-- =====================================================
-- You now have:
-- 1. ✅ customer table created
-- 2. ✅ Customer fields added to billing tables
-- 3. ✅ Existing customer data migrated
-- 4. ✅ Bills linked to customers
-- 5. ✅ Indexes and RLS policies configured
-- =====================================================

-- Verify migration:
SELECT 'Customer Table Count' as info, COUNT(*) as count FROM customer
UNION ALL
SELECT 'GST Bills with Customer' as info, COUNT(*) as count FROM gst_billing WHERE customer_id IS NOT NULL
UNION ALL
SELECT 'Non-GST Bills with Customer' as info, COUNT(*) as count FROM non_gst_billing WHERE customer_id IS NOT NULL;
