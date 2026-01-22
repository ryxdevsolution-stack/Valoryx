-- ================================================================
-- Mark Existing Supabase Records as Synced
-- Purpose: Prevent duplicate inserts for records already in Supabase
-- Date: 2026-01-18
-- ================================================================

-- IMPORTANT: Run this AFTER adding synced_at columns
-- This will mark all existing records in Supabase as "already synced"
-- so that sync service won't try to upload them again

-- ================================================================
-- Step 1: Mark all existing records in Supabase as synced
-- ================================================================

-- Mark existing GST bills as synced
UPDATE gst_billing
SET synced_at = CURRENT_TIMESTAMP
WHERE synced_at IS NULL;

-- Mark existing non-GST bills as synced
UPDATE non_gst_billing
SET synced_at = CURRENT_TIMESTAMP
WHERE synced_at IS NULL;

-- Mark existing stock entries as synced
UPDATE stock_entry
SET synced_at = CURRENT_TIMESTAMP
WHERE synced_at IS NULL;

-- Mark existing customers as synced
UPDATE customer
SET synced_at = CURRENT_TIMESTAMP
WHERE synced_at IS NULL;

-- ================================================================
-- Step 2: Verify - all records should now have synced_at set
-- ================================================================

SELECT
    'gst_billing' as table_name,
    COUNT(*) as total_records,
    COUNT(*) FILTER (WHERE synced_at IS NOT NULL) as synced_records,
    COUNT(*) FILTER (WHERE synced_at IS NULL) as unsynced_records
FROM gst_billing
UNION ALL
SELECT
    'non_gst_billing',
    COUNT(*),
    COUNT(*) FILTER (WHERE synced_at IS NOT NULL),
    COUNT(*) FILTER (WHERE synced_at IS NULL)
FROM non_gst_billing
UNION ALL
SELECT
    'stock_entry',
    COUNT(*),
    COUNT(*) FILTER (WHERE synced_at IS NOT NULL),
    COUNT(*) FILTER (WHERE synced_at IS NULL)
FROM stock_entry
UNION ALL
SELECT
    'customer',
    COUNT(*),
    COUNT(*) FILTER (WHERE synced_at IS NOT NULL),
    COUNT(*) FILTER (WHERE synced_at IS NULL)
FROM customer;

-- ================================================================
-- Expected output: unsynced_records should be 0 for all tables
-- ================================================================

-- ================================================================
-- IMPORTANT: What This Does
-- ================================================================
-- This marks ALL existing records in Supabase as "already synced"
--
-- After running this:
-- 1. Old data in Supabase won't be uploaded again (no duplicates)
-- 2. Only NEW data created in SQLite will be synced
-- 3. You can safely run sync without duplicate errors
--
-- If you want to re-sync specific records later:
-- UPDATE table_name SET synced_at = NULL WHERE condition;
-- ================================================================
