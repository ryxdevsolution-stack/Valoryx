"""
TOTP action-token helper
------------------------
Used by endpoints that require 2FA verification before a sensitive action
(delete account, add team member, etc.).

Flow:
  1. Frontend calls POST /api/totp/verify-action  → gets action_token (TTL 60s)
  2. Frontend passes action_token in the real action request body
  3. Backend calls require_totp_action_token() to validate before proceeding

Only applied to self-registered client owners: users where created_by IS NULL.
Admin-created sub-users are never gated, even if they happen to have totp_enabled.
"""
from flask import jsonify
from utils.cache_helper import get_cache_manager


def require_totp_action_token(user, data: dict):
    """
    Validate a TOTP action token for a sensitive action.

    Returns None if the check passes (caller may proceed).
    Returns a Flask (response, status_code) tuple if the check fails.

    Args:
        user: SQLAlchemy User model instance (must have totp_enabled, created_by).
        data: Parsed request JSON dict, expected to contain 'totp_action_token'.
    """
    # Only self-registered owners (created_by IS NULL) with 2FA enabled need this
    if not user.totp_enabled or user.created_by is not None:
        return None

    action_token = (data.get('totp_action_token') or '').strip()
    if not action_token:
        return jsonify({'success': False, 'requires_totp': True}), 403

    cache = get_cache_manager()
    cache_key = f"totp_action:{str(user.user_id)}:{action_token}"
    if not cache.get(cache_key):
        return jsonify({
            'success': False,
            'requires_totp': True,
            'error': 'Verification expired. Please verify again.',
        }), 403

    # Consume the token — single use
    cache.delete(cache_key)
    return None
