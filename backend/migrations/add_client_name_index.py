"""
Migration: Add index on client_entry.client_name for faster duplicate lookups.
Run once: python migrations/add_client_name_index.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app
from extensions import db
from sqlalchemy import text

def up():
    with app.app_context():
        with db.engine.connect() as conn:
            # PostgreSQL / SQLite compatible — CREATE INDEX IF NOT EXISTS
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_client_entry_client_name "
                "ON client_entry (client_name)"
            ))
            conn.commit()
        print("✓ Index idx_client_entry_client_name created.")

def down():
    with app.app_context():
        with db.engine.connect() as conn:
            conn.execute(text("DROP INDEX IF EXISTS idx_client_entry_client_name"))
            conn.commit()
        print("✓ Index dropped.")

if __name__ == '__main__':
    up()
