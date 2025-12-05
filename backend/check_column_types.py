#!/usr/bin/env python3
"""Check column data types in existing tables"""
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

db_url = os.getenv('DB_URL')

print("Connecting to database...")
conn = psycopg2.connect(db_url)
cursor = conn.cursor()

print("\n=== Checking client_entry table ===")
cursor.execute("""
    SELECT column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_name = 'client_entry'
    AND column_name IN ('client_id')
""")
for row in cursor.fetchall():
    print(f"Column: {row[0]}, Type: {row[1]}, UDT: {row[2]}")

print("\n=== Checking users table ===")
cursor.execute("""
    SELECT column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_name = 'users'
    AND column_name IN ('user_id')
""")
for row in cursor.fetchall():
    print(f"Column: {row[0]}, Type: {row[1]}, UDT: {row[2]}")

print("\n=== Checking other tables for reference ===")
cursor.execute("""
    SELECT table_name, column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_name IN ('gst_billing', 'non_gst_billing', 'stock', 'report')
    AND column_name IN ('client_id', 'user_id')
    ORDER BY table_name, column_name
""")
for row in cursor.fetchall():
    print(f"Table: {row[0]}, Column: {row[1]}, Type: {row[2]}, UDT: {row[3]}")

cursor.close()
conn.close()
print("\n[OK] Done")
