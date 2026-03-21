"""
Electron desktop app endpoints.

Two modes:
  1. Live server  — GET  /api/electron/data-export
     Authenticated endpoint that exports all client data as JSON for
     the Electron app to download on first launch.

  2. Local Flask  — POST /api/electron/setup
                  — GET  /api/electron/needs-setup
     Called by the Electron frontend during first-time setup.
     Hits the live server, pulls the data export, stores in local SQLite.
"""

import os
import json
import logging
import httpx
from datetime import datetime
from flask import Blueprint, request, jsonify, g
from extensions import db
from utils.auth_middleware import authenticate

electron_bp = Blueprint('electron', __name__)

LIVE_API_URL = os.environ.get('LIVE_API_URL', 'https://valoryx.ryxtech.in')

# ─────────────────────────────────────────────────────────────────────────────
# 1. LIVE SERVER — data export endpoint
# ─────────────────────────────────────────────────────────────────────────────

@electron_bp.route('/api/electron/data-export', methods=['GET'])
@authenticate
def data_export():
    """
    Returns all data for the authenticated client as JSON.
    Called by the Electron app during first-time setup.
    Only works in online mode (Supabase).
    """
    client_id = g.user['client_id']

    try:
        from models.user_model import User
        from models.client_model import ClientEntry
        from models.billing_model import GSTBilling
        from models.non_gst_billing_model import NonGSTBilling
        from models.stock_model import StockEntry
        from models.customer_model import Customer
        from models.payment_type_model import PaymentType
        from models.expense_model import Expense
        from models.permission_model import UserPermission, Permission
        from models.branch_model import Branch
        from models.branch_inventory_model import BranchInventory

        def rows(query):
            return [r.to_dict() if hasattr(r, 'to_dict') else _model_to_dict(r)
                    for r in query]

        def _model_to_dict(obj):
            result = {}
            for col in obj.__table__.columns:
                val = getattr(obj, col.name)
                if isinstance(val, datetime):
                    val = val.isoformat()
                result[col.name] = val
            return result

        data = {
            'client_id': client_id,
            'exported_at': datetime.utcnow().isoformat(),
            'users': rows(User.query.filter_by(client_id=client_id, deleted_at=None).all()),
            'gst_billing': rows(GSTBilling.query.filter_by(client_id=client_id).all()),
            'non_gst_billing': rows(NonGSTBilling.query.filter_by(client_id=client_id).all()),
            'stock_entry': rows(StockEntry.query.filter_by(client_id=client_id).all()),
            'customer': rows(Customer.query.filter_by(client_id=client_id).all()),
            'payment_type': rows(PaymentType.query.filter_by(client_id=client_id).all()),
            'expense': rows(Expense.query.filter_by(client_id=client_id).all()),
            'branches': rows(Branch.query.filter_by(client_id=client_id).all()),
            'branch_inventory': rows(BranchInventory.query.filter_by(client_id=client_id).all()),
            'user_permissions': rows(
                db.session.query(UserPermission)
                .join(User, UserPermission.user_id == User.user_id)
                .filter(User.client_id == client_id)
                .all()
            ),
        }

        return jsonify({'success': True, 'data': data}), 200

    except Exception as e:
        logging.error(f'[Electron] data-export failed: {e}')
        return jsonify({'error': str(e)}), 500


# ─────────────────────────────────────────────────────────────────────────────
# 2. LOCAL FLASK (Electron offline) — setup endpoints
# ─────────────────────────────────────────────────────────────────────────────

@electron_bp.route('/api/electron/needs-setup', methods=['GET'])
def needs_setup():
    """Returns true if local SQLite has no users (first launch)."""
    try:
        from models.user_model import User
        count = db.session.query(User.user_id).count()
        return jsonify({'needs_setup': count == 0}), 200
    except Exception:
        return jsonify({'needs_setup': True}), 200


@electron_bp.route('/api/electron/setup', methods=['POST'])
def setup():
    """
    First-time setup for Electron app.
    1. Authenticates against the live server.
    2. Downloads all client data via /api/electron/data-export.
    3. Inserts everything into local SQLite.
    """
    body = request.get_json() or {}
    email = body.get('email', '').strip()
    password = body.get('password', '').strip()
    server_url = body.get('server_url', LIVE_API_URL).rstrip('/')

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    # Step 1 — authenticate against live server
    try:
        login_resp = httpx.post(
            f'{server_url}/api/auth/login',
            json={'email': email, 'password': password},
            timeout=15,
        )
    except Exception as e:
        return jsonify({'error': f'Cannot reach server: {e}'}), 503

    if login_resp.status_code != 200:
        try:
            msg = login_resp.json().get('error', 'Invalid credentials')
        except Exception:
            msg = 'Invalid credentials'
        return jsonify({'error': msg}), 401

    login_data = login_resp.json()
    token = login_data.get('token')
    if not token:
        return jsonify({'error': 'No token returned from server'}), 500

    # Step 2 — download all client data
    try:
        export_resp = httpx.get(
            f'{server_url}/api/electron/data-export',
            headers={'Authorization': f'Bearer {token}'},
            timeout=60,
        )
    except Exception as e:
        return jsonify({'error': f'Failed to download data: {e}'}), 503

    if export_resp.status_code != 200:
        try:
            detail = export_resp.json()
        except Exception:
            detail = export_resp.text[:200]
        logging.error(f'[Electron] data-export returned {export_resp.status_code}: {detail}')
        return jsonify({'error': f'Failed to export data from server (status {export_resp.status_code})', 'detail': str(detail)}), 500

    export = export_resp.json().get('data', {})

    # Step 3 — insert into local SQLite
    try:
        _import_data(export)
    except Exception as e:
        logging.error(f'[Electron] setup import failed: {e}')
        db.session.rollback()
        return jsonify({'error': f'Failed to import data: {e}'}), 500

    return jsonify({
        'success': True,
        'message': 'Setup complete. You can now log in.',
    }), 200


def _import_data(data: dict):
    """Insert exported data into local SQLite using upsert logic."""
    from sqlalchemy import text

    tables = {
        'users':            ('users',            'user_id'),
        'gst_billing':      ('gst_billing',      'bill_id'),
        'non_gst_billing':  ('non_gst_billing',  'bill_id'),
        'stock_entry':      ('stock_entry',       'product_id'),
        'customer':         ('customer',          'customer_id'),
        'payment_type':     ('payment_type',      'payment_type_id'),
        'expense':          ('expense',           'expense_id'),
        'branches':         ('branches',          'branch_id'),
        'branch_inventory': ('branch_inventory',  'id'),
        'user_permissions': ('user_permissions',  'id'),
    }

    for key, (table, pk) in tables.items():
        rows = data.get(key, [])
        if not rows:
            continue

        for row in rows:
            # Remove keys with None pk
            if not row.get(pk):
                continue

            cols = [c for c in row.keys() if row[c] is not None]
            if not cols:
                continue

            placeholders = ', '.join(f':{c}' for c in cols)
            col_names = ', '.join(cols)

            # SQLite upsert: INSERT OR REPLACE
            sql = f'INSERT OR REPLACE INTO {table} ({col_names}) VALUES ({placeholders})'
            db.session.execute(text(sql), {c: row[c] for c in cols})

    db.session.commit()
    logging.info('[Electron] Data import complete')
