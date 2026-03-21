"""
Migration: Create user_sessions table
Date: 2026-03-02
Run: python -m migrations.add_sessions_table [--sqlite] [--supabase] [--both]
"""
import os
import sys
import logging
from sqlalchemy import create_engine, text, inspect

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def table_exists(engine, table_name):
    return table_name in inspect(engine).get_table_names()


def run_sqlite(sqlite_path=None):
    sqlite_path = sqlite_path or os.getenv('SQLITE_DB_PATH', os.path.expanduser('~/.valoryx/local.db'))
    if not os.path.exists(sqlite_path):
        logger.error('SQLite DB not found: %s', sqlite_path)
        return False
    engine = create_engine(f'sqlite:///{sqlite_path}')
    with engine.connect() as conn:
        if not table_exists(engine, 'user_sessions'):
            conn.execute(text("""
                CREATE TABLE user_sessions (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL UNIQUE,
                    user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                    client_id TEXT NOT NULL,
                    ip_address TEXT,
                    user_agent TEXT,
                    device TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP NOT NULL,
                    is_active BOOLEAN NOT NULL DEFAULT 1,
                    revoked_at TIMESTAMP
                )
            """))
            conn.execute(text('CREATE INDEX idx_sessions_user_id ON user_sessions(user_id)'))
            conn.execute(text('CREATE UNIQUE INDEX ix_sessions_session_id ON user_sessions(session_id)'))
            conn.commit()
            logger.info('Created user_sessions table (SQLite)')
        else:
            logger.info('user_sessions already exists — skipping')
    return True


def run_supabase(db_url=None):
    db_url = db_url or os.getenv('DB_URL')
    if not db_url:
        logger.error('No DB_URL found — set DB_URL in environment')
        return False
    engine = create_engine(db_url, pool_pre_ping=True)
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS user_sessions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                session_id VARCHAR(64) NOT NULL UNIQUE,
                user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                client_id UUID NOT NULL,
                ip_address VARCHAR(45),
                user_agent VARCHAR(512),
                device VARCHAR(100),
                created_at TIMESTAMPTZ DEFAULT NOW(),
                last_seen TIMESTAMPTZ DEFAULT NOW(),
                expires_at TIMESTAMPTZ NOT NULL,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                revoked_at TIMESTAMPTZ
            )
        """))
        conn.execute(text('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON user_sessions(user_id)'))
        conn.commit()
        logger.info('Created user_sessions table (Supabase)')
    return True


if __name__ == '__main__':
    # Load .env manually so the script can run standalone
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
        print('Usage: python -m migrations.add_sessions_table [--sqlite] [--supabase] [--both]')
        sys.exit(1)
