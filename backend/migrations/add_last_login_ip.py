"""
Migration: Add last_login_ip column to users table
Applies to: SQLite (offline) + Supabase (online)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv()


def migrate_sqlite():
    import sqlite3
    from sqlalchemy import inspect, create_engine

    db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'instance', 'billing.db')
    if not os.path.exists(db_path):
        print(f'[SQLite] DB not found at {db_path} — skipping')
        return

    engine = create_engine(f'sqlite:///{db_path}')
    inspector = inspect(engine)
    cols = [c['name'] for c in inspector.get_columns('users')]

    if 'last_login_ip' in cols:
        print('[SQLite] last_login_ip already exists — skipping')
        return

    conn = sqlite3.connect(db_path)
    conn.execute('ALTER TABLE users ADD COLUMN last_login_ip VARCHAR(45)')
    conn.commit()
    conn.close()
    print('[SQLite] Added last_login_ip column')


def migrate_supabase():
    db_url = os.getenv('DB_URL')
    if not db_url:
        print('[Supabase] DB_URL not set — skipping')
        return

    import psycopg2
    try:
        conn = psycopg2.connect(db_url, connect_timeout=10)
        cur = conn.cursor()
        cur.execute("""
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(45);
        """)
        conn.commit()
        cur.close()
        conn.close()
        print('[Supabase] Added last_login_ip column (or already existed)')
    except Exception as e:
        print(f'[Supabase] Error: {e}')


if __name__ == '__main__':
    print('Running migration: add_last_login_ip')
    migrate_sqlite()
    migrate_supabase()
    print('Done.')
