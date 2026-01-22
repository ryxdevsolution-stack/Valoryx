-- ================================================================
-- Supabase Migration: Add synced_at column to all sync tables
-- Purpose: Track sync status from SQLite to Supabase
-- Date: 2026-01-18
-- ================================================================

-- Instructions:
-- 1. Open Supabase SQL Editor (https://app.supabase.com)
-- 2. Select your project
-- 3. Copy and paste this entire SQL script
-- 4. Click "Run" to execute
-- ================================================================

-- Add synced_at to gst_billing table
ALTER TABLE gst_billing
ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_gst_billing_synced_at
ON gst_billing(synced_at);

COMMENT ON COLUMN gst_billing.synced_at IS
'Timestamp when this record was last synced from local SQLite to Supabase';

-- ================================================================

-- Add synced_at to non_gst_billing table
ALTER TABLE non_gst_billing
ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_non_gst_billing_synced_at
ON non_gst_billing(synced_at);

COMMENT ON COLUMN non_gst_billing.synced_at IS
'Timestamp when this record was last synced from local SQLite to Supabase';

-- ================================================================

-- Add synced_at to stock_entry table
ALTER TABLE stock_entry
ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_stock_entry_synced_at
ON stock_entry(synced_at);

COMMENT ON COLUMN stock_entry.synced_at IS
'Timestamp when this record was last synced from local SQLite to Supabase';

-- ================================================================

-- Add synced_at to customer table
ALTER TABLE customer
ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_customer_synced_at
ON customer(synced_at);

COMMENT ON COLUMN customer.synced_at IS
'Timestamp when this record was last synced from local SQLite to Supabase';

-- ================================================================

-- Verify the columns were added
SELECT
    'gst_billing' as table_name,
    COUNT(*) FILTER (WHERE column_name = 'synced_at') as synced_at_exists
FROM information_schema.columns
WHERE table_name = 'gst_billing'
UNION ALL
SELECT
    'non_gst_billing',
    COUNT(*) FILTER (WHERE column_name = 'synced_at')
FROM information_schema.columns
WHERE table_name = 'non_gst_billing'
UNION ALL
SELECT
    'stock_entry',
    COUNT(*) FILTER (WHERE column_name = 'synced_at')
FROM information_schema.columns
WHERE table_name = 'stock_entry'
UNION ALL
SELECT
    'customer',
    COUNT(*) FILTER (WHERE column_name = 'synced_at')
FROM information_schema.columns
WHERE table_name = 'customer';

-- ================================================================
-- Expected output: All rows should show synced_at_exists = 1
-- ================================================================
