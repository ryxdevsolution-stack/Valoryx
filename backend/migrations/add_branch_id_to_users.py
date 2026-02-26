"""
Migration: Add branch_id column to users table
Run once: python migrations/add_branch_id_to_users.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from extensions import db
from app import create_app

def run():
    app = create_app()
    with app.app_context():
        with db.engine.connect() as conn:
            # SQLite / Supabase Postgres compatible check
            dialect = db.engine.dialect.name

            if dialect == 'sqlite':
                import sqlite3
                raw = db.engine.raw_connection()
                cur = raw.cursor()
                cur.execute("PRAGMA table_info(users)")
                cols = [row[1] for row in cur.fetchall()]
                if 'branch_id' not in cols:
                    cur.execute("ALTER TABLE users ADD COLUMN branch_id TEXT REFERENCES branches(branch_id)")
                    raw.commit()
                    print("[OK] Added branch_id to users (SQLite)")
                else:
                    print("[SKIP] branch_id already exists on users (SQLite)")
                raw.close()

            else:
                # PostgreSQL (Supabase)
                result = conn.execute(db.text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name='users' AND column_name='branch_id'"
                ))
                if not result.fetchone():
                    conn.execute(db.text(
                        "ALTER TABLE users ADD COLUMN branch_id UUID REFERENCES branches(branch_id)"
                    ))
                    conn.commit()
                    print("[OK] Added branch_id to users (PostgreSQL)")
                else:
                    print("[SKIP] branch_id already exists on users (PostgreSQL)")

if __name__ == '__main__':
    run()
