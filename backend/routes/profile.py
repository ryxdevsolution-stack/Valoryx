"""
Profile routes for user self-management
Allows users to view/edit their own profile and change password
"""

import bcrypt
from datetime import datetime
from flask import Blueprint, request, jsonify, g
from extensions import db
from models.user_model import User
from models.client_model import ClientEntry
from models.branch_model import Branch
from models.audit_model import AuditLog
from models.permission_model import get_user_permissions
from models.session_model import UserSession
from utils.auth_middleware import authenticate
from utils.audit_logger import log_action
from utils.cache_helper import get_cache_manager
from utils.login_pin import pin_eligible, validate_new_pin, apply_pin, clear_pin

profile_bp = Blueprint('profile', __name__)


@profile_bp.route('', methods=['GET'])
@authenticate
def get_profile():
    """Get current user's complete profile"""
    try:
        user_id = g.user['user_id']

        cache = get_cache_manager()
        cache_key = f"profile:{user_id}"
        cached = cache.get(cache_key)
        if cached is not None:
            return jsonify(cached), 200

        user = User.query.filter_by(user_id=user_id).first()
        if not user:
            return jsonify({'error': 'User not found'}), 404

        client = ClientEntry.query.filter_by(client_id=user.client_id).first()
        permissions = get_user_permissions(user_id)

        # Resolve branch name if user has a branch assigned
        branch_name = None
        if user.branch_id:
            branch = Branch.query.filter_by(branch_id=user.branch_id).first()
            if branch:
                branch_name = branch.name

        profile_data = {
            'user_id': user.user_id,
            'email': user.email,
            'full_name': user.full_name or '',
            'phone': user.phone or '',
            'department': user.department or '',
            'role': user.role,
            'is_super_admin': user.is_super_admin,
            'is_active': user.is_active,
            'branch_id': str(user.branch_id) if user.branch_id else None,
            'branch_name': branch_name,
            'created_at': user.created_at.isoformat() if user.created_at else None,
            'last_login': user.last_login.isoformat() if user.last_login else None,
            'telegram_chat_id': user.telegram_chat_id,
            'report_email_frequency': user.report_email_frequency,
            'must_change_password': user.must_change_password,
            'totp_enabled': user.totp_enabled,
            'pin_eligible': pin_eligible(user),
            'has_pin': bool(user.pin_hash),
            'permissions': permissions,
            'client': {
                'client_id': client.client_id,
                'client_name': client.client_name,
                'email': client.email,
                'logo_url': client.logo_url
            } if client else None
        }

        cache.set(cache_key, profile_data, 30)
        return jsonify(profile_data), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@profile_bp.route('', methods=['PUT'])
