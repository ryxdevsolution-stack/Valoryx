"""
Quick script to check synced_at status for recent records
"""
import os
import sys
import sqlite3
from dotenv import load_dotenv

load_dotenv()

def check_sync_status():
    """Check sync status of recent records"""
    db_path = os.getenv('SQLITE_DB_PATH', os.path.expanduser('~/.valoryx/local.db'))

    if not os.path.exists(db_path):
        print(f"[X] Database not found: {db_path}")
        return

    print("\n" + "="*70)
    print("Checking Sync Status in SQLite Database")
    print("="*70)
    print(f"Database: {db_path}\n")

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Check customers
    print("\n[Customers] Last 5 customers:")
    print("-" * 70)
    cursor.execute("""
        SELECT customer_name, customer_phone, created_at, synced_at
        FROM customer
        ORDER BY created_at DESC
        LIMIT 5
    """)

    print(f"{'Name':<25} {'Phone':<15} {'Created':<20} {'Synced?':<10}")
    print("-" * 70)
    for row in cursor.fetchall():
        name, phone, created, synced = row
        synced_status = "YES" if synced else "NO"
        synced_display = synced if synced else "Not synced"
        print(f"{name[:24]:<25} {phone:<15} {created[:19]:<20} {synced_status:<10}")

    # Check stock
    print("\n\n[Stock] Last 5 stock entries:")
    print("-" * 70)
    cursor.execute("""
        SELECT product_name, quantity, updated_at, synced_at
        FROM stock_entry
        ORDER BY updated_at DESC
        LIMIT 5
    """)

    print(f"{'Product':<30} {'Qty':<10} {'Updated':<20} {'Synced?':<10}")
    print("-" * 70)
    for row in cursor.fetchall():
        product, qty, updated, synced = row
        synced_status = "YES" if synced else "NO"
        print(f"{product[:29]:<30} {qty:<10} {updated[:19]:<20} {synced_status:<10}")

    # Check GST bills
    print("\n\n[GST Bills] Last 5 bills:")
    print("-" * 70)
    cursor.execute("""
        SELECT bill_number, customer_name, final_amount, created_at, synced_at
        FROM gst_billing
        ORDER BY created_at DESC
        LIMIT 5
    """)

    print(f"{'Bill #':<15} {'Customer':<20} {'Amount':<12} {'Created':<20} {'Synced?':<10}")
    print("-" * 70)
    for row in cursor.fetchall():
        bill_num, customer, amount, created, synced = row
        synced_status = "YES" if synced else "NO"
        print(f"{bill_num:<15} {customer[:19]:<20} {amount:<12} {created[:19]:<20} {synced_status:<10}")

    # Count unsynced records
    print("\n\n[Summary] Unsynced Records:")
    print("-" * 70)

    cursor.execute("SELECT COUNT(*) FROM customer WHERE synced_at IS NULL")
    unsynced_customers = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM stock_entry WHERE synced_at IS NULL")
    unsynced_stock = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM gst_billing WHERE synced_at IS NULL")
    unsynced_gst = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM non_gst_billing WHERE synced_at IS NULL")
    unsynced_non_gst = cursor.fetchone()[0]

    print(f"Customers:      {unsynced_customers} unsynced")
    print(f"Stock entries:  {unsynced_stock} unsynced")
    print(f"GST bills:      {unsynced_gst} unsynced")
    print(f"Non-GST bills:  {unsynced_non_gst} unsynced")

    total_unsynced = unsynced_customers + unsynced_stock + unsynced_gst + unsynced_non_gst

    if total_unsynced > 0:
        print(f"\n[INFO] Total unsynced: {total_unsynced} records")
        print("[ACTION] Run sync to upload these to Supabase:")
        print("         curl -X POST http://localhost:5017/api/sync/trigger")
    else:
        print("\n[OK] All records are synced!")

    print("="*70 + "\n")

    conn.close()

if __name__ == "__main__":
    check_sync_status()
