"""
Invite Blueprint
----------------
Handles invite token validation and password setup for new team members.

Endpoints:
  POST /api/invite/validate        -- Validate token (public)
  POST /api/invite/accept          -- Accept invite, set password, auto-login (public)
  POST /api/invite/resend/<user_id> -- Resend invite (requires owner/admin auth)
"""
import secrets
import uuid as _uuid
from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request, g
from extensions import db
from models.user_model import User
from models.audit_model import AuditLog
from utils.auth_middleware import authenticate, require_role
from utils.email_service import send_invite_email
from config import Config

invite_bp = Blueprint('invite', __name__)

INVITE_EXPIRY_HOURS = 48


# ---------------------------------------------------------------------------
# POST /api/invite/validate
# ---------------------------------------------------------------------------
@invite_bp.route('/validate', methods=['POST'])
def validate_invite():
    """
    Validate an invite token (called when user lands on AcceptInvite page).
    Body: { "token": "..." }
    Returns: { success, data: { email, role, full_name, business_name } }
    """
    data = request.get_json() or {}
    token = (data.get('token') or '').strip()

    if not token:
        return jsonify({'success': False, 'error': 'Token is required'}), 400

    user = User.query.filter_by(invite_token=token, invite_accepted=False).first()

    if not user:
        return jsonify({'success': False, 'error': 'Invalid or already used invite link'}), 404

    if not user.invite_token_expires or datetime.utcnow() > user.invite_token_expires:
        return jsonify({'success': False, 'error': 'This invite link has expired. Ask your admin to resend.'}), 410

    from models.client_model import ClientEntry
    client = ClientEntry.query.filter_by(client_id=user.client_id).first()

    return jsonify({
        'success': True,
        'data': {
            'email': user.email,
            'role': user.role,
            'full_name': user.full_name or '',
            'business_name': client.client_name if client else '',
        }
    }), 200


# ---------------------------------------------------------------------------
# POST /api/invite/accept
# ---------------------------------------------------------------------------
@invite_bp.route('/accept', methods=['POST'])
def accept_invite():
    """
    Accept invite: set password and activate account.
    Body: { "token": "...", "password": "..." }
    Returns JWT token for auto-login.
    """
    import bcrypt
    import jwt
    from models.permission_model import get_user_permissions
    from models.client_model import ClientEntry

    data = request.get_json() or {}
    token = (data.get('token') or '').strip()
    password = (data.get('password') or '').strip()

    if not token or not password:
        return jsonify({'success': False, 'error': 'Token and password are required'}), 400

    if len(password) < 8:
        return jsonify({'success': False, 'error': 'Password must be at least 8 characters'}), 400

    user = User.query.filter_by(invite_token=token, invite_accepted=False).first()

    if not user:
        return jsonify({'success': False, 'error': 'Invalid or already used invite link'}), 404

    if not user.invite_token_expires or datetime.utcnow() > user.invite_token_expires:
        return jsonify({'success': False, 'error': 'This invite link has expired. Ask your admin to resend.'}), 410

    # Set password, mark invite accepted, clear token, activate account
    user.password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    user.invite_accepted = True
    user.invite_token = None
    user.invite_token_expires = None
    user.is_active = True
    user.updated_at = datetime.utcnow()

    # Write audit log inline (no g.user available in unauthenticated context)
    try:
        audit_entry = AuditLog(
            log_id=str(_uuid.uuid4()),
            client_id=str(user.client_id),
            user_id=str(user.user_id),
            action_type='invite_accepted',
            table_name='users',
            record_id=str(user.user_id),
            old_data=None,
            new_data={'email': user.email, 'role': user.role},
            ip_address=request.remote_addr,
            user_agent=request.headers.get('User-Agent', ''),
        )
        db.session.add(audit_entry)
    except Exception as _audit_exc:
        # Audit failure must never block account activation
        import logging
        logging.getLogger(__name__).warning('invite_accepted audit log failed: %s', _audit_exc)

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({'success': False, 'error': 'Failed to activate account'}), 500

    # Generate JWT for auto-login
    client = ClientEntry.query.filter_by(client_id=user.client_id).first()
    permissions = get_user_permissions(str(user.user_id))

    # Create a tracked session (same pattern as auth.py login)
    from models.session_model import UserSession
    import secrets as _secrets

    session_id = _secrets.token_urlsafe(32)
    session_expires = datetime.utcnow() + timedelta(hours=Config.JWT_EXPIRATION_HOURS)

    ua_string = request.headers.get('User-Agent', '')
    if 'Mobile' in ua_string:
        device = 'Mobile'
    elif 'Tablet' in ua_string:
        device = 'Tablet'
    else:
        device = 'Desktop'

    incoming_ip = (
        request.headers.get('X-Forwarded-For', '').split(',')[0].strip()
        or request.remote_addr
        or 'unknown'
    )

    new_session = UserSession(
        id=str(_uuid.uuid4()),
        session_id=session_id,
        user_id=str(user.user_id),
        client_id=str(user.client_id),
        ip_address=incoming_ip,
        user_agent=ua_string[:512],
        device=device,
        expires_at=session_expires,
        is_active=True,
    )
    db.session.add(new_session)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        # Non-fatal: session tracking failure should not block invite acceptance

    token_payload = {
        'user_id': str(user.user_id),
        'email': user.email,
        'client_id': str(user.client_id),
        'role': user.role,
        'is_super_admin': user.is_super_admin,
        'permissions': permissions,
        'session_id': session_id,
        'exp': datetime.utcnow() + timedelta(hours=Config.JWT_EXPIRATION_HOURS),
    }
    jwt_token = jwt.encode(token_payload, Config.JWT_SECRET, algorithm=Config.JWT_ALGORITHM)

    user_dict = user.to_dict()
    user_dict.pop('password_hash', None)

    return jsonify({
        'success': True,
        'token': jwt_token,
        'user': user_dict,
        'client_id': str(user.client_id),
        'client_name': client.client_name if client else '',
        'message': 'Account activated successfully. Welcome!',
    }), 200


# ---------------------------------------------------------------------------
# POST /api/invite/resend/<user_id>
# ---------------------------------------------------------------------------
@invite_bp.route('/resend/<user_id>', methods=['POST'])
@authenticate
@require_role(['owner', 'admin'])
def resend_invite(user_id):
    """
    Resend (or generate a fresh) invite for a pending team member.
    Requires owner/admin role.
    """
    user = User.query.filter_by(
        user_id=user_id,
        client_id=g.user['client_id'],
        deleted_at=None,
    ).first()

    if not user:
        return jsonify({'success': False, 'error': 'User not found'}), 404

    if user.invite_accepted:
        return jsonify({'success': False, 'error': 'This user has already accepted their invite'}), 409

    new_token = secrets.token_urlsafe(32)
    user.invite_token = new_token
    user.invite_token_expires = datetime.utcnow() + timedelta(hours=INVITE_EXPIRY_HOURS)
    user.updated_at = datetime.utcnow()
    user.updated_by = g.user['user_id']

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({'success': False, 'error': 'Failed to resend invite'}), 500

    from models.client_model import ClientEntry
    client = ClientEntry.query.filter_by(client_id=g.user['client_id']).first()
    frontend_url = Config.FRONTEND_URL
    invite_url = f"{frontend_url}/accept-invite?token={new_token}"

    send_invite_email(
        to_email=user.email,
        inviter_name=g.user.get('full_name') or g.user.get('email', ''),
        business_name=client.client_name if client else '',
        role=user.role,
        invite_url=invite_url,
    )

    return jsonify({'success': True, 'message': 'Invite resent successfully'}), 200
