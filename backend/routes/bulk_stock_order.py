import uuid
from datetime import datetime
from flask import Blueprint, request, jsonify, g
from extensions import db
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

    # Find the highest order number for this year and client
    prefix = f"ORD-{year}-"
    existing_orders = BulkStockOrder.query.filter(
        BulkStockOrder.client_id == client_id,
        BulkStockOrder.order_number.like(f"{prefix}%")
    ).order_by(BulkStockOrder.order_number.desc()).first()

    if existing_orders:
        try:
            last_num = int(existing_orders.order_number.split('-')[-1])
            next_num = last_num + 1
        except ValueError:
            next_num = 1
    else:
        next_num = 1

    order_number = f"{prefix}{next_num:04d}"

    # Handle collision
    counter = 0
    while BulkStockOrder.query.filter_by(order_number=order_number).first():
        counter += 1
        next_num += counter
        order_number = f"{prefix}{next_num:04d}"
        if counter > 100:
            order_number = f"{prefix}{uuid.uuid4().hex[:6].upper()}"
            break

    return order_number


@bulk_order_bp.route('', methods=['POST'])
@authenticate
@require_permission('add_product')
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
            created_at=datetime.utcnow()
        )

        db.session.add(order)

        # Add order items (apply title case to product names and categories)
        for item_data in data['items']:
            # Apply title case to name fields
            product_name = title_case(item_data['product_name'])
            category = title_case(item_data.get('category', 'Other'))

            # Check if product exists
            product_id = item_data.get('product_id')
            if not product_id and product_name:
                # Try to find existing product by name
                existing_product = StockEntry.query.filter_by(
                    client_id=client_id,
                    product_name=product_name
                ).first()
                if existing_product:
                    product_id = existing_product.product_id

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
@require_permission('view_stock')
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
@require_permission('view_stock')
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
@require_permission('edit_product_details')
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
@require_permission('add_product')
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

        # Process each received item
        for item_data in data['items']:
            item_id = item_data.get('item_id')
            quantity_received = item_data.get('quantity_received', 0)

            if quantity_received <= 0:
                continue

            # Find the order item
            order_item = BulkStockOrderItem.query.filter_by(
                item_id=item_id,
                order_id=order_id
            ).first()

            if not order_item:
                continue

            # Update received quantity
            order_item.quantity_received += quantity_received

            # Ensure we don't exceed ordered quantity
            if order_item.quantity_received > order_item.quantity_ordered:
                order_item.quantity_received = order_item.quantity_ordered

            # Add to stock
            existing_product = None
            if order_item.product_id:
                existing_product = StockEntry.query.filter_by(
                    product_id=order_item.product_id,
                    client_id=client_id
                ).first()
            else:
                # Try to find by product name
                existing_product = StockEntry.query.filter_by(
                    client_id=client_id,
                    product_name=order_item.product_name
                ).first()

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
                    created_at=datetime.utcnow()
                )

                db.session.add(new_product)
                order_item.product_id = new_product.product_id

                log_action('CREATE', 'stock_entry', new_product.product_id, None, new_product.to_dict())

        # Update order status
        all_items = order.items.all()
        fully_received = all([item.quantity_received >= item.quantity_ordered for item in all_items])
        partially_received = any([item.quantity_received > 0 for item in all_items])

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
@require_permission('edit_product_details')
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

        # Count orders by status
        pending_count = BulkStockOrder.query.filter_by(
            client_id=client_id,
            status='pending'
        ).count()

        partial_count = BulkStockOrder.query.filter_by(
            client_id=client_id,
            status='partial'
        ).count()

        received_count = BulkStockOrder.query.filter_by(
            client_id=client_id,
            status='received'
        ).count()

        total_count = BulkStockOrder.query.filter_by(
            client_id=client_id
        ).count()

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
