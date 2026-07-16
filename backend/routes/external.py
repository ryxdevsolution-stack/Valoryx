"""
Ryx external API — the ONLY surface exposed to third-party devs/partners.

Two endpoint groups, gated by different key scopes (see utils/api_key_auth.py):
  - POST   /external/clients             (dev-level key, client_provisioning)
  - GET    /external/stock                (client-level key, stock_management)
  - POST   /external/stock                (client-level key, stock_management)
  - PUT    /external/stock/<product_id>   (client-level key, stock_management)
  - DELETE /external/stock/<product_id>   (client-level key, stock_management)
  - POST   /external/stock/reduce         (client-level key, stock_management)
  - POST   /external/stock/upload         (client-level key, stock_management)
  - GET    /external/stock/lookup/<code>  (client-level key, stock_management)

Nothing else in Valoryx's backend is reachable through these keys.
"""
import uuid
from datetime import datetime
from flask import Blueprint, request, jsonify, g
from werkzeug.utils import secure_filename
import pandas as pd

from extensions import db
from models.client_model import ClientEntry
from models.stock_model import StockEntry
from models.api_key_model import ApiKey
from models.developer_model import Developer
from utils.api_key_auth import (
    authenticate_api_key,
    generate_api_key,
    SCOPE_CLIENT_PROVISIONING,
    SCOPE_STOCK_MANAGEMENT,
)
from utils.cache_helper import invalidate_stock_cache
from utils.helpers import title_case
from utils.rate_limiter import rate_limit
from utils.email_service import send_developer_signup_notification
from routes.stock import _to_num, _to_int, _to_str_or_none, generate_item_code

external_bp = Blueprint('external', __name__)


def _api_key_bucket():
    return request.headers.get('X-API-Key', request.remote_addr or 'unknown')


@external_bp.route('/developers/register', methods=['POST'])
@rate_limit(max_requests=10, window_seconds=60)
def register_developer():
    """Public signup — creates a pending developer record. No key is issued
    here; approval (and dev-level key issuance) is a manual step, see
    backend/scripts/approve_developer.py."""
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip().lower()

    if not name or not email:
        return jsonify({'error': 'name and email are required'}), 400

    if Developer.query.filter_by(email=email).first():
        return jsonify({'error': 'A developer with this email is already registered'}), 409

    dev = Developer(
        name=name,
        email=email,
        company=data.get('company'),
        phone=data.get('phone'),
        status='pending',
    )
    db.session.add(dev)
    db.session.commit()

    send_developer_signup_notification(name, email, data.get('company'), data.get('phone'))

    return jsonify({
        'dev_id': str(dev.dev_id),
        'status': dev.status,
        'message': "Registered. You'll receive your API key once approved.",
    }), 201


@external_bp.route('/clients', methods=['POST'])
@rate_limit(max_requests=20, window_seconds=60, key_func=_api_key_bucket)
@authenticate_api_key(SCOPE_CLIENT_PROVISIONING)
def create_client():
    """Dev uses their dev-level key to provision a new client, and immediately
    receives that client's stock-management key (shown once)."""
    data = request.get_json(silent=True) or {}
    client_name = (data.get('client_name') or '').strip()
    email = (data.get('email') or '').strip().lower()

    if not client_name or not email:
        return jsonify({'error': 'client_name and email are required'}), 400

    if ClientEntry.query.filter_by(email=email).first():
        return jsonify({'error': 'A client with this email already exists'}), 409

    client = ClientEntry(
        client_id=str(uuid.uuid4()),
        client_name=client_name,
        email=email,
        phone=data.get('phone'),
        dev_id=g.api_key['dev_id'],
        is_active=True,
    )
    db.session.add(client)
    db.session.flush()  # Ensure client_entry row exists before api_keys FK references it

    raw_key, key_hash, key_prefix = generate_api_key()
    stock_key = ApiKey(
        client_id=client.client_id,
        key_hash=key_hash,
        key_prefix=key_prefix,
        label=f"Stock API key for {client_name}",
        scope=SCOPE_STOCK_MANAGEMENT,
    )
    db.session.add(stock_key)
    db.session.commit()

    return jsonify({
        'client_id': str(client.client_id),
        'client_name': client.client_name,
        'api_key': raw_key,
        'message': 'Save this API key now — it will not be shown again.',
    }), 201


