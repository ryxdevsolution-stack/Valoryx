-- Migration: Add customer reference and additional fields to billing tables
-- Created: 2025-10-22
-- Description: Link billing tables to customer table and add missing customer fields

-- UP Migration

-- Add new columns to gst_billing table
ALTER TABLE gst_billing
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customer(customer_id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS customer_address TEXT,
ADD COLUMN IF NOT EXISTS customer_gstin VARCHAR(15);

-- Add new columns to non_gst_billing table
ALTER TABLE non_gst_billing
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customer(customer_id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS customer_address TEXT;

-- Create indexes for customer_id foreign keys
CREATE INDEX IF NOT EXISTS idx_gst_billing_customer_id ON gst_billing(customer_id);
CREATE INDEX IF NOT EXISTS idx_non_gst_billing_customer_id ON non_gst_billing(customer_id);

-- Add comments
COMMENT ON COLUMN gst_billing.customer_id IS 'Reference to customer table - Optional for backwards compatibility';
COMMENT ON COLUMN gst_billing.customer_email IS 'Customer email - duplicated from customer table for bill generation';
COMMENT ON COLUMN gst_billing.customer_address IS 'Customer address - duplicated for bill generation';
COMMENT ON COLUMN gst_billing.customer_gstin IS 'Customer GSTIN - required for GST bills';

COMMENT ON COLUMN non_gst_billing.customer_id IS 'Reference to customer table - Optional for backwards compatibility';
COMMENT ON COLUMN non_gst_billing.customer_email IS 'Customer email - duplicated from customer table for bill generation';
COMMENT ON COLUMN non_gst_billing.customer_address IS 'Customer address - duplicated for bill generation';

-- DOWN Migration (Rollback)
-- DROP INDEX IF EXISTS idx_non_gst_billing_customer_id;
-- DROP INDEX IF EXISTS idx_gst_billing_customer_id;
-- ALTER TABLE non_gst_billing DROP COLUMN IF EXISTS customer_address;
-- ALTER TABLE non_gst_billing DROP COLUMN IF EXISTS customer_email;
-- ALTER TABLE non_gst_billing DROP COLUMN IF EXISTS customer_id;
-- ALTER TABLE gst_billing DROP COLUMN IF EXISTS customer_gstin;
-- ALTER TABLE gst_billing DROP COLUMN IF EXISTS customer_address;
-- ALTER TABLE gst_billing DROP COLUMN IF EXISTS customer_email;
-- ALTER TABLE gst_billing DROP COLUMN IF EXISTS customer_id;
