"""
Add MRP Field Migration Script
Adds MRP (Maximum Retail Price) field to stock_entry table
"""
import os
import sys
from datetime import datetime

# Add backend to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from extensions import db
from app import create_app

def run_migration():
    """Run the MRP field migration"""
    app = create_app()

    with app.app_context():
        print("=" * 80)
        print("ADD MRP FIELD MIGRATION")
        print("=" * 80)
        print(f"Starting migration at: {datetime.now().isoformat()}\n")

        try:
            # Step 1: Add MRP column to stock_entry table
            print("Step 1: Adding MRP column to stock_entry table...")

            # Check if column already exists
            check_mrp = db.session.execute(text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'stock_entry' AND column_name = 'mrp';
            """)).fetchone()

            if not check_mrp:
                db.session.execute(text("""
                    ALTER TABLE stock_entry
                    ADD COLUMN IF NOT EXISTS mrp NUMERIC(10, 2);
                """))
                db.session.commit()
                print("[OK] MRP column added to stock_entry table\n")
            else:
                print("[SKIP] MRP column already exists in stock_entry table\n")

            # Step 2: Add comment for documentation
            print("Step 2: Adding documentation comment...")
            db.session.execute(text("""
                COMMENT ON COLUMN stock_entry.mrp IS 'Maximum Retail Price - shown in print but not in billing display';
            """))
            db.session.commit()
            print("[OK] Documentation comment added\n")

            # Step 3: Get migration statistics
            print("Step 3: Gathering migration statistics...")
            stats = db.session.execute(text("""
                SELECT
                    (SELECT COUNT(*) FROM stock_entry) as total_products,
                    (SELECT COUNT(*) FROM stock_entry WHERE mrp IS NOT NULL) as products_with_mrp;
            """)).fetchone()

            print("\n" + "=" * 80)
            print("MIGRATION COMPLETED SUCCESSFULLY")
            print("=" * 80)
            print(f"Total Products: {stats[0]}")
            print(f"Products with MRP: {stats[1]}")
            print("\nNew features enabled:")
            print("  - MRP field in stock_entry table")
            print("  - MRP can be added when creating/updating products")
            print("  - MRP will be included in billing items")
            print("  - MRP shown in print but not in billing display")
            print(f"\nCompleted at: {datetime.now().isoformat()}")
            print("=" * 80)

            return True

        except Exception as e:
            print(f"\n[ERROR] Migration failed with error: {str(e)}")
            import traceback
            print(traceback.format_exc())
            db.session.rollback()
            return False


if __name__ == '__main__':
    print("\n>> Starting MRP Field Migration...\n")
    success = run_migration()

    if success:
        print("\n>> Migration completed successfully!")
        print("You can now add MRP to products.\n")
        sys.exit(0)
    else:
        print("\n>> Migration failed. Please check the errors above.\n")
        sys.exit(1)
