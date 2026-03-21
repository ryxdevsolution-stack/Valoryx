"""
Apply performance indexes to existing SQLite database.
Run once: python -m database.apply_perf_indexes
"""
import sqlite3
import os

DB_PATH = os.path.expanduser('~/.valoryx/local.db')

INDEXES = [
    # GSTBilling indexes
    ('idx_gst_client_createdby', 'gst_billing', 'client_id, created_by'),
    ('idx_gst_client_phone', 'gst_billing', 'client_id, customer_phone'),
    ('idx_gst_client_payment', 'gst_billing', 'client_id, payment_type'),
    # NonGSTBilling indexes
    ('idx_nongst_client_createdby', 'non_gst_billing', 'client_id, created_by'),
    ('idx_nongst_client_phone', 'non_gst_billing', 'client_id, customer_phone'),
    ('idx_nongst_client_payment', 'non_gst_billing', 'client_id, payment_type'),
    # Customer indexes
    ('idx_customer_client_phone', 'customer', 'client_id, customer_phone'),
    ('idx_customer_client_status', 'customer', 'client_id, status'),
]


def apply_indexes():
    if not os.path.exists(DB_PATH):
        print(f'Database not found at {DB_PATH}')
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    for idx_name, table, columns in INDEXES:
        try:
            cursor.execute(f'CREATE INDEX IF NOT EXISTS {idx_name} ON {table} ({columns})')
            print(f'  + {idx_name} on {table}({columns})')
        except Exception as e:
            print(f'  ! {idx_name} failed: {e}')

    conn.commit()
    conn.close()
    print('Done — all performance indexes applied.')


if __name__ == '__main__':
    apply_indexes()
