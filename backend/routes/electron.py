"""
Electron desktop app endpoints.

All endpoints run on the local Flask server (SQLite mode).
Setup connects directly to Supabase using DB_URL from .env —
no live server dependency needed.

Setup accepts two proofs that the caller controls the account's email:
email + password, or a cloud-signed, PKCE-bound Google assertion. The second
exists because users who signed up with Google have no password they know —
`google_callback` stores a random hash for them — which otherwise locked them
out of the app entirely on first install.
"""

import os
import logging
import bcrypt
from datetime import datetime
from flask import Blueprint, request, jsonify
from extensions import db
from sqlalchemy import create_engine, text as sa_text
from config import Config
from utils.rate_limiter import rate_limit

electron_bp = Blueprint('electron', __name__)

# Generic credential-failure message — never reveal whether the email exists
_GENERIC_AUTH_ERROR = 'Invalid email or password'


class _SetupAuthError(Exception):
    """Identity failure during setup, carrying the status to report.

    The password path always reports 401 + a generic message (an unauthenticated
    caller must not be able to enumerate accounts). The Google path has already
    proven control of the address, so it can name the cause.
    """

    def __init__(self, message: str, status: int = 401):
        super().__init__(message)
        self.status = status


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/electron/needs-setup
# ─────────────────────────────────────────────────────────────────────────────

@electron_bp.route('/api/electron/needs-setup', methods=['GET'])
def needs_setup():
    """Returns true if local SQLite has no users (first launch).

    `google_enabled` tells the setup screen whether to offer "Continue with
    Google". The assertion path is inert without the shared secret, and a button
    that can only ever return 501 is worse than no button at all.
    """
    google_enabled = bool(Config.DESKTOP_OAUTH_SECRET)
    try:
        from models.user_model import User
        count = db.session.query(User.user_id).count()
        return jsonify({'needs_setup': count == 0, 'google_enabled': google_enabled}), 200
    except Exception:
        return jsonify({'needs_setup': True, 'google_enabled': google_enabled}), 200


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/electron/setup
# ─────────────────────────────────────────────────────────────────────────────

@electron_bp.route('/api/electron/setup', methods=['POST'])
@rate_limit(max_requests=5, window_seconds=300,
            error_message='Too many setup attempts. Please wait a few minutes.')
def setup():
    """
    First-time setup for Electron app.
    1. Establishes who the caller is — Google assertion or email + password.
    2. Connects directly to Supabase using DB_URL and resolves that identity.
    3. Fetches all client data from Supabase.
    4. Inserts everything into local SQLite.

    Body: {"assertion": "<jwt>", "verifier": "<pkce>"} or {"email", "password"}

    This only syncs data; it never mints a session. The user signs in on the
    normal login screen afterwards, which now works because the local user
    exists.
    """
    body = request.get_json() or {}
    assertion = (body.get('assertion') or '').strip()

    if assertion:
        # Google path: the cloud has already verified this Google account and
        # signed a short-lived assertion bound to the PKCE verifier that never
        # left the Electron main process.
        from routes.oauth import verify_desktop_handoff
        payload, error_body, status = verify_desktop_handoff(
            assertion, (body.get('verifier') or '').strip()
        )
        if not payload:
            return jsonify(error_body), status
        email = (payload.get('email') or '').lower().strip()
        google_id = (payload.get('google_id') or '').strip()
        password = None
    else:
        email = body.get('email', '').strip()
        password = body.get('password', '').strip()
        google_id = ''
        if not email or not password:
            return jsonify({'error': 'Email and password are required'}), 400

    db_url = os.environ.get('DB_URL')
    if not db_url:
        return jsonify({'error': 'DB_URL not configured in .env'}), 500

    # Step 1 — connect to Supabase and resolve the identity
    engine = None
    try:
        engine = create_engine(
            db_url,
            pool_pre_ping=True,
            connect_args={'connect_timeout': 30}
        )
        if password is None:
            client_id = _authenticate_supabase_google(engine, email, google_id)
        else:
            client_id = _authenticate_supabase(engine, email, password)
    except _SetupAuthError as e:
        # Never echo raw exception text (e.g. bcrypt's 'Invalid salt') — the
        # message and status are chosen deliberately by the authenticator.
        if engine is not None:
            engine.dispose()
        return jsonify({'error': str(e)}), e.status
    except Exception as e:
        logging.error(f'[Electron] Supabase auth failed: {e}')
        if engine is not None:
            engine.dispose()
        return jsonify({'error': 'Cannot connect to the server. Please try again later.'}), 503

    # Step 2 — fetch all client data from Supabase
    try:
        export = _fetch_from_supabase(engine, client_id)
    except Exception as e:
        logging.error(f'[Electron] Supabase fetch failed: {e}')
        engine.dispose()
        return jsonify({'error': 'Failed to fetch account data. Please try again later.'}), 500
    finally:
        engine.dispose()

    # Step 3 — insert into local SQLite
    try:
        _import_data(export)
    except Exception as e:
        logging.error(f'[Electron] import failed: {e}')
        db.session.rollback()
        return jsonify({'error': 'Failed to import account data. Please try again later.'}), 500

    return jsonify({
        'success': True,
        'message': 'Setup complete. You can now log in.',
    }), 200


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _fetch_supabase_user(engine, email: str):
    """Look up a usable (active, not soft-deleted) Supabase user by email.

    Returns the row or None. Deliberately says nothing about *why* a row is
    unusable — each caller decides how much to reveal.
    """
    with engine.connect() as conn:
        row = conn.execute(
            sa_text("""
                SELECT user_id, client_id, password_hash, is_active, deleted_at, google_id
                FROM users
                WHERE email = :email
                LIMIT 1
            """),
            {'email': email}
        ).mappings().first()

    if not row or row['deleted_at'] is not None or not row['is_active']:
        return None
    return row


