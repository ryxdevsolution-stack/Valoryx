#!/usr/bin/env python3
"""Run expense tables migration"""
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

# Get database URL
db_url = os.getenv('DB_URL')

print("Connecting to database...")
conn = psycopg2.connect(db_url)
cursor = conn.cursor()

print("Running migration to create expense tables...")

# Read the SQL migration file
with open('migrations/create_expense_tables.sql', 'r') as f:
    sql = f.read()

# Execute the migration
try:
    # Split by semicolon and execute each statement
    statements = [s.strip() for s in sql.split(';') if s.strip() and not s.strip().startswith('--')]

    for statement in statements:
        if statement:
            print(f"Executing: {statement[:100]}...")
            cursor.execute(statement)

    conn.commit()
    print("✅ Migration completed successfully!")

    # Verify tables exist
    cursor.execute("""
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name IN ('expense', 'expense_summary')
    """)
    tables = cursor.fetchall()
    if tables:
        print(f"✅ Tables created: {[t[0] for t in tables]}")
    else:
        print("⚠️  Tables not found")

except Exception as e:
    conn.rollback()
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
finally:
    cursor.close()
    conn.close()
    print("Connection closed.")
