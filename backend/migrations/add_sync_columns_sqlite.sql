-- Migration: Add synced_at and updated_at columns for SQLite-Supabase sync
-- Run this on SQLite database

-- ============================================
-- 1. PAYMENT_TYPE table
-- ============================================
ALTER TABLE payment_type ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE payment_type ADD COLUMN synced_at TIMESTAMP NULL;

-- ============================================
-- 2. EXPENSE table
-- ============================================
ALTER TABLE expense ADD COLUMN synced_at TIMESTAMP NULL;

-- ============================================
-- 3. EXPENSE_SUMMARY table
-- ============================================
ALTER TABLE expense_summary ADD COLUMN synced_at TIMESTAMP NULL;

-- ============================================
-- 4. BULK_STOCK_ORDER table
-- ============================================
ALTER TABLE bulk_stock_order ADD COLUMN synced_at TIMESTAMP NULL;

-- ============================================
-- 5. BULK_STOCK_ORDER_ITEM table
-- ============================================
ALTER TABLE bulk_stock_order_item ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE bulk_stock_order_item ADD COLUMN synced_at TIMESTAMP NULL;

-- ============================================
-- 6. USERS table
-- ============================================
ALTER TABLE users ADD COLUMN synced_at TIMESTAMP NULL;

-- ============================================
-- 7. REPORT table
-- ============================================
ALTER TABLE report ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE report ADD COLUMN synced_at TIMESTAMP NULL;

-- ============================================
-- 8. NOTES table
-- ============================================
ALTER TABLE notes ADD COLUMN synced_at TIMESTAMP NULL;

-- ============================================
-- 9. USER_PERMISSIONS table
-- ============================================
ALTER TABLE user_permissions ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE user_permissions ADD COLUMN synced_at TIMESTAMP NULL;

-- ============================================
-- 10. SYNC_METADATA table (new)
-- ============================================
CREATE TABLE IF NOT EXISTS sync_metadata (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    table_name TEXT NOT NULL,
    last_upload_time TIMESTAMP NULL,
    last_download_time TIMESTAMP NULL,
    last_full_sync_time TIMESTAMP NULL,
    records_uploaded INTEGER DEFAULT 0,
    records_downloaded INTEGER DEFAULT 0,
    last_upload_count INTEGER DEFAULT 0,
    last_download_count INTEGER DEFAULT 0,
    sync_status TEXT DEFAULT 'idle',
    last_error TEXT NULL,
    last_error_time TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(client_id, table_name),
    FOREIGN KEY (client_id) REFERENCES client_entry(client_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_client_table ON sync_metadata(client_id, table_name);

-- ============================================
-- 11. SYNC_LOG table (new)
-- ============================================
CREATE TABLE IF NOT EXISTS sync_log (
    log_id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    sync_type TEXT NOT NULL,
    table_name TEXT NULL,
    direction TEXT NOT NULL,
    records_processed INTEGER DEFAULT 0,
    records_success INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    status TEXT NOT NULL,
    error_message TEXT NULL,
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    duration_seconds INTEGER NULL,
    FOREIGN KEY (client_id) REFERENCES client_entry(client_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_log_client ON sync_log(client_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_time ON sync_log(started_at);
