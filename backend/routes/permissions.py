from flask import Blueprint, request, jsonify, g
from extensions import db
from models.user_model import User
from models.permission_model import (
    Permission, UserPermission, PermissionSection,
    get_user_permissions, grant_permission,
    revoke_permission, bulk_update_permissions,
    get_all_sections_with_permissions, get_user_permissions_by_section
)
from utils.auth_middleware import authenticate
from utils.audit_logger import log_action

permissions_bp = Blueprint('permissions', __name__)


def require_super_admin():
    """Check if current user is a super admin"""
    if not g.user.get('is_super_admin', False):
        return jsonify({'error': 'Access denied. Super admin privileges required.'}), 403
    return None


@permissions_bp.route('/all', methods=['GET'])
@authenticate
def get_all_permissions():
    """Get all available permissions organized by sections (super admin only)"""
    # Check super admin
    error = require_super_admin()
    if error:
        return error

    try:
        # Get all sections with their permissions in tree structure
        sections = get_all_sections_with_permissions()

        # Flatten permissions for easy access
        all_permissions = []
        categorized = {}

        for section in sections:
            category = section['section_name']
            categorized[category] = []

            for perm in section.get('permissions', []):
                perm_data = {
                    'permission_id': perm['permission_id'],
                    'permission_name': perm['permission_name'],
                    'description': perm['description'],
                    'category': category
                }
                all_permissions.append(perm_data)
                categorized[category].append(perm_data)

        return jsonify({
            'success': True,
            'sections': sections,
            'permissions': all_permissions,
            'categorized': categorized
        }), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch permissions', 'message': str(e)}), 500


@permissions_bp.route('/my', methods=['GET'])
@authenticate
def get_my_permissions():
    """Get current user's permissions"""
    try:
        user_permissions = get_user_permissions(g.user['user_id'])

        return jsonify({
            'success': True,
            'permissions': user_permissions,
            'is_super_admin': g.user.get('is_super_admin', False)
        }), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch permissions', 'message': str(e)}), 500


@permissions_bp.route('/user/<user_id>', methods=['GET'])
@authenticate
def get_user_permissions_route(user_id):
    """Get specific user's permissions organized by sections (super admin only)"""
    # Check super admin
    error = require_super_admin()
    if error:
        return error

    try:
        # Verify user exists
        user = User.query.filter_by(user_id=user_id).first()
        if not user:
            return jsonify({'error': 'User not found'}), 404

        # Get permissions organized by section
        sections = get_user_permissions_by_section(user_id)

        return jsonify({
            'success': True,
            'user': {
                'user_id': user.user_id,
                'email': user.email,
                'role': user.role,
                'is_super_admin': user.is_super_admin
            },
            'sections': sections
        }), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch user permissions', 'message': str(e)}), 500


