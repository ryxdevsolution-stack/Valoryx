#!/usr/bin/env python3
"""Run discount_amount column migration"""
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

# Get database URL
db_url = os.getenv('DB_URL')

print("Connecting to database...")
conn = psycopg2.connect(db_url)
cursor = conn.cursor()

print("Running migration to add discount_amount column...")

# Read the SQL migration file
with open('migrations/add_discount_amount_column.sql', 'r') as f:
    sql = f.read()

# Execute the migration
try:
    # Split by semicolon and execute each statement
    statements = [s.strip() for s in sql.split(';') if s.strip() and not s.strip().startswith('--')]

    for statement in statements:
        if statement:
            if 'SELECT' in statement.upper():
                # Execute SELECT and show results
                print(f"Executing verification query...")
                cursor.execute(statement)
                results = cursor.fetchall()
                print("\nVerification Results:")
                for row in results:
                    print(f"  Table: {row[0]}, Total Records: {row[1]}, Records with Discount: {row[2]}")
            else:
                print(f"Executing: {statement[:80]}...")
                cursor.execute(statement)

    conn.commit()
    print("\n✅ Migration completed successfully!")

    # Verify columns exist
    cursor.execute("""
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name IN ('gst_billing', 'non_gst_billing')
        AND column_name = 'discount_amount'
        ORDER BY table_name
    """)
    results = cursor.fetchall()
    if results:
        print("\n✅ Discount columns verified:")
        for row in results:
            print(f"  Column: {row[0]}, Type: {row[1]}")
    else:
        print("\n⚠ Warning: Discount columns not found")

except Exception as e:
    conn.rollback()
    print(f"\n❌ Error: {e}")
    import traceback
    traceback.print_exc()
finally:
    cursor.close()
    conn.close()
    print("\nConnection closed.")
