"""
Migration: Create permission_presets table
Run once: python migrations/add_permission_presets.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from extensions import db
from app import create_app


def run():
    app = create_app()
    with app.app_context():
        dialect = db.engine.dialect.name

        if dialect == 'sqlite':
            raw = db.engine.raw_connection()
            try:
                cur = raw.cursor()
                cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='permission_presets'")
                if cur.fetchone():
                    print("[SKIP] permission_presets table already exists (SQLite)")
                else:
                    cur.execute("""
                        CREATE TABLE permission_presets (
                            preset_id TEXT PRIMARY KEY,
                            client_id TEXT NOT NULL REFERENCES client_entry(client_id) ON DELETE CASCADE,
                            role VARCHAR(50) NOT NULL,
                            permissions TEXT NOT NULL,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
                            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            updated_by TEXT REFERENCES users(user_id) ON DELETE SET NULL,
                            UNIQUE(client_id, role)
                        )
                    """)
                    cur.execute("CREATE INDEX idx_preset_client_role ON permission_presets(client_id, role)")
                    raw.commit()
                    print("[OK] Created permission_presets table (SQLite)")
            finally:
                raw.close()

        else:
            with db.engine.connect() as conn:
                result = conn.execute(db.text(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_name='permission_presets'"
                ))
                if result.fetchone():
                    print("[SKIP] permission_presets table already exists (PostgreSQL)")
                else:
                    conn.execute(db.text("""
                        CREATE TABLE permission_presets (
                            preset_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                            client_id UUID NOT NULL REFERENCES client_entry(client_id) ON DELETE CASCADE,
                            role VARCHAR(50) NOT NULL,
                            permissions JSONB NOT NULL,
                            created_at TIMESTAMP DEFAULT NOW() NOT NULL,
                            updated_at TIMESTAMP DEFAULT NOW(),
                            updated_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
                            UNIQUE(client_id, role)
                        )
                    """))
                    conn.execute(db.text(
                        "CREATE INDEX idx_preset_client_role ON permission_presets(client_id, role)"
                    ))
                    conn.commit()
                    print("[OK] Created permission_presets table (PostgreSQL)")


def rollback():
    app = create_app()
    with app.app_context():
        dialect = db.engine.dialect.name
        if dialect == 'sqlite':
            raw = db.engine.raw_connection()
            try:
                raw.cursor().execute("DROP TABLE IF EXISTS permission_presets")
                raw.commit()
            finally:
                raw.close()
        else:
            with db.engine.connect() as conn:
                conn.execute(db.text("DROP TABLE IF EXISTS permission_presets"))
                conn.commit()
        print("[OK] Dropped permission_presets table")


if __name__ == '__main__':
    run()
