#!/usr/bin/env python3
"""
Migration script to add bulk stock order tables
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from extensions import db
from models.bulk_stock_order_model import BulkStockOrder, BulkStockOrderItem

def run_migration():
    """Create bulk stock order tables"""
    app = create_app()

    with app.app_context():
        try:
            print("🔄 Starting bulk stock order migration...")

            # Create tables
            db.create_all()

            print("✅ Successfully created bulk stock order tables:")
            print("   - bulk_stock_order")
            print("   - bulk_stock_order_item")
            print("\n✨ Migration completed successfully!")

            return True

        except Exception as e:
            print(f"❌ Migration failed: {str(e)}")
            import traceback
            traceback.print_exc()
            return False

if __name__ == '__main__':
    success = run_migration()
    sys.exit(0 if success else 1)
