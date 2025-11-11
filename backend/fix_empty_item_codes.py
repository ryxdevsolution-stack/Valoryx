#!/usr/bin/env python3
"""
Fix empty item_code and barcode values in the database
- Sets empty barcode strings to NULL
- Auto-generates item_codes for products without them
"""

import sys
import os
import re
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from extensions import db
from models.stock_model import StockEntry


def generate_item_code(client_id, product_name, existing_codes_set):
    """
    Auto-generate item code based on product name and client
    Format: {PRODUCT_INITIALS}-{CLIENT_PREFIX}-{SEQUENCE}
    """
    # Extract product initials (first 3 letters, alphanumeric only)
    clean_name = re.sub(r'[^a-zA-Z0-9]', '', product_name)
    product_prefix = clean_name[:3].upper() if clean_name else 'ITM'

    # Extract client prefix (first 3 chars of client_id)
    client_prefix = client_id[:3].upper()

    # Find the highest sequence number
    max_sequence = 0
    for code in existing_codes_set:
        if code:
            parts = code.split('-')
            if len(parts) >= 3:
                try:
                    seq = int(parts[-1])
                    max_sequence = max(max_sequence, seq)
                except ValueError:
                    continue

    # Generate next sequence
    next_sequence = max_sequence + 1
    item_code = f"{product_prefix}-{client_prefix}-{next_sequence:03d}"

    # Add to set to track for next generation
    existing_codes_set.add(item_code)

    return item_code


def fix_empty_values():
    """Update empty item_code and barcode values"""
    app = create_app()

    with app.app_context():
        print("🔧 Fixing empty item_code and barcode values...")

        # Find all products with empty/NULL item_code
        products_with_empty_item_code = StockEntry.query.filter(
            (StockEntry.item_code == '') | (StockEntry.item_code == None)
        ).all()

        # Find all products with empty barcode (set to NULL)
        products_with_empty_barcode = StockEntry.query.filter(
            StockEntry.barcode == ''
        ).all()

        print(f"Found {len(products_with_empty_item_code)} products with empty item_code")
        print(f"Found {len(products_with_empty_barcode)} products with empty barcode")

        # Group products by client for item_code generation
        products_by_client = {}
        for product in products_with_empty_item_code:
            if product.client_id not in products_by_client:
                products_by_client[product.client_id] = []
            products_by_client[product.client_id].append(product)

        # Auto-generate item_codes per client
        generated_item_codes = 0
        for client_id, products in products_by_client.items():
            print(f"\n📦 Processing {len(products)} products for client {client_id}...")

            # Get all existing item_codes for this client
            existing_codes = StockEntry.query.filter_by(client_id=client_id).with_entities(
                StockEntry.item_code
            ).all()
            existing_codes_set = {code[0] for code in existing_codes if code[0]}

            # Generate item_codes for products without them
            for product in products:
                new_item_code = generate_item_code(client_id, product.product_name, existing_codes_set)
                product.item_code = new_item_code
                generated_item_codes += 1
                print(f"   ✓ {product.product_name[:30]:<30} → {new_item_code}")

        # Update barcodes to NULL
        updated_barcodes = 0
        for product in products_with_empty_barcode:
            product.barcode = None
            updated_barcodes += 1

        try:
            db.session.commit()
            print(f"\n✅ Auto-generated {generated_item_codes} item_codes")
            print(f"✅ Updated {updated_barcodes} barcodes to NULL")
            print("✅ Database cleanup completed successfully!")
        except Exception as e:
            db.session.rollback()
            print(f"\n❌ Error updating database: {e}")
            import traceback
            traceback.print_exc()
            return False

        return True


if __name__ == '__main__':
    success = fix_empty_values()
    sys.exit(0 if success else 1)
