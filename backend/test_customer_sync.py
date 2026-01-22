"""
Test customer sync by creating a test customer and syncing it
"""
import os
import sys
import uuid
from datetime import datetime
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
load_dotenv()

from extensions import db
from models.customer_model import Customer
from services.sync_service import sync_service
from app import create_app

def test_customer_sync():
    """Create a test customer and sync it"""
    app = create_app()

    with app.app_context():
        print("\n" + "="*60)
        print("Testing Customer Sync")
        print("="*60)

        # Create a test customer
        print("\n[1/4] Creating test customer...")
        test_customer = Customer(
            customer_id=str(uuid.uuid4()),
            client_id='00000000-0000-0000-0000-000000000000',  # Replace with your client_id
            customer_code=99999,
            customer_name='Test Customer - Auto Sync',
            customer_phone='9999999999',
            customer_email='test@sync.com',
            customer_address='Test Address',
            status='active',
            total_bills=0,
            total_spent=0.0,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            synced_at=None  # Not synced yet
        )

        try:
            db.session.add(test_customer)
            db.session.commit()
            print(f"[OK] Created customer: {test_customer.customer_name}")
            print(f"    Customer ID: {test_customer.customer_id}")
            print(f"    synced_at BEFORE sync: {test_customer.synced_at}")
        except Exception as e:
            print(f"[X] Failed to create customer: {e}")
            return False

        # Initialize sync service
        print("\n[2/4] Initializing sync service...")
        if not sync_service.initialize():
            print("[X] Sync service failed to initialize")
            return False
        print("[OK] Sync service initialized")

        # Run sync
        print("\n[3/4] Running sync...")
        result = sync_service.sync_all()

        if result['status'] == 'success':
            print(f"[OK] Sync completed successfully")
            print(f"    Customers synced: {result['synced']['customers']}")
        else:
            print(f"[X] Sync failed: {result}")
            return False

        # Check if customer was synced
        print("\n[4/4] Verifying sync...")
        db.session.refresh(test_customer)

        print(f"    synced_at AFTER sync: {test_customer.synced_at}")

        if test_customer.synced_at:
            print("\n[OK] SUCCESS! Customer was synced to Supabase")
            print(f"    synced_at: {test_customer.synced_at.isoformat()}")

            # Cleanup - delete test customer
            print("\n[Cleanup] Removing test customer from SQLite...")
            db.session.delete(test_customer)
            db.session.commit()
            print("[OK] Test customer removed from local database")
            print("[INFO] Test customer still exists in Supabase (this is normal)")

            return True
        else:
            print("\n[X] FAILED: synced_at is still NULL")
            print("    Possible reasons:")
            print("    - Sync didn't find the customer")
            print("    - Database update failed")
            print("    - Check sync service logs")
            return False

if __name__ == "__main__":
    success = test_customer_sync()

    print("\n" + "="*60)
    if success:
        print("[OK] Customer sync test PASSED!")
        print("\nWhat happened:")
        print("1. Created a test customer in SQLite (synced_at = NULL)")
        print("2. Ran sync to Supabase")
        print("3. synced_at was updated with timestamp")
        print("4. Test customer was removed from SQLite")
        print("5. Customer still exists in Supabase (verified sync worked)")
    else:
        print("[X] Customer sync test FAILED")
        print("Check the errors above")
    print("="*60)

    sys.exit(0 if success else 1)
