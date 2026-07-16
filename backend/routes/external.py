"""
Ryx external API — the ONLY surface exposed to third-party devs/partners.

Two endpoint groups, gated by different key scopes (see utils/api_key_auth.py):
  - POST /external/clients        (dev-level key, client_provisioning)
  - GET  /external/stock           (client-level key, stock_management)
  - POST /external/stock/reduce    (client-level key, stock_management)

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
    product_id = request.args.get('product_id')
    if not product_id:
        return jsonify({'error': 'product_id is required'}), 400

    product = StockEntry.query.filter_by(
        product_id=product_id,
        client_id=g.api_key['client_id'],
    ).first()

    if not product:
        return jsonify({'error': 'Product not found'}), 404

    return jsonify({
        'product_id': str(product.product_id),
        'product_name': product.product_name,
        'quantity': product.quantity,
    })


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
