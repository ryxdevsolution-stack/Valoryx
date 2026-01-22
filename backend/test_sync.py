"""
Test script for Supabase sync functionality
Run this to validate the sync implementation
"""
import os
import sys
from dotenv import load_dotenv

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Load environment variables
load_dotenv()

from services.sync_service import sync_service

def test_sync():
    """Test the sync service initialization and sync"""
    print("=" * 60)
    print("Testing Supabase Sync Service")
    print("=" * 60)

    # Test initialization
    print("\n[1/3] Testing initialization...")
    initialized = sync_service.initialize()

    if not initialized:
        print("[X] FAILED: Sync service could not initialize")
        print("   Possible reasons:")
        print("   - DB_URL not set in .env")
        print("   - Supabase connection failed")
        print("   - SQLite database not accessible")
        return False

    print("[OK] SUCCESS: Sync service initialized")

    # Test connection to both databases
    print("\n[2/3] Testing database connections...")
    try:
        from sqlalchemy import text

        # Test SQLite
        with sync_service.sqlite_engine.connect() as conn:
            result = conn.execute(text("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'"))
            table_count = list(result)[0][0]
            print(f"[OK] SQLite connected: {table_count} tables found")

        # Test PostgreSQL (Supabase)
        with sync_service.postgres_engine.connect() as conn:
            result = conn.execute(text("SELECT version()"))
            version = list(result)[0][0]
            print(f"[OK] PostgreSQL connected: {version[:50]}...")

    except Exception as e:
        print(f"[X] FAILED: Database connection error: {e}")
        return False

    # Test sync operation
    print("\n[3/3] Testing sync operation...")
    try:
        result = sync_service.sync_all()

        if result["status"] == "skipped":
            print(f"[WARNING]  SKIPPED: {result.get('reason', 'Unknown reason')}")
            return False

        if result["status"] == "failed":
            print(f"[X] FAILED: {result.get('error', 'Unknown error')}")
            return False

        print("[OK] SUCCESS: Sync completed")
        print(f"\n   Synced:")
        print(f"   - GST + Non-GST Bills: {result['synced']['bills']}")
        print(f"   - Stock entries: {result['synced']['stock']}")
        print(f"   - Customers: {result['synced']['customers']}")

        if result.get('errors'):
            print(f"\n   [WARNING]  Errors encountered:")
            for error in result['errors']:
                print(f"   - {error}")

        return True

    except Exception as e:
        print(f"[X] FAILED: Sync operation error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("\nMJ Billing - Supabase Sync Test\n")

    # Check environment variables
    print("Checking environment configuration...")
    db_url = os.getenv('DB_URL')
    db_mode = os.getenv('DB_MODE', 'offline')

    print(f"DB_MODE: {db_mode}")
    print(f"DB_URL: {'[OK] Set' if db_url else '[X] Not set'}")

    if not db_url:
        print("\n[X] ERROR: DB_URL is not set in .env file")
        print("   Please configure your Supabase PostgreSQL connection string")
        sys.exit(1)

    print()

    # Run test
    success = test_sync()

    print("\n" + "=" * 60)
    if success:
        print("[OK] All tests passed! Auto-upload to Supabase is working.")
    else:
        print("[X] Tests failed. Check the errors above.")
    print("=" * 60)

    sys.exit(0 if success else 1)
