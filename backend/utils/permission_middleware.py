"""
Permission middleware for checking user permissions
"""
from functools import wraps
from flask import jsonify, g
from models.permission_model import has_permission


def require_permission(permission_name):
    """
    Decorator to check if user has a specific permission
    Usage: @require_permission('view_dashboard')
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Check if user is authenticated (g.user should be set by auth middleware)
            if not g.user:
                return jsonify({'error': 'Authentication required'}), 401

            # Super admins have all permissions
            if g.user.get('is_super_admin', False):
                return f(*args, **kwargs)

            # Check if user has the specific permission
            user_permissions = g.user.get('permissions', [])
            if permission_name not in user_permissions:
                # Double-check in database if not in token
                if not has_permission(g.user['user_id'], permission_name):
                    return jsonify({
                        'error': 'Access denied',
                        'message': f'Permission "{permission_name}" required'
                    }), 403

            return f(*args, **kwargs)
        return decorated_function
    return decorator


def require_super_admin(f):
    """
    Decorator to check if user is a super admin
    Usage: @require_super_admin
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Check if user is authenticated
        if not g.user:
            return jsonify({'error': 'Authentication required'}), 401

        # Check if user is super admin
        if not g.user.get('is_super_admin', False):
            return jsonify({
                'error': 'Access denied',
                'message': 'Super admin privileges required'
            }), 403

        return f(*args, **kwargs)
    return decorated_function


def require_any_permission(*permission_names):
    """
    Decorator to check if user has any of the specified permissions
    Usage: @require_any_permission('view_billing', 'create_bill')
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Check if user is authenticated
            if not g.user:
                return jsonify({'error': 'Authentication required'}), 401

            # Super admins have all permissions
            if g.user.get('is_super_admin', False):
                return f(*args, **kwargs)

            # Check if user has any of the permissions
            user_permissions = g.user.get('permissions', [])
            has_any = any(perm in user_permissions for perm in permission_names)

            if not has_any:
                # Double-check in database
                has_any = any(
                    has_permission(g.user['user_id'], perm)
                    for perm in permission_names
                )

                if not has_any:
                    return jsonify({
                        'error': 'Access denied',
                        'message': f'One of these permissions required: {", ".join(permission_names)}'
                    }), 403

            return f(*args, **kwargs)
        return decorated_function
    return decorator


def require_all_permissions(*permission_names):
    """
    Decorator to check if user has all of the specified permissions
    Usage: @require_all_permissions('view_reports', 'manage_reports')
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Check if user is authenticated
            if not g.user:
                return jsonify({'error': 'Authentication required'}), 401

            # Super admins have all permissions
            if g.user.get('is_super_admin', False):
                return f(*args, **kwargs)

            # Check if user has all permissions
            user_permissions = g.user.get('permissions', [])
            has_all = all(perm in user_permissions for perm in permission_names)

            if not has_all:
                # Double-check in database
                has_all = all(
                    has_permission(g.user['user_id'], perm)
                    for perm in permission_names
                )

                if not has_all:
                    missing = [p for p in permission_names if p not in user_permissions]
                    return jsonify({
                        'error': 'Access denied',
                        'message': f'Missing permissions: {", ".join(missing)}'
                    }), 403

            return f(*args, **kwargs)
        return decorated_function
    return decorator