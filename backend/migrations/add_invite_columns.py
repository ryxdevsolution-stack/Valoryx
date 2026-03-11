"""
Migration: Add invite columns to users table
Date: 2026-03-02
Columns: invite_token (VARCHAR 64, indexed), invite_token_expires (TIMESTAMP), invite_accepted (BOOLEAN)
Run: python -m migrations.add_invite_columns [--sqlite] [--supabase] [--both]
"""
import os
import sys
import logging
from sqlalchemy import create_engine, text, inspect

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def column_exists(engine, table_name, column_name):
    inspector = inspect(engine)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def run_sqlite(sqlite_path=None):
    if sqlite_path is None:
        sqlite_path = os.getenv('SQLITE_DB_PATH', os.path.expanduser('~/.mj-billing/local.db'))

    logger.info('Running SQLite migration on: %s', sqlite_path)
    if not os.path.exists(sqlite_path):
        logger.error('SQLite database not found at: %s', sqlite_path)
        return False

    engine = create_engine(f'sqlite:///{sqlite_path}')
    with engine.connect() as conn:
        if not column_exists(engine, 'users', 'invite_token'):
            conn.execute(text('ALTER TABLE users ADD COLUMN invite_token VARCHAR(64) NULL'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS ix_users_invite_token ON users(invite_token)'))
            conn.commit()
            logger.info('Added users.invite_token')
        else:
            logger.info('users.invite_token already exists — skipping')

        if not column_exists(engine, 'users', 'invite_token_expires'):
            conn.execute(text('ALTER TABLE users ADD COLUMN invite_token_expires TIMESTAMP NULL'))
            conn.commit()
            logger.info('Added users.invite_token_expires')
        else:
            logger.info('users.invite_token_expires already exists — skipping')

        if not column_exists(engine, 'users', 'invite_accepted'):
            conn.execute(text('ALTER TABLE users ADD COLUMN invite_accepted BOOLEAN NOT NULL DEFAULT 0'))
            conn.commit()
            logger.info('Added users.invite_accepted')
        else:
            logger.info('users.invite_accepted already exists — skipping')

    logger.info('SQLite migration complete')
    return True


def run_supabase(db_url=None):
    if db_url is None:
        db_url = os.getenv('DB_URL')
    if not db_url:
        logger.error('No DB_URL found — set DB_URL in environment')
        return False

    logger.info('Running Supabase (PostgreSQL) migration')
    engine = create_engine(db_url, pool_pre_ping=True)
    with engine.connect() as conn:
        conn.execute(text('ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_token VARCHAR(64) NULL'))
        conn.execute(text('CREATE INDEX IF NOT EXISTS ix_users_invite_token ON users(invite_token)'))
        conn.execute(text('ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_token_expires TIMESTAMP WITH TIME ZONE NULL'))
        conn.execute(text('ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_accepted BOOLEAN NOT NULL DEFAULT FALSE'))
        conn.commit()
        logger.info('Added invite columns (invite_token, invite_token_expires, invite_accepted)')

    logger.info('Supabase migration complete')
    return True


if __name__ == '__main__':
    # Load .env manually so the script can run standalone
    env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, _, val = line.partition('=')
                    os.environ.setdefault(key.strip(), val.strip())

    args = sys.argv[1:]
    if not args or '--both' in args:
        run_sqlite()
        run_supabase()
    elif '--sqlite' in args:
        run_sqlite()
    elif '--supabase' in args:
        run_supabase()
    else:
        print('Usage: python -m migrations.add_invite_columns [--sqlite] [--supabase] [--both]')
        sys.exit(1)
