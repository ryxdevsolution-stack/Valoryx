import uuid
from datetime import datetime
from flask import Blueprint, request, jsonify, g
from extensions import db
from sqlalchemy.orm import joinedload, selectinload
from models.stock_transfer_model import StockTransfer, StockTransferItem
from models.stock_model import StockEntry
from models.branch_model import Branch
from models.branch_inventory_model import BranchInventory
from utils.auth_middleware import authenticate
from utils.cache_helper import get_cache_manager

TRANSFER_CACHE_TTL = 30  # seconds — short enough to see new transfers quickly

stock_transfer_bp = Blueprint('stock_transfers', __name__)

# ── Auth helpers ──────────────────────────────────────────────────────────────

def _is_owner_admin(user):
    return user.get('role') in ('owner', 'admin') or user.get('is_super_admin')


def _is_branch_manager(user):
    """Returns True if user is a manager/admin with a branch assignment."""
    return user.get('role') in ('manager', 'admin') and bool(user.get('branch_id'))


def _can_access_transfer(user, transfer):
    """Owner/admin sees all; manager sees only transfers involving their branch."""
    if _is_owner_admin(user):
        return True
    user_branch = user.get('branch_id')
    if user_branch and user.get('role') in ('manager', 'admin'):
        return (str(transfer.to_branch_id) == str(user_branch) or
                str(transfer.from_branch_id) == str(user_branch))
    return False


def _deduct_source(client_id, branch_id, items):
    """
    Deduct item quantities from source branch inventory.
    Returns an error string if any item has insufficient stock, else None.
    OPTIMIZED: batch-fetches all BranchInventory rows in one query instead of N queries.
    """
    product_ids = [
        item.product_id if hasattr(item, 'product_id') else item['product_id']
        for item in items
    ]
    inv_map = {
        inv.product_id: inv
        for inv in BranchInventory.query.filter(
            BranchInventory.branch_id == branch_id,
            BranchInventory.product_id.in_(product_ids),
            BranchInventory.client_id == client_id
        ).all()
    }
    for item in items:
        pid = item.product_id if hasattr(item, 'product_id') else item['product_id']
        qty = item.quantity if hasattr(item, 'quantity') else item['quantity']
        src = inv_map.get(pid)
        available = src.quantity if src else 0
        if available < qty:
            pname = item.product.product_name if hasattr(item, 'product') and item.product else str(pid)
            return f'Insufficient stock for {pname} (available: {available}, requested: {qty})'
        src.quantity -= qty
    return None


def _add_to_dest(client_id, branch_id, items):
    """
    Add item quantities to destination branch inventory.
    OPTIMIZED: batch-fetches existing rows in one query instead of N queries.
    """
    product_ids = [
        item.product_id if hasattr(item, 'product_id') else item['product_id']
        for item in items
    ]
    inv_map = {
        inv.product_id: inv
        for inv in BranchInventory.query.filter(
            BranchInventory.branch_id == branch_id,
            BranchInventory.product_id.in_(product_ids),
            BranchInventory.client_id == client_id
        ).all()
    }
    for item in items:
        product_id = item.product_id if hasattr(item, 'product_id') else item['product_id']
        qty = item.quantity if hasattr(item, 'quantity') else item['quantity']
        dest = inv_map.get(product_id)
        if dest:
            dest.quantity += qty
        else:
            db.session.add(BranchInventory(
                id=str(uuid.uuid4()),
                branch_id=branch_id,
                product_id=product_id,
                client_id=client_id,
                quantity=qty
            ))


def _bust_transfer_cache(client_id):
    """Invalidate all list_transfers cache entries for a client after any write."""
    try:
        cache = get_cache_manager()
        cache.delete_pattern(f"transfers:list:{client_id}:*")
    except Exception:
        pass  # cache bust is best-effort


