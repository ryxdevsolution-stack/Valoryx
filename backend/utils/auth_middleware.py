import jwt
from functools import wraps
from flask import request, jsonify, g
from config import Config
from models.user_model import User
from models.client_model import ClientEntry

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


def authenticate(f):
    """
    Authentication decorator - MUST be used on ALL protected routes
    Extracts client_id from JWT token and stores in g.user
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
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

            # Verify user exists and is active
            user = User.query.filter_by(user_id=user_id, is_active=True).first()
            if not user:
                return jsonify({'error': 'User not found or inactive'}), 401

            # Verify client exists and is active
            client = ClientEntry.query.filter_by(client_id=client_id, is_active=True).first()
            if not client:
                return jsonify({'error': 'Client not found or inactive'}), 401

            # Store user and client info in g object for access in route handlers
            g.user = {
                'user_id': user_id,
                'client_id': client_id,
                'email': user.email,
                'role': user.role,
                'is_super_admin': decoded.get('is_super_admin', False),
                'permissions': decoded.get('permissions', [])
            }

            g.client = {
                'client_id': client_id,
                'client_name': client.client_name,
                'logo_url': client.logo_url
            }

            return f(*args, **kwargs)

        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token has expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401
        except Exception as e:
            return jsonify({'error': 'Authentication failed'}), 401

    return decorated_function


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
