"""Add enhanced admin fields to users table"""

import os
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask
from extensions import db
from models.user_model import User
from config import Config
from sqlalchemy import text

def add_admin_user_fields():
    """Add new fields for enhanced admin system"""
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)

    with app.app_context():
        try:
            # Add new columns to users table - run each query separately with commit
            alter_queries = [
                ("ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255) DEFAULT ''", False),
                ("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20) DEFAULT ''", False),
                ("ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(100) DEFAULT ''", False),
                ("ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(user_id)", True),
                ("ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP", False),
                ("ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(user_id)", True),
                ("ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP", False)
            ]

            for query, needs_commit in alter_queries:
                try:
                    db.session.execute(text(query))
                    if needs_commit:
                        db.session.commit()
                    print(f"[OK] Executed: {query}")
                except Exception as e:
                    if 'already exists' in str(e).lower() or 'duplicate column' in str(e).lower():
                        print(f"[INFO] Column already exists: {query}")
                    else:
                        print(f"[ERROR] Error executing {query}: {e}")
                    db.session.rollback()

            # Final commit for non-committed queries
            try:
                db.session.commit()
            except:
                pass
            print("[SUCCESS] Admin user fields migration completed successfully")

            # Update existing super admin with full name
            super_admin_query = text("""
                UPDATE users
                SET full_name = 'System Administrator'
                WHERE is_super_admin = true
                AND (full_name IS NULL OR full_name = '')
            """)
            result = db.session.execute(super_admin_query)
            db.session.commit()

            if result.rowcount > 0:
                print(f"[SUCCESS] Updated {result.rowcount} super admin user(s) with default full name")

        except Exception as e:
            print(f"[ERROR] Migration failed: {e}")
            db.session.rollback()
            return False

    return True

if __name__ == "__main__":
    success = add_admin_user_fields()
    sys.exit(0 if success else 1)