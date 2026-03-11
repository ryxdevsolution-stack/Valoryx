"""
Sessions Blueprint
------------------
List and revoke active user sessions. Users manage their own; admins can manage team members'.
"""
from datetime import datetime
from flask import Blueprint, jsonify, request, g
from extensions import db
from models.session_model import UserSession
from models.user_model import User
from utils.auth_middleware import authenticate, require_role
from utils.audit_logger import log_action
from utils.cache_helper import get_cache_manager
import jwt
from config import Config

sessions_bp = Blueprint('sessions', __name__)


@sessions_bp.route('', methods=['GET'])
@authenticate
def list_my_sessions():
    """List all active sessions for the current user. GET /api/sessions"""
    user_id = g.user['user_id']

    # Identify current session from JWT (needed before cache to mark is_current)
    current_session_id = None
    auth_header = request.headers.get('Authorization', '')
    if auth_header:
        try:
            token = auth_header.split(' ')[-1]
            decoded = jwt.decode(token, Config.JWT_SECRET, algorithms=[Config.JWT_ALGORITHM])
            current_session_id = decoded.get('session_id')
        except Exception:
            pass

    cache = get_cache_manager()
    cache_key = f"sessions:{user_id}:{current_session_id}"
    cached = cache.get(cache_key)
    if cached is not None:
        return jsonify(cached), 200

    sessions = UserSession.query.filter_by(
        user_id=user_id,
        is_active=True,
    ).filter(
        UserSession.expires_at > datetime.utcnow()
    ).order_by(UserSession.last_seen.desc()).all()

    result = []
    for s in sessions:
        d = s.to_dict()
        d['is_current'] = (s.session_id == current_session_id)
        result.append(d)

    response = {'success': True, 'data': result, 'sessions': result}
    cache.set(cache_key, response, 15)
    return jsonify(response), 200


@sessions_bp.route('/<session_id>/revoke', methods=['POST'])
@authenticate
def revoke_session(session_id):
    """Revoke a specific session. POST /api/sessions/<session_id>/revoke"""
    session = UserSession.query.filter_by(
        session_id=session_id,
        user_id=g.user['user_id'],
        is_active=True,
    ).first()

    if not session:
        return jsonify({'success': False, 'error': 'Session not found'}), 404

    session.is_active = False
    session.revoked_at = datetime.utcnow()
    db.session.commit()

    log_action('session_revoked', 'user_sessions', session_id,
               {'ip': session.ip_address}, {}, auto_commit=True)

    return jsonify({'success': True, 'message': 'Session revoked'}), 200


@sessions_bp.route('/revoke-all', methods=['POST'])
@authenticate
def revoke_all_sessions():
    """Revoke ALL sessions except the current one. POST /api/sessions/revoke-all"""
    current_session_id = None
    auth_header = request.headers.get('Authorization', '')
    if auth_header:
        try:
            token = auth_header.split(' ')[-1]
            decoded = jwt.decode(token, Config.JWT_SECRET, algorithms=[Config.JWT_ALGORITHM])
            current_session_id = decoded.get('session_id')
        except Exception:
            pass

    query = UserSession.query.filter_by(user_id=g.user['user_id'], is_active=True)
    if current_session_id:
        query = query.filter(UserSession.session_id != current_session_id)

    count = query.count()
    now = datetime.utcnow()
    query.update({'is_active': False, 'revoked_at': now})
    db.session.commit()

    return jsonify({'success': True, 'message': f'{count} session(s) revoked'}), 200


@sessions_bp.route('/user/<user_id>', methods=['GET'])
@authenticate
@require_role(['owner', 'admin'])
def list_user_sessions(user_id):
    """Admin: list active sessions for a team member. GET /api/sessions/user/<user_id>"""
    target = User.query.filter_by(
        user_id=user_id,
        client_id=g.user['client_id'],
        deleted_at=None,
    ).first()
    if not target:
        return jsonify({'success': False, 'error': 'User not found'}), 404

    sessions = UserSession.query.filter_by(
        user_id=user_id,
        is_active=True,
    ).filter(
        UserSession.expires_at > datetime.utcnow()
    ).order_by(UserSession.last_seen.desc()).all()

    return jsonify({'success': True, 'data': [s.to_dict() for s in sessions]}), 200


@sessions_bp.route('/user/<user_id>/revoke-all', methods=['POST'])
@authenticate
@require_role(['owner', 'admin'])
def admin_revoke_user_sessions(user_id):
    """Admin: force-logout all sessions for a team member. POST /api/sessions/user/<user_id>/revoke-all"""
    target = User.query.filter_by(
        user_id=user_id,
        client_id=g.user['client_id'],
        deleted_at=None,
    ).first()
    if not target:
        return jsonify({'success': False, 'error': 'User not found'}), 404

    count = UserSession.query.filter_by(user_id=user_id, is_active=True).count()
    now = datetime.utcnow()
    UserSession.query.filter_by(user_id=user_id, is_active=True).update({
        'is_active': False, 'revoked_at': now
    })
    db.session.commit()

    log_action('sessions_revoked_by_admin', 'user_sessions', user_id,
               {}, {'count': count}, auto_commit=True)

    return jsonify({'success': True, 'message': f'{count} session(s) revoked'}), 200
