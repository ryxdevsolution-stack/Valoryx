import uuid
from datetime import datetime
from flask import Blueprint, request, jsonify, g
from extensions import db
from models.stock_transfer_model import StockTransfer, StockTransferItem
from models.stock_model import StockEntry
from models.branch_model import Branch
from models.branch_inventory_model import BranchInventory
from utils.auth_middleware import authenticate

stock_transfer_bp = Blueprint('stock_transfers', __name__)


def check_owner_admin(user):
    """Returns error response tuple if user is not owner/admin, None if OK"""
    if user.get('role') not in ('owner', 'admin') and not user.get('is_super_admin'):
        return jsonify({'success': False, 'error': 'Only owners and admins can manage stock transfers'}), 403
    return None


@stock_transfer_bp.route('', methods=['POST'])
@authenticate
def create_transfer():
    """Create a new stock transfer request between branches"""
    try:
        role_error = check_owner_admin(g.user)
        if role_error:
            return role_error

        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Request body is required'}), 400

        client_id = g.user['client_id']

        # Validate required fields
        from_branch_id = data.get('from_branch_id')
        to_branch_id = data.get('to_branch_id')
        items = data.get('items')

        if not from_branch_id or not to_branch_id:
            return jsonify({'success': False, 'error': 'from_branch_id and to_branch_id are required'}), 400

        if str(from_branch_id) == str(to_branch_id):
            return jsonify({'success': False, 'error': 'Cannot transfer to the same branch'}), 400

        # Validate both branches exist, belong to client, and are active
        from_branch = Branch.query.filter_by(
            branch_id=from_branch_id,
            client_id=client_id,
            is_active=True
        ).first()
        if not from_branch:
            return jsonify({'success': False, 'error': 'Source branch not found or inactive'}), 404

        to_branch = Branch.query.filter_by(
            branch_id=to_branch_id,
            client_id=client_id,
            is_active=True
        ).first()
        if not to_branch:
            return jsonify({'success': False, 'error': 'Destination branch not found or inactive'}), 404

        # Validate items
        if not items or not isinstance(items, list):
            return jsonify({'success': False, 'error': 'items must be a non-empty list'}), 400

        if len(items) > 100:
            return jsonify({'success': False, 'error': 'Cannot transfer more than 100 items at once'}), 400

        # Validate each item
        for idx, item in enumerate(items):
            product_id = item.get('product_id')
            quantity = item.get('quantity')

            if not product_id:
                return jsonify({'success': False, 'error': f'product_id is required for item {idx + 1}'}), 400

            if quantity is None or not isinstance(quantity, (int, float)) or quantity <= 0:
                return jsonify({'success': False, 'error': f'quantity must be greater than 0 for item {idx + 1}'}), 400

            # Verify product exists for this client
            product = StockEntry.query.filter_by(
                product_id=product_id,
                client_id=client_id
            ).first()
            if not product:
                return jsonify({'success': False, 'error': f'Product not found for item {idx + 1}'}), 404

            # Verify sufficient stock at source branch
            branch_inv = BranchInventory.query.filter_by(
                branch_id=from_branch_id,
                product_id=product_id,
                client_id=client_id
            ).first()

            available_qty = branch_inv.quantity if branch_inv else 0
            if available_qty < int(quantity):
                return jsonify({
                    'success': False,
                    'error': f'Insufficient stock for {product.product_name} at source branch (available: {available_qty}, requested: {int(quantity)})'
                }), 400

        # Create the transfer request
        transfer = StockTransfer(
            transfer_id=str(uuid.uuid4()),
            client_id=client_id,
            from_branch_id=from_branch_id,
            to_branch_id=to_branch_id,
            status='pending',
            notes=data.get('notes'),
            requested_by=g.user['user_id']
        )
        db.session.add(transfer)

        # Create transfer items
        for item in items:
            transfer_item = StockTransferItem(
                id=str(uuid.uuid4()),
                transfer_id=transfer.transfer_id,
                product_id=item['product_id'],
                quantity=int(item['quantity'])
            )
            db.session.add(transfer_item)

        db.session.commit()

        # Refresh to load relationships for to_dict()
        db.session.refresh(transfer)

        return jsonify({
            'success': True,
            'data': transfer.to_dict(),
            'message': 'Transfer request created'
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': f'Failed to create transfer: {str(e)}'}), 500


@stock_transfer_bp.route('', methods=['GET'])
@authenticate
def list_transfers():
    """List stock transfers with filtering and pagination"""
    try:
        role_error = check_owner_admin(g.user)
        if role_error:
            return role_error

        client_id = g.user['client_id']

        # Query params
        status = request.args.get('status')
        from_branch_id = request.args.get('from_branch_id')
        to_branch_id = request.args.get('to_branch_id')
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)

        # Clamp pagination values
        page = max(1, page)
        per_page = max(1, min(per_page, 100))

        # Build query
        query = StockTransfer.query.filter_by(client_id=client_id)

        if status:
            query = query.filter_by(status=status)
        if from_branch_id:
            query = query.filter_by(from_branch_id=from_branch_id)
        if to_branch_id:
            query = query.filter_by(to_branch_id=to_branch_id)

        # Get total count before pagination
        total = query.count()

        # Order and paginate
        transfers = query.order_by(StockTransfer.created_at.desc()) \
            .offset((page - 1) * per_page) \
            .limit(per_page) \
            .all()

        return jsonify({
            'success': True,
            'data': [t.to_dict() for t in transfers],
            'total': total,
            'page': page,
            'per_page': per_page
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'error': f'Failed to list transfers: {str(e)}'}), 500


@stock_transfer_bp.route('/<transfer_id>', methods=['GET'])
@authenticate
def get_transfer(transfer_id):
    """Get a specific stock transfer with items"""
    try:
        role_error = check_owner_admin(g.user)
        if role_error:
            return role_error

        client_id = g.user['client_id']

        transfer = StockTransfer.query.filter_by(
            transfer_id=transfer_id,
            client_id=client_id
        ).first()

        if not transfer:
            return jsonify({'success': False, 'error': 'Transfer not found'}), 404

        return jsonify({
            'success': True,
            'data': transfer.to_dict()
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'error': f'Failed to get transfer: {str(e)}'}), 500


@stock_transfer_bp.route('/<transfer_id>/approve', methods=['POST'])
@authenticate
def approve_transfer(transfer_id):
    """Approve a pending transfer and execute stock movement"""
    try:
        role_error = check_owner_admin(g.user)
        if role_error:
            return role_error

        client_id = g.user['client_id']

        transfer = StockTransfer.query.filter_by(
            transfer_id=transfer_id,
            client_id=client_id
        ).first()

        if not transfer:
            return jsonify({'success': False, 'error': 'Transfer not found'}), 404

        if transfer.status != 'pending':
            return jsonify({'success': False, 'error': 'Transfer is not pending'}), 400

        # Execute the stock movement inside a transaction
        for item in transfer.items:
            # Get source branch inventory
            source_inv = BranchInventory.query.filter_by(
                branch_id=transfer.from_branch_id,
                product_id=item.product_id,
                client_id=client_id
            ).first()

            if not source_inv or source_inv.quantity < item.quantity:
                product_name = item.product.product_name if item.product else str(item.product_id)
                db.session.rollback()
                return jsonify({
                    'success': False,
                    'error': f'Insufficient stock for {product_name}'
                }), 400

            # Deduct from source
            source_inv.quantity -= item.quantity

            # Get or create destination branch inventory
            dest_inv = BranchInventory.query.filter_by(
                branch_id=transfer.to_branch_id,
                product_id=item.product_id,
                client_id=client_id
            ).first()

            if dest_inv:
                dest_inv.quantity += item.quantity
            else:
                dest_inv = BranchInventory(
                    id=str(uuid.uuid4()),
                    branch_id=transfer.to_branch_id,
                    product_id=item.product_id,
                    client_id=client_id,
                    quantity=item.quantity
                )
                db.session.add(dest_inv)

            # Update the stock_entry total quantity to reflect sum across all branches
            total_qty = db.session.query(
                db.func.coalesce(db.func.sum(BranchInventory.quantity), 0)
            ).filter_by(
                product_id=item.product_id,
                client_id=client_id
            ).scalar()

            stock_entry = StockEntry.query.filter_by(
                product_id=item.product_id,
                client_id=client_id
            ).first()
            if stock_entry:
                stock_entry.quantity = total_qty

        # Update transfer status
        transfer.status = 'completed'
        transfer.approved_by = g.user['user_id']
        transfer.approved_at = datetime.utcnow()
        transfer.completed_at = datetime.utcnow()

        db.session.commit()

        return jsonify({
            'success': True,
            'data': transfer.to_dict(),
            'message': 'Transfer approved and completed'
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': f'Failed to approve transfer: {str(e)}'}), 500


@stock_transfer_bp.route('/<transfer_id>/reject', methods=['POST'])
@authenticate
def reject_transfer(transfer_id):
    """Reject a pending stock transfer"""
    try:
        role_error = check_owner_admin(g.user)
        if role_error:
            return role_error

        client_id = g.user['client_id']

        transfer = StockTransfer.query.filter_by(
            transfer_id=transfer_id,
            client_id=client_id
        ).first()

        if not transfer:
            return jsonify({'success': False, 'error': 'Transfer not found'}), 404

        if transfer.status != 'pending':
            return jsonify({'success': False, 'error': 'Transfer is not pending'}), 400

        # Get optional rejection reason
        data = request.get_json(silent=True) or {}
        reason = data.get('reason')

        transfer.status = 'rejected'
        transfer.approved_by = g.user['user_id']
        transfer.approved_at = datetime.utcnow()

        if reason:
            transfer.notes = (transfer.notes or '') + f'\nRejection reason: {reason}'

        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Transfer rejected'
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': f'Failed to reject transfer: {str(e)}'}), 500


@stock_transfer_bp.route('/branches/<branch_id>/inventory', methods=['GET'])
@authenticate
def get_branch_inventory(branch_id):
    """Get inventory at a specific branch"""
    try:
        client_id = g.user['client_id']

        # Verify branch exists and belongs to client
        branch = Branch.query.filter_by(
            branch_id=branch_id,
            client_id=client_id
        ).first()

        if not branch:
            return jsonify({'success': False, 'error': 'Branch not found'}), 404

        inventory = BranchInventory.query.filter_by(
            branch_id=branch_id,
            client_id=client_id
        ).all()

        return jsonify({
            'success': True,
            'data': [inv.to_dict() for inv in inventory]
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'error': f'Failed to get branch inventory: {str(e)}'}), 500
