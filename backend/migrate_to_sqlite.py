"""
One-time data migration: Supabase (PostgreSQL) → SQLite
Run this ONCE to copy your existing data for offline mode
"""
import os
import sys

# Set up path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Force UTF-8 encoding for Windows console
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

from sqlalchemy import create_engine, text
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

print("\n" + "="*70)
print("DATA MIGRATION: Supabase (PostgreSQL) → SQLite")
print("="*70)

# Database connections
POSTGRES_URL = os.getenv('DB_URL')
SQLITE_PATH = os.getenv('SQLITE_DB_PATH', os.path.expanduser('~/.mj-billing/local.db'))
SQLITE_URL = f'sqlite:///{SQLITE_PATH}'

if not POSTGRES_URL:
    print("❌ Error: DB_URL not found in environment")
    sys.exit(1)

print(f"\n📍 Source: PostgreSQL (Supabase)")
print(f"📍 Target: SQLite at {SQLITE_PATH}\n")

# Create engines
pg_engine = create_engine(POSTGRES_URL)
sqlite_engine = create_engine(SQLITE_URL)

# Tables to migrate (in dependency order)
TABLES_TO_MIGRATE = [
    ('client_entry', 'client_id'),
    ('users', 'user_id'),
    ('stock_entry', 'product_id'),
    ('customer', 'customer_id'),
    ('payment_type', 'payment_type_id'),
    ('permission_sections', 'section_id'),
    ('permissions', 'permission_id'),
    ('user_permissions', 'id'),
    # Add bills if you want (could be large)
    # ('gst_billing', 'bill_id'),
    # ('non_gst_billing', 'bill_id'),
]

def migrate_table(table_name, primary_key):
    """Migrate a single table from PostgreSQL to SQLite"""
    print(f"📦 Migrating {table_name}...", end=" ")

    try:
        # Read from PostgreSQL
        with pg_engine.connect() as pg_conn:
            result = pg_conn.execute(text(f"SELECT * FROM {table_name}"))
            rows = result.fetchall()
            columns = result.keys()

        if not rows:
            print("⚠️  No data to migrate")
            return 0

        # Clear existing data in SQLite
        with sqlite_engine.connect() as sqlite_conn:
            sqlite_conn.execute(text(f"DELETE FROM {table_name}"))
            sqlite_conn.commit()

        # Insert into SQLite
        migrated = 0
        with sqlite_engine.connect() as sqlite_conn:
            for row in rows:
                # Build insert query
                cols = ', '.join(columns)
                placeholders = ', '.join([f':{col}' for col in columns])
                query = f"INSERT INTO {table_name} ({cols}) VALUES ({placeholders})"

                # Convert row to dict and handle type conversion
                row_dict = {}
                for col, val in zip(columns, row):
                    if val is None:
                        row_dict[col] = None
                    elif hasattr(val, 'hex'):  # UUID object
                        row_dict[col] = str(val)
                    elif isinstance(val, dict) or isinstance(val, list):  # JSON
                        import json
                        row_dict[col] = json.dumps(val)
                    else:
                        # Convert Decimal to float for SQLite
                        from decimal import Decimal
                        if isinstance(val, Decimal):
                            row_dict[col] = float(val)
                        else:
                            row_dict[col] = val

                try:
                    sqlite_conn.execute(text(query), row_dict)
                    migrated += 1
                except Exception as e:
                    print(f"\n  ⚠️  Skipped 1 row: {str(e)[:80]}")
                    continue

            sqlite_conn.commit()

        print(f"✅ {migrated} rows migrated")
        return migrated

    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return 0

def main():
    """Run the migration"""
    print("⚙️  Starting migration...\n")

    total_migrated = 0
    results = []

    for table_name, primary_key in TABLES_TO_MIGRATE:
        count = migrate_table(table_name, primary_key)
        total_migrated += count
        results.append((table_name, count))

    print("\n" + "="*70)
    print("MIGRATION SUMMARY")
    print("="*70)

    for table_name, count in results:
        status = "✅" if count > 0 else "⚠️ "
        print(f"{status} {table_name:25} {count:>6} rows")

    print(f"\n📊 Total: {total_migrated} rows migrated")

    print("\n" + "="*70)
    print("✅ MIGRATION COMPLETE!")
    print("="*70)
    print("\nNext steps:")
    print("1. Verify data in SQLite:")
    print(f"   sqlite3 {SQLITE_PATH}")
    print("2. Switch to offline mode in .env:")
    print("   # DB_MODE=online  (comment this out)")
    print("3. Restart backend - it will use SQLite\n")

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n❌ Migration cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
