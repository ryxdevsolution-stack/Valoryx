"""
Customer Table Migration Script
Runs database migrations programmatically using SQLAlchemy
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
    """Run the customer table migration"""
    app = create_app()

    with app.app_context():
        print("=" * 80)
        print("CUSTOMER TABLE MIGRATION")
        print("=" * 80)
        print(f"Starting migration at: {datetime.now().isoformat()}\n")

        try:
            # Step 1: Create customer table
            print("Step 1: Creating customer table...")
            db.session.execute(text("""
                CREATE TABLE IF NOT EXISTS customer (
                    customer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    client_id UUID NOT NULL REFERENCES client_entry(client_id) ON DELETE CASCADE,
                    customer_name VARCHAR(255) NOT NULL,
                    customer_phone VARCHAR(20) NOT NULL,
                    customer_email VARCHAR(255),
                    customer_address TEXT,
                    customer_gstin VARCHAR(15),
                    customer_city VARCHAR(100),
                    customer_state VARCHAR(100),
                    customer_pincode VARCHAR(10),
                    total_bills INTEGER DEFAULT 0,
                    total_spent DECIMAL(15, 2) DEFAULT 0.00,
                    last_purchase_date TIMESTAMP,
                    first_purchase_date TIMESTAMP,
                    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
                    notes TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """))
            db.session.commit()
            print("[OK] Customer table created successfully\n")

            # Step 2: Create indexes
            print("Step 2: Creating indexes...")
            db.session.execute(text("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_client_phone
                ON customer(client_id, customer_phone);
            """))
            db.session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_customer_client
                ON customer(client_id);
            """))
            db.session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_customer_phone
                ON customer(customer_phone);
            """))
            db.session.commit()
            print("[OK] Indexes created successfully\n")

            # Step 3: Add customer fields to gst_billing
            print("Step 3: Adding customer fields to gst_billing table...")

            # Check if columns already exist
            check_gst = db.session.execute(text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'gst_billing' AND column_name = 'customer_id';
            """)).fetchone()

            if not check_gst:
                db.session.execute(text("""
                    ALTER TABLE gst_billing
                    ADD COLUMN customer_id UUID REFERENCES customer(customer_id),
                    ADD COLUMN customer_email VARCHAR(255),
                    ADD COLUMN customer_address TEXT,
                    ADD COLUMN customer_gstin VARCHAR(15);
                """))
                db.session.commit()
                print("[OK] Customer fields added to gst_billing\n")
            else:
                print("[SKIP] Customer fields already exist in gst_billing\n")

            # Step 4: Add customer fields to non_gst_billing
            print("Step 4: Adding customer fields to non_gst_billing table...")

            check_non_gst = db.session.execute(text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'non_gst_billing' AND column_name = 'customer_id';
            """)).fetchone()

            if not check_non_gst:
                db.session.execute(text("""
                    ALTER TABLE non_gst_billing
                    ADD COLUMN customer_id UUID REFERENCES customer(customer_id),
                    ADD COLUMN customer_email VARCHAR(255),
                    ADD COLUMN customer_address TEXT;
                """))
                db.session.commit()
                print("[OK] Customer fields added to non_gst_billing\n")
            else:
                print("[SKIP] Customer fields already exist in non_gst_billing\n")

            # Step 5: Migrate existing customer data from GST bills
            print("Step 5: Migrating customer data from GST bills...")
            result = db.session.execute(text("""
                INSERT INTO customer (
                    client_id,
                    customer_name,
                    customer_phone,
                    customer_email,
                    customer_address,
                    customer_gstin,
                    total_bills,
                    total_spent,
                    last_purchase_date,
                    first_purchase_date,
                    status
                )
                SELECT
                    client_id,
                    customer_name,
                    customer_phone,
                    MAX(customer_email) as customer_email,
                    MAX(customer_address) as customer_address,
                    MAX(customer_gstin) as customer_gstin,
                    COUNT(*) as total_bills,
                    SUM(final_amount) as total_spent,
                    MAX(created_at) as last_purchase_date,
                    MIN(created_at) as first_purchase_date,
                    CASE
                        WHEN MAX(created_at) >= CURRENT_TIMESTAMP - INTERVAL '30 days'
                        THEN 'active'
                        ELSE 'inactive'
                    END as status
                FROM gst_billing
                WHERE customer_phone IS NOT NULL
                AND customer_phone != ''
                GROUP BY client_id, customer_name, customer_phone
                ON CONFLICT (client_id, customer_phone) DO UPDATE SET
                    customer_email = COALESCE(EXCLUDED.customer_email, customer.customer_email),
                    customer_address = COALESCE(EXCLUDED.customer_address, customer.customer_address),
                    customer_gstin = COALESCE(EXCLUDED.customer_gstin, customer.customer_gstin),
                    total_bills = customer.total_bills + EXCLUDED.total_bills,
                    total_spent = customer.total_spent + EXCLUDED.total_spent,
                    last_purchase_date = GREATEST(customer.last_purchase_date, EXCLUDED.last_purchase_date),
                    first_purchase_date = LEAST(customer.first_purchase_date, EXCLUDED.first_purchase_date),
                    updated_at = CURRENT_TIMESTAMP;
            """))
            db.session.commit()
            print(f"[OK] Migrated GST customer data (rows affected: {result.rowcount})\n")

            # Step 6: Migrate existing customer data from Non-GST bills
            print("Step 6: Migrating customer data from Non-GST bills...")
            result = db.session.execute(text("""
                INSERT INTO customer (
                    client_id,
                    customer_name,
                    customer_phone,
                    customer_email,
                    customer_address,
                    total_bills,
                    total_spent,
                    last_purchase_date,
                    first_purchase_date,
                    status
                )
                SELECT
                    client_id,
                    customer_name,
                    customer_phone,
                    MAX(customer_email) as customer_email,
                    MAX(customer_address) as customer_address,
                    COUNT(*) as total_bills,
                    SUM(total_amount) as total_spent,
                    MAX(created_at) as last_purchase_date,
                    MIN(created_at) as first_purchase_date,
                    CASE
                        WHEN MAX(created_at) >= CURRENT_TIMESTAMP - INTERVAL '30 days'
                        THEN 'active'
                        ELSE 'inactive'
                    END as status
                FROM non_gst_billing
                WHERE customer_phone IS NOT NULL
                AND customer_phone != ''
                GROUP BY client_id, customer_name, customer_phone
                ON CONFLICT (client_id, customer_phone) DO UPDATE SET
                    customer_email = COALESCE(EXCLUDED.customer_email, customer.customer_email),
                    customer_address = COALESCE(EXCLUDED.customer_address, customer.customer_address),
                    total_bills = customer.total_bills + EXCLUDED.total_bills,
                    total_spent = customer.total_spent + EXCLUDED.total_spent,
                    last_purchase_date = GREATEST(customer.last_purchase_date, EXCLUDED.last_purchase_date),
                    first_purchase_date = LEAST(customer.first_purchase_date, EXCLUDED.first_purchase_date),
                    updated_at = CURRENT_TIMESTAMP;
            """))
            db.session.commit()
            print(f"[OK] Migrated Non-GST customer data (rows affected: {result.rowcount})\n")

            # Step 7: Link GST bills to customers
            print("Step 7: Linking GST bills to customer records...")
            result = db.session.execute(text("""
                UPDATE gst_billing gb
                SET customer_id = c.customer_id
                FROM customer c
                WHERE gb.customer_phone = c.customer_phone
                AND gb.client_id = c.client_id
                AND gb.customer_id IS NULL;
            """))
            db.session.commit()
            print(f"[OK] Linked GST bills to customers (rows affected: {result.rowcount})\n")

            # Step 8: Link Non-GST bills to customers
            print("Step 8: Linking Non-GST bills to customer records...")
            result = db.session.execute(text("""
                UPDATE non_gst_billing nb
                SET customer_id = c.customer_id
                FROM customer c
                WHERE nb.customer_phone = c.customer_phone
                AND nb.client_id = c.client_id
                AND nb.customer_id IS NULL;
            """))
            db.session.commit()
            print(f"[OK] Linked Non-GST bills to customers (rows affected: {result.rowcount})\n")

            # Step 9: Get migration statistics
            print("Step 9: Gathering migration statistics...")
            stats = db.session.execute(text("""
                SELECT
                    (SELECT COUNT(*) FROM customer) as total_customers,
                    (SELECT COUNT(*) FROM customer WHERE status = 'active') as active_customers,
                    (SELECT COUNT(*) FROM gst_billing WHERE customer_id IS NOT NULL) as linked_gst_bills,
                    (SELECT COUNT(*) FROM non_gst_billing WHERE customer_id IS NOT NULL) as linked_non_gst_bills;
            """)).fetchone()

            print("\n" + "=" * 80)
            print("MIGRATION COMPLETED SUCCESSFULLY")
            print("=" * 80)
            print(f"Total Customers Created: {stats[0]}")
            print(f"Active Customers: {stats[1]}")
            print(f"Inactive Customers: {stats[0] - stats[1]}")
            print(f"GST Bills Linked: {stats[2]}")
            print(f"Non-GST Bills Linked: {stats[3]}")
            print(f"Completed at: {datetime.now().isoformat()}")
            print("=" * 80)

            return True

        except Exception as e:
            print(f"\n[ERROR] Migration failed with error: {str(e)}")
            db.session.rollback()
            return False


if __name__ == '__main__':
    print("\n>> Starting Customer Table Migration...\n")
    success = run_migration()

    if success:
        print("\n>> Migration completed successfully!")
        print("You can now use the Customer Management feature.\n")
        sys.exit(0)
    else:
        print("\n>> Migration failed. Please check the errors above.\n")
        sys.exit(1)
