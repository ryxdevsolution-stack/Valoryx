"""
Supplier management routes.

Endpoints:
  Suppliers (vendor master):
    GET  /api/suppliers                       - list suppliers
    POST /api/suppliers                       - create supplier
    PUT  /api/suppliers/<id>                  - update supplier
    DELETE /api/suppliers/<id>                - deactivate supplier

  Deliveries:
    GET  /api/suppliers/deliveries            - list all deliveries (all suppliers)
    POST /api/suppliers/deliveries            - create delivery (draft)
    GET  /api/suppliers/deliveries/<id>       - get delivery detail
    PUT  /api/suppliers/deliveries/<id>       - update delivery (draft only)
    POST /api/suppliers/deliveries/<id>/confirm-products  - mark products confirmed
    POST /api/suppliers/deliveries/<id>/upload-note       - upload delivery note file
    GET  /api/suppliers/deliveries/<id>/download-note     - download/view delivery note
    POST /api/suppliers/deliveries/<id>/complete          - complete + update stock
    DELETE /api/suppliers/deliveries/<id>     - delete delivery (draft only)
"""

import os
import uuid
import logging
from datetime import datetime, date
from flask import Blueprint, request, jsonify, g, send_file
from sqlalchemy import text
from werkzeug.utils import secure_filename

from extensions import db
from utils.auth_middleware import authenticate
from utils.cache_helper import get_cache_manager

logger = logging.getLogger(__name__)

suppliers_bp = Blueprint('suppliers', __name__)

# ── File storage config ───────────────────────────────────────────────────────
_HOME = os.path.expanduser('~')
DELIVERY_NOTES_DIR = os.path.join(_HOME, '.mj-billing', 'delivery_notes')
ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf'}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


def _delivery_notes_path(client_id: str) -> str:
    path = os.path.join(DELIVERY_NOTES_DIR, client_id)
    os.makedirs(path, exist_ok=True)
    return path