@external_bp.route('/stock', methods=['GET'])
@rate_limit(max_requests=120, window_seconds=60, key_func=_api_key_bucket)
@authenticate_api_key(SCOPE_STOCK_MANAGEMENT)
def get_stock():
    """Single product by ?product_id=, or the client's whole catalog (paginated) if omitted."""
    client_id = g.api_key['client_id']
    product_id = request.args.get('product_id')

    if product_id:
        product = StockEntry.query.filter_by(product_id=product_id, client_id=client_id).first()
        if not product:
            return jsonify({'error': 'Product not found'}), 404
        return jsonify(product.to_dict())

    MAX_LIMIT = 500
    requested_limit = request.args.get('limit', 100, type=int)
    limit = min(requested_limit, MAX_LIMIT) if requested_limit > 0 else 100
    search = request.args.get('search', '')

    query = StockEntry.query.filter_by(client_id=client_id)
    if search:
        query = query.filter(StockEntry.product_name.ilike(f'%{search}%'))
    products = query.order_by(StockEntry.product_name).limit(limit).all()

    return jsonify({'products': [p.to_dict() for p in products]})


@external_bp.route('/stock', methods=['POST'])
@rate_limit(max_requests=60, window_seconds=60, key_func=_api_key_bucket)
@authenticate_api_key(SCOPE_STOCK_MANAGEMENT)
def create_stock():
    """Create a single product, or add quantity to it if product_name already exists
    for this client (same auto-sum behavior as the internal add-stock flow)."""
    client_id = g.api_key['client_id']
    data = request.get_json(silent=True) or {}

    product_name_raw = data.get('product_name')
    if not product_name_raw or not str(product_name_raw).strip():
        return jsonify({'error': 'product_name is required'}), 400

    quantity = _to_int(data.get('quantity'))
    if quantity is None or quantity < 0:
        return jsonify({'error': 'quantity is required and must be zero or positive'}), 400

    rate = _to_num(data.get('rate'))
    if rate is None or rate < 0:
        return jsonify({'error': 'rate is required and must be zero or positive'}), 400

    product_name = title_case(str(product_name_raw).strip())
    category = title_case(str(data.get('category') or 'Other').strip() or 'Other')
    unit = _to_str_or_none(data.get('unit')) or 'pcs'
    hsn_code = _to_str_or_none(data.get('hsn_code'))
    item_code_in = _to_str_or_none(data.get('item_code'))
    gst_percentage = _to_num(data.get('gst_percentage'), default=0)

    existing = StockEntry.query.filter_by(client_id=client_id, product_name=product_name).first()

    if existing:
        existing.quantity += quantity
        existing.rate = rate
        existing.category = category
        existing.unit = unit
        existing.gst_percentage = gst_percentage
        if hsn_code is not None:
            existing.hsn_code = hsn_code
        if item_code_in:
            existing.item_code = item_code_in
        elif not existing.item_code:
            existing.item_code = generate_item_code(client_id, existing.product_name)
        existing.updated_at = datetime.utcnow()
        db.session.commit()
        invalidate_stock_cache(client_id)
        return jsonify({'success': True, 'message': 'Quantity added to existing product', 'product': existing.to_dict()}), 200

    new_product = StockEntry(
        product_id=str(uuid.uuid4()),
        client_id=client_id,
        product_name=product_name,
        category=category,
        quantity=quantity,
        rate=rate,
        unit=unit,
        item_code=item_code_in or generate_item_code(client_id, product_name),
        gst_percentage=gst_percentage,
        hsn_code=hsn_code,
        created_at=datetime.utcnow(),
        added_by_label='Ryx External API',
    )
    db.session.add(new_product)
    db.session.commit()
    invalidate_stock_cache(client_id)

    return jsonify({'success': True, 'message': 'Product created', 'product': new_product.to_dict()}), 201


@external_bp.route('/stock/<product_id>', methods=['PUT'])
@rate_limit(max_requests=60, window_seconds=60, key_func=_api_key_bucket)
@authenticate_api_key(SCOPE_STOCK_MANAGEMENT)
def update_stock_external(product_id):
    client_id = g.api_key['client_id']
    product = StockEntry.query.filter_by(product_id=product_id, client_id=client_id).first()
    if not product:
        return jsonify({'error': 'Product not found'}), 404

    data = request.get_json(silent=True) or {}

    if 'product_name' in data:
        new_name = _to_str_or_none(data['product_name'])
        if new_name:
            product.product_name = title_case(new_name)
    if 'category' in data:
        new_cat = _to_str_or_none(data['category'])
        product.category = title_case(new_cat) if new_cat else product.category
    if 'unit' in data:
        new_unit = _to_str_or_none(data['unit'])
        if new_unit:
            product.unit = new_unit
    if 'hsn_code' in data:
        product.hsn_code = _to_str_or_none(data['hsn_code'])
    if 'quantity' in data:
        qty = _to_int(data['quantity'])
        if qty is None or qty < 0:
            return jsonify({'error': 'Invalid quantity'}), 400
        product.quantity = qty
    if 'rate' in data:
        rate = _to_num(data['rate'])
        if rate is None or rate < 0:
            return jsonify({'error': 'Invalid rate'}), 400
        product.rate = rate
    if 'gst_percentage' in data:
        product.gst_percentage = _to_num(data['gst_percentage'], default=0)
    if 'item_code' in data:
        new_code = _to_str_or_none(data['item_code'])
        if new_code:
            product.item_code = new_code
    if 'barcode' in data:
        product.barcode = _to_str_or_none(data['barcode'])

    product.updated_at = datetime.utcnow()
    db.session.commit()
    invalidate_stock_cache(client_id)

    return jsonify({'success': True, 'message': 'Product updated', 'product': product.to_dict()})


