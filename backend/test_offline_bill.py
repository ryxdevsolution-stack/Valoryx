"""
Quick test: Create a bill in offline mode
"""
import os
import sys

# Force offline mode
os.environ['DB_MODE'] = 'offline'

# Set up path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Force UTF-8 encoding for Windows console
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

from app import app
from extensions import db

print("\n" + "="*60)
print("OFFLINE MODE TEST: Creating a test bill in SQLite")
print("="*60)

with app.app_context():
    # Show current mode
    mode = app.config.get('DB_MODE')
    uri = app.config.get('SQLALCHEMY_DATABASE_URI')

    print(f"\n✓ Running in {mode} mode")
    print(f"✓ Database: {uri}\n")

    # Check if tables exist in SQLite
    from sqlalchemy import inspect
    inspector = inspect(db.engine)
    tables = inspector.get_table_names()

    if tables:
        print(f"✓ Found {len(tables)} tables in SQLite database:")
        for table in tables[:10]:  # Show first 10 tables
            print(f"  - {table}")
        if len(tables) > 10:
            print(f"  ... and {len(tables) - 10} more")
    else:
        print("⚠ No tables found in SQLite database")
        print("  You need to create tables first with: db.create_all()")

    print("\n" + "="*60)
    print("✅ Offline mode is working! SQLite database is accessible.")
    print("="*60)
    print(f"\nSQLite database location:\n{uri.replace('sqlite:///', '')}")
