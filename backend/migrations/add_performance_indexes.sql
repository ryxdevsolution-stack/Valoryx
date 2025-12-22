-- Performance Optimization Indexes for MJ-Billing Database
-- Run this migration to add indexes for faster queries

-- ============================================
-- STOCK_ENTRY TABLE INDEXES
-- ============================================

-- CRITICAL: Composite index for product_id lookups in billing (fixes N+1)
CREATE INDEX IF NOT EXISTS idx_stock_client_productid
ON stock_entry(client_id, product_id);

-- Composite index for client + product name lookups (for duplicate checking)
CREATE INDEX IF NOT EXISTS idx_stock_client_product
ON stock_entry(client_id, product_name);

-- Index for item code lookups
CREATE INDEX IF NOT EXISTS idx_stock_client_itemcode
ON stock_entry(client_id, item_code);

-- Index for barcode lookups (already unique, but add if missing)
CREATE INDEX IF NOT EXISTS idx_stock_barcode
ON stock_entry(barcode);

-- Index for category filtering
CREATE INDEX IF NOT EXISTS idx_stock_client_category
ON stock_entry(client_id, category);

-- Index for low stock queries
CREATE INDEX IF NOT EXISTS idx_stock_low_alert
ON stock_entry(client_id, quantity, low_stock_alert);

-- Index for product name search (prefix search)
CREATE INDEX IF NOT EXISTS idx_stock_product_name_pattern
ON stock_entry(product_name varchar_pattern_ops);

-- ============================================
-- GST_BILLING TABLE INDEXES
-- ============================================

-- Composite index for date range queries
CREATE INDEX IF NOT EXISTS idx_gst_client_created
ON gst_billing(client_id, created_at DESC);

-- Index for bill number lookups
CREATE INDEX IF NOT EXISTS idx_gst_client_billnum
ON gst_billing(client_id, bill_number DESC);

-- Index for customer searches
CREATE INDEX IF NOT EXISTS idx_gst_customer_name
ON gst_billing(client_id, customer_name);

-- Index for payment type analysis
CREATE INDEX IF NOT EXISTS idx_gst_payment_type
ON gst_billing(client_id, payment_type);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_gst_status
ON gst_billing(client_id, status);

-- Index for customer phone lookups (for customer list aggregation)
CREATE INDEX IF NOT EXISTS idx_gst_customer_phone
ON gst_billing(client_id, customer_phone);

-- Partial index for recent bills (last 30 days) - most frequently accessed
CREATE INDEX IF NOT EXISTS idx_gst_recent_bills
ON gst_billing(client_id, created_at DESC)
WHERE created_at > CURRENT_DATE - INTERVAL '30 days';

-- ============================================
-- NON_GST_BILLING TABLE INDEXES
-- ============================================

-- Composite index for date range queries
CREATE INDEX IF NOT EXISTS idx_nongst_client_created
ON non_gst_billing(client_id, created_at DESC);

-- Index for bill number lookups
CREATE INDEX IF NOT EXISTS idx_nongst_client_billnum
ON non_gst_billing(client_id, bill_number DESC);

-- Index for customer searches
CREATE INDEX IF NOT EXISTS idx_nongst_customer_name
ON non_gst_billing(client_id, customer_name);

-- Index for payment type analysis
CREATE INDEX IF NOT EXISTS idx_nongst_payment_type
ON non_gst_billing(client_id, payment_type);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_nongst_status
ON non_gst_billing(client_id, status);

-- Index for customer phone lookups (for customer list aggregation)
CREATE INDEX IF NOT EXISTS idx_nongst_customer_phone
ON non_gst_billing(client_id, customer_phone);

-- Partial index for recent bills (last 30 days)
CREATE INDEX IF NOT EXISTS idx_nongst_recent_bills
ON non_gst_billing(client_id, created_at DESC)
WHERE created_at > CURRENT_DATE - INTERVAL '30 days';

-- ============================================
-- JSONB INDEXES FOR ITEMS COLUMN
-- ============================================