@external_bp.route('/stock/<product_id>', methods=['DELETE'])
@rate_limit(max_requests=30, window_seconds=60, key_func=_api_key_bucket)
@authenticate_api_key(SCOPE_STOCK_MANAGEMENT)
def delete_stock_external(product_id):
    client_id = g.api_key['client_id']

    is_sqlite = str(db.engine.url).startswith('sqlite')
    ph = '?' if is_sqlite else '%s'
    pid, cid = str(product_id), str(client_id)

    conn = db.engine.raw_connection()
    try:
        cur = conn.cursor()
        cur.execute(f"SELECT product_id FROM stock_entry WHERE product_id = {ph} AND client_id = {ph}", (pid, cid))
        if not cur.fetchone():
            conn.close()
            return jsonify({'error': 'Product not found'}), 404

        # Same cascade as the internal delete route — bypasses the ORM's
        # BranchInventory backref, which would otherwise try to SET NULL a
        # NOT NULL column during session flush.
        cur.execute(f"DELETE FROM branch_inventory WHERE product_id = {ph}", (pid,))
        cur.execute(f"DELETE FROM stock_transfer_items WHERE product_id = {ph}", (pid,))
        cur.execute(f"DELETE FROM bulk_stock_order_item WHERE product_id = {ph}", (pid,))
        cur.execute(f"UPDATE supplier_delivery_items SET product_id = NULL WHERE product_id = {ph}", (pid,))
        cur.execute(f"DELETE FROM stock_entry WHERE product_id = {ph} AND client_id = {ph}", (pid, cid))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    db.session.expire_all()
    invalidate_stock_cache(client_id)

    return jsonify({'success': True, 'message': 'Product deleted'})


@external_bp.route('/stock/lookup/<code>', methods=['GET'])
@rate_limit(max_requests=120, window_seconds=60, key_func=_api_key_bucket)
@authenticate_api_key(SCOPE_STOCK_MANAGEMENT)
def lookup_stock_external(code):
    """Look up a product by barcode, item code, or exact product name — same
    resolution order as the internal barcode-scanner lookup."""
    client_id = g.api_key['client_id']
    normalized_code = (code or '').strip()
    if not normalized_code:
        return jsonify({'error': 'Product not found'}), 404

    product = StockEntry.query.filter_by(client_id=client_id, barcode=normalized_code).first()

    if not product:
        code_no_spaces = normalized_code.replace(' ', '')
        if code_no_spaces != normalized_code:
            product = StockEntry.query.filter_by(client_id=client_id, barcode=code_no_spaces).first()

    if not product:
        product = StockEntry.query.filter_by(client_id=client_id, item_code=normalized_code).first()

    if not product:
        product = StockEntry.query.filter(
            StockEntry.client_id == client_id,
            StockEntry.product_name.ilike(normalized_code),
        ).first()

    if not product:
        return jsonify({'error': 'Product not found'}), 404

    return jsonify({'success': True, 'product': product.to_dict()})


@external_bp.route('/stock/reduce', methods=['POST'])
@rate_limit(max_requests=120, window_seconds=60, key_func=_api_key_bucket)
@authenticate_api_key(SCOPE_STOCK_MANAGEMENT)
def reduce_stock():
    data = request.get_json(silent=True) or {}
    product_id = data.get('product_id')
    quantity = data.get('quantity')

    if not product_id or not isinstance(quantity, int) or quantity < 1:
        return jsonify({'error': 'product_id and a positive integer quantity are required'}), 400

    client_id = g.api_key['client_id']

    # Single conditional UPDATE — reduces only if enough stock remains right
    # now, so two simultaneous sales (or an in-store sale + an online sale)
    # can never both succeed against the same units.
    updated_rows = db.session.query(StockEntry).filter(
        StockEntry.product_id == product_id,
        StockEntry.client_id == client_id,
        StockEntry.quantity >= quantity,
    ).update(
        {StockEntry.quantity: StockEntry.quantity - quantity},
        synchronize_session=False,
    )
    db.session.commit()

    if updated_rows == 0:
        product = StockEntry.query.filter_by(product_id=product_id, client_id=client_id).first()
        if not product:
            return jsonify({'error': 'Product not found'}), 404
        return jsonify({
            'error': 'Insufficient stock',
            'available': product.quantity,
        }), 409

    product = StockEntry.query.filter_by(product_id=product_id, client_id=client_id).first()
    return jsonify({
        'product_id': str(product.product_id),
        'quantity_reduced': quantity,
        'remaining_stock': product.quantity,
    })


