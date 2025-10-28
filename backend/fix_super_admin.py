import sys
sys.path.append('.')

from flask import Flask
from extensions import db
from config import Config
from sqlalchemy import text

app = Flask(__name__)
app.config.from_object(Config)
db.init_app(app)

with app.app_context():
    with db.engine.connect() as conn:
        try:
            # Try to add the column
            conn.execute(text("ALTER TABLE users ADD COLUMN is_super_admin BOOLEAN DEFAULT FALSE"))
            conn.commit()
            print("Added is_super_admin column")
        except Exception as e:
            if "already exists" in str(e) or "duplicate column" in str(e):
                print("Column already exists")
            else:
                print(f"Error: {e}")

        # Check if column was added
        result = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='is_super_admin'"))
        if result.fetchone():
            print("Column exists in database")

            # Set first admin as super admin
            conn.execute(text("""
                UPDATE users
                SET is_super_admin = TRUE
                WHERE user_id = (
                    SELECT user_id FROM users
                    WHERE role IN ('admin', 'owner')
                      AND is_super_admin = FALSE
                    ORDER BY created_at
                    LIMIT 1
                )
            """))
            conn.commit()
            print("Set first admin as super admin")
        else:
            print("Column still doesn't exist!")