@authenticate
def update_profile():
    """Update current user's profile (name, phone, department only)"""
    try:
        user_id = g.user['user_id']
        data = request.get_json()

        user = User.query.filter_by(user_id=user_id).first()
        if not user:
            return jsonify({'error': 'User not found'}), 404

        old_data = user.to_dict()

        # Only allow updating specific fields
        if 'full_name' in data:
            user.full_name = data['full_name']
        if 'phone' in data:
            user.phone = data['phone']
        if 'department' in data:
            user.department = data['department']
        if 'telegram_chat_id' in data:
            raw_id = str(data['telegram_chat_id']).strip() if data['telegram_chat_id'] else ''
            if raw_id and not raw_id.lstrip('-').isdigit():
                return jsonify({'error': 'telegram_chat_id must be a numeric Telegram chat ID'}), 400
            user.telegram_chat_id = raw_id or None
        if 'report_email_frequency' in data:
            freq = str(data['report_email_frequency']).strip().lower()
            if freq not in ('off', 'daily', 'weekly'):
                return jsonify({'error': "report_email_frequency must be 'off', 'daily' or 'weekly'"}), 400
            user.report_email_frequency = freq

        user.updated_at = datetime.utcnow()
        user.updated_by = user_id
        # Re-queue this row for upload: the sync uploader only picks up rows
        # WHERE synced_at IS NULL. Without this, an edit made after the row's
        # first successful sync is skipped forever and never reaches the cloud
        # (and therefore never reaches other devices / the live server).
        user.synced_at = None

        db.session.commit()

        # Invalidate cache
        cache = get_cache_manager()
        cache.delete(f"user_session:{user_id}")
        cache.delete(f"profile:{user_id}")

        # Log action
        log_action('UPDATE', 'users', user_id, old_data, user.to_dict())

        return jsonify({
            'success': True,
            'message': 'Profile updated successfully',
            'profile': {
                'full_name': user.full_name,
                'phone': user.phone,
                'department': user.department,
                'telegram_chat_id': user.telegram_chat_id,
                'report_email_frequency': user.report_email_frequency,
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


# Setting a PIN without re-typing the password is only allowed right after login,
# when the user has just proven it (the post-login "set your PIN" prompt).
FRESH_LOGIN_MINUTES = 10


def _fresh_login(user_id) -> bool:
    session_id = g.user.get('session_id')
    if not session_id:
        return False
    s = UserSession.query.filter_by(session_id=session_id, user_id=str(user_id), is_active=True).first()
    return bool(s and s.created_at and (datetime.utcnow() - s.created_at).total_seconds() < FRESH_LOGIN_MINUTES * 60)


@profile_bp.route('/pin', methods=['PUT'])
@authenticate
def set_own_pin():
    """Staff/manager sets or changes their own 4-digit login PIN.

    Body: {pin, current_password?}. The current password is required — except for a
    first PIN set within FRESH_LOGIN_MINUTES of a password login (the login prompt).
    """
    try:
        user = User.query.filter_by(user_id=g.user['user_id']).first()
        if not user:
            return jsonify({'error': 'User not found'}), 404
        if not pin_eligible(user):
            return jsonify({'error': 'PIN login is only for staff and managers — owners use their password'}), 403

        data = request.get_json() or {}
        pin = str(data.get('pin') or '').strip()
        error = validate_new_pin(pin)
        if error:
            return jsonify({'error': error}), 400

        current_password = data.get('current_password') or ''
        if current_password:
            if not bcrypt.checkpw(current_password.encode('utf-8'), user.password_hash.encode('utf-8')):
                return jsonify({'error': 'Current password is incorrect'}), 401
        elif user.pin_hash or not _fresh_login(user.user_id):
            return jsonify({'error': 'Enter your current password to change your PIN',
                            'code': 'PASSWORD_REQUIRED'}), 401

        apply_pin(user, pin, user.user_id)
        log_action('UPDATE', 'users', user.user_id, {'has_pin': bool(user.pin_hash)}, {'pin_changed_by': 'self'})
        db.session.commit()
        get_cache_manager().delete(f"profile:{user.user_id}")
        return jsonify({'success': True, 'message': 'PIN saved'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to save PIN', 'message': str(e)}), 500


@profile_bp.route('/pin', methods=['DELETE'])
@authenticate
def remove_own_pin():
    """Remove your own PIN (requires current password). Body: {current_password}."""
    try:
        user = User.query.filter_by(user_id=g.user['user_id']).first()
        if not user or not pin_eligible(user):
            return jsonify({'error': 'Not allowed'}), 403
        current_password = (request.get_json(silent=True) or {}).get('current_password') or ''
        if not current_password or not bcrypt.checkpw(current_password.encode('utf-8'),
                                                      user.password_hash.encode('utf-8')):
            return jsonify({'error': 'Current password is incorrect'}), 401
        clear_pin(user, user.user_id)
        db.session.commit()
        get_cache_manager().delete(f"profile:{user.user_id}")
        return jsonify({'success': True, 'message': 'PIN removed'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to remove PIN', 'message': str(e)}), 500


@profile_bp.route('/password', methods=['POST'])
@authenticate
def change_password():
    """Change own password (requires current password verification)"""
    try:
        user_id = g.user['user_id']
        data = request.get_json()

        current_password = data.get('current_password')
        new_password = data.get('new_password')

        if not current_password or not new_password:
            return jsonify({'error': 'Current password and new password are required'}), 400

        if len(new_password) < 6:
            return jsonify({'error': 'New password must be at least 6 characters'}), 400

        user = User.query.filter_by(user_id=user_id).first()
        if not user:
            return jsonify({'error': 'User not found'}), 404

        # Verify current password
        if not bcrypt.checkpw(current_password.encode('utf-8'), user.password_hash.encode('utf-8')):
            return jsonify({'error': 'Current password is incorrect'}), 401

        # Hash new password
        salt = bcrypt.gensalt()
        new_password_hash = bcrypt.hashpw(new_password.encode('utf-8'), salt).decode('utf-8')

        user.password_hash = new_password_hash
        user.updated_at = datetime.utcnow()
        user.updated_by = user_id
        # Clear force-change flag now that the user has chosen their own password
        user.must_change_password = False
        # Re-queue for upload (see update_profile): a locally-changed password
        # that never syncs would leave the OLD password working on the live
        # server and other devices — a correctness and security gap.
        user.synced_at = None

        # Security: revoke all OTHER active sessions on password change.
        # Keeps the current session alive (so user stays logged in here) but
        # forces re-login on every other device/browser. Mitigates the "attacker
        # session keeps working after victim resets password" scenario.
        current_session_id = g.user.get('session_id')
        revoke_query = UserSession.query.filter(
            UserSession.user_id == user_id,
            UserSession.is_active.is_(True),
        )
        if current_session_id:
            revoke_query = revoke_query.filter(UserSession.session_id != current_session_id)
        revoked_sessions = revoke_query.all()
        now = datetime.utcnow()
        for s in revoked_sessions:
            s.is_active = False
            s.revoked_at = now

        db.session.commit()

        # Invalidate cache for this user + each revoked session (auth middleware
        # may cache them; without this, revoked sessions could still appear
        # valid until their cache TTL expires).
        cache = get_cache_manager()
        cache.delete(f"user_session:{user_id}")
        for s in revoked_sessions:
            cache.delete(f"session:{s.session_id}")

        # Log action (don't store passwords). Include the count of sessions
        # killed so an audit reader can spot suspicious activity (e.g. a user
        # who had 7 active sessions before a password change).
        log_action('PASSWORD_CHANGE', 'users', user_id, None, {
            'changed_at': now.isoformat(),
            'other_sessions_revoked': len(revoked_sessions),
        })

        return jsonify({
            'success': True,
            'message': 'Password changed successfully',
            'other_sessions_revoked': len(revoked_sessions),
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@profile_bp.route('/activity', methods=['GET'])
@authenticate
def get_activity_history():
    """Get user's own activity history (last 7 days) with pagination"""
    try:
        user_id = g.user['user_id']
        client_id = g.user['client_id']

        page = request.args.get('page', 1, type=int)
        limit = request.args.get('limit', 10, type=int)
        limit = min(limit, 100)  # Cap at 100
        offset = (page - 1) * limit

        # Get activity logs for last 7 days
        from datetime import timedelta
        seven_days_ago = datetime.utcnow() - timedelta(days=7)

        base_query = AuditLog.query.filter(
            AuditLog.user_id == user_id,
            AuditLog.client_id == client_id,
            AuditLog.timestamp >= seven_days_ago
        )

        total = base_query.count()
        logs = base_query.order_by(AuditLog.timestamp.desc()).offset(offset).limit(limit).all()

        activity_list = []
        for log in logs:
            activity_list.append({
                'log_id': log.log_id,
                'action_type': log.action_type,
                'table_name': log.table_name,
                'record_id': log.record_id,
                'timestamp': log.timestamp.isoformat() if log.timestamp else None,
                'ip_address': log.ip_address
            })

        return jsonify({
            'activity': activity_list,
            'pagination': {
                'page': page,
                'limit': limit,
                'total': total,
                'pages': (total + limit - 1) // limit
            }
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500