@permissions_bp.route('/grant', methods=['POST'])
@authenticate
def grant_permission_route():
    """Grant permission to a user (super admin only)"""
    # Check super admin
    error = require_super_admin()
    if error:
        return error

    try:
        data = request.get_json()
        user_id = data.get('user_id')
        permission_name = data.get('permission_name')

        if not user_id or not permission_name:
            return jsonify({'error': 'user_id and permission_name required'}), 400

        # Verify user exists
        user = User.query.filter_by(user_id=user_id).first()
        if not user:
            return jsonify({'error': 'User not found'}), 404

        # Grant permission
        granted = grant_permission(user_id, permission_name, g.user['user_id'])

        if granted:
            # Log action
            log_action('GRANT_PERMISSION', 'user_permissions', user_id,
                      {'permission': permission_name, 'granted_to': user.email})

            return jsonify({
                'success': True,
                'message': f'Permission {permission_name} granted to {user.email}'
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': 'User already has this permission'
            }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to grant permission', 'message': str(e)}), 500


@permissions_bp.route('/revoke', methods=['POST'])
@authenticate
def revoke_permission_route():
    """Revoke permission from a user (super admin only)"""
    # Check super admin
    error = require_super_admin()
    if error:
        return error

    try:
        data = request.get_json()
        user_id = data.get('user_id')
        permission_name = data.get('permission_name')

        if not user_id or not permission_name:
            return jsonify({'error': 'user_id and permission_name required'}), 400

        # Verify user exists
        user = User.query.filter_by(user_id=user_id).first()
        if not user:
            return jsonify({'error': 'User not found'}), 404

        # Revoke permission
        revoked = revoke_permission(user_id, permission_name)

        if revoked:
            # Log action
            log_action('REVOKE_PERMISSION', 'user_permissions', user_id,
                      {'permission': permission_name, 'revoked_from': user.email})

            return jsonify({
                'success': True,
                'message': f'Permission {permission_name} revoked from {user.email}'
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': 'User does not have this permission'
            }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to revoke permission', 'message': str(e)}), 500


@permissions_bp.route('/bulk-update', methods=['POST'])
@authenticate
def bulk_update_permissions_route():
    """Update all permissions for a user at once (super admin only)"""
    # Check super admin
    error = require_super_admin()
    if error:
        return error

    try:
        data = request.get_json()
        user_id = data.get('user_id')
        permission_names = data.get('permissions', [])

        if not user_id:
            return jsonify({'error': 'user_id required'}), 400

        # Verify user exists
        user = User.query.filter_by(user_id=user_id).first()
        if not user:
            return jsonify({'error': 'User not found'}), 404

        # Update permissions
        result = bulk_update_permissions(user_id, permission_names, g.user['user_id'])

        # Log action (wrapped in try-except to prevent audit log errors from failing the request)
        try:
            log_action('BULK_UPDATE_PERMISSIONS', 'user_permissions', user_id,
                      {'added': result['added'], 'removed': result['removed'], 'user': user.email})
        except Exception as log_error:
            print(f"Audit log error: {log_error}")

        return jsonify({
            'success': True,
            'message': f'Permissions updated for {user.email}',
            'changes': result
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to update permissions', 'message': str(e)}), 500


@permissions_bp.route('/users', methods=['GET'])
@authenticate
def get_all_users_with_permissions():
    """Get all users with their permissions (super admin only)"""
    # Check super admin
    error = require_super_admin()
    if error:
        return error

    try:
        # Get client_id from query param or use current client
        client_id = request.args.get('client_id')

        # Super admin can view all clients' users or specific client
        if client_id:
            users = User.query.filter_by(client_id=client_id).order_by(User.email).all()
        else:
            # Default: show users from current super admin's client
            users = User.query.filter_by(client_id=g.user['client_id']).order_by(User.email).all()

        users_data = []
        for user in users:
            user_permissions = get_user_permissions(user.user_id)
            users_data.append({
                'user_id': user.user_id,
                'email': user.email,
                'full_name': user.full_name or user.email.split('@')[0],
                'role': user.role,
                'is_super_admin': user.is_super_admin,
                'is_active': user.is_active,
                'permissions': user_permissions,
                'permission_count': len(user_permissions),
                'created_at': user.created_at.isoformat() if user.created_at else None,
                'last_login': user.last_login.isoformat() if user.last_login else None
            })

        return jsonify({
            'success': True,
            'users': users_data,
            'total_users': len(users_data)
        }), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch users', 'message': str(e)}), 500


@permissions_bp.route('/sections', methods=['GET'])
@authenticate
def get_permission_sections():
    """Get all permission sections with permissions count"""
    try:
        sections = get_all_sections_with_permissions()

        return jsonify({
            'success': True,
            'sections': sections,
            'total_sections': len(sections),
            'total_permissions': sum(len(s.get('permissions', [])) for s in sections)
        }), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch permission sections', 'message': str(e)}), 500


@permissions_bp.route('/check', methods=['GET'])
@authenticate
def check_permissions_setup():
    """Check if permissions are properly set up in the database"""
    try:
        # Count sections
        section_count = PermissionSection.query.count()

        # Count permissions
        permission_count = Permission.query.count()

        # Get sections with their permission counts
        sections = db.session.query(
            PermissionSection.section_name,
            db.func.count(Permission.permission_id).label('perm_count')
        ).outerjoin(
            Permission, PermissionSection.section_id == Permission.section_id
        ).group_by(PermissionSection.section_name).all()

        sections_summary = [{'name': s[0], 'permissions': s[1]} for s in sections]

        return jsonify({
            'success': True,
            'total_sections': section_count,
            'total_permissions': permission_count,
            'sections': sections_summary,
            'status': 'OK' if section_count > 0 and permission_count > 0 else 'NEEDS_SETUP'
        }), 200

    except Exception as e:
        return jsonify({'error': 'Failed to check permissions', 'message': str(e)}), 500