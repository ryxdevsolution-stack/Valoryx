#!/usr/bin/env python3
"""Run audit log action types migration"""
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

# Get database URL
db_url = os.getenv('DB_URL')

print("Connecting to database...")
conn = psycopg2.connect(db_url)
cursor = conn.cursor()

print("Running migration to fix audit_log action types...")

# Read the SQL migration file
with open('migrations/fix_audit_action_types.sql', 'r') as f:
    sql = f.read()

# Execute the migration
try:
    # Split by semicolon and execute each statement
    statements = [s.strip() for s in sql.split(';') if s.strip() and not s.strip().startswith('--')]

    for statement in statements:
        if statement and 'SELECT' not in statement:  # Skip SELECT verification for now
            print(f"Executing: {statement[:100]}...")
            cursor.execute(statement)

    conn.commit()
    print("✅ Migration completed successfully!")

    # Verify
    cursor.execute("""
        SELECT conname
        FROM pg_constraint
        WHERE conname = 'audit_log_action_type_check'
    """)
    result = cursor.fetchone()
    if result:
        print(f"✅ Constraint exists: {result[0]}")
    else:
        print("⚠️  Constraint not found")

except Exception as e:
    conn.rollback()
    print(f"❌ Error: {e}")
finally:
    cursor.close()
    conn.close()
    print("Connection closed.")
