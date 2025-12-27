import jwt
import bcrypt
import uuid
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, g
from extensions import db
from models.user_model import User
from models.client_model import ClientEntry
from models.permission_model import get_user_permissions
from utils.auth_middleware import authenticate
from utils.audit_logger import log_action
from utils.cache_helper import get_cache_manager
from config import Config

auth_bp = Blueprint('auth', __name__)

# Cache timeout for user session data (24 hours)
USER_SESSION_CACHE_TIMEOUT = 86400


@auth_bp.route('/login', methods=['POST', 'OPTIONS'])
def login():
    """
    User login - Returns JWT token with client_id
    CRITICAL: client_id MUST be included in JWT payload and response
    OPTIMIZED: Uses JOIN query to reduce DB roundtrips
    """
    try:
        data = request.get_json()

        # Validate input
        email = data.get('email')
        password = data.get('password')

        if not email or not password:
            return jsonify({'error': 'Email and password required'}), 400

        # OPTIMIZED: Single JOIN query to get User + Client together
        result = db.session.query(User, ClientEntry).join(
            ClientEntry, User.client_id == ClientEntry.client_id
        ).filter(User.email == email).first()

        if not result:
            return jsonify({'error': 'Email address not found'}), 401

        user, client = result

        # Verify password
        if not bcrypt.checkpw(password.encode('utf-8'), user.password_hash.encode('utf-8')):
            return jsonify({'error': 'Incorrect password'}), 401

        # Check if user is active
        if not user.is_active:
            return jsonify({'error': 'Account is inactive'}), 401

        # Check if client is active (already fetched via JOIN)
        if not client.is_active:
            return jsonify({'error': 'Client account is inactive'}), 401

        # OPTIMIZED: Get permissions with eager loading
        user_permissions = get_user_permissions(str(user.user_id))

        # Generate JWT token with client_id and permissions (convert UUIDs to strings)
        token_payload = {
            'user_id': str(user.user_id),
            'email': user.email,
            'client_id': str(user.client_id),
            'role': user.role,
            'is_super_admin': user.is_super_admin,
            'permissions': user_permissions,
            'exp': datetime.utcnow() + timedelta(hours=Config.JWT_EXPIRATION_HOURS)
        }

        token = jwt.encode(token_payload, Config.JWT_SECRET, algorithm=Config.JWT_ALGORITHM)

        # OPTIMIZED: Defer last_login update and audit log to after response
        # Update last_login without blocking (will be committed with cache set)
        user.last_login = datetime.utcnow()

        # Prepare user data for caching
        user_data = {
            'user_id': str(user.user_id),
            'email': user.email,
            'full_name': user.full_name or user.email.split('@')[0],
            'phone': user.phone,
            'department': user.department,
            'role': user.role,
            'is_super_admin': user.is_super_admin,
            'permissions': user_permissions
        }

        # Prepare client data for caching
        client_data = {
            'client_id': str(user.client_id),
            'client_name': client.client_name,
            'logo_url': client.logo_url,
            'address': client.address,
            'phone': client.phone,
            'email': client.email,
            'gstin': client.gst_number
        }

        # Cache user and client data in Redis
        cache = get_cache_manager()
        cache_key = f"user_session:{user.user_id}"
        cache.set(cache_key, {
            'user': user_data,
            'client': client_data
        }, USER_SESSION_CACHE_TIMEOUT)

        # OPTIMIZED: Single commit for last_login update (non-blocking)
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()  # Don't fail login if last_login update fails

        # Return token with client info and permissions (convert all UUIDs to strings)
        return jsonify({
            'success': True,
            'token': token,
            'client_id': str(user.client_id),
            'client_name': client.client_name,
            'client_logo': client.logo_url,
            'client_address': client.address,
            'client_phone': client.phone,
            'client_email': client.email,
            'client_gstin': client.gst_number,
            'user': user_data
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Login failed', 'message': str(e)}), 500


@auth_bp.route('/register', methods=['POST'])
def register():
    """Register new user (requires client_id)"""
    try:
        data = request.get_json()

        # Validate input
        email = data.get('email')
        password = data.get('password')
        client_id = data.get('client_id')
        role = data.get('role', 'staff')

        if not email or not password or not client_id:
            return jsonify({'error': 'Email, password, and client_id required'}), 400

        # Check if user already exists
        existing_user = User.query.filter_by(email=email).first()
        if existing_user:
            return jsonify({'error': 'User already exists'}), 409

        # Verify client exists
        client = ClientEntry.query.filter_by(client_id=client_id).first()
        if not client:
            return jsonify({'error': 'Invalid client_id'}), 400

        # Hash password
        password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

        # Create user
        new_user = User(
            user_id=str(uuid.uuid4()),
            email=email,
            password_hash=password_hash,
            client_id=client_id,
            role=role,
            created_at=datetime.utcnow(),
            is_active=True
        )

        db.session.add(new_user)
        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'User registered successfully',
            'user_id': new_user.user_id
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Registration failed', 'message': str(e)}), 500


@auth_bp.route('/logout', methods=['POST'])
@authenticate
def logout():
    """User logout - Logs action to audit and clears cache"""
    try:
        log_action('LOGOUT', 'users', g.user['user_id'])

        # Clear user session from cache
        cache = get_cache_manager()
        cache.delete(f"user_session:{g.user['user_id']}")

        return jsonify({
            'success': True,
            'message': 'Logged out successfully'
        }), 200

    except Exception as e:
        return jsonify({'error': 'Logout failed', 'message': str(e)}), 500


@auth_bp.route('/verify', methods=['GET'])
@authenticate
def verify_token():
    """Verify JWT token is valid"""
    # Add permissions to the response if not already in g.user
    user_data = dict(g.user)
    if 'permissions' not in user_data:
        user_data['permissions'] = get_user_permissions(g.user['user_id'])

    return jsonify({
        'success': True,
        'user': user_data,
        'client': g.client
    }), 200
