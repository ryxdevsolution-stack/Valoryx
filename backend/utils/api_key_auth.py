"""
Ryx external API keys — a separate trust mechanism from the user-login JWT in
auth_middleware.py. These authenticate a partner's SERVER, not a logged-in
person, so there is no 2FA / session revocation / subscription check here —
only "is this key valid, and what is it allowed to touch."

Key format: ryx_live_<64 hex chars>. Only the SHA-256 hash is ever stored;
the raw key is shown to the caller once, at creation time, and never again.
"""
import hashlib
import secrets
from datetime import datetime
from functools import wraps

from flask import g, jsonify, request

from extensions import db
from models.api_key_model import ApiKey

KEY_PREFIX = 'ryx_live_'

SCOPE_CLIENT_PROVISIONING = 'client_provisioning'  # dev-level: create clients
SCOPE_STOCK_MANAGEMENT = 'stock_management'        # client-level: check/reduce stock


def generate_api_key():
    """Create a new raw key + its hash. Returns (raw_key, key_hash, key_prefix).

    The raw key is the only copy that will ever exist in plaintext — persist
    key_hash/key_prefix and return raw_key to the caller exactly once.
    """
    raw_key = KEY_PREFIX + secrets.token_hex(32)
    key_hash = hash_api_key(raw_key)
    key_prefix = raw_key[:len(KEY_PREFIX) + 8]
    return raw_key, key_hash, key_prefix


def hash_api_key(raw_key):
    return hashlib.sha256(raw_key.encode('utf-8')).hexdigest()


def authenticate_api_key(required_scope):
    """
    Usage:
        @authenticate_api_key(SCOPE_STOCK_MANAGEMENT)
        def check_stock(): ...

    On success sets g.api_key = {'client_id', 'dev_id', 'scope'}.
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            raw_key = request.headers.get('X-API-Key')
            if not raw_key:
                return jsonify({'error': 'X-API-Key header missing'}), 401

            key_hash = hash_api_key(raw_key)
            key_row = ApiKey.query.filter_by(key_hash=key_hash, is_active=True).first()
            if not key_row:
                return jsonify({'error': 'Invalid or revoked API key'}), 401

            if key_row.scope != required_scope:
                return jsonify({
                    'error': 'This key is not authorized for this action',
                    'code': 'SCOPE_MISMATCH',
                }), 403

            key_row.last_used_at = datetime.utcnow()
            try:
                db.session.commit()
            except Exception:
                db.session.rollback()

            g.api_key = {
                'api_key_id': str(key_row.api_key_id),
                'client_id': str(key_row.client_id) if key_row.client_id else None,
                'dev_id': str(key_row.dev_id) if key_row.dev_id else None,
                'scope': key_row.scope,
            }
            return f(*args, **kwargs)
        return decorated_function
    return decorator
