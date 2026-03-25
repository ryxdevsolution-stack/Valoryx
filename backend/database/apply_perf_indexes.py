"""
Apply performance indexes and SQLite PRAGMAs to the local database.
Run once after DB creation or migration: python -m database.apply_perf_indexes

Safe to re-run — uses IF NOT EXISTS and idempotent PRAGMA sets.
"""
import sqlite3
import os

# Support both legacy path and current path
_CANDIDATES = [
    os.getenv('SQLITE_DB_PATH', ''),
    os.path.expanduser('~/.mj-billing/local.db'),
    os.path.expanduser('~/.valoryx/local.db'),
]
DB_PATH = next((p for p in _CANDIDATES if p and os.path.exists(p)), None)

INDEXES = [
    # GSTBilling
    ('idx_gst_client_created',   'gst_billing',     'client_id, created_at'),
    ('idx_gst_client_billnum',   'gst_billing',     'client_id, bill_number'),
    ('idx_gst_client_createdby', 'gst_billing',     'client_id, created_by'),
    ('idx_gst_client_phone',     'gst_billing',     'client_id, customer_phone'),
    ('idx_gst_client_payment',   'gst_billing',     'client_id, payment_type'),
    # NonGSTBilling
    ('idx_nongst_client_created',   'non_gst_billing', 'client_id, created_at'),
    ('idx_nongst_client_billnum',   'non_gst_billing', 'client_id, bill_number'),
    ('idx_nongst_client_createdby', 'non_gst_billing', 'client_id, created_by'),
    ('idx_nongst_client_phone',     'non_gst_billing', 'client_id, customer_phone'),
    ('idx_nongst_client_payment',   'non_gst_billing', 'client_id, payment_type'),
    # StockEntry
    ('idx_stock_client_product',  'stock_entry', 'client_id, product_name'),
    ('idx_stock_client_itemcode', 'stock_entry', 'client_id, item_code'),
    ('idx_stock_client_barcode',  'stock_entry', 'client_id, barcode'),   # scanner lookup path
    # Customer
    ('idx_customer_client_phone',  'customer', 'client_id, customer_phone'),
    ('idx_customer_client_status', 'customer', 'client_id, status'),
    # Users — composite for role/soft-delete queries
    ('idx_users_client_role_deleted', 'users', 'client_id, role, deleted_at'),
    # Audit log — composite for client+user+time queries
    ('idx_audit_client_user_ts', 'audit_log', 'client_id, user_id, timestamp'),
]


def apply_pragmas(cursor):
    """Apply persistent + session PRAGMAs for maximum SQLite performance."""
    pragmas = [
        ("journal_mode", "WAL"),        # WAL: reads never block writes
        ("synchronous",  "NORMAL"),     # Safe with WAL; avoids full fsync per write
        ("cache_size",   "-32000"),     # 32 MB page cache (negative = KB)
        ("temp_store",   "MEMORY"),     # Temp tables/indexes in RAM
        ("mmap_size",    "268435456"),  # 256 MB memory-mapped I/O
        ("busy_timeout", "5000"),       # 5 s wait before SQLITE_BUSY error
        ("foreign_keys", "ON"),
        ("wal_autocheckpoint", "1000"), # Checkpoint every 1000 WAL pages
    ]
    for pragma, value in pragmas:
        cursor.execute(f"PRAGMA {pragma}={value}")
        result = cursor.fetchone()
        print(f"  PRAGMA {pragma} = {result[0] if result else value}")


def apply_indexes(cursor):
    for idx_name, table, columns in INDEXES:
        # Skip if table doesn't exist (future-proof)
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,)
        )
        if not cursor.fetchone():
            print(f"  ~ skip {idx_name} — table '{table}' not found")
            continue
        try:
            cursor.execute(
                f'CREATE INDEX IF NOT EXISTS {idx_name} ON {table} ({columns})'
            )
            print(f"  + {idx_name} on {table}({columns})")
        except Exception as e:
            print(f"  ! {idx_name} failed: {e}")


def run():
    if not DB_PATH:
        print("Database not found. Set SQLITE_DB_PATH or ensure ~/.mj-billing/local.db exists.")
        return

    print(f"Applying optimizations to: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    print("\n[PRAGMAs]")
    apply_pragmas(cursor)

    print("\n[Indexes]")
    apply_indexes(cursor)

    # Update query planner statistics
    print("\n[Stats]")
    cursor.execute("PRAGMA optimize")
    cursor.execute("ANALYZE")
    print("  ANALYZE complete — query planner stats updated")

    conn.commit()
    conn.close()
    print("\nDone.")


if __name__ == '__main__':
    run()
