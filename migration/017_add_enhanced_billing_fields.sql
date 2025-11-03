-- Migration: Add Enhanced Billing Fields
-- Description: Adds support for customer GSTIN, multi-payment splits, received amount, and discount
-- Date: 2025-11-04

-- Add new columns to gst_billing table
ALTER TABLE gst_billing
ADD COLUMN IF NOT EXISTS customer_gstin VARCHAR(15),
ADD COLUMN IF NOT EXISTS amount_received NUMERIC(12, 2),
ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC(5, 2);

-- Change payment_type to TEXT to support JSON storage of payment splits
ALTER TABLE gst_billing
ALTER COLUMN payment_type TYPE TEXT;

-- Make customer_name nullable (optional for walk-in customers)
ALTER TABLE gst_billing
ALTER COLUMN customer_name DROP NOT NULL;

-- Add new columns to non_gst_billing table
ALTER TABLE non_gst_billing
ADD COLUMN IF NOT EXISTS customer_gstin VARCHAR(15),
ADD COLUMN IF NOT EXISTS amount_received NUMERIC(12, 2),
ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC(5, 2);

-- Change payment_type to TEXT to support JSON storage of payment splits
ALTER TABLE non_gst_billing
ALTER COLUMN payment_type TYPE TEXT;

-- Make customer_name nullable (optional for walk-in customers)
ALTER TABLE non_gst_billing
ALTER COLUMN customer_name DROP NOT NULL;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_gst_billing_customer_gstin ON gst_billing(customer_gstin);
CREATE INDEX IF NOT EXISTS idx_non_gst_billing_customer_gstin ON non_gst_billing(customer_gstin);

-- Add comments for documentation
COMMENT ON COLUMN gst_billing.customer_gstin IS 'Customer GST Identification Number (optional)';
COMMENT ON COLUMN gst_billing.amount_received IS 'Amount received from customer (for change calculation)';
COMMENT ON COLUMN gst_billing.discount_percentage IS 'Discount percentage applied to the bill';
COMMENT ON COLUMN gst_billing.payment_type IS 'JSON string of payment splits for multi-payment support';

COMMENT ON COLUMN non_gst_billing.customer_gstin IS 'Customer GST Identification Number (optional)';
COMMENT ON COLUMN non_gst_billing.amount_received IS 'Amount received from customer (for change calculation)';
COMMENT ON COLUMN non_gst_billing.discount_percentage IS 'Discount percentage applied to the bill';
COMMENT ON COLUMN non_gst_billing.payment_type IS 'JSON string of payment splits for multi-payment support';

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Migration 017 completed successfully: Enhanced billing fields added';
    RAISE NOTICE 'New features enabled:';
    RAISE NOTICE '  - Customer GSTIN field';
    RAISE NOTICE '  - Multi-payment split support (payment_type now stores JSON)';
    RAISE NOTICE '  - Amount received tracking';
    RAISE NOTICE '  - Discount percentage support';
    RAISE NOTICE '  - Optional customer name for walk-in customers';
END $$;
