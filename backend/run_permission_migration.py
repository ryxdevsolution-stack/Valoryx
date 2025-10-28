"""
Run permission system migration
This script runs the migration to add the permission system to the database
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from flask import Flask
from extensions import db
from config import Config
from models.user_model import User
from models.permission_model import Permission, UserPermission
import uuid
from datetime import datetime

def run_migration():
    """Run the permission migration"""

    # Create Flask app for context
    app = Flask(__name__)
    app.config.from_object(Config)

    # Initialize database
    db.init_app(app)

    with app.app_context():
        print("Starting permission system migration...")

        # Create tables
        db.create_all()
        print("[OK] Database tables created/verified")

        # Check if permissions table is empty
        existing_permissions = Permission.query.count()

        if existing_permissions == 0:
            # Seed default permissions
            default_permissions = [
                # Dashboard & Analytics
                ('view_dashboard', 'View analytics dashboard', 'dashboard'),

                # Billing permissions
                ('view_billing', 'View bills list', 'billing'),
                ('create_bill', 'Create new bills', 'billing'),
                ('edit_bill', 'Edit existing bills', 'billing'),
                ('delete_bill', 'Delete bills', 'billing'),

                # Customer permissions
                ('view_customers', 'View customer list', 'customers'),
                ('manage_customers', 'Add, edit, and delete customers', 'customers'),

                # Stock permissions
                ('view_stock', 'View stock and inventory', 'stock'),
                ('manage_stock', 'Add, edit, and delete stock items', 'stock'),

                # Reports & Audit
                ('view_reports', 'Access reports section', 'reports'),
                ('view_audit', 'View audit logs', 'audit'),

                # Admin permissions (for super admins)
                ('manage_permissions', 'Manage user permissions', 'admin'),
                ('view_all_users', 'View all users in system', 'admin'),
                ('manage_users', 'Create, edit, and delete users', 'admin'),
            ]

            for perm_name, desc, category in default_permissions:
                permission = Permission(
                    permission_name=perm_name,
                    description=desc,
                    category=category
                )
                db.session.add(permission)

            db.session.commit()
            print(f"[OK] Seeded {len(default_permissions)} default permissions")
        else:
            print(f"[OK] Permissions table already has {existing_permissions} permissions")

        # Set first admin user as super admin
        first_admin = User.query.filter(User.role.in_(['admin', 'owner'])).order_by(User.created_at.asc()).first()

        if first_admin:
            if not first_admin.is_super_admin:
                first_admin.is_super_admin = True
                db.session.commit()
                print(f"[OK] Set {first_admin.email} as super admin")
            else:
                print(f"[OK] {first_admin.email} is already a super admin")

            # Grant all permissions to super admin (optional - super admins have implicit access)
            # This is just for explicit record keeping
            all_permissions = Permission.query.all()
            for permission in all_permissions:
                existing = UserPermission.query.filter_by(
                    user_id=first_admin.user_id,
                    permission_id=permission.permission_id
                ).first()

                if not existing:
                    user_permission = UserPermission(
                        user_id=first_admin.user_id,
                        permission_id=permission.permission_id,
                        granted_by=first_admin.user_id  # Self-granted for initial setup
                    )
                    db.session.add(user_permission)

            db.session.commit()
            print(f"[OK] Granted all permissions to super admin {first_admin.email}")
        else:
            print("[WARNING] No admin users found. Please manually set a super admin.")

        print("\n[SUCCESS] Permission system migration completed successfully!")
        print("\nIMPORTANT: You may need to manually set is_super_admin=TRUE for additional RYX founder accounts")

if __name__ == "__main__":
    run_migration()