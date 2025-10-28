"""
Migration: Add Permissions System
Description: Adds is_super_admin to users table and creates permission-related tables
Date: 2025-10-27
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import uuid
from datetime import datetime
from extensions import db
from models.user_model import User
from models.permission_model import Permission, UserPermission

def upgrade():
    """Add permission system to database"""

    # 1. Add is_super_admin column to users table if not exists
    with db.engine.connect() as conn:
        # Check if column exists
        result = conn.execute("""
            SELECT COUNT(*)
            FROM information_schema.columns
            WHERE table_name='users' AND column_name='is_super_admin'
        """)

        if result.scalar() == 0:
            conn.execute("""
                ALTER TABLE users
                ADD COLUMN is_super_admin BOOLEAN DEFAULT FALSE
            """)
            conn.commit()
            print("✓ Added is_super_admin column to users table")

    # 2. Create permissions table
    with db.engine.connect() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS permissions (
                permission_id VARCHAR(36) PRIMARY KEY,
                permission_name VARCHAR(100) UNIQUE NOT NULL,
                description VARCHAR(255),
                category VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
        print("✓ Created permissions table")

    # 3. Create user_permissions table
    with db.engine.connect() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_permissions (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                permission_id VARCHAR(36) NOT NULL,
                granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                granted_by VARCHAR(36),
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
                FOREIGN KEY (permission_id) REFERENCES permissions(permission_id) ON DELETE CASCADE,
                FOREIGN KEY (granted_by) REFERENCES users(user_id) ON DELETE SET NULL,
                UNIQUE KEY unique_user_permission (user_id, permission_id)
            )
        """)
        conn.commit()
        print("✓ Created user_permissions table")

    # 4. Seed default permissions
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

    with db.engine.connect() as conn:
        for perm_name, desc, category in default_permissions:
            # Check if permission already exists
            result = conn.execute(
                "SELECT COUNT(*) FROM permissions WHERE permission_name = %s",
                (perm_name,)
            )

            if result.scalar() == 0:
                conn.execute("""
                    INSERT INTO permissions (permission_id, permission_name, description, category, created_at)
                    VALUES (%s, %s, %s, %s, %s)
                """, (
                    str(uuid.uuid4()),
                    perm_name,
                    desc,
                    category,
                    datetime.utcnow()
                ))

        conn.commit()
        print("✓ Seeded default permissions")

    # 5. Set first user as super admin (optional - you can manually set this)
    with db.engine.connect() as conn:
        # Get the first admin/owner user
        result = conn.execute("""
            SELECT user_id, email FROM users
            WHERE role IN ('admin', 'owner')
            ORDER BY created_at ASC
            LIMIT 1
        """)

        first_admin = result.fetchone()
        if first_admin:
            conn.execute("""
                UPDATE users
                SET is_super_admin = TRUE
                WHERE user_id = %s
            """, (first_admin[0],))
            conn.commit()
            print(f"✓ Set {first_admin[1]} as super admin")

    print("\n✅ Permission system migration completed successfully!")
    print("\nIMPORTANT: Remember to manually set is_super_admin=TRUE for RYX founder accounts in the database")

def downgrade():
    """Remove permission system from database"""
    with db.engine.connect() as conn:
        # Drop tables in reverse order due to foreign keys
        conn.execute("DROP TABLE IF EXISTS user_permissions")
        conn.execute("DROP TABLE IF EXISTS permissions")

        # Remove column from users table
        conn.execute("ALTER TABLE users DROP COLUMN IF EXISTS is_super_admin")

        conn.commit()
        print("✓ Removed permission system from database")

if __name__ == "__main__":
    print("Running permission system migration...")
    upgrade()