def _sync_stock_totals(client_id, product_ids):
    """
    Recalculate stock_entry.quantity = sum of all branch inventories for each product.
    OPTIMIZED: two batch queries instead of 2×N individual queries.
    """
    # Batch SUM per product in one query
    totals = {
        row.product_id: row.total
        for row in db.session.query(
            BranchInventory.product_id,
            db.func.coalesce(db.func.sum(BranchInventory.quantity), 0).label('total')
        ).filter(
            BranchInventory.product_id.in_(product_ids),
            BranchInventory.client_id == client_id
        ).group_by(BranchInventory.product_id).all()
    }
    # Batch-fetch all StockEntry rows in one query
    entries = StockEntry.query.filter(
        StockEntry.product_id.in_(product_ids),
        StockEntry.client_id == client_id
    ).all()
    for entry in entries:
        if entry.product_id in totals:
            entry.quantity = totals[entry.product_id]


# ── POST /api/stock-transfers  (owner sends stock immediately) ────────────────

@stock_transfer_bp.route('', methods=['POST'])
@authenticate
def create_transfer():
    """
    Owner dispatches stock to a branch.
    Stock is deducted from source immediately; status = in_transit.
    Destination branch manager confirms receipt separately.
    """
    if not _is_owner_admin(g.user):
        return jsonify({'success': False, 'error': 'Only owners and admins can send stock'}), 403

    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'Request body required'}), 400

    client_id     = g.user['client_id']
    from_branch_id = data.get('from_branch_id')
    to_branch_id   = data.get('to_branch_id')
    items_data     = data.get('items')

    if not from_branch_id or not to_branch_id:
        return jsonify({'success': False, 'error': 'from_branch_id and to_branch_id are required'}), 400

    if str(from_branch_id) == str(to_branch_id):
        return jsonify({'success': False, 'error': 'Cannot transfer to the same branch'}), 400

    from_branch = Branch.query.filter_by(branch_id=from_branch_id, client_id=client_id, is_active=True).first()
    if not from_branch:
        return jsonify({'success': False, 'error': 'Source branch not found or inactive'}), 404

    to_branch = Branch.query.filter_by(branch_id=to_branch_id, client_id=client_id, is_active=True).first()
    if not to_branch:
        return jsonify({'success': False, 'error': 'Destination branch not found or inactive'}), 404

    if not items_data or not isinstance(items_data, list) or len(items_data) == 0:
        return jsonify({'success': False, 'error': 'items must be a non-empty list'}), 400

    if len(items_data) > 100:
        return jsonify({'success': False, 'error': 'Cannot transfer more than 100 items at once'}), 400

    try:
        # Validate all items before touching inventory
        req_ids = [item.get('product_id') for item in items_data if item.get('product_id')]

        # Batch-fetch products and branch inventory in 2 queries instead of 2N
        _products_map: dict = {}
        _inv_map: dict = {}
        if req_ids:
            for p in StockEntry.query.filter(
                StockEntry.product_id.in_(req_ids),
                StockEntry.client_id == client_id
            ).all():
                _products_map[p.product_id] = p

            for inv in BranchInventory.query.filter(
                BranchInventory.product_id.in_(req_ids),
                BranchInventory.branch_id == from_branch_id,
                BranchInventory.client_id == client_id
            ).all():
                _inv_map[inv.product_id] = inv

        for idx, item in enumerate(items_data):
            if not item.get('product_id'):
                return jsonify({'success': False, 'error': f'product_id required for item {idx+1}'}), 400
            qty = item.get('quantity')
            if not qty or not isinstance(qty, (int, float)) or qty <= 0:
                return jsonify({'success': False, 'error': f'quantity must be > 0 for item {idx+1}'}), 400
            product = _products_map.get(item['product_id'])
            if not product:
                return jsonify({'success': False, 'error': f'Product not found for item {idx+1}'}), 404
            inv = _inv_map.get(item['product_id'])
            available = inv.quantity if inv else 0
            if available < int(qty):
                return jsonify({
                    'success': False,
                    'error': f'Insufficient stock for {product.product_name} '
                             f'(available: {available}, requested: {int(qty)})'
                }), 400

        # Create transfer record
        transfer = StockTransfer(
            transfer_id=str(uuid.uuid4()),
            client_id=client_id,
            from_branch_id=from_branch_id,
            to_branch_id=to_branch_id,
            transfer_type='send',
            status='in_transit',
            notes=data.get('notes'),
            requested_by=g.user['user_id'],
            approved_by=g.user['user_id'],
            approved_at=datetime.utcnow(),
            dispatched_at=datetime.utcnow(),
        )
        db.session.add(transfer)

        transfer_items = []
        for item in items_data:
            ti = StockTransferItem(
                id=str(uuid.uuid4()),
                transfer_id=transfer.transfer_id,
                product_id=item['product_id'],
                quantity=int(item['quantity'])
            )
            db.session.add(ti)
            transfer_items.append({'product_id': item['product_id'], 'quantity': int(item['quantity'])})

        # Deduct from source immediately
        err = _deduct_source(client_id, from_branch_id, transfer_items)
        if err:
            db.session.rollback()
            return jsonify({'success': False, 'error': err}), 400

        # Sync master totals
        _sync_stock_totals(client_id, [i['product_id'] for i in transfer_items])

        db.session.commit()
        _bust_transfer_cache(client_id)
        db.session.refresh(transfer)

        return jsonify({
            'success': True,
            'data': transfer.to_dict(),
            'message': f'Stock dispatched to {to_branch.name}. Awaiting receipt confirmation.'
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': f'Failed to create transfer: {str(e)}'}), 500


# ── POST /api/stock-transfers/request  (branch manager requests stock) ────────

@stock_transfer_bp.route('/request', methods=['POST'])
@authenticate
def create_request():
    """
    Branch manager requests stock from another branch.
    No stock moves yet; owner must approve to convert to in_transit.
    """
    user_role   = g.user.get('role', '')
    user_branch = g.user.get('branch_id')

    if user_role not in ('manager', 'admin') or not user_branch:
        return jsonify({
            'success': False,
            'error': 'Only branch managers/admins with a branch assignment can request stock'
        }), 403

    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'Request body required'}), 400

    client_id      = g.user['client_id']
    from_branch_id = data.get('from_branch_id')   # which branch they want stock FROM
    items_data     = data.get('items')

    if not from_branch_id:
        return jsonify({'success': False, 'error': 'from_branch_id (source branch) is required'}), 400

    if str(from_branch_id) == str(user_branch):
        return jsonify({'success': False, 'error': 'Cannot request from your own branch'}), 400

    from_branch = Branch.query.filter_by(branch_id=from_branch_id, client_id=client_id, is_active=True).first()
    if not from_branch:
        return jsonify({'success': False, 'error': 'Source branch not found or inactive'}), 404

    to_branch = Branch.query.filter_by(branch_id=user_branch, client_id=client_id, is_active=True).first()
    if not to_branch:
        return jsonify({'success': False, 'error': 'Your branch is not found or inactive'}), 404

    if not items_data or not isinstance(items_data, list) or len(items_data) == 0:
        return jsonify({'success': False, 'error': 'items must be a non-empty list'}), 400

    if len(items_data) > 100:
        return jsonify({'success': False, 'error': 'Cannot request more than 100 items at once'}), 400

    try:
        # Batch-fetch products before validation loop
        _req_ids = [item.get('product_id') for item in items_data if item.get('product_id')]
        _req_products: dict = {}
        if _req_ids:
            for p in StockEntry.query.filter(
                StockEntry.product_id.in_(_req_ids),
                StockEntry.client_id == client_id
            ).all():
                _req_products[p.product_id] = p

        for idx, item in enumerate(items_data):
            if not item.get('product_id'):
                return jsonify({'success': False, 'error': f'product_id required for item {idx+1}'}), 400
            qty = item.get('quantity')
            if not qty or not isinstance(qty, (int, float)) or qty <= 0:
                return jsonify({'success': False, 'error': f'quantity must be > 0 for item {idx+1}'}), 400
            if not _req_products.get(item['product_id']):
                return jsonify({'success': False, 'error': f'Product not found for item {idx+1}'}), 404

        transfer = StockTransfer(
            transfer_id=str(uuid.uuid4()),
            client_id=client_id,
            from_branch_id=from_branch_id,
            to_branch_id=user_branch,
            transfer_type='request',
            status='requested',
            notes=data.get('notes'),
            requested_by=g.user['user_id'],
        )
        db.session.add(transfer)

        for item in items_data:
            db.session.add(StockTransferItem(
                id=str(uuid.uuid4()),
                transfer_id=transfer.transfer_id,
                product_id=item['product_id'],
                quantity=int(item['quantity'])
            ))

        db.session.commit()
        _bust_transfer_cache(client_id)
        db.session.refresh(transfer)

        return jsonify({
            'success': True,
            'data': transfer.to_dict(),
            'message': 'Stock request submitted. Waiting for owner approval.'
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': f'Failed to create request: {str(e)}'}), 500


# ── GET /api/stock-transfers  (list with role-based scoping) ──────────────────

@stock_transfer_bp.route('', methods=['GET'])
@authenticate
def list_transfers():
    """List transfers. Owner sees all; branch manager sees only their branch's transfers."""
    client_id   = g.user['client_id']
    user_role   = g.user.get('role', '')
    user_branch = g.user.get('branch_id')

    # Determine base query scope
    if _is_owner_admin(g.user):
        query = StockTransfer.query.filter_by(client_id=client_id)
    elif user_role in ('manager', 'admin') and user_branch:
        query = StockTransfer.query.filter(
            StockTransfer.client_id == client_id,
            db.or_(
                StockTransfer.to_branch_id == user_branch,
                StockTransfer.from_branch_id == user_branch
            )
        )
    else:
        return jsonify({'success': False, 'error': 'Access denied'}), 403

    try:
        status          = request.args.get('status')
        transfer_type   = request.args.get('transfer_type')
        from_branch_id  = request.args.get('from_branch_id')
        to_branch_id    = request.args.get('to_branch_id')
        page            = max(1, request.args.get('page', 1, type=int))
        per_page        = max(1, min(100, request.args.get('per_page', 20, type=int)))

        # Cache key scoped to client + role-scope + all filter params
        scope        = user_branch or 'all'
        cache_key    = (f"transfers:list:{client_id}:{scope}:"
                        f"{status}:{transfer_type}:{from_branch_id}:{to_branch_id}:"
                        f"{page}:{per_page}")
        cache        = get_cache_manager()
        cached       = cache.get(cache_key)
        if cached is not None:
            return jsonify(cached), 200

        if status:
            query = query.filter(StockTransfer.status == status)
        if transfer_type:
            query = query.filter(StockTransfer.transfer_type == transfer_type)
        if from_branch_id:
            query = query.filter(StockTransfer.from_branch_id == from_branch_id)
        if to_branch_id:
            query = query.filter(StockTransfer.to_branch_id == to_branch_id)

        # Eager-load all relationships to eliminate N+1 round trips.
        # branches use joinedload (branch_id is varchar = varchar, JOIN works fine).
        # users use selectinload — users.user_id is a native PostgreSQL uuid type
        # while stock_transfers foreign keys are varchar (FlexibleUUID), so a JOIN
        # produces "uuid = character varying" which PostgreSQL rejects. selectinload
        # issues WHERE user_id IN (...) with string literals that Postgres auto-casts.
        # items/product are lazy='joined' on the model — do not add joinedload here.
        transfers = query.options(
            joinedload(StockTransfer.from_branch),
            joinedload(StockTransfer.to_branch),
            selectinload(StockTransfer.requester),
            selectinload(StockTransfer.approver),
            selectinload(StockTransfer.receiver),
        ).order_by(StockTransfer.created_at.desc()) \
         .offset((page - 1) * per_page).limit(per_page).all()

        total = len(transfers) if page == 1 and len(transfers) < per_page else query.count()

        response_data = {
            'success':  True,
            'data':     [t.to_dict() for t in transfers],
            'total':    total,
            'page':     page,
            'per_page': per_page,
        }
        cache.set(cache_key, response_data, TRANSFER_CACHE_TTL)
        return jsonify(response_data), 200

    except Exception as e:
        return jsonify({'success': False, 'error': f'Failed to list transfers: {str(e)}'}), 500


# ── GET /api/stock-transfers/<id> ─────────────────────────────────────────────

@stock_transfer_bp.route('/<transfer_id>', methods=['GET'])
@authenticate
def get_transfer(transfer_id):
    try:
        client_id = g.user['client_id']
        transfer  = StockTransfer.query.filter_by(transfer_id=transfer_id, client_id=client_id).first()
        if not transfer:
            return jsonify({'success': False, 'error': 'Transfer not found'}), 404
        if not _can_access_transfer(g.user, transfer):
            return jsonify({'success': False, 'error': 'Access denied'}), 403
        return jsonify({'success': True, 'data': transfer.to_dict()}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': f'Failed to get transfer: {str(e)}'}), 500


# ── POST /api/stock-transfers/<id>/approve  (owner approves a request) ────────

@stock_transfer_bp.route('/<transfer_id>/approve', methods=['POST'])
@authenticate
def approve_transfer(transfer_id):
    """
    Owner approves a branch stock request.
    Deducts from source branch; status → in_transit.
    Branch manager will confirm receipt separately.
    """
    if not _is_owner_admin(g.user):
        return jsonify({'success': False, 'error': 'Only owners and admins can approve requests'}), 403

    client_id = g.user['client_id']
    transfer  = StockTransfer.query.filter_by(transfer_id=transfer_id, client_id=client_id).first()
    if not transfer:
        return jsonify({'success': False, 'error': 'Transfer not found'}), 404

    # Accept both 'requested' (new flow) and legacy 'pending' transfers
    if transfer.status not in ('requested', 'pending'):
        return jsonify({'success': False, 'error': f'Transfer is not pending approval (status: {transfer.status})'}), 400

    try:
        items_list = list(transfer.items)
        _ap_pids = [i.product_id for i in items_list]

        # Batch-fetch source inventory — was 1 query per item
        _ap_inv: dict = {}
        if _ap_pids:
            for inv in BranchInventory.query.filter(
                BranchInventory.branch_id == transfer.from_branch_id,
                BranchInventory.product_id.in_(_ap_pids),
                BranchInventory.client_id == client_id,
            ).all():
                _ap_inv[inv.product_id] = inv

        # Validate and deduct stock from source
        for item in items_list:
            src = _ap_inv.get(item.product_id)
            available = src.quantity if src else 0
            if available < item.quantity:
                pname = item.product.product_name if item.product else str(item.product_id)
                db.session.rollback()
                return jsonify({'success': False,
                                'error': f'Insufficient stock for {pname} (available: {available})'}), 400
            if src:
                src.quantity -= item.quantity

        _sync_stock_totals(client_id, [i.product_id for i in transfer.items])

        transfer.status       = 'in_transit'
        transfer.approved_by  = g.user['user_id']
        transfer.approved_at  = datetime.utcnow()
        transfer.dispatched_at = datetime.utcnow()

        db.session.commit()
        _bust_transfer_cache(client_id)

        return jsonify({
            'success': True,
            'data':    transfer.to_dict(),
            'message': 'Request approved. Stock is now in transit to the branch.'
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': f'Failed to approve: {str(e)}'}), 500


# ── POST /api/stock-transfers/<id>/receive  (branch manager confirms receipt) ─

@stock_transfer_bp.route('/<transfer_id>/receive', methods=['POST'])
@authenticate
def receive_transfer(transfer_id):
    """
    Branch manager confirms receipt of an in_transit transfer.
    Adds items to destination branch inventory; status → received.
    """
    user_role   = g.user.get('role', '')
    user_branch = g.user.get('branch_id')

    # Owner/admin can also mark as received on behalf of a branch
    if not (_is_owner_admin(g.user) or (user_role in ('manager', 'admin') and user_branch)):
        return jsonify({'success': False, 'error': 'Access denied'}), 403

    client_id = g.user['client_id']
    transfer  = StockTransfer.query.filter_by(transfer_id=transfer_id, client_id=client_id).first()
    if not transfer:
        return jsonify({'success': False, 'error': 'Transfer not found'}), 404

    if transfer.status != 'in_transit':
        return jsonify({'success': False, 'error': f'Transfer is not in transit (status: {transfer.status})'}), 400

    # Branch manager can only receive transfers destined for their branch
    if not _is_owner_admin(g.user) and user_branch:
        if str(transfer.to_branch_id) != str(user_branch):
            return jsonify({'success': False, 'error': 'This transfer is not destined for your branch'}), 403

    try:
        _add_to_dest(client_id, str(transfer.to_branch_id), transfer.items)
        _sync_stock_totals(client_id, [i.product_id for i in transfer.items])

        transfer.status      = 'received'
        transfer.received_by = g.user['user_id']
        transfer.received_at = datetime.utcnow()
        transfer.completed_at = datetime.utcnow()

        db.session.commit()
        _bust_transfer_cache(client_id)

        return jsonify({
            'success': True,
            'data':    transfer.to_dict(),
            'message': 'Stock received and added to branch inventory.'
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': f'Failed to mark as received: {str(e)}'}), 500


# ── POST /api/stock-transfers/<id>/reject ─────────────────────────────────────

@stock_transfer_bp.route('/<transfer_id>/reject', methods=['POST'])
@authenticate
def reject_transfer(transfer_id):
    """
    Owner rejects a stock request (status: requested).
    If an in_transit transfer is rejected, stock is restored to source.
    """
    if not _is_owner_admin(g.user):
        return jsonify({'success': False, 'error': 'Only owners and admins can reject transfers'}), 403

    client_id = g.user['client_id']
    transfer  = StockTransfer.query.filter_by(transfer_id=transfer_id, client_id=client_id).first()
    if not transfer:
        return jsonify({'success': False, 'error': 'Transfer not found'}), 404

    if transfer.status not in ('requested', 'pending', 'in_transit'):
        return jsonify({'success': False, 'error': f'Cannot reject transfer with status: {transfer.status}'}), 400

    data   = request.get_json(silent=True) or {}
    reason = data.get('reason', '').strip()

    try:
        # If already in transit, restore stock to source branch
        if transfer.status == 'in_transit':
            _rj_items = list(transfer.items)
            _rj_pids  = [i.product_id for i in _rj_items]

            # Batch-fetch source inventory — was 1 query per item
            _rj_inv: dict = {}
            if _rj_pids:
                for inv in BranchInventory.query.filter(
                    BranchInventory.branch_id == transfer.from_branch_id,
                    BranchInventory.product_id.in_(_rj_pids),
                    BranchInventory.client_id == client_id,
                ).all():
                    _rj_inv[inv.product_id] = inv

            for item in _rj_items:
                src = _rj_inv.get(item.product_id)
                if src:
                    src.quantity += item.quantity
                else:
                    db.session.add(BranchInventory(
                        id=str(uuid.uuid4()),
                        branch_id=str(transfer.from_branch_id),
                        product_id=item.product_id,
                        client_id=client_id,
                        quantity=item.quantity
                    ))
            _sync_stock_totals(client_id, [i.product_id for i in transfer.items])

        transfer.status      = 'rejected'
        transfer.approved_by = g.user['user_id']
        transfer.approved_at = datetime.utcnow()

        if reason:
            transfer.notes = (transfer.notes or '') + f'\nRejection reason: {reason}'

        db.session.commit()
        _bust_transfer_cache(client_id)

        return jsonify({'success': True, 'message': 'Transfer rejected'}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': f'Failed to reject: {str(e)}'}), 500


# ── GET /api/stock-transfers/branches/<id>/inventory ─────────────────────────

@stock_transfer_bp.route('/branches/<branch_id>/inventory', methods=['GET'])
@authenticate
def get_branch_inventory(branch_id):
    """Get inventory at a specific branch."""
    try:
        client_id = g.user['client_id']
        branch    = Branch.query.filter_by(branch_id=branch_id, client_id=client_id).first()
        if not branch:
            return jsonify({'success': False, 'error': 'Branch not found'}), 404

        # Branch managers can only view their own branch's inventory
        user_branch = g.user.get('branch_id')
        if not _is_owner_admin(g.user) and user_branch and str(branch_id) != str(user_branch):
            return jsonify({'success': False, 'error': 'Access denied to this branch inventory'}), 403

        inventory = BranchInventory.query.filter_by(branch_id=branch_id, client_id=client_id).all()

        return jsonify({'success': True, 'data': [inv.to_dict() for inv in inventory]}), 200

    except Exception as e:
        return jsonify({'success': False, 'error': f'Failed to get branch inventory: {str(e)}'}), 500
