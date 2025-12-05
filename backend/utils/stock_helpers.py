"""
RYX Billing - Stock Validation Helpers
Provides batch product validation to avoid N+1 queries in billing operations
"""
from typing import List, Dict, Tuple, Optional, Set
from models.stock_model import StockEntry


def batch_validate_products(
    product_ids: List[str],
    client_id: str,
    quantities: Optional[Dict[str, int]] = None
) -> Tuple[Dict[str, StockEntry], List[str], List[Dict]]:
    """
    Batch validate multiple products in a single query.

    Args:
        product_ids: List of product IDs to validate
        client_id: Client ID for filtering
        quantities: Optional dict mapping product_id to requested quantity for stock check

    Returns:
        Tuple of:
        - products_dict: Dict mapping product_id to StockEntry object
        - not_found_ids: List of product IDs that weren't found
        - insufficient_stock: List of dicts with product info for insufficient stock

    Example:
        product_ids = ['uuid1', 'uuid2', 'uuid3']
        quantities = {'uuid1': 5, 'uuid2': 10, 'uuid3': 3}
        products, not_found, insufficient = batch_validate_products(
            product_ids, client_id, quantities
        )
    """
    # Filter out temp- and nosave- IDs (new products or quick sales)
    valid_ids = [
        pid for pid in product_ids
        if pid and not pid.startswith('temp-') and not pid.startswith('nosave-')
    ]

    if not valid_ids:
        return {}, [], []

    # Single query to fetch all products (N+1 FIX)
    products = StockEntry.query.filter(
        StockEntry.product_id.in_(valid_ids),
        StockEntry.client_id == client_id
    ).all()

    # Build lookup dict
    products_dict = {p.product_id: p for p in products}

    # Find missing products
    found_ids = set(products_dict.keys())
    not_found_ids = [pid for pid in valid_ids if pid not in found_ids]

    # Check stock availability if quantities provided
    insufficient_stock = []
    if quantities:
        for product_id, requested_qty in quantities.items():
            if product_id in products_dict:
                product = products_dict[product_id]
                if product.quantity < requested_qty:
                    insufficient_stock.append({
                        'product_id': product_id,
                        'product_name': product.product_name,
                        'available': product.quantity,
                        'requested': requested_qty
                    })

    return products_dict, not_found_ids, insufficient_stock


def get_products_by_ids(product_ids: List[str], client_id: str) -> Dict[str, StockEntry]:
    """
    Get multiple products by IDs in a single query.

    Args:
        product_ids: List of product IDs
        client_id: Client ID for filtering

    Returns:
        Dict mapping product_id to StockEntry object
    """
    if not product_ids:
        return {}

    products = StockEntry.query.filter(
        StockEntry.product_id.in_(product_ids),
        StockEntry.client_id == client_id
    ).all()

    return {p.product_id: p for p in products}


def validate_billing_items_stock(
    items: List[Dict],
    client_id: str
) -> Tuple[bool, Optional[str], Dict[str, StockEntry]]:
    """
    Validate all billing items for stock availability.

    Args:
        items: List of billing items with product_id and quantity
        client_id: Client ID for filtering

    Returns:
        Tuple of:
        - is_valid: Boolean indicating if all items are valid
        - error_message: Error message if validation failed, None otherwise
        - products_dict: Dict of validated products for further use
    """
    # Extract product IDs and quantities
    product_ids = []
    quantities = {}

    for item in items:
        product_id = item.get('product_id', '')

        # Skip temp- and nosave- products
        if product_id.startswith('temp-') or product_id.startswith('nosave-'):
            continue

        product_ids.append(product_id)
        quantities[product_id] = item.get('quantity', 0)

    # Batch validate
    products_dict, not_found_ids, insufficient_stock = batch_validate_products(
        product_ids, client_id, quantities
    )

    # Check for not found products
    if not_found_ids:
        # Find the item name for better error message
        for item in items:
            if item.get('product_id') in not_found_ids:
                return False, f"Product '{item.get('product_name', 'Unknown')}' not found for your account", {}
        return False, f"Products not found: {', '.join(not_found_ids[:3])}", {}

    # Check for insufficient stock
    if insufficient_stock:
        item = insufficient_stock[0]
        return False, f"Insufficient stock for {item['product_name']}. Available: {item['available']}, Requested: {item['requested']}", products_dict

    return True, None, products_dict


# ============================================================================
# EXPORTS
# ============================================================================

__all__ = [
    'batch_validate_products',
    'get_products_by_ids',
    'validate_billing_items_stock',
]
