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
from models.audit_model import AuditLog
from models.permission_model import get_user_permissions
from utils.auth_middleware import authenticate
from utils.audit_logger import log_action
from utils.cache_helper import get_cache_manager

profile_bp = Blueprint('profile', __name__)


@profile_bp.route('', methods=['GET'])
@authenticate
def get_profile():
    """Get current user's complete profile"""
    try:
        user_id = g.user['user_id']

        user = User.query.filter_by(user_id=user_id).first()
        if not user:
            return jsonify({'error': 'User not found'}), 404

        client = ClientEntry.query.filter_by(client_id=user.client_id).first()
        permissions = get_user_permissions(user_id)

        profile_data = {
            'user_id': user.user_id,
            'email': user.email,
            'full_name': user.full_name or '',
            'phone': user.phone or '',
            'department': user.department or '',
            'role': user.role,
            'is_super_admin': user.is_super_admin,
            'is_active': user.is_active,
            'created_at': user.created_at.isoformat() if user.created_at else None,
            'last_login': user.last_login.isoformat() if user.last_login else None,
            'permissions': permissions,
            'client': {
                'client_id': client.client_id,
                'client_name': client.client_name,
                'email': client.email,
                'logo_url': client.logo_url
            } if client else None
        }

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

        user.updated_at = datetime.utcnow()
        user.updated_by = user_id

        db.session.commit()

        # Invalidate cache
        cache = get_cache_manager()
        cache.delete(f"user_session:{user_id}")

        # Log action
        log_action('UPDATE', 'users', user_id, old_data, user.to_dict())

        return jsonify({
            'success': True,
            'message': 'Profile updated successfully',
            'profile': {
                'full_name': user.full_name,
                'phone': user.phone,
                'department': user.department
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


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

        db.session.commit()

        # Invalidate cache
        cache = get_cache_manager()
        cache.delete(f"user_session:{user_id}")

        # Log action (don't store passwords)
        log_action('PASSWORD_CHANGE', 'users', user_id, None, {'changed_at': datetime.utcnow().isoformat()})

        return jsonify({
            'success': True,
            'message': 'Password changed successfully'
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