def _authenticate_supabase(engine, email: str, password: str) -> str:
    """
    Verify credentials directly against Supabase users table.
    Returns client_id, or raises _SetupAuthError on bad credentials.
    """
    row = _fetch_supabase_user(engine, email)
    if not row:
        raise _SetupAuthError(_GENERIC_AUTH_ERROR)

    # Empty/NULL hash (invite-pending account) would make bcrypt raise
    # 'Invalid salt' — treat as a normal credential failure
    if not row['password_hash']:
        raise _SetupAuthError(_GENERIC_AUTH_ERROR)

    if not bcrypt.checkpw(password.encode('utf-8'), row['password_hash'].encode('utf-8')):
        raise _SetupAuthError(_GENERIC_AUTH_ERROR)

    return str(row['client_id'])


def _authenticate_supabase_google(engine, email: str, google_id: str) -> str:
    """
    Resolve a Supabase user from a Google identity already verified by the cloud.
    Returns client_id, or raises _SetupAuthError.

    No password is involved: users who signed up with Google hold a random hash
    they can never type. The cloud only mints assertions for Google-*verified*
    addresses, so trusting the email here is the same trust boundary the web
    auto-link already relies on.

    This reads Supabase but never writes to it — linking google_id onto the
    local record happens later, in desktop_login.
    """
    row = _fetch_supabase_user(engine, email)
    if not row:
        # Naming this is safe: the caller has already proven control of the
        # address, so there is nothing left to enumerate.
        raise _SetupAuthError(f'No Valoryx account found for {email}.', 404)

    linked = (row['google_id'] or '').strip()
    if linked and google_id and linked != google_id:
        logging.warning('[Electron] setup google_id mismatch for %s', email)
        raise _SetupAuthError(
            'This Google account does not match the account on file. '
            'Please contact your administrator.', 401
        )

    return str(row['client_id'])


def _serialize_row(row: dict) -> dict:
    result = {}
    for k, v in row.items():
        if v is None:
            result[k] = v
        elif isinstance(v, datetime):
            result[k] = v.isoformat()
        elif isinstance(v, (str, int, float, bool)):
            result[k] = v
        else:
            result[k] = str(v)  # handles UUID, Decimal, and any other pg types
    return result


