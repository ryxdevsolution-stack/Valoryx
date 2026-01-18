"""
Phase 1: Test script for dual database mode
Tests both online (PostgreSQL) and offline (SQLite) modes
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

def test_online_mode():
    """Test online mode (PostgreSQL)"""
    print("\n" + "="*60)
    print("TEST 1: Online Mode (PostgreSQL)")
    print("="*60)

    # Ensure DB_MODE is not set (will auto-detect)
    if 'DB_MODE' in os.environ:
        del os.environ['DB_MODE']

    from database.manager import DatabaseManager
    from config import get_database_mode, get_database_uri

    mode = get_database_mode()
    uri = get_database_uri()

    print(f"✓ Detected mode: {mode}")
    print(f"✓ Database URI: {uri[:50]}...")

    if mode != 'online':
        print("✗ FAILED: Expected 'online' mode")
        return False

    if 'postgresql' not in uri.lower():
        print("✗ FAILED: Expected PostgreSQL URI")
        return False

    print("✓ PASSED: Online mode configured correctly")
    return True


def test_offline_mode():
    """Test offline mode (SQLite)"""
    print("\n" + "="*60)
    print("TEST 2: Offline Mode (SQLite)")
    print("="*60)

    # Force offline mode
    os.environ['DB_MODE'] = 'offline'

    # Reload modules to pick up new environment
    import importlib
    import config
    import database.manager

    importlib.reload(config)
    importlib.reload(database.manager)

    from config import get_database_mode, get_database_uri

    mode = get_database_mode()
    uri = get_database_uri()

    print(f"✓ Detected mode: {mode}")
    print(f"✓ Database URI: {uri}")

    if mode != 'offline':
        print("✗ FAILED: Expected 'offline' mode")
        return False

    if 'sqlite' not in uri.lower():
        print("✗ FAILED: Expected SQLite URI")
        return False

    print("✓ PASSED: Offline mode configured correctly")
    return True


def test_db_mode_helper():
    """Test db_mode.py helper functions"""
    print("\n" + "="*60)
    print("TEST 3: Database Mode Helper Functions")
    print("="*60)

    # Test online mode
    os.environ['DB_MODE'] = 'online'

    import importlib
    import utils.db_mode
    importlib.reload(utils.db_mode)

    from utils.db_mode import is_online_mode, is_offline_mode, get_db_mode

    print("Testing with DB_MODE=online:")
    print(f"  is_online_mode(): {is_online_mode()}")
    print(f"  is_offline_mode(): {is_offline_mode()}")
    print(f"  get_db_mode(): {get_db_mode()}")

    if not is_online_mode() or is_offline_mode() or get_db_mode() != 'online':
        print("✗ FAILED: Online mode helpers returned wrong values")
        return False

    # Test offline mode
    os.environ['DB_MODE'] = 'offline'
    importlib.reload(utils.db_mode)
    from utils.db_mode import is_online_mode, is_offline_mode, get_db_mode

    print("\nTesting with DB_MODE=offline:")
    print(f"  is_online_mode(): {is_online_mode()}")
    print(f"  is_offline_mode(): {is_offline_mode()}")
    print(f"  get_db_mode(): {get_db_mode()}")

    if is_online_mode() or not is_offline_mode() or get_db_mode() != 'offline':
        print("✗ FAILED: Offline mode helpers returned wrong values")
        return False

    print("✓ PASSED: Helper functions work correctly")
    return True


def test_type_converter():
    """Test type conversion functions"""
    print("\n" + "="*60)
    print("TEST 4: Type Converter")
    print("="*60)

    from database.type_converters import TypeConverter
    from decimal import Decimal
    from datetime import datetime
    import uuid
    import json

    # Test UUID conversion
    test_uuid = uuid.uuid4()
    sqlite_uuid = TypeConverter.to_sqlite(test_uuid, 'UUID')
    print(f"✓ UUID to SQLite: {test_uuid} → {sqlite_uuid}")

    postgres_uuid = TypeConverter.from_sqlite(sqlite_uuid, 'UUID')
    print(f"✓ SQLite to UUID: {sqlite_uuid} → {postgres_uuid}")

    if postgres_uuid != test_uuid:
        print("✗ FAILED: UUID conversion mismatch")
        return False

    # Test NUMERIC conversion
    test_decimal = Decimal('123.45')
    sqlite_decimal = TypeConverter.to_sqlite(test_decimal, 'NUMERIC')
    print(f"✓ NUMERIC to SQLite: {test_decimal} → {sqlite_decimal}")

    postgres_decimal = TypeConverter.from_sqlite(sqlite_decimal, 'NUMERIC')
    print(f"✓ SQLite to NUMERIC: {sqlite_decimal} → {postgres_decimal}")

    if abs(float(postgres_decimal) - float(test_decimal)) > 0.001:
        print("✗ FAILED: NUMERIC conversion mismatch")
        return False

    # Test JSONB conversion
    test_json = {'key': 'value', 'number': 42}
    sqlite_json = TypeConverter.to_sqlite(test_json, 'JSONB')
    print(f"✓ JSONB to SQLite: {test_json} → {sqlite_json}")

    postgres_json = TypeConverter.from_sqlite(sqlite_json, 'JSONB')
    print(f"✓ SQLite to JSONB: {sqlite_json} → {postgres_json}")

    if postgres_json != test_json:
        print("✗ FAILED: JSONB conversion mismatch")
        return False

    # Test TIMESTAMP conversion
    test_timestamp = datetime.now()
    sqlite_timestamp = TypeConverter.to_sqlite(test_timestamp, 'TIMESTAMP')
    print(f"✓ TIMESTAMP to SQLite: {test_timestamp} → {sqlite_timestamp}")

    postgres_timestamp = TypeConverter.from_sqlite(sqlite_timestamp, 'TIMESTAMP')
    print(f"✓ SQLite to TIMESTAMP: {sqlite_timestamp} → {postgres_timestamp}")

    # Allow small difference due to microsecond precision
    if abs((postgres_timestamp - test_timestamp).total_seconds()) > 1:
        print("✗ FAILED: TIMESTAMP conversion mismatch")
        return False

    print("✓ PASSED: Type conversions work correctly")
    return True


def main():
    """Run all tests"""
    print("\n" + "="*60)
    print("PHASE 1: DUAL DATABASE MODE TESTS")
    print("="*60)

    results = []

    # Run tests
    results.append(("Online Mode", test_online_mode()))
    results.append(("Offline Mode", test_offline_mode()))
    results.append(("Helper Functions", test_db_mode_helper()))
    results.append(("Type Converter", test_type_converter()))

    # Print summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)

    passed = sum(1 for _, result in results if result)
    total = len(results)

    for name, result in results:
        status = "✓ PASSED" if result else "✗ FAILED"
        print(f"{status}: {name}")

    print(f"\nTotal: {passed}/{total} tests passed")

    if passed == total:
        print("\n🎉 All tests passed! Phase 1 dual database support is working correctly.")
        return 0
    else:
        print(f"\n❌ {total - passed} test(s) failed. Please review the errors above.")
        return 1


if __name__ == '__main__':
    sys.exit(main())