def _allowed(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def _file_type(filename: str) -> str:
    ext = filename.rsplit('.', 1)[1].lower()
    return 'pdf' if ext == 'pdf' else 'image'


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_supplier_or_404(supplier_id: str, client_id: str):
    from models.supplier_model import Supplier
    s = Supplier.query.filter_by(supplier_id=supplier_id, client_id=client_id, is_active=True).first()
    if not s:
        return None
    return s


def _get_delivery_or_404(delivery_id: str, client_id: str):
    from models.supplier_model import SupplierDelivery
    d = SupplierDelivery.query.filter_by(delivery_id=delivery_id, client_id=client_id).first()
    if not d:
        return None
    return d


def _invalidate_supplier_cache(client_id: str):
    get_cache_manager().delete_pattern(f'suppliers:*:{client_id}:*')


def _invalidate_delivery_cache(client_id: str):
    get_cache_manager().delete_pattern(f'supplier_deliveries:*:{client_id}:*')


# ── Supplier CRUD ─────────────────────────────────────────────────────────────

@suppliers_bp.route('/', methods=['GET'])
@authenticate
def list_suppliers():
    client_id = g.user['client_id']
    cache_key = f'suppliers:list:{client_id}'

    cache = get_cache_manager()
    cached = cache.get(cache_key)
    if cached:
        return jsonify({'success': True, 'data': cached}), 200

    from models.supplier_model import Supplier
    suppliers = Supplier.query.filter_by(client_id=client_id, is_active=True).order_by(Supplier.name).all()
    data = [s.to_dict() for s in suppliers]

    cache.set(cache_key, data, timeout=300)
    return jsonify({'success': True, 'data': data}), 200


@suppliers_bp.route('/', methods=['POST'])
@authenticate
def create_supplier():
    client_id = g.user['client_id']
    body = request.get_json(silent=True) or {}

    name = (body.get('name') or '').strip()
    if not name:
        return jsonify({'success': False, 'error': 'Supplier name is required'}), 400

    from models.supplier_model import Supplier
    supplier = Supplier(
        supplier_id    = str(uuid.uuid4()),
        client_id      = client_id,
        name           = name,
        contact_person = (body.get('contact_person') or '').strip() or None,
        phone          = (body.get('phone') or '').strip() or None,
        email          = (body.get('email') or '').strip() or None,
        address        = (body.get('address') or '').strip() or None,
        gst_number     = (body.get('gst_number') or '').strip() or None,
        transport_fee  = body.get('transport_fee') or 0,
        payment_terms  = (body.get('payment_terms') or '').strip() or None,
        notes          = (body.get('notes') or '').strip() or None,
    )
    db.session.add(supplier)
    db.session.commit()
    _invalidate_supplier_cache(client_id)

    return jsonify({'success': True, 'data': supplier.to_dict(), 'message': f'Supplier "{name}" created'}), 201


@suppliers_bp.route('/<supplier_id>', methods=['PUT'])
@authenticate
def update_supplier(supplier_id):
    client_id = g.user['client_id']
    supplier = _get_supplier_or_404(supplier_id, client_id)
    if not supplier:
        return jsonify({'success': False, 'error': 'Supplier not found'}), 404

    body = request.get_json(silent=True) or {}

    if 'name' in body:
        name = body['name'].strip()
        if not name:
            return jsonify({'success': False, 'error': 'Name cannot be empty'}), 400
        supplier.name = name

    for field in ('contact_person', 'phone', 'email', 'address', 'gst_number', 'payment_terms', 'notes'):
        if field in body:
            setattr(supplier, field, (body[field] or '').strip() or None)

    if 'transport_fee' in body:
        supplier.transport_fee = body['transport_fee'] or 0

    db.session.commit()
    _invalidate_supplier_cache(client_id)
    return jsonify({'success': True, 'data': supplier.to_dict(), 'message': 'Supplier updated'}), 200


@suppliers_bp.route('/<supplier_id>', methods=['DELETE'])
@authenticate
def delete_supplier(supplier_id):
    client_id = g.user['client_id']
    supplier = _get_supplier_or_404(supplier_id, client_id)
    if not supplier:
        return jsonify({'success': False, 'error': 'Supplier not found'}), 404

    supplier.is_active = False
    db.session.commit()
    _invalidate_supplier_cache(client_id)
    return jsonify({'success': True, 'message': f'Supplier "{supplier.name}" removed'}), 200


# ── Deliveries ────────────────────────────────────────────────────────────────

@suppliers_bp.route('/deliveries', methods=['GET'])
@authenticate
def list_deliveries():
    client_id = g.user['client_id']
    status    = request.args.get('status')
    supplier_id = request.args.get('supplier_id')

    from models.supplier_model import SupplierDelivery
    q = SupplierDelivery.query.filter_by(client_id=client_id)
    if status:
        q = q.filter_by(status=status)
    if supplier_id:
        q = q.filter_by(supplier_id=supplier_id)
    deliveries = q.order_by(SupplierDelivery.created_at.desc()).all()

    # HIGH-5: Only load suppliers referenced by the fetched deliveries (not the full table)
    from models.supplier_model import Supplier
    needed_sids = {d.supplier_id for d in deliveries}
    supplier_map = {s.supplier_id: s.name for s in Supplier.query.filter(
        Supplier.supplier_id.in_(needed_sids),
        Supplier.client_id == client_id
    ).all()} if needed_sids else {}

    data = []
    for d in deliveries:
        row = d.to_dict()
        row['supplier_name'] = supplier_map.get(d.supplier_id, '')
        data.append(row)

    return jsonify({'success': True, 'data': data, 'total': len(data)}), 200


@suppliers_bp.route('/deliveries', methods=['POST'])
@authenticate
def create_delivery():
    client_id = g.user['client_id']
    body = request.get_json(silent=True) or {}

    supplier_id = body.get('supplier_id', '').strip()
    if not supplier_id:
        return jsonify({'success': False, 'error': 'supplier_id is required'}), 400

    from models.supplier_model import Supplier, SupplierDelivery, SupplierDeliveryItem
    if not Supplier.query.filter_by(supplier_id=supplier_id, client_id=client_id, is_active=True).first():
        return jsonify({'success': False, 'error': 'Supplier not found'}), 404

    # Parse delivery date
    delivery_date = None
    if body.get('delivery_date'):
        try:
            delivery_date = date.fromisoformat(body['delivery_date'])
        except ValueError:
            pass

    delivery = SupplierDelivery(
        delivery_id    = str(uuid.uuid4()),
        client_id      = client_id,
        supplier_id    = supplier_id,
        branch_id      = body.get('branch_id') or None,
        invoice_number = (body.get('invoice_number') or '').strip() or None,
        delivery_date  = delivery_date,
        transport_fee  = body.get('transport_fee') or 0,
        notes          = (body.get('notes') or '').strip() or None,
        status         = 'draft',
    )
    db.session.add(delivery)
    db.session.flush()  # get delivery_id before items

    items_data = body.get('items', [])
    for item in items_data:
        pname = (item.get('product_name') or '').strip()
        if not pname:
            continue
        qty = int(item.get('quantity') or 1)
        if qty <= 0:
            qty = 1
        di = SupplierDeliveryItem(
            id            = str(uuid.uuid4()),
            delivery_id   = delivery.delivery_id,
            product_id    = item.get('product_id') or None,
            product_name  = pname,
            category      = (item.get('category') or '').strip() or None,
            quantity      = qty,
            cost_price    = item.get('cost_price') or None,
            selling_price = item.get('selling_price') or None,
            mrp           = item.get('mrp') or None,
            unit          = (item.get('unit') or 'pcs').strip(),
            barcode       = (item.get('barcode') or '').strip() or None,
            item_code     = (item.get('item_code') or '').strip() or None,
            gst_percentage= item.get('gst_percentage') or 0,
            hsn_code      = (item.get('hsn_code') or '').strip() or None,
        )
        db.session.add(di)

    db.session.commit()
    _invalidate_delivery_cache(client_id)
    return jsonify({'success': True, 'data': delivery.to_dict(include_supplier=True), 'message': 'Delivery created'}), 201


@suppliers_bp.route('/deliveries/<delivery_id>', methods=['GET'])
@authenticate
def get_delivery(delivery_id):
    client_id = g.user['client_id']
    delivery = _get_delivery_or_404(delivery_id, client_id)
    if not delivery:
        return jsonify({'success': False, 'error': 'Delivery not found'}), 404
    return jsonify({'success': True, 'data': delivery.to_dict(include_supplier=True)}), 200


@suppliers_bp.route('/deliveries/<delivery_id>', methods=['PUT'])
@authenticate
def update_delivery(delivery_id):
    """Update delivery details + items — only allowed while status is 'draft'"""
    client_id = g.user['client_id']
    delivery = _get_delivery_or_404(delivery_id, client_id)
    if not delivery:
        return jsonify({'success': False, 'error': 'Delivery not found'}), 404
    if delivery.status != 'draft':
        return jsonify({'success': False, 'error': 'Only draft deliveries can be edited'}), 400

    body = request.get_json(silent=True) or {}

    if 'invoice_number' in body:
        delivery.invoice_number = (body['invoice_number'] or '').strip() or None
    if 'delivery_date' in body:
        try:
            delivery.delivery_date = date.fromisoformat(body['delivery_date']) if body['delivery_date'] else None
        except ValueError:
            pass
    if 'transport_fee' in body:
        delivery.transport_fee = body['transport_fee'] or 0
    if 'notes' in body:
        delivery.notes = (body['notes'] or '').strip() or None
    if 'branch_id' in body:
        delivery.branch_id = body['branch_id'] or None

    # Replace items if provided
    if 'items' in body:
        from models.supplier_model import SupplierDeliveryItem
        SupplierDeliveryItem.query.filter_by(delivery_id=delivery.delivery_id).delete()
        for item in body['items']:
            pname = (item.get('product_name') or '').strip()
            if not pname:
                continue
            qty = int(item.get('quantity') or 1)
            di = SupplierDeliveryItem(
                id            = str(uuid.uuid4()),
                delivery_id   = delivery.delivery_id,
                product_id    = item.get('product_id') or None,
                product_name  = pname,
                category      = (item.get('category') or '').strip() or None,
                quantity      = max(qty, 1),
                cost_price    = item.get('cost_price') or None,
                selling_price = item.get('selling_price') or None,
                mrp           = item.get('mrp') or None,
                unit          = (item.get('unit') or 'pcs').strip(),
                barcode       = (item.get('barcode') or '').strip() or None,
                item_code     = (item.get('item_code') or '').strip() or None,
                gst_percentage= item.get('gst_percentage') or 0,
                hsn_code      = (item.get('hsn_code') or '').strip() or None,
            )
            db.session.add(di)

    db.session.commit()
    _invalidate_delivery_cache(client_id)
    return jsonify({'success': True, 'data': delivery.to_dict(include_supplier=True), 'message': 'Delivery updated'}), 200


@suppliers_bp.route('/deliveries/<delivery_id>/confirm-products', methods=['POST'])
@authenticate
def confirm_products(delivery_id):
    """Mark that the user has physically verified all products are present."""
    client_id = g.user['client_id']
    delivery = _get_delivery_or_404(delivery_id, client_id)
    if not delivery:
        return jsonify({'success': False, 'error': 'Delivery not found'}), 404
    if delivery.status == 'completed':
        return jsonify({'success': False, 'error': 'Delivery already completed'}), 400
    if not delivery.items:
        return jsonify({'success': False, 'error': 'Add at least one product before confirming'}), 400

    delivery.products_confirmed = True
    delivery.confirmed_by       = g.user.get('user_id')
    delivery.confirmed_at       = datetime.utcnow()
    delivery.status             = 'confirmed'
    db.session.commit()
    _invalidate_delivery_cache(client_id)
    return jsonify({'success': True, 'message': 'Products confirmed', 'data': delivery.to_dict()}), 200


@suppliers_bp.route('/deliveries/<delivery_id>/upload-note', methods=['POST'])
@authenticate
def upload_delivery_note(delivery_id):
    """Upload delivery note image or PDF."""
    client_id = g.user['client_id']
    delivery = _get_delivery_or_404(delivery_id, client_id)
    if not delivery:
        return jsonify({'success': False, 'error': 'Delivery not found'}), 404
    if delivery.status == 'completed':
        return jsonify({'success': False, 'error': 'Delivery already completed'}), 400

    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'No file provided'}), 400

    file = request.files['file']
    if not file or not file.filename:
        return jsonify({'success': False, 'error': 'Empty file'}), 400

    # Extract extension from the raw filename BEFORE secure_filename (which can strip leading dots)
    raw_name = file.filename or ''
    ext = raw_name.rsplit('.', 1)[-1].lower() if '.' in raw_name else ''
    if not ext or ext not in ALLOWED_EXTENSIONS:
        return jsonify({'success': False, 'error': f'File type not allowed. Allowed: {", ".join(sorted(ALLOWED_EXTENSIONS))}'}), 400

    original_name = secure_filename(raw_name) or f'delivery_note.{ext}'

    file_bytes = file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        return jsonify({'success': False, 'error': 'File exceeds 10 MB limit'}), 400

    # Delete old file if exists
    if delivery.delivery_note_path and os.path.exists(delivery.delivery_note_path):
        try:
            os.remove(delivery.delivery_note_path)
        except OSError:
            pass

    # Save new file
    unique_fn = f"delivery-{delivery_id}-{int(datetime.utcnow().timestamp())}.{ext}"
    save_dir  = _delivery_notes_path(client_id)
    save_path = os.path.join(save_dir, unique_fn)

    with open(save_path, 'wb') as f:
        f.write(file_bytes)

    delivery.delivery_note_filename = original_name
    delivery.delivery_note_path     = save_path
    delivery.delivery_note_type     = 'pdf' if ext == 'pdf' else 'image'
    db.session.commit()
    _invalidate_delivery_cache(client_id)

    return jsonify({
        'success': True,
        'message': 'Delivery note uploaded',
        'filename': original_name,
        'file_type': delivery.delivery_note_type,
    }), 200


