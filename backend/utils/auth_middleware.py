import jwt
from datetime import datetime
from utils.dt import is_past
from functools import wraps
from flask import request, jsonify, g
from config import Config
from extensions import db
from models.user_model import User
from models.client_model import ClientEntry
from models.session_model import UserSession


def get_client_id_from_token(token):
    """Extract and validate client_id from JWT token"""
    try:
        decoded = jwt.decode(token, Config.JWT_SECRET, algorithms=[Config.JWT_ALGORITHM])
        client_id = decoded.get('client_id')

        if not client_id:
            return None

        return client_id
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def authenticate(f=None, allow_expired=False):
    """
    Authentication decorator - MUST be used on ALL protected routes
    Extracts client_id from JWT token and stores in g.user

    Usage:
        @authenticate              # default — blocks expired trial users
        @authenticate(allow_expired=True)  # allows expired users (e.g. payment endpoints)
    """
    def decorator(func):
        @wraps(func)
        def decorated_function(*args, **kwargs):
            return _authenticate_inner(func, allow_expired, *args, **kwargs)
        return decorated_function

    if f is not None:
        # Called as @authenticate (without parentheses)
        return decorator(f)
    # Called as @authenticate(allow_expired=True)
    return decorator


def _authenticate_inner(f, allow_expired, *args, **kwargs):
    """Core authentication logic shared by all @authenticate variants"""
    # Get token from Authorization header
    auth_header = request.headers.get('Authorization')

    if not auth_header:
        return jsonify({'error': 'Authorization header missing'}), 401

    try:
        # Extract token (format: "Bearer <token>")
        token = auth_header.split(' ')[1] if ' ' in auth_header else auth_header

        # Decode JWT token
        decoded = jwt.decode(token, Config.JWT_SECRET, algorithms=[Config.JWT_ALGORITHM])

        # Extract user info
        user_id = decoded.get('user_id')
        client_id = decoded.get('client_id')

        if not user_id or not client_id:
            return jsonify({'error': 'Invalid token payload'}), 401

        # Query DB directly
        user = User.query.filter_by(user_id=user_id, is_active=True).first()
        if not user:
            return jsonify({'error': 'User not found or inactive'}), 401

        client = ClientEntry.query.filter_by(client_id=client_id, is_active=True).first()
        if not client:
            return jsonify({'error': 'Client not found or inactive'}), 401

        # Check subscription status — skip if allow_expired is True or user is super admin
        is_super_admin = decoded.get('is_super_admin', False)
        if not allow_expired and not is_super_admin:
            if client.subscription_status == 'expired':
                return jsonify({
                    'error': 'Trial expired',
                    'message': 'Your 14-day free trial has expired. Please upgrade to continue.',
                    'code': 'TRIAL_EXPIRED'
                }), 403

            if client.is_trial_expired:
                client.subscription_status = 'expired'
                try:
                    db.session.commit()
                except Exception:
                    db.session.rollback()
                return jsonify({
                    'error': 'Trial expired',
                    'message': 'Your 14-day free trial has expired. Please upgrade to continue.',
                    'code': 'TRIAL_EXPIRED'
                }), 403

            if client.is_subscription_expired:
                client.subscription_status = 'expired'
                try:
                    db.session.commit()
                except Exception:
                    db.session.rollback()
                return jsonify({
                    'error': 'Subscription expired',
                    'message': 'Your subscription has expired. Please renew to continue.',
                    'code': 'SUBSCRIPTION_EXPIRED'
                }), 403

        # Store user and client info in g object
        g.user = {
            'user_id': user_id,
            'client_id': client_id,
            'email': user.email,
            'full_name': user.full_name or user.email.split('@')[0],
            'phone': user.phone,
            'department': user.department,
            'role': user.role,
            'branch_id': str(user.branch_id) if user.branch_id else None,
            'is_super_admin': decoded.get('is_super_admin', False),
            'permissions': decoded.get('permissions', []),
            'is_readonly': decoded.get('is_readonly', False),
            'is_impersonation': decoded.get('is_impersonation', False),
            'impersonating_admin_id': decoded.get('impersonating_admin_id'),
        }

        g.client = {
            'client_id': client_id,
            'client_name': client.client_name,
            'logo_url': client.logo_url,
            'address': client.address,
            'phone': client.phone,
            'email': client.email,
            'gstin': client.gst_number,
            'subscription_status': client.subscription_status,
            'trial_end_date': client.trial_end_date.isoformat() if client.trial_end_date else None,
            'trial_days_remaining': client.trial_days_remaining,
            'subscription_days_remaining': client.subscription_days_remaining,
            'subscription_end_date': client.subscription_end_date.isoformat() if client.subscription_end_date else None,
            'points_per_100': getattr(client, 'points_per_100', 0) or 0,
        }

        # Validate that the session has not been revoked.
        session_id = decoded.get('session_id')
        if session_id:
            session_record = UserSession.query.filter_by(
                session_id=session_id,
                is_active=True
            ).first()
            if not session_record:
                return jsonify({
                    'error': 'Session has been revoked. Please login again.',
                    'code': 'SESSION_REVOKED'
                }), 401

            # Update last_seen
            try:
                session_record.last_seen = datetime.utcnow()
                db.session.commit()
            except Exception:
                db.session.rollback()

        return f(*args, **kwargs)

    except jwt.ExpiredSignatureError:
        return jsonify({'error': 'Token has expired', 'message': 'Please login again'}), 401
    except jwt.InvalidTokenError as e:
        return jsonify({'error': 'Invalid token', 'message': str(e)}), 401
    except Exception as e:
        import traceback
        print(f"[AUTH ERROR] {str(e)}")
        print(traceback.format_exc())
        return jsonify({'error': 'Authentication failed', 'message': str(e)}), 401


def require_role(allowed_roles):
    """
    Role-based authorization decorator
    Usage: @require_role(['admin', 'manager'])
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not hasattr(g, 'user'):
                return jsonify({'error': 'Unauthorized'}), 401

            user_role = g.user.get('role')
            if user_role not in allowed_roles:
                return jsonify({'error': 'Insufficient permissions'}), 403

            return f(*args, **kwargs)
        return decorated_function
    return decorator


def readonly_guard(f):
    """
    Blocks mutating operations when the current JWT is a read-only impersonation token.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not hasattr(g, 'user'):
            return jsonify({'error': 'Unauthorized'}), 401
        if g.user.get('is_readonly'):
            return jsonify({
                'error': 'Read-only session',
                'message': 'This action is disabled during impersonation — impersonation sessions are read-only.',
                'code': 'READONLY_SESSION',
            }), 403
        return f(*args, **kwargs)
    return decorated_function
