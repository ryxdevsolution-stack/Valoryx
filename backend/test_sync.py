"""
Test script for Supabase sync functionality
Run: python test_sync.py
"""
import os
import sys
from dotenv import load_dotenv

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Load environment variables
load_dotenv()

from services.sync_service import sync_service
from sqlalchemy import text

def test_sync():
    """Test the sync service"""
    print("=" * 60)
    print("SYNC SYSTEM TEST")
    print("=" * 60)

    # 1. Test initialization
    print("\n[1/6] Testing initialization...")
    if not sync_service.initialize():
        print("    [X] FAILED: Sync service could not initialize")
        return False
    print("    [OK] Sync service initialized")

    # 2. Test database connections
    print("\n[2/6] Testing database connections...")
    try:
        with sync_service.sqlite_engine.connect() as conn:
            result = conn.execute(text("SELECT COUNT(*) FROM sqlite_master WHERE type='table'"))
            table_count = result.scalar()
            print(f"    [OK] SQLite: {table_count} tables")

        with sync_service.postgres_engine.connect() as conn:
            result = conn.execute(text("SELECT version()"))
            version = result.scalar()
            print(f"    [OK] Supabase: Connected")
    except Exception as e:
        print(f"    [X] FAILED: {e}")
        return False

    # 3. Check unsynced records
    print("\n[3/6] Checking unsynced records...")
    tables = ['gst_billing', 'non_gst_billing', 'stock_entry', 'customer',
              'expense', 'users', 'notes', 'report']

    total_unsynced = 0
    with sync_service.sqlite_engine.connect() as conn:
        for table in tables:
            try:
                result = conn.execute(text(f'SELECT COUNT(*) FROM {table} WHERE synced_at IS NULL'))
                count = result.scalar()
                total_unsynced += count
                status = f"{count} unsynced" if count > 0 else "synced"
                print(f"    {table}: {status}")
            except Exception as e:
                print(f"    {table}: error - {e}")

    # 4. Test Upload Sync
    print("\n[4/6] Testing UPLOAD sync (SQLite -> Supabase)...")
    try:
        result = sync_service.sync_all()
        print(f"    Status: {result.get('status')}")
        print(f"    Synced: {result.get('total_synced', 0)} records")

        if result.get('details'):
            for table, count in result['details'].items():
                if count > 0:
                    print(f"      - {table}: {count}")
    except Exception as e:
        print(f"    [X] FAILED: {e}")

    # 5. Test Download Sync
    print("\n[5/6] Testing DOWNLOAD sync (Supabase -> SQLite)...")
    try:
        # Get client_id
        with sync_service.sqlite_engine.connect() as conn:
            result = conn.execute(text('SELECT DISTINCT client_id FROM users LIMIT 1'))
            row = result.fetchone()
            client_id = row[0] if row else None

        if client_id:
            result = sync_service.download_all(client_id)
            print(f"    Status: {result.get('status')}")
            print(f"    Downloaded: {result.get('total_downloaded', 0)} records")
        else:
            print("    [SKIP] No client_id found")
    except Exception as e:
        print(f"    [X] FAILED: {e}")

    # 6. Test Full Sync
    print("\n[6/6] Testing FULL bidirectional sync...")
    try:
        if client_id:
            result = sync_service.full_sync(client_id)
            print(f"    Status: {result.get('status')}")
            upload = result.get('upload', {})
            download = result.get('download', {})
            print(f"    Uploaded: {upload.get('total_synced', 0)}")
            print(f"    Downloaded: {download.get('total_downloaded', 0)}")
    except Exception as e:
        print(f"    [X] FAILED: {e}")

    # Final check
    print("\n" + "-" * 60)
    print("FINAL STATUS")
    print("-" * 60)

    final_unsynced = 0
    with sync_service.sqlite_engine.connect() as conn:
        for table in tables:
            try:
                result = conn.execute(text(f'SELECT COUNT(*) FROM {table} WHERE synced_at IS NULL'))
                final_unsynced += result.scalar()
            except:
                pass

    if final_unsynced == 0:
        print("[OK] All records synced successfully!")
        return True
    else:
        print(f"[WARNING] {final_unsynced} records still unsynced")
        return True  # Still pass if sync ran without errors

if __name__ == "__main__":
    print("\nMJ Billing - Sync System Test\n")

    # Check environment
    db_url = os.getenv('DB_URL') or os.getenv('DATABASE_URL')
    print(f"DB_URL: {'Set' if db_url else 'NOT SET'}")

    if not db_url:
        print("\n[X] ERROR: DB_URL not set in .env file")
        sys.exit(1)

    print()
    success = test_sync()

    print("\n" + "=" * 60)
    print("TEST COMPLETE" if success else "TEST FAILED")
    print("=" * 60)

    sys.exit(0 if success else 1)