@suppliers_bp.route('/deliveries/<delivery_id>/download-note', methods=['GET'])
@authenticate
def download_delivery_note(delivery_id):
    """Serve the uploaded delivery note file."""
    client_id = g.user['client_id']
    delivery = _get_delivery_or_404(delivery_id, client_id)
    if not delivery:
        return jsonify({'success': False, 'error': 'Delivery not found'}), 404
    if not delivery.delivery_note_path or not os.path.exists(delivery.delivery_note_path):
        return jsonify({'success': False, 'error': 'No delivery note uploaded'}), 404

    return send_file(
        delivery.delivery_note_path,
        download_name=delivery.delivery_note_filename or 'delivery_note',
        as_attachment=False,   # inline display (browser can preview PDF/image)
    )


@suppliers_bp.route('/deliveries/<delivery_id>/complete', methods=['POST'])
@authenticate
def complete_delivery(delivery_id):
    """
    Complete the delivery:
    - products_confirmed must be True
    - delivery note must be uploaded
    - For each item: update or create stock_entry quantity
    """
    client_id = g.user['client_id']
    delivery = _get_delivery_or_404(delivery_id, client_id)
    if not delivery:
        return jsonify({'success': False, 'error': 'Delivery not found'}), 404
    if delivery.status == 'completed':
        return jsonify({'success': False, 'error': 'Already completed'}), 400
    if not delivery.products_confirmed:
        return jsonify({'success': False, 'error': 'Please confirm all products are available first'}), 400
    if not delivery.items:
        return jsonify({'success': False, 'error': 'Delivery has no items'}), 400

    from models.stock_model import StockEntry

    # --- CRIT-2 fix: pre-load all matching stock rows in 3 bulk queries (was 3N) ---
    barcodes = [i.barcode.strip() for i in delivery.items if i.barcode and i.barcode.strip()]
    pids     = [str(i.product_id) for i in delivery.items if i.product_id]
    names    = [i.product_name.strip().title().lower() for i in delivery.items]

    stock_by_barcode = {s.barcode: s for s in StockEntry.query.filter(
        StockEntry.client_id == client_id,
        StockEntry.barcode.in_(barcodes)
    ).all()} if barcodes else {}

    stock_by_pid = {str(s.product_id): s for s in StockEntry.query.filter(
        StockEntry.client_id == client_id,
        StockEntry.product_id.in_(pids)
    ).all()} if pids else {}

    stock_by_name = {s.product_name.strip().lower(): s for s in StockEntry.query.filter(
        StockEntry.client_id == client_id,
        db.func.lower(StockEntry.product_name).in_(names)
    ).all()} if names else {}

    # --- CRIT-3 fix: wrap entire update loop in try/except with rollback ---
    errors = []
    try:
        _now = datetime.utcnow()
        for item in delivery.items:
            pname = item.product_name.strip().title()
            qty   = item.quantity
            stock = None

            # Match priority: barcode → product_id → product_name → create new
            if item.barcode and item.barcode.strip():
                stock = stock_by_barcode.get(item.barcode.strip())

            if not stock and item.product_id:
                stock = stock_by_pid.get(str(item.product_id))

            if stock:
                stock.quantity += qty
                if item.cost_price and float(item.cost_price) > 0:
                    stock.cost_price = item.cost_price
                stock.updated_at = _now
                item.product_id = stock.product_id
                continue

            stock = stock_by_name.get(pname.lower())
            if stock:
                stock.quantity += qty
                if item.cost_price and float(item.cost_price) > 0:
                    stock.cost_price = item.cost_price
                if item.selling_price and float(item.selling_price) > 0:
                    stock.rate = item.selling_price
                stock.updated_at = _now
                item.product_id = stock.product_id
            else:
                # Create new stock entry
                new_stock = StockEntry(
                    product_id      = str(uuid.uuid4()),
                    client_id       = client_id,
                    product_name    = pname,
                    category        = item.category or '',
                    quantity        = qty,
                    rate            = item.selling_price or item.cost_price or 0,
                    cost_price      = item.cost_price or 0,
                    mrp             = item.mrp or 0,
                    unit            = item.unit or 'pcs',
                    low_stock_alert = 10,
                    item_code       = item.item_code or _generate_item_code(pname, client_id),
                    barcode         = item.barcode or None,
                    gst_percentage  = item.gst_percentage or 0,
                    hsn_code        = item.hsn_code or None,
                )
                db.session.add(new_stock)
                db.session.flush()
                item.product_id = new_stock.product_id

        delivery.status       = 'completed'
        delivery.completed_by = g.user.get('user_id')
        delivery.completed_at = _now
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise

    # Invalidate stock cache so CreateBill & Stock page see fresh data
    get_cache_manager().delete_pattern(f'stock:list:{client_id}:*')
    get_cache_manager().delete_pattern(f'stock:alerts:{client_id}')
    _invalidate_delivery_cache(client_id)

    return jsonify({
        'success': True,
        'message': f'Delivery completed. {len(delivery.items)} product(s) added to stock.',
        'data': delivery.to_dict(include_supplier=True),
        'errors': errors,
    }), 200


