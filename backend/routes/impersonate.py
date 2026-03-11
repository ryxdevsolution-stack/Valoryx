"""
Super-admin impersonation routes.

POST /api/admin/impersonate/<client_id>
    Issues a short-lived (2-hour), read-only JWT scoped to the target client.
    Requires the caller to be a super admin with a valid non-impersonation session.

POST /api/admin/impersonate/end
    Invalidates the impersonation token by logging the session end.
    The caller just discards their impersonation token and resumes their real token.
"""
import jwt
from datetime import datetime, timedelta
from flask import Blueprint, g, jsonify
from models.user_model import User
from models.client_model import ClientEntry
from utils.auth_middleware import authenticate
from utils.permission_middleware import require_super_admin
from utils.audit_logger import log_action
from config import Config

impersonate_bp = Blueprint('impersonate', __name__)

_IMPERSONATION_TTL_HOURS = 2


@impersonate_bp.route('/<client_id>', methods=['POST'])
@authenticate
@require_super_admin
def start_impersonation(client_id):
    """Issue a read-only impersonation JWT for the given client."""
    # Refuse nested impersonation
    if g.user.get('is_impersonation'):
        return jsonify({'error': 'Cannot impersonate while already in an impersonation session'}), 403

    target_client = ClientEntry.query.filter_by(client_id=client_id, is_active=True).first()
    if not target_client:
        return jsonify({'error': 'Client not found or inactive'}), 404

    # Find the owner user for the target client (to anchor the JWT user_id)
    target_owner = User.query.filter_by(client_id=client_id, role='owner', is_active=True).first()
    if not target_owner:
        return jsonify({'error': 'No active owner found for this client'}), 404

    now = datetime.utcnow()
    exp = now + timedelta(hours=_IMPERSONATION_TTL_HOURS)

    payload = {
        'user_id': str(target_owner.user_id),
        'client_id': str(target_client.client_id),
        'client_name': target_client.client_name,
        'role': target_owner.role,
        'is_super_admin': False,
        'permissions': [],
        'is_impersonation': True,
        'is_readonly': True,
        'impersonating_admin_id': g.user['user_id'],
        'iat': now,
        'exp': exp,
    }

    token = jwt.encode(payload, Config.JWT_SECRET, algorithm=Config.JWT_ALGORITHM)
    if isinstance(token, bytes):
        token = token.decode('utf-8')

    log_action(
        'IMPERSONATION_START',
        'client_entry',
        str(target_client.client_id),
        {'admin_id': g.user['user_id']},
        {'target_client': str(target_client.client_id), 'expires': exp.isoformat()},
    )

    return jsonify({
        'success': True,
        'token': token,
        'expires_at': exp.isoformat(),
        'client': {
            'client_id': str(target_client.client_id),
            'client_name': target_client.client_name,
            'email': target_client.email,
        },
    }), 200


@impersonate_bp.route('/end', methods=['POST'])
@authenticate
def end_impersonation():
    """Log the end of an impersonation session (client-side discards the token)."""
    if not g.user.get('is_impersonation'):
        return jsonify({'error': 'Not in an impersonation session'}), 400

    log_action(
        'IMPERSONATION_END',
        'client_entry',
        g.user['client_id'],
        {'admin_id': g.user.get('impersonating_admin_id')},
        {},
    )

    return jsonify({'success': True, 'message': 'Impersonation session ended'}), 200
