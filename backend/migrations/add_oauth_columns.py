"""
Migration: Add Google OAuth columns to users table
Date: 2026-03-02
Run: python -m migrations.add_oauth_columns [--sqlite] [--supabase] [--both]
"""
import os
import sys
import logging
from sqlalchemy import create_engine, text, inspect

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def column_exists(engine, table_name, column_name):
    return column_name in [c['name'] for c in inspect(engine).get_columns(table_name)]


def index_exists(engine, table_name, index_name):
    return index_name in [i['name'] for i in inspect(engine).get_indexes(table_name)]


def run_sqlite(sqlite_path=None):
    sqlite_path = sqlite_path or os.getenv('SQLITE_DB_PATH', os.path.expanduser('~/.mj-billing/local.db'))
    if not os.path.exists(sqlite_path):
        logger.error('SQLite DB not found: %s', sqlite_path)
        return False
    engine = create_engine(f'sqlite:///{sqlite_path}')
    with engine.connect() as conn:
        if not column_exists(engine, 'users', 'google_id'):
            conn.execute(text('ALTER TABLE users ADD COLUMN google_id VARCHAR(128) NULL'))
            conn.commit()
            logger.info('Added users.google_id')
        else:
            logger.info('users.google_id already exists — skipping')

        # SQLite does not support ADD CONSTRAINT UNIQUE via ALTER TABLE,
        # but a unique index achieves the same enforcement.
        if not index_exists(engine, 'users', 'ix_users_google_id'):
            conn.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_id ON users (google_id) WHERE google_id IS NOT NULL'))
            conn.commit()
            logger.info('Created unique index ix_users_google_id')
        else:
            logger.info('ix_users_google_id already exists — skipping')

        if not column_exists(engine, 'users', 'avatar_url'):
            conn.execute(text('ALTER TABLE users ADD COLUMN avatar_url VARCHAR(512) NULL'))
            conn.commit()
            logger.info('Added users.avatar_url')
        else:
            logger.info('users.avatar_url already exists — skipping')
    return True


def run_supabase(db_url=None):
    db_url = db_url or os.getenv('DB_URL')
    if not db_url:
        logger.error('No DB_URL set — cannot run Supabase migration')
        return False
    engine = create_engine(db_url, pool_pre_ping=True)
    with engine.connect() as conn:
        conn.execute(text('ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(128) NULL'))
        conn.execute(text(
            'CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_id '
            'ON users (google_id) WHERE google_id IS NOT NULL'
        ))
        conn.execute(text('ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(512) NULL'))
        conn.commit()
        logger.info('Added OAuth columns (Supabase)')
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
        print('Usage: python -m migrations.add_oauth_columns [--sqlite] [--supabase] [--both]')
        sys.exit(1)