@suppliers_bp.route('/deliveries/<delivery_id>', methods=['DELETE'])
@authenticate
def delete_delivery(delivery_id):
    """Delete a draft delivery only."""
    client_id = g.user['client_id']
    delivery = _get_delivery_or_404(delivery_id, client_id)
    if not delivery:
        return jsonify({'success': False, 'error': 'Delivery not found'}), 404
    if delivery.status == 'completed':
        return jsonify({'success': False, 'error': 'Cannot delete a completed delivery'}), 400

    # Clean up file
    if delivery.delivery_note_path and os.path.exists(delivery.delivery_note_path):
        try:
            os.remove(delivery.delivery_note_path)
        except OSError:
            pass

    db.session.delete(delivery)
    db.session.commit()
    _invalidate_delivery_cache(client_id)
    return jsonify({'success': True, 'message': 'Delivery deleted'}), 200


# ── Helper ────────────────────────────────────────────────────────────────────

def _generate_item_code(product_name: str, client_id: str) -> str:
    from models.stock_model import StockEntry
    prefix = ''.join(c for c in product_name.upper()[:3] if c.isalpha()) or 'PRD'
    cli    = client_id.replace('-', '').upper()[:3]
    count  = StockEntry.query.filter_by(client_id=client_id).count()
    return f"{prefix}-{cli}-{count + 1:03d}"