@external_bp.route('/stock/upload', methods=['POST'])
@rate_limit(max_requests=5, window_seconds=60, key_func=_api_key_bucket,
            error_message='Bulk stock upload is limited to 5 times per minute.')
@authenticate_api_key(SCOPE_STOCK_MANAGEMENT)
def upload_stock():
    """Bulk create/update a client's product catalog from CSV or Excel — lets
    a dev populate stock entirely through the API, without the client ever
    logging into Valoryx. Matches products by product_name (create if new,
    update quantity/rate/etc if it already exists)."""
    client_id = g.api_key['client_id']

    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded — send it as multipart/form-data field "file"'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    filename = secure_filename(file.filename)
    file_ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
    if file_ext not in ('csv', 'xlsx', 'xls'):
        return jsonify({'error': 'Invalid file format. Only CSV, XLSX, XLS are allowed'}), 400

    try:
        df = pd.read_csv(file) if file_ext == 'csv' else pd.read_excel(file)
    except Exception as e:
        return jsonify({'error': 'Failed to read file', 'message': str(e)}), 400

    required_columns = ['product_name', 'quantity', 'rate']
    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        return jsonify({
            'error': f'Missing required columns: {", ".join(missing_columns)}',
            'required_columns': required_columns,
            'found_columns': list(df.columns),
        }), 400

    existing_by_name = {e.product_name: e for e in StockEntry.query.filter_by(client_id=client_id).all()}

    success_count = 0
    created_count = 0
    updated_count = 0
    error_count = 0
    errors = []

    for index, row in df.iterrows():
        savepoint = db.session.begin_nested()
        try:
            if pd.isna(row['product_name']) or pd.isna(row['quantity']) or pd.isna(row['rate']):
                savepoint.rollback()
                error_count += 1
                errors.append(f"Row {index + 2}: Missing required fields")
                continue

            product_name = title_case(str(row['product_name']).strip())
            quantity = int(row['quantity'])
            rate = float(row['rate'])

            if quantity < 0 or rate < 0:
                savepoint.rollback()
                error_count += 1
                errors.append(f"Row {index + 2}: Quantity and rate must be positive")
                continue

            category = title_case(str(row['category']).strip()) if 'category' in row and not pd.isna(row['category']) else 'Other'
            unit = str(row['unit']).strip() if 'unit' in row and not pd.isna(row['unit']) else 'pcs'
            item_code = str(row['item_code']).strip() if 'item_code' in row and not pd.isna(row['item_code']) else None
            gst_percentage = float(row['gst_percentage']) if 'gst_percentage' in row and not pd.isna(row['gst_percentage']) else 0
            hsn_code = str(row['hsn_code']).strip() if 'hsn_code' in row and not pd.isna(row['hsn_code']) else None

            existing_product = existing_by_name.get(product_name)
            if existing_product:
                existing_product.quantity += quantity
                existing_product.rate = rate
                existing_product.category = category
                existing_product.unit = unit
                existing_product.gst_percentage = gst_percentage
                if hsn_code:
                    existing_product.hsn_code = hsn_code
                if item_code and not existing_product.item_code:
                    existing_product.item_code = item_code
                existing_product.updated_at = datetime.utcnow()
                updated_count += 1
            else:
                new_product = StockEntry(
                    product_id=str(uuid.uuid4()),
                    client_id=client_id,
                    product_name=product_name,
                    category=category,
                    quantity=quantity,
                    rate=rate,
                    unit=unit,
                    item_code=item_code,
                    gst_percentage=gst_percentage,
                    hsn_code=hsn_code,
                    created_at=datetime.utcnow(),
                    added_by_label='Ryx External API',
                )
                db.session.add(new_product)
                existing_by_name[product_name] = new_product
                created_count += 1

            savepoint.commit()
            success_count += 1
        except Exception as e:
            savepoint.rollback()
            error_count += 1
            errors.append(f"Row {index + 2}: {str(e)}")

    db.session.commit()
    invalidate_stock_cache(client_id)

    return jsonify({
        'success': True,
        'summary': {
            'total_rows': len(df),
            'success_count': success_count,
            'created_count': created_count,
            'updated_count': updated_count,
            'error_count': error_count,
            'errors': errors[:10],
        },
    }), 200
