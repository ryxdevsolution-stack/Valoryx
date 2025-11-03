"""
Enhanced Billing Fields Migration Script
Adds amount_received, discount_percentage, and customer_gstin columns
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
    """Run the enhanced billing fields migration"""
    app = create_app()

    with app.app_context():
        print("=" * 80)
        print("ENHANCED BILLING FIELDS MIGRATION")
        print("=" * 80)
        print(f"Starting migration at: {datetime.now().isoformat()}\n")

        try:
            # Step 1: Add new columns to gst_billing table
            print("Step 1: Adding new columns to gst_billing table...")

            # Check if columns already exist
            check_gst = db.session.execute(text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'gst_billing' AND column_name = 'amount_received';
            """)).fetchone()

            if not check_gst:
                db.session.execute(text("""
                    ALTER TABLE gst_billing
                    ADD COLUMN IF NOT EXISTS customer_gstin VARCHAR(15),
                    ADD COLUMN IF NOT EXISTS amount_received NUMERIC(12, 2),
                    ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC(5, 2);
                """))
                db.session.commit()
                print("[OK] Columns added to gst_billing table\n")
            else:
                print("[SKIP] Columns already exist in gst_billing table\n")

            # Step 2: Change payment_type to TEXT
            print("Step 2: Modifying payment_type column in gst_billing...")
            try:
                db.session.execute(text("""
                    ALTER TABLE gst_billing
                    ALTER COLUMN payment_type TYPE TEXT;
                """))
                db.session.commit()
                print("[OK] payment_type column modified in gst_billing\n")
            except Exception as e:
                if "cannot be cast automatically" in str(e):
                    print("[INFO] payment_type requires manual conversion, using USING clause...")
                    db.session.rollback()
                    db.session.execute(text("""
                        ALTER TABLE gst_billing
                        ALTER COLUMN payment_type TYPE TEXT USING payment_type::TEXT;
                    """))
                    db.session.commit()
                    print("[OK] payment_type column modified with USING clause\n")
                else:
                    raise

            # Step 3: Make customer_name nullable
            print("Step 3: Making customer_name nullable in gst_billing...")
            try:
                db.session.execute(text("""
                    ALTER TABLE gst_billing
                    ALTER COLUMN customer_name DROP NOT NULL;
                """))
                db.session.commit()
                print("[OK] customer_name is now nullable in gst_billing\n")
            except Exception as e:
                print(f"[INFO] customer_name nullability: {str(e)}\n")
                db.session.rollback()

            # Step 4: Add new columns to non_gst_billing table
            print("Step 4: Adding new columns to non_gst_billing table...")

            check_non_gst = db.session.execute(text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'non_gst_billing' AND column_name = 'amount_received';
            """)).fetchone()

            if not check_non_gst:
                db.session.execute(text("""
                    ALTER TABLE non_gst_billing
                    ADD COLUMN IF NOT EXISTS customer_gstin VARCHAR(15),
                    ADD COLUMN IF NOT EXISTS amount_received NUMERIC(12, 2),
                    ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC(5, 2);
                """))
                db.session.commit()
                print("[OK] Columns added to non_gst_billing table\n")
            else:
                print("[SKIP] Columns already exist in non_gst_billing table\n")

            # Step 5: Change payment_type to TEXT in non_gst_billing
            print("Step 5: Modifying payment_type column in non_gst_billing...")
            try:
                db.session.execute(text("""
                    ALTER TABLE non_gst_billing
                    ALTER COLUMN payment_type TYPE TEXT;
                """))
                db.session.commit()
                print("[OK] payment_type column modified in non_gst_billing\n")
            except Exception as e:
                if "cannot be cast automatically" in str(e):
                    print("[INFO] payment_type requires manual conversion, using USING clause...")
                    db.session.rollback()
                    db.session.execute(text("""
                        ALTER TABLE non_gst_billing
                        ALTER COLUMN payment_type TYPE TEXT USING payment_type::TEXT;
                    """))
                    db.session.commit()
                    print("[OK] payment_type column modified with USING clause\n")
                else:
                    raise

            # Step 6: Make customer_name nullable in non_gst_billing
            print("Step 6: Making customer_name nullable in non_gst_billing...")
            try:
                db.session.execute(text("""
                    ALTER TABLE non_gst_billing
                    ALTER COLUMN customer_name DROP NOT NULL;
                """))
                db.session.commit()
                print("[OK] customer_name is now nullable in non_gst_billing\n")
            except Exception as e:
                print(f"[INFO] customer_name nullability: {str(e)}\n")
                db.session.rollback()

            # Step 7: Create indexes for better performance
            print("Step 7: Creating indexes for better query performance...")
            db.session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_gst_billing_customer_gstin ON gst_billing(customer_gstin);
            """))
            db.session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_non_gst_billing_customer_gstin ON non_gst_billing(customer_gstin);
            """))
            db.session.commit()
            print("[OK] Indexes created successfully\n")

            # Step 8: Get migration statistics
            print("Step 8: Gathering migration statistics...")
            stats = db.session.execute(text("""
                SELECT
                    (SELECT COUNT(*) FROM gst_billing) as total_gst_bills,
                    (SELECT COUNT(*) FROM non_gst_billing) as total_non_gst_bills;
            """)).fetchone()

            print("\n" + "=" * 80)
            print("MIGRATION COMPLETED SUCCESSFULLY")
            print("=" * 80)
            print(f"Total GST Bills: {stats[0]}")
            print(f"Total Non-GST Bills: {stats[1]}")
            print("\nNew features enabled:")
            print("  - Customer GSTIN field")
            print("  - Multi-payment split support (payment_type now stores JSON)")
            print("  - Amount received tracking")
            print("  - Discount percentage support")
            print("  - Optional customer name for walk-in customers")
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
    print("\n>> Starting Enhanced Billing Fields Migration...\n")
    success = run_migration()

    if success:
        print("\n>> Migration completed successfully!")
        print("You can now use the enhanced billing features.\n")
        sys.exit(0)
    else:
        print("\n>> Migration failed. Please check the errors above.\n")
        sys.exit(1)
