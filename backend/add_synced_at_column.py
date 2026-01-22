"""
Add synced_at column to customer table in SQLite (if missing)
Run this once to update your local SQLite database
"""
import os
import sys
import sqlite3
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def add_synced_at_column():
    """Add synced_at column to customer table if it doesn't exist"""
    sqlite_path = os.getenv('SQLITE_DB_PATH', os.path.expanduser('~/.mj-billing/local.db'))

    if not os.path.exists(sqlite_path):
        print(f"[X] SQLite database not found at: {sqlite_path}")
        return False

    print(f"[OK] Connecting to: {sqlite_path}")

    try:
        conn = sqlite3.connect(sqlite_path)
        cursor = conn.cursor()

        # Check if synced_at column exists
        cursor.execute("PRAGMA table_info(customer)")
        columns = [column[1] for column in cursor.fetchall()]

        if 'synced_at' in columns:
            print("[OK] Column 'synced_at' already exists in customer table")
            conn.close()
            return True

        # Add the column
        print("[INFO] Adding synced_at column to customer table...")
        cursor.execute("ALTER TABLE customer ADD COLUMN synced_at DATETIME")

        # Also add to stock_entry if missing
        cursor.execute("PRAGMA table_info(stock_entry)")
        stock_columns = [column[1] for column in cursor.fetchall()]

        if 'synced_at' not in stock_columns:
            print("[INFO] Adding synced_at column to stock_entry table...")
            cursor.execute("ALTER TABLE stock_entry ADD COLUMN synced_at DATETIME")

        # Add to billing tables if missing
        cursor.execute("PRAGMA table_info(gst_billing)")
        gst_columns = [column[1] for column in cursor.fetchall()]

        if 'synced_at' not in gst_columns:
            print("[INFO] Adding synced_at column to gst_billing table...")
            cursor.execute("ALTER TABLE gst_billing ADD COLUMN synced_at DATETIME")

        cursor.execute("PRAGMA table_info(non_gst_billing)")
        non_gst_columns = [column[1] for column in cursor.fetchall()]

        if 'synced_at' not in non_gst_columns:
            print("[INFO] Adding synced_at column to non_gst_billing table...")
            cursor.execute("ALTER TABLE non_gst_billing ADD COLUMN synced_at DATETIME")

        conn.commit()
        conn.close()

        print("[OK] Migration completed successfully!")
        return True

    except Exception as e:
        print(f"[X] Error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("\nAdding synced_at column to SQLite tables...\n")
    success = add_synced_at_column()

    if success:
        print("\n[OK] All done! Your database is ready for auto-sync to Supabase.")
    else:
        print("\n[X] Migration failed. Check the errors above.")

    sys.exit(0 if success else 1)
