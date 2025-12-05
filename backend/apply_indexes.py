#!/usr/bin/env python3
"""
Apply performance indexes to the database
Run this script to ensure all indexes are created
"""
import os
import sys

# Add the backend directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from extensions import db

def apply_indexes():
    """Apply performance indexes from the migration file"""
    app = create_app()

    with app.app_context():
        # Read the migration SQL
        migration_path = os.path.join(
            os.path.dirname(__file__),
            'migrations',
            'add_performance_indexes.sql'
        )

        if not os.path.exists(migration_path):
            print(f"Migration file not found: {migration_path}")
            return False

        with open(migration_path, 'r') as f:
            sql_content = f.read()

        # Split into individual statements (ignoring comments and empty lines)
        statements = []
        current_statement = []

        for line in sql_content.split('\n'):
            stripped = line.strip()

            # Skip comments and empty lines
            if stripped.startswith('--') or stripped.startswith('/*') or not stripped:
                continue
            if stripped.startswith('*/'):
                continue

            current_statement.append(line)

            # Check if statement is complete
            if stripped.endswith(';'):
                full_statement = '\n'.join(current_statement)
                # Only include CREATE INDEX and ANALYZE statements
                if 'CREATE INDEX' in full_statement.upper() or 'ANALYZE' in full_statement.upper():
                    statements.append(full_statement)
                current_statement = []

        print(f"Found {len(statements)} index statements to apply...")

        # Execute each statement
        success_count = 0
        skip_count = 0

        for statement in statements:
            try:
                db.session.execute(db.text(statement))
                db.session.commit()

                # Extract index name for logging
                if 'CREATE INDEX' in statement.upper():
                    idx_name = statement.split('idx_')[1].split()[0] if 'idx_' in statement else 'unknown'
                    print(f"  [OK] Created index: idx_{idx_name}")
                else:
                    print(f"  [OK] Executed: {statement[:50]}...")

                success_count += 1

            except Exception as e:
                error_msg = str(e)
                if 'already exists' in error_msg.lower():
                    if 'idx_' in statement:
                        idx_name = statement.split('idx_')[1].split()[0]
                        print(f"  [SKIP] Index already exists: idx_{idx_name}")
                    skip_count += 1
                else:
                    print(f"  [ERROR] {error_msg[:100]}")
                db.session.rollback()

        print(f"\nDone! Created: {success_count}, Skipped (already exist): {skip_count}")
        return True

if __name__ == '__main__':
    print("Applying performance indexes...")
    print("=" * 50)
    apply_indexes()