def _fetch_from_supabase(engine, client_id: str) -> dict:
    """Fetch all client data from Supabase."""

    def fetch_table(table, extra_filter=''):
        sql = f"SELECT * FROM {table} WHERE client_id = :cid {extra_filter}"
        with engine.connect() as conn:
            rows = conn.execute(sa_text(sql), {'cid': client_id}).mappings().all()
            return [_serialize_row(dict(r)) for r in rows]

    def fetch_join(child_table, parent_table, parent_fk, parent_pk='client_id'):
        """Fetch child rows that belong to client via a parent table join."""
        sql = f"""SELECT c.* FROM {child_table} c
                  JOIN {parent_table} p ON c.{parent_fk} = p.{parent_fk}
                  WHERE p.{parent_pk} = :cid"""
        with engine.connect() as conn:
            rows = conn.execute(sa_text(sql), {'cid': client_id}).mappings().all()
            return [_serialize_row(dict(r)) for r in rows]

    with engine.connect() as conn:
        user_permissions = [
            _serialize_row(dict(r)) for r in conn.execute(sa_text("""
                SELECT up.* FROM user_permissions up
                JOIN users u ON up.user_id = u.user_id
                WHERE u.client_id = :cid
            """), {'cid': client_id}).mappings().all()
        ]

    # client_entry uses client_id as its PK, not FK
    with engine.connect() as conn:
        ce_rows = conn.execute(sa_text(
            "SELECT * FROM client_entry WHERE client_id = :cid"
        ), {'cid': client_id}).mappings().all()
        client_entry = [_serialize_row(dict(r)) for r in ce_rows]

    # global tables — fetch all rows (no client_id filter)
    def fetch_global(table):
        with engine.connect() as conn:
            rows = conn.execute(sa_text(f"SELECT * FROM {table}")).mappings().all()
            return [_serialize_row(dict(r)) for r in rows]

    # notes: no client_id, filter via users table
    def fetch_notes():
        with engine.connect() as conn:
            rows = conn.execute(sa_text("""
                SELECT n.* FROM notes n
                JOIN users u ON n.user_id = u.user_id
                WHERE u.client_id = :cid
            """), {'cid': client_id}).mappings().all()
            return [_serialize_row(dict(r)) for r in rows]

    data = {
        # Global tables (no client_id filter)
        'client_entry':             client_entry,
        'permission_sections':      fetch_global('permission_sections'),
        'permissions':              fetch_global('permissions'),
        'subscription_plan':        fetch_global('subscription_plan'),
        # Client-scoped tables
        'users':                    fetch_table('users', extra_filter='AND deleted_at IS NULL'),
        'user_permissions':         user_permissions,
        'user_sessions':            fetch_table('user_sessions'),
        'gst_billing':              fetch_table('gst_billing'),
        'non_gst_billing':          fetch_table('non_gst_billing'),
        'stock_entry':              fetch_table('stock_entry'),
        'customer':                 fetch_table('customer'),
        'payment_type':             fetch_table('payment_type'),
        'expense':                  fetch_table('expense'),
        'expense_summary':          fetch_table('expense_summary'),
        'branches':                 fetch_table('branches'),
        'branch_inventory':         fetch_table('branch_inventory'),
        'bulk_stock_order':         fetch_table('bulk_stock_order'),
        'bulk_stock_order_item':    fetch_join('bulk_stock_order_item', 'bulk_stock_order', 'order_id'),
        'stock_transfers':          fetch_table('stock_transfers'),
        'stock_transfer_items':     fetch_join('stock_transfer_items', 'stock_transfers', 'transfer_id'),
        'suppliers':                fetch_table('suppliers'),
        'supplier_deliveries':      fetch_table('supplier_deliveries'),
        'supplier_delivery_items':  fetch_join('supplier_delivery_items', 'supplier_deliveries', 'delivery_id'),
        'notes':                    fetch_notes(),
        'report':                   fetch_table('report'),
        'audit_log':                fetch_table('audit_log'),
        'payment_transaction':      fetch_table('payment_transaction'),
        'permission_presets':       fetch_table('permission_presets'),
        'webhook_endpoints':        fetch_table('webhook_endpoints'),
        'webhook_deliveries':       fetch_table('webhook_deliveries'),
    }

    logging.info(f'[Electron] Fetched Supabase data for client {client_id}')
    return data


def _import_data(data: dict):
    """Upsert all rows into local SQLite."""
    tables = {
        'client_entry':             'client_id',
        'permission_sections':      'section_id',
        'permissions':              'permission_id',
        'subscription_plan':        'plan_id',
        'users':                    'user_id',
        'user_permissions':         'id',
        'user_sessions':            'id',
        'gst_billing':              'bill_id',
        'non_gst_billing':          'bill_id',
        'stock_entry':              'product_id',
        'customer':                 'customer_id',
        'payment_type':             'payment_type_id',
        'expense':                  'expense_id',
        'expense_summary':          'summary_id',
        'branches':                 'branch_id',
        'branch_inventory':         'id',
        'bulk_stock_order':         'order_id',
        'bulk_stock_order_item':    'item_id',
        'stock_transfers':          'transfer_id',
        'stock_transfer_items':     'id',
        'suppliers':                'supplier_id',
        'supplier_deliveries':      'delivery_id',
        'supplier_delivery_items':  'id',
        'notes':                    'note_id',
        'report':                   'report_id',
        'audit_log':                'log_id',
        'payment_transaction':      'transaction_id',
        'permission_presets':       'preset_id',
        'webhook_endpoints':        'endpoint_id',
        'webhook_deliveries':       'delivery_id',
    }

    for key, pk in tables.items():
        rows = data.get(key, [])
        if not rows:
            continue

        for row in rows:
            if not row.get(pk):
                continue

            cols = [c for c in row.keys() if row[c] is not None]
            if not cols:
                continue

            col_names = ', '.join(cols)
            placeholders = ', '.join(f':{c}' for c in cols)
            sql = f'INSERT OR REPLACE INTO {key} ({col_names}) VALUES ({placeholders})'
            db.session.execute(sa_text(sql), {c: row[c] for c in cols})

    db.session.commit()
    logging.info('[Electron] Data import complete')
