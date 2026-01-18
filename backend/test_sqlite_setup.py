"""
Test SQLite table creation with flexible types
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
from sqlalchemy import inspect

print("\n" + "="*60)
print("TESTING SQLITE TABLE CREATION")
print("="*60)

with app.app_context():
    # Show current mode
    mode = app.config.get('DB_MODE')
    uri = app.config.get('SQLALCHEMY_DATABASE_URI')

    print(f"\n✓ Database Mode: {mode}")
    print(f"✓ Database URI: {uri}\n")

    # Create tables
    print("Creating tables...")
    try:
        db.create_all()
        print("✓ db.create_all() succeeded!\n")
    except Exception as e:
        print(f"✗ Error: {e}\n")
        sys.exit(1)

    # Check tables created
    inspector = inspect(db.engine)
    tables = inspector.get_table_names()

    print(f"✓ Created {len(tables)} tables in SQLite:\n")
    for table in sorted(tables):
        print(f"  - {table}")

    # Check specific table schema
    if 'gst_billing' in tables:
        print(f"\n✓ Checking gst_billing schema:")
        columns = inspector.get_columns('gst_billing')
        for col in columns:
            print(f"  - {col['name']:20} {col['type']}")

    print("\n" + "="*60)
    print("✅ SUCCESS! SQLite tables created with flexible types")
    print("="*60)
