"""
Migration: Add TOTP 2FA columns to users table
Date: 2026-03-02
Run: python -m migrations.add_totp_columns [--sqlite] [--supabase] [--both]
"""
import os
import sys
import logging
from sqlalchemy import create_engine, text, inspect

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def column_exists(engine, table_name, column_name):
    return column_name in [c['name'] for c in inspect(engine).get_columns(table_name)]


def run_sqlite(sqlite_path=None):
    sqlite_path = sqlite_path or os.getenv('SQLITE_DB_PATH', os.path.expanduser('~/.mj-billing/local.db'))
    if not os.path.exists(sqlite_path):
        logger.error('SQLite DB not found: %s', sqlite_path)
        return False
    engine = create_engine(f'sqlite:///{sqlite_path}')
    with engine.connect() as conn:
        if not column_exists(engine, 'users', 'totp_secret'):
            conn.execute(text('ALTER TABLE users ADD COLUMN totp_secret VARCHAR(32) NULL'))
            conn.commit()
            logger.info('Added users.totp_secret')
        else:
            logger.info('users.totp_secret already exists — skipping')
        if not column_exists(engine, 'users', 'totp_enabled'):
            conn.execute(text('ALTER TABLE users ADD COLUMN totp_enabled BOOLEAN NOT NULL DEFAULT 0'))
            conn.commit()
            logger.info('Added users.totp_enabled')
        else:
            logger.info('users.totp_enabled already exists — skipping')
    return True


def run_supabase(db_url=None):
    db_url = db_url or os.getenv('DB_URL')
    if not db_url:
        logger.error('No DB_URL set — cannot run Supabase migration')
        return False
    engine = create_engine(db_url, pool_pre_ping=True)
    with engine.connect() as conn:
        conn.execute(text('ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(32) NULL'))
        conn.execute(text('ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE'))
        conn.commit()
        logger.info('Added TOTP columns (Supabase)')
    return True


if __name__ == '__main__':
    env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, _, v = line.partition('=')
                    os.environ.setdefault(k.strip(), v.strip())

    args = sys.argv[1:]
    if not args or '--both' in args:
        run_sqlite()
        run_supabase()
    elif '--sqlite' in args:
        run_sqlite()
    elif '--supabase' in args:
        run_supabase()
    else:
        print('Usage: python -m migrations.add_totp_columns [--sqlite] [--supabase] [--both]')
        sys.exit(1)
