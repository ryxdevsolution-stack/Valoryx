import uuid
from datetime import datetime
from flask import Blueprint, request, jsonify, g
from extensions import db
from sqlalchemy import func, case
from models.bulk_stock_order_model import BulkStockOrder, BulkStockOrderItem
from models.stock_model import StockEntry
from utils.auth_middleware import authenticate
from utils.permission_middleware import require_permission
from utils.audit_logger import log_action
from utils.helpers import title_case

bulk_order_bp = Blueprint('bulk_stock_order', __name__)


def generate_order_number(client_id):
    """Generate unique order number: ORD-YYYY-###"""
    year = datetime.now().year
    prefix = f"ORD-{year}-"

    # Single MAX() query — no collision loop
    row = db.session.query(
        func.max(
            func.cast(
                func.substr(BulkStockOrder.order_number, len(prefix) + 1),
                db.Integer
            )
        )
    ).filter(
        BulkStockOrder.client_id == client_id,
        BulkStockOrder.order_number.like(f"{prefix}%"),
        func.length(BulkStockOrder.order_number) == len(prefix) + 4,
    ).scalar()

    next_num = (row or 0) + 1
    return f"{prefix}{next_num:04d}"


@bulk_order_bp.route('', methods=['POST'])
@authenticate
@require_permission('create_bulk_order')
def create_bulk_order():
    """Create a new bulk stock order"""
    try:
        data = request.get_json()
        client_id = g.user['client_id']
        user_id = g.user['user_id']

        # Validate required fields
        if 'items' not in data or not data['items']:
            return jsonify({'error': 'Order must contain at least one item'}), 400

        # Generate order number
        order_number = generate_order_number(client_id)

        # Added-by label (v19) — user-typed name for shared-login attribution
        added_by_label = (data.get('added_by_label') or '').strip() or None

        # Create order (apply title case to supplier name)
        order = BulkStockOrder(
            order_id=str(uuid.uuid4()),
            client_id=client_id,
            order_number=order_number,
            supplier_name=title_case(data.get('supplier_name')),
            supplier_contact=data.get('supplier_contact'),
            order_date=datetime.utcnow(),
            expected_delivery_date=datetime.fromisoformat(data['expected_delivery_date']) if data.get('expected_delivery_date') else None,
            status='pending',
            notes=data.get('notes'),
            created_by=user_id,
            added_by_label=added_by_label,
            created_at=datetime.utcnow()
        )

        db.session.add(order)

        # Batch-fetch products by name to avoid N+1 per item
        names_without_id = [
            title_case(d['product_name'])
            for d in data['items']
            if not d.get('product_id') and d.get('product_name')
        ]
        _name_to_id: dict = {}
        if names_without_id:
            _rows = StockEntry.query.filter(
                StockEntry.client_id == client_id,
                StockEntry.product_name.in_(names_without_id)
            ).with_entities(StockEntry.product_name, StockEntry.product_id).all()
            _name_to_id = {r.product_name: r.product_id for r in _rows}

        # Add order items (apply title case to product names and categories)
        for item_data in data['items']:
            # Apply title case to name fields
            product_name = title_case(item_data['product_name'])
            category = title_case(item_data.get('category', 'Other'))

            # Check if product exists (dict lookup — no per-item query)
            product_id = item_data.get('product_id')
            if not product_id and product_name:
                product_id = _name_to_id.get(product_name)

            order_item = BulkStockOrderItem(
                item_id=str(uuid.uuid4()),
                order_id=order.order_id,
                product_id=product_id,
                product_name=product_name,
                category=category,
                quantity_ordered=item_data['quantity_ordered'],
                quantity_received=0,
                unit=item_data.get('unit', 'pcs'),
                cost_price=item_data.get('cost_price'),
                selling_price=item_data.get('selling_price'),
                mrp=item_data.get('mrp'),
                barcode=item_data.get('barcode'),
                item_code=item_data.get('item_code'),
                gst_percentage=item_data.get('gst_percentage', 0),
                hsn_code=item_data.get('hsn_code'),
                notes=item_data.get('notes')
            )
            db.session.add(order_item)

        db.session.commit()

        # Log action
        log_action('CREATE', 'bulk_stock_order', order.order_id, None, order.to_dict())

        return jsonify({
            'success': True,
            'message': 'Bulk order created successfully',
            'order': order.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to create bulk order', 'message': str(e)}), 500


@bulk_order_bp.route('', methods=['GET'])
@authenticate
@require_permission('view_bulk_orders')
def get_bulk_orders():
    """Get all bulk orders for the client"""
    try:
        client_id = g.user['client_id']

        # Get query parameters
        status = request.args.get('status')

        # Build query
        query = BulkStockOrder.query.filter_by(client_id=client_id)

        if status:
            query = query.filter_by(status=status)

        # Order by date desc
        orders = query.order_by(BulkStockOrder.order_date.desc()).all()

        return jsonify({
            'success': True,
            'orders': [order.to_dict() for order in orders]
        }), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch orders', 'message': str(e)}), 500


@bulk_order_bp.route('/<order_id>', methods=['GET'])
@authenticate
@require_permission('view_bulk_orders')
def get_bulk_order(order_id):
    """Get a specific bulk order with all items"""
    try:
        client_id = g.user['client_id']

        order = BulkStockOrder.query.filter_by(
            order_id=order_id,
            client_id=client_id
        ).first()

        if not order:
            return jsonify({'error': 'Order not found'}), 404

        return jsonify({
            'success': True,
            'order': order.to_dict()
        }), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch order', 'message': str(e)}), 500


@bulk_order_bp.route('/<order_id>', methods=['PUT'])
@authenticate
@require_permission('edit_bulk_order')
def update_bulk_order(order_id):
    """Update a bulk order"""
    try:
        client_id = g.user['client_id']
        data = request.get_json()

        order = BulkStockOrder.query.filter_by(
            order_id=order_id,
            client_id=client_id
        ).first()

        if not order:
            return jsonify({'error': 'Order not found'}), 404

        # Store old data
        old_data = order.to_dict()

        # Update fields
        if 'supplier_name' in data:
            order.supplier_name = data['supplier_name']
        if 'supplier_contact' in data:
            order.supplier_contact = data['supplier_contact']
        if 'expected_delivery_date' in data:
            order.expected_delivery_date = datetime.fromisoformat(data['expected_delivery_date']) if data['expected_delivery_date'] else None
        if 'status' in data:
            order.status = data['status']
            if data['status'] == 'received':
                order.received_at = datetime.utcnow()
        if 'notes' in data:
            order.notes = data['notes']

        order.updated_at = datetime.utcnow()

        db.session.commit()

        # Log action
        log_action('UPDATE', 'bulk_stock_order', order_id, old_data, order.to_dict())

        return jsonify({
            'success': True,
            'message': 'Order updated successfully',
            'order': order.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to update order', 'message': str(e)}), 500


@bulk_order_bp.route('/<order_id>/receive', methods=['POST'])
@authenticate
@require_permission('receive_bulk_order')
def receive_bulk_order(order_id):
    """
    Receive items from a bulk order and add to stock
    Can receive partial quantities
    """
    try:
        client_id = g.user['client_id']
        data = request.get_json()

        order = BulkStockOrder.query.filter_by(
            order_id=order_id,
            client_id=client_id
        ).first()

        if not order:
            return jsonify({'error': 'Order not found'}), 404

        if not data.get('items'):
            return jsonify({'error': 'No items to receive'}), 400

        # Store old data
        old_data = order.to_dict()

        # Batch-fetch all order items and stock entries before the loop
        incoming_ids = [d.get('item_id') for d in data['items'] if d.get('item_id')]
        order_items_map: dict = {}
        if incoming_ids:
            for oi in BulkStockOrderItem.query.filter(
                BulkStockOrderItem.item_id.in_(incoming_ids),
                BulkStockOrderItem.order_id == order_id
            ).all():
                order_items_map[oi.item_id] = oi

        # Pre-load stock entries by product_id and by product_name
        _prod_ids = {oi.product_id for oi in order_items_map.values() if oi.product_id}
        _prod_names = {oi.product_name for oi in order_items_map.values() if not oi.product_id and oi.product_name}
        _stock_rows = StockEntry.query.filter(
            StockEntry.client_id == client_id,
            db.or_(
                StockEntry.product_id.in_(_prod_ids) if _prod_ids else db.false(),
                StockEntry.product_name.in_(_prod_names) if _prod_names else db.false(),
            )
        ).all() if (_prod_ids or _prod_names) else []
        _stock_by_id: dict = {s.product_id: s for s in _stock_rows}
        _stock_by_name: dict = {s.product_name: s for s in _stock_rows if s.product_name}

        # Process each received item
        for item_data in data['items']:
            item_id = item_data.get('item_id')
            quantity_received = item_data.get('quantity_received', 0)

            if quantity_received <= 0:
                continue

            # Find the order item (dict lookup — no per-item query)
            order_item = order_items_map.get(item_id)

            if not order_item:
                continue

            # Update received quantity
            order_item.quantity_received += quantity_received

            # Ensure we don't exceed ordered quantity
            if order_item.quantity_received > order_item.quantity_ordered:
                order_item.quantity_received = order_item.quantity_ordered

            # Resolve stock entry (dict lookup — no per-item query)
            existing_product = None
            if order_item.product_id:
                existing_product = _stock_by_id.get(order_item.product_id)
            else:
                existing_product = _stock_by_name.get(order_item.product_name)

            if existing_product:
                # Update existing product
                product_old_data = existing_product.to_dict()
                existing_product.quantity += quantity_received

                # Update prices if provided
                if order_item.cost_price:
                    existing_product.cost_price = order_item.cost_price
                if order_item.selling_price:
                    existing_product.rate = order_item.selling_price
                if order_item.mrp:
                    existing_product.mrp = order_item.mrp

                existing_product.updated_at = datetime.utcnow()

                log_action('UPDATE', 'stock_entry', existing_product.product_id, product_old_data, existing_product.to_dict())
            else:
                # Create new product
                from routes.stock import generate_item_code

                new_product = StockEntry(
                    product_id=str(uuid.uuid4()),
                    client_id=client_id,
                    product_name=order_item.product_name,
                    category=order_item.category,
                    quantity=quantity_received,
                    rate=order_item.selling_price or 0,
                    cost_price=order_item.cost_price,
                    mrp=order_item.mrp,
                    unit=order_item.unit,
                    low_stock_alert=10,
                    item_code=order_item.item_code or generate_item_code(client_id, order_item.product_name),
                    barcode=order_item.barcode,
                    gst_percentage=order_item.gst_percentage or 0,
                    hsn_code=order_item.hsn_code,
                    created_at=datetime.utcnow(),
                    created_by=g.user['user_id'],
                    added_by_label=order.added_by_label,
                )

                db.session.add(new_product)
                order_item.product_id = new_product.product_id
                # Keep dicts in sync so duplicate names in same batch resolve correctly
                _stock_by_id[new_product.product_id] = new_product
                if new_product.product_name:
                    _stock_by_name[new_product.product_name] = new_product

                log_action('CREATE', 'stock_entry', new_product.product_id, None, new_product.to_dict())

        # Use already-fetched map — avoids a separate SELECT on the dynamic relationship
        all_items = list(order_items_map.values())
        fully_received = all(item.quantity_received >= item.quantity_ordered for item in all_items)
        partially_received = any(item.quantity_received > 0 for item in all_items)

        if fully_received:
            order.status = 'received'
            order.received_at = datetime.utcnow()
        elif partially_received:
            order.status = 'partial'

        order.updated_at = datetime.utcnow()

        db.session.commit()

        # Log action
        log_action('UPDATE', 'bulk_stock_order', order_id, old_data, order.to_dict())

        return jsonify({
            'success': True,
            'message': 'Items received and added to stock successfully',
            'order': order.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to receive order', 'message': str(e)}), 500


@bulk_order_bp.route('/<order_id>', methods=['DELETE'])
@authenticate
@require_permission('delete_bulk_order')
def delete_bulk_order(order_id):
    """Delete a bulk order"""
    try:
        client_id = g.user['client_id']

        order = BulkStockOrder.query.filter_by(
            order_id=order_id,
            client_id=client_id
        ).first()

        if not order:
            return jsonify({'error': 'Order not found'}), 404

        # Store data for audit
        old_data = order.to_dict()

        db.session.delete(order)
        db.session.commit()

        # Log action
        log_action('DELETE', 'bulk_stock_order', order_id, old_data, None)

        return jsonify({
            'success': True,
            'message': 'Order deleted successfully'
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to delete order', 'message': str(e)}), 500


@bulk_order_bp.route('/stats', methods=['GET'])
@authenticate
@require_permission('view_stock')
def get_order_stats():
    """Get statistics about bulk orders"""
    try:
        client_id = g.user['client_id']

        # Single GROUP BY CASE WHEN — was 4 separate COUNT queries
        row = db.session.query(
            func.count(BulkStockOrder.order_id).label('total'),
            func.sum(case((BulkStockOrder.status == 'pending',  1), else_=0)).label('pending'),
            func.sum(case((BulkStockOrder.status == 'partial',  1), else_=0)).label('partial'),
            func.sum(case((BulkStockOrder.status == 'received', 1), else_=0)).label('received'),
        ).filter(BulkStockOrder.client_id == client_id).one()

        total_count    = row.total    or 0
        pending_count  = row.pending  or 0
        partial_count  = row.partial  or 0
        received_count = row.received or 0

        return jsonify({
            'success': True,
            'stats': {
                'pending': pending_count,
                'partial': partial_count,
                'received': received_count,
                'total': total_count
            }
        }), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch stats', 'message': str(e)}), 500
