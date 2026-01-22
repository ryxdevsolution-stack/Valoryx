"""
Mark existing records in both SQLite and Supabase as synced
This prevents duplicate uploads for records that already exist in both databases
"""
import os
import sys
from datetime import datetime
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
load_dotenv()

from services.sync_service import sync_service
from sqlalchemy import text

def mark_existing_as_synced():
    """
    Mark all records that exist in both SQLite and Supabase as synced
    This prevents re-uploading existing data
    """
    print("\n" + "="*70)
    print("Marking Existing Records as Synced")
    print("="*70)
    print("\nThis will prevent duplicate uploads by marking existing records")
    print("as already synced in both SQLite and Supabase.\n")

    # Initialize sync service
    if not sync_service.initialize():
        print("[X] Failed to initialize sync service")
        return False

    print("[OK] Sync service initialized\n")

    # Process each table
    tables_to_sync = [
        {
            'name': 'gst_billing',
            'id_column': 'bill_id',
            'display_name': 'GST Bills'
        },
        {
            'name': 'non_gst_billing',
            'id_column': 'bill_id',
            'display_name': 'Non-GST Bills'
        },
        {
            'name': 'stock_entry',
            'id_column': 'product_id',
            'display_name': 'Stock Entries'
        },
        {
            'name': 'customer',
            'id_column': 'customer_id',
            'display_name': 'Customers'
        }
    ]

    total_marked = 0

    for table_info in tables_to_sync:
        table_name = table_info['name']
        id_column = table_info['id_column']
        display_name = table_info['display_name']

        print(f"[{display_name}]")
        print("-" * 70)

        try:
            # Get all IDs from Supabase
            with sync_service.postgres_engine.connect() as pg_conn:
                result = pg_conn.execute(text(f"""
                    SELECT {id_column} FROM {table_name}
                """))
                supabase_ids = [str(row[0]) for row in result]

            print(f"  Found {len(supabase_ids)} records in Supabase")

            if not supabase_ids:
                print(f"  [SKIP] No records in Supabase, nothing to mark\n")
                continue

            # Mark matching records in SQLite as synced
            placeholders = ','.join([f":id_{i}" for i in range(len(supabase_ids))])
            params = {"synced_at": datetime.utcnow().isoformat()}
            params.update({f"id_{i}": id_val for i, id_val in enumerate(supabase_ids)})

            with sync_service.sqlite_engine.connect() as sqlite_conn:
                # Count how many will be updated
                count_result = sqlite_conn.execute(text(f"""
                    SELECT COUNT(*) FROM {table_name}
                    WHERE {id_column} IN ({placeholders})
                    AND synced_at IS NULL
                """), params)
                count = count_result.fetchone()[0]

                if count == 0:
                    print(f"  [OK] All matching records already marked as synced\n")
                    continue

                # Update synced_at for matching records
                sqlite_conn.execute(text(f"""
                    UPDATE {table_name}
                    SET synced_at = :synced_at
                    WHERE {id_column} IN ({placeholders})
                    AND synced_at IS NULL
                """), params)
                sqlite_conn.commit()

                print(f"  [OK] Marked {count} records as synced in SQLite")
                total_marked += count

            # Also mark records in Supabase as synced
            with sync_service.postgres_engine.connect() as pg_conn:
                pg_conn.execute(text(f"""
                    UPDATE {table_name}
                    SET synced_at = CURRENT_TIMESTAMP
                    WHERE synced_at IS NULL
                """))
                pg_conn.commit()
                print(f"  [OK] Marked all records as synced in Supabase\n")

        except Exception as e:
            print(f"  [X] Error: {e}\n")
            import traceback
            traceback.print_exc()
            continue

    print("="*70)
    print(f"[OK] Complete! Marked {total_marked} total records as synced")
    print("="*70)
    print("\nWhat this means:")
    print("- Existing records won't be re-uploaded (no duplicates)")
    print("- Only NEW records will be synced from now on")
    print("- You can now safely run sync without duplicate errors")
    print("\nNext step: Run sync to upload any NEW records:")
    print("  curl -X POST http://localhost:5000/api/sync/trigger")
    print()

    return True

if __name__ == "__main__":
    success = mark_existing_as_synced()
    sys.exit(0 if success else 1)