-- GIN index for JSONB items column (for searching within items)
CREATE INDEX IF NOT EXISTS idx_gst_items_gin
ON gst_billing USING gin (items);

CREATE INDEX IF NOT EXISTS idx_nongst_items_gin
ON non_gst_billing USING gin (items);

-- ============================================
-- AUDIT_LOG TABLE INDEXES (if exists)
-- ============================================

-- Index for audit log queries
CREATE INDEX IF NOT EXISTS idx_audit_table_record
ON audit_log(table_name, record_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_user_action
ON audit_log(created_by, action_type, created_at DESC);

-- ============================================
-- USERS TABLE INDEXES
-- ============================================

-- Index for username lookups
CREATE INDEX IF NOT EXISTS idx_users_username
ON users(username);

-- Index for client_id filtering
CREATE INDEX IF NOT EXISTS idx_users_client
ON users(client_id);

-- ============================================
-- USER_PERMISSIONS TABLE INDEXES (for login)
-- ============================================

-- CRITICAL: Index for user permissions lookup during login
CREATE INDEX IF NOT EXISTS idx_user_permissions_user
ON user_permissions(user_id);

CREATE INDEX IF NOT EXISTS idx_user_permissions_perm
ON user_permissions(permission_id);

-- ============================================
-- PERFORMANCE OPTIMIZATION SETTINGS
-- ============================================

-- Analyze tables to update statistics for query planner
ANALYZE stock_entry;
ANALYZE gst_billing;
ANALYZE non_gst_billing;
ANALYZE users;

-- ============================================
-- CLEANUP AND MAINTENANCE
-- ============================================

-- Remove duplicate indexes if any exist
-- (PostgreSQL will automatically skip if index already exists with IF NOT EXISTS)

-- Reindex tables for better performance (run during maintenance window)
-- REINDEX TABLE stock_entry;
-- REINDEX TABLE gst_billing;
-- REINDEX TABLE non_gst_billing;

-- ============================================
-- MONITORING QUERIES
-- ============================================

-- Query to check index usage (run periodically)
/*
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan as index_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY idx_scan DESC;
*/

-- Query to find missing indexes
/*
SELECT
    schemaname,
    tablename,
    attname,
    n_distinct,
    correlation
FROM pg_stats
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
    AND n_distinct > 100
    AND correlation < 0.1
ORDER BY n_distinct DESC;
*/

-- ============================================
-- ROLLBACK SCRIPT (if needed)
-- ============================================

/*
-- To remove all indexes created by this migration:
DROP INDEX IF EXISTS idx_stock_client_product;
DROP INDEX IF EXISTS idx_stock_client_itemcode;
DROP INDEX IF EXISTS idx_stock_barcode;
DROP INDEX IF EXISTS idx_stock_client_category;
DROP INDEX IF EXISTS idx_stock_low_alert;
DROP INDEX IF EXISTS idx_stock_product_name_pattern;

DROP INDEX IF EXISTS idx_gst_client_created;
DROP INDEX IF EXISTS idx_gst_client_billnum;
DROP INDEX IF EXISTS idx_gst_customer_name;
DROP INDEX IF EXISTS idx_gst_payment_type;
DROP INDEX IF EXISTS idx_gst_status;
DROP INDEX IF EXISTS idx_gst_recent_bills;
DROP INDEX IF EXISTS idx_gst_items_gin;

DROP INDEX IF EXISTS idx_nongst_client_created;
DROP INDEX IF EXISTS idx_nongst_client_billnum;
DROP INDEX IF EXISTS idx_nongst_customer_name;
DROP INDEX IF EXISTS idx_nongst_payment_type;
DROP INDEX IF EXISTS idx_nongst_status;
DROP INDEX IF EXISTS idx_nongst_recent_bills;
DROP INDEX IF EXISTS idx_nongst_items_gin;

DROP INDEX IF EXISTS idx_audit_table_record;
DROP INDEX IF EXISTS idx_audit_user_action;
DROP INDEX IF EXISTS idx_users_username;
DROP INDEX IF EXISTS idx_users_client;
*/