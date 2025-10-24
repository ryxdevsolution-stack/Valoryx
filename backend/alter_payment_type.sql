-- Migration: Change payment_type from UUID foreign key to VARCHAR
-- This allows storing payment methods as simple strings (cash, upi, card)

-- Drop foreign key constraints first
ALTER TABLE gst_billing
DROP CONSTRAINT IF EXISTS gst_billing_payment_type_fkey;

ALTER TABLE non_gst_billing
DROP CONSTRAINT IF EXISTS non_gst_billing_payment_type_fkey;

-- Alter column type to VARCHAR(50)
ALTER TABLE gst_billing
ALTER COLUMN payment_type TYPE VARCHAR(50);

ALTER TABLE non_gst_billing
ALTER COLUMN payment_type TYPE VARCHAR(50);

-- Verification
SELECT
    'gst_billing' as table_name,
    column_name,
    data_type,
    character_maximum_length
FROM information_schema.columns
WHERE table_name = 'gst_billing' AND column_name = 'payment_type'
UNION ALL
SELECT
    'non_gst_billing' as table_name,
    column_name,
    data_type,
    character_maximum_length
FROM information_schema.columns
WHERE table_name = 'non_gst_billing' AND column_name = 'payment_type';
