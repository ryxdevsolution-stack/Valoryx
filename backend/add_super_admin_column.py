"""
Add is_super_admin column to users table
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from flask import Flask
from extensions import db
from config import Config
from sqlalchemy import text

def add_column():
    """Add is_super_admin column to users table"""

    # Create Flask app for context
    app = Flask(__name__)
    app.config.from_object(Config)

    # Initialize database
    db.init_app(app)

    with app.app_context():
        print("Adding is_super_admin column to users table...")

        try:
            # Add the column if it doesn't exist
            with db.engine.connect() as conn:
                # Check if column exists
                result = conn.execute(text("""
                    SELECT COUNT(*)
                    FROM information_schema.columns
                    WHERE table_name='users' AND column_name='is_super_admin'
                """))

                if result.scalar() == 0:
                    # Add the column
                    conn.execute(text("""
                        ALTER TABLE users
                        ADD COLUMN is_super_admin BOOLEAN DEFAULT FALSE
                    """))
                    conn.commit()
                    print("[OK] Added is_super_admin column to users table")

                    # Set first admin as super admin
                    conn.execute(text("""
                        UPDATE users
                        SET is_super_admin = TRUE
                        WHERE role IN ('admin', 'owner')
                        ORDER BY created_at
                        LIMIT 1
                    """))
                    conn.commit()
                    print("[OK] Set first admin user as super admin")
                else:
                    print("[OK] is_super_admin column already exists")

        except Exception as e:
            print(f"[ERROR] Failed to add column: {e}")
            return False

        print("\n[SUCCESS] Column added successfully!")
        return True

if __name__ == "__main__":
    add_column()