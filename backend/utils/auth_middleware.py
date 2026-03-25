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
from utils.cache_helper import get_cache_manager

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
    Uses Redis cache for user/client data to reduce DB queries

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

        # Try to get user/client data from Redis cache first
        cache = get_cache_manager()
        cache_key = f"user_session:{user_id}"
        cached_data = cache.get(cache_key)

        if cached_data:
            # Use cached data - no DB query needed
            user_data = cached_data.get('user', {})
            client_data = cached_data.get('client', {})

            g.user = {
                'user_id': user_id,
                'client_id': client_id,
                'email': user_data.get('email', ''),
                'full_name': user_data.get('full_name', ''),
                'phone': user_data.get('phone', ''),
                'department': user_data.get('department', ''),
                'role': user_data.get('role', 'staff'),
                'branch_id': user_data.get('branch_id'),
                'is_super_admin': user_data.get('is_super_admin', False),
                'permissions': user_data.get('permissions', []),
                'is_readonly': decoded.get('is_readonly', False),
                'is_impersonation': decoded.get('is_impersonation', False),
                'impersonating_admin_id': decoded.get('impersonating_admin_id'),
            }

            g.client = {
                'client_id': client_id,
                'client_name': client_data.get('client_name', ''),
                'logo_url': client_data.get('logo_url', ''),
                'address': client_data.get('address', ''),
                'phone': client_data.get('phone', ''),
                'email': client_data.get('email', ''),
                'gstin': client_data.get('gstin', ''),
                'subscription_status': client_data.get('subscription_status'),
                'trial_end_date': client_data.get('trial_end_date'),
                'trial_days_remaining': client_data.get('trial_days_remaining'),
                'subscription_end_date': client_data.get('subscription_end_date'),
                'points_per_100': client_data.get('points_per_100', 0),
            }

            # Check subscription status — skip if allow_expired is True or user is super admin
            is_super_admin = user_data.get('is_super_admin', False)
            if not allow_expired and not is_super_admin and not user_data.get('is_super_admin', False):
                sub_status = client_data.get('subscription_status')
                if sub_status == 'expired':
                    return jsonify({
                        'error': 'Trial expired',
                        'message': 'Your 14-day free trial has expired. Please upgrade to continue.',
                        'code': 'TRIAL_EXPIRED'
                    }), 403
                if sub_status == 'cancelled':
                    # Cancelled users keep access until subscription_end_date
                    end_str = client_data.get('subscription_end_date')
                    if end_str:
                        try:
                            end_date = datetime.fromisoformat(end_str)
                            if is_past(end_date):
                                cache.delete(cache_key)
                                return jsonify({
                                    'error': 'Subscription expired',
                                    'message': 'Your subscription has expired. Please reactivate to continue.',
                                    'code': 'SUBSCRIPTION_EXPIRED'
                                }), 403
                        except (ValueError, TypeError):
                            pass
                if sub_status == 'trial':
                    trial_end_str = client_data.get('trial_end_date')
                    if trial_end_str:
                        try:
                            trial_end = datetime.fromisoformat(trial_end_str)
                            if is_past(trial_end):
                                cache.delete(cache_key)
                                return jsonify({
                                    'error': 'Trial expired',
                                    'message': 'Your 14-day free trial has expired. Please upgrade to continue.',
                                    'code': 'TRIAL_EXPIRED'
                                }), 403
                        except (ValueError, TypeError):
                            pass

        else:
            # Cache miss - query DB and cache the result
            user = User.query.filter_by(user_id=user_id, is_active=True).first()
            if not user:
                return jsonify({'error': 'User not found or inactive'}), 401

            client = ClientEntry.query.filter_by(client_id=client_id, is_active=True).first()
            if not client:
                return jsonify({'error': 'Client not found or inactive'}), 401

            # Check subscription status — skip if allow_expired is True or user is super admin
            is_super_admin_db = decoded.get('is_super_admin', False)
            is_super_admin = decoded.get('is_super_admin', False)
            if not allow_expired and not is_super_admin_db and not is_super_admin:
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
                'subscription_end_date': client.subscription_end_date.isoformat() if client.subscription_end_date else None,
                'points_per_100': getattr(client, 'points_per_100', 0) or 0,
            }

            # Cache the data for future requests (24 hours)
            cache.set(cache_key, {
                'user': g.user,
                'client': g.client
            }, 86400)

        # Validate that the session has not been revoked.
        # Old JWTs without session_id (issued before this feature) are still accepted.
        session_id = decoded.get('session_id')
        if session_id:
            # Cache session-valid status for 60s — skips the DB SELECT on every API call.
            # A page with 10 API calls used to do 10 DB reads + 10 DB writes here.
            # Now it does at most 1 read + 1 write per 5 minutes.
            session_cache_key = f"session_valid:{session_id}"
            if not cache.get(session_cache_key):
                session_record = UserSession.query.filter_by(
                    session_id=session_id,
                    is_active=True
                ).first()
                if not session_record:
                    return jsonify({
                        'error': 'Session has been revoked. Please login again.',
                        'code': 'SESSION_REVOKED'
                    }), 401
                cache.set(session_cache_key, 1, 300)  # re-validate at most once per 5 min

                # Throttle last_seen write — at most once per 5 minutes per session
                seen_key = f"session_seen:{session_id}"
                if not cache.get(seen_key):
                    try:
                        session_record.last_seen = datetime.utcnow()
                        db.session.commit()
                        cache.set(seen_key, 1, 300)
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
    Apply to any POST/PUT/PATCH/DELETE route that should be disabled during impersonation.

    Usage:
        @client_bp.route('/something', methods=['POST'])
        @authenticate
        @readonly_guard
        def create_something():
            ...
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
