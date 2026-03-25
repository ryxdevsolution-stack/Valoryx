"""
One-shot fix: adds role_quotas column to client_entry in PostgreSQL.
Run once: python3 fix_role_quotas_column.py
Safe to run multiple times (checks if column already exists).
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app import app
from extensions import db
from sqlalchemy import text, inspect as sa_inspect

with app.app_context():
    inspector = sa_inspect(db.engine)
    try:
        cols = [c['name'] for c in inspector.get_columns('client_entry')]
    except Exception as e:
        print(f"✗ Could not read client_entry columns: {e}")
        sys.exit(1)

    if 'role_quotas' in cols:
        print("✓ role_quotas column already exists — nothing to do")
        sys.exit(0)

    dialect = db.engine.dialect.name
    col_type = 'JSONB' if dialect == 'postgresql' else 'TEXT'
    try:
        db.session.execute(text(
            f"ALTER TABLE client_entry ADD COLUMN role_quotas {col_type} NULL"
        ))
        db.session.commit()
        print(f"✓ role_quotas ({col_type}) column added to client_entry")
    except Exception as e:
        db.session.rollback()
        print(f"✗ Failed: {e}")
        sys.exit(1)
