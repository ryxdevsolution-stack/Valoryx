-- Migration: Add synced_at and updated_at columns for SQLite-Supabase sync
-- Run this on Supabase/PostgreSQL database

-- ============================================
-- 1. PAYMENT_TYPE table
-- ============================================
ALTER TABLE payment_type ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE payment_type ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP WITH TIME ZONE NULL;

-- ============================================
-- 2. EXPENSE table
-- ============================================
ALTER TABLE expense ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP WITH TIME ZONE NULL;

-- ============================================
-- 3. EXPENSE_SUMMARY table
-- ============================================
ALTER TABLE expense_summary ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP WITH TIME ZONE NULL;

-- ============================================
-- 4. BULK_STOCK_ORDER table
-- ============================================
ALTER TABLE bulk_stock_order ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP WITH TIME ZONE NULL;

-- ============================================
-- 5. BULK_STOCK_ORDER_ITEM table
-- ============================================
ALTER TABLE bulk_stock_order_item ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE bulk_stock_order_item ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP WITH TIME ZONE NULL;

-- ============================================
-- 6. USERS table
-- ============================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP WITH TIME ZONE NULL;

-- ============================================
-- 7. REPORT table
-- ============================================
ALTER TABLE report ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE report ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP WITH TIME ZONE NULL;

-- ============================================
-- 8. NOTES table
-- ============================================
ALTER TABLE notes ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP WITH TIME ZONE NULL;

-- ============================================
-- 9. USER_PERMISSIONS table
-- ============================================
ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP WITH TIME ZONE NULL;

-- ============================================
-- 10. SYNC_METADATA table (new)
-- ============================================
CREATE TABLE IF NOT EXISTS sync_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES client_entry(client_id),
    table_name VARCHAR(100) NOT NULL,
    last_upload_time TIMESTAMP WITH TIME ZONE NULL,
    last_download_time TIMESTAMP WITH TIME ZONE NULL,
    last_full_sync_time TIMESTAMP WITH TIME ZONE NULL,
    records_uploaded INTEGER DEFAULT 0,
    records_downloaded INTEGER DEFAULT 0,
    last_upload_count INTEGER DEFAULT 0,
    last_download_count INTEGER DEFAULT 0,
    sync_status VARCHAR(50) DEFAULT 'idle',
    last_error TEXT NULL,
    last_error_time TIMESTAMP WITH TIME ZONE NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(client_id, table_name)
);

CREATE INDEX IF NOT EXISTS idx_sync_client_table ON sync_metadata(client_id, table_name);

-- ============================================
-- 11. SYNC_LOG table (new)
-- ============================================
CREATE TABLE IF NOT EXISTS sync_log (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES client_entry(client_id),
    sync_type VARCHAR(50) NOT NULL,
    table_name VARCHAR(100) NULL,
    direction VARCHAR(20) NOT NULL,
    records_processed INTEGER DEFAULT 0,
    records_success INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    status VARCHAR(50) NOT NULL,
    error_message TEXT NULL,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE NULL,
    duration_seconds INTEGER NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_log_client ON sync_log(client_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_time ON sync_log(started_at);

-- ============================================
-- 12. Update triggers for updated_at (optional but recommended)
-- ============================================

-- Create or replace the trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to payment_type
DROP TRIGGER IF EXISTS update_payment_type_updated_at ON payment_type;
CREATE TRIGGER update_payment_type_updated_at
    BEFORE UPDATE ON payment_type
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to bulk_stock_order_item
DROP TRIGGER IF EXISTS update_bulk_stock_order_item_updated_at ON bulk_stock_order_item;
CREATE TRIGGER update_bulk_stock_order_item_updated_at
    BEFORE UPDATE ON bulk_stock_order_item
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to report
DROP TRIGGER IF EXISTS update_report_updated_at ON report;
CREATE TRIGGER update_report_updated_at
    BEFORE UPDATE ON report
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to user_permissions
DROP TRIGGER IF EXISTS update_user_permissions_updated_at ON user_permissions;
CREATE TRIGGER update_user_permissions_updated_at
    BEFORE UPDATE ON user_permissions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to sync_metadata
DROP TRIGGER IF EXISTS update_sync_metadata_updated_at ON sync_metadata;
CREATE TRIGGER update_sync_metadata_updated_at
    BEFORE UPDATE ON sync_metadata
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
