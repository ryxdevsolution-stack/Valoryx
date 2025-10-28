"""
Finalize permission setup - grant permissions to super admin
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from flask import Flask
from extensions import db
from config import Config
from sqlalchemy import text
import uuid

def finalize_permissions():
    """Complete permission setup"""

    # Create Flask app for context
    app = Flask(__name__)
    app.config.from_object(Config)

    # Initialize database
    db.init_app(app)

    with app.app_context():
        with db.engine.connect() as conn:
            print("Finalizing permission system setup...")

            # Set first admin as super admin
            result = conn.execute(text("""
                UPDATE users
                SET is_super_admin = TRUE
                WHERE user_id = (
                    SELECT user_id FROM users
                    WHERE role IN ('admin', 'owner')
                    ORDER BY created_at
                    LIMIT 1
                )
                RETURNING email
            """))
            conn.commit()

            admin_email = result.fetchone()
            if admin_email:
                print(f"[OK] Set {admin_email[0]} as super admin")

                # Get the admin's user_id
                result = conn.execute(text("""
                    SELECT user_id FROM users
                    WHERE email = :email
                """), {"email": admin_email[0]})
                admin_id = result.fetchone()[0]

                # Grant all permissions to super admin
                all_permissions = conn.execute(text("SELECT permission_id FROM permissions"))

                for perm in all_permissions:
                    # Check if permission already granted
                    existing = conn.execute(text("""
                        SELECT COUNT(*) FROM user_permissions
                        WHERE user_id = :user_id AND permission_id = :permission_id
                    """), {"user_id": admin_id, "permission_id": perm[0]})

                    if existing.scalar() == 0:
                        # Grant permission
                        conn.execute(text("""
                            INSERT INTO user_permissions (id, user_id, permission_id, granted_by)
                            VALUES (:id, :user_id, :permission_id, :granted_by)
                        """), {"id": str(uuid.uuid4()), "user_id": admin_id, "permission_id": perm[0], "granted_by": admin_id})

                conn.commit()
                print(f"[OK] Granted all permissions to super admin")

                # Show summary
                result = conn.execute(text("""
                    SELECT COUNT(*) FROM user_permissions WHERE user_id = :user_id
                """), {"user_id": admin_id})
                perm_count = result.scalar()
                print(f"\n[SUCCESS] Super admin {admin_email[0]} now has {perm_count} permissions")
            else:
                print("[WARNING] No admin users found. Please manually set a super admin.")

            print("\n[SUCCESS] Permission system setup completed!")
            print("\nYou can now use the following credentials:")
            print(f"Email: {admin_email[0] if admin_email else 'N/A'}")
            print("This user has super admin privileges and can manage other users' permissions")

if __name__ == "__main__":
    finalize_permissions()