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
            'gstin': client.gst_number,
            'subscription_status': client.subscription_status,
            'trial_end_date': client.trial_end_date.isoformat() if client.trial_end_date else None,
            'trial_days_remaining': client.trial_days_remaining,
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

        # Build trial info if on trial
        trial_info = None
        if client.subscription_status == 'trial':
            trial_info = {
                'status': client.subscription_status,
                'days_remaining': client.trial_days_remaining,
                'end_date': client.trial_end_date.isoformat() if client.trial_end_date else None,
            }

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
            'subscription_status': client.subscription_status,
            'subscription_end_date': client.subscription_end_date.isoformat() if client.subscription_end_date else None,
            'plan_id': str(client.plan_id) if client.plan_id else None,
            'user': user_data,
            'trial': trial_info,
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


@auth_bp.route('/signup', methods=['POST'])
def signup():
    """
    Self-signup: Create new client + admin user in one step.
    No client_id needed. Returns JWT for auto-login.
    """
    try:
        data = request.get_json()

        business_name = data.get('business_name', '').strip()
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')
        phone = data.get('phone', '').strip()

        if not business_name or not email or not password:
            return jsonify({'error': 'Business name, email, and password are required'}), 400

        if len(password) < 8:
            return jsonify({'error': 'Password must be at least 8 characters'}), 400

        # Check if email already exists
        existing_user = User.query.filter_by(email=email).first()
        if existing_user:
            return jsonify({'error': 'An account with this email already exists'}), 409

        existing_client = ClientEntry.query.filter_by(email=email).first()
        if existing_client:
            return jsonify({'error': 'A business with this email already exists'}), 409

        # Create client with 14-day trial
        now = datetime.utcnow()
        trial_end = now + timedelta(days=14)
        client_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())

        new_client = ClientEntry(
            client_id=client_id,
            client_name=business_name,
            email=email,
            phone=phone or None,
            created_at=now,
            is_active=True,
            subscription_status='trial',
            trial_start_date=now,
            trial_end_date=trial_end,
        )

        password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

        new_user = User(
            user_id=user_id,
            email=email,
            password_hash=password_hash,
            client_id=client_id,
            role='admin',
            is_super_admin=False,
            created_at=now,
            is_active=True,
            full_name=business_name,
        )

        db.session.add(new_client)
        db.session.add(new_user)
        db.session.flush()

        # Assign all admin-level permissions to trial owner
        from models.permission_model import Permission, UserPermission
        admin_permissions = [
            'view_dashboard', 'gst_billing', 'non_gst_billing',
            'view_all_bills', 'view_own_bills', 'view_customers',
            'manage_customers', 'view_stock', 'manage_stock',
            'view_sales_reports', 'view_audit_logs', 'manage_payment_types',
        ]
        all_perms = Permission.query.filter(
            Permission.permission_name.in_(admin_permissions)
        ).all()
        for perm in all_perms:
            db.session.add(UserPermission(
                id=str(uuid.uuid4()),
                user_id=user_id,
                permission_id=perm.permission_id,
                granted_by=user_id,
            ))

        db.session.commit()

        # Generate JWT token (same as login)
        user_permissions = get_user_permissions(user_id)

        token_payload = {
            'user_id': user_id,
            'email': email,
            'client_id': client_id,
            'role': 'admin',
            'is_super_admin': False,
            'permissions': user_permissions,
            'exp': datetime.utcnow() + timedelta(hours=Config.JWT_EXPIRATION_HOURS)
        }

        token = jwt.encode(token_payload, Config.JWT_SECRET, algorithm=Config.JWT_ALGORITHM)

        user_data = {
            'user_id': user_id,
            'email': email,
            'full_name': business_name,
            'phone': phone or None,
            'department': None,
            'role': 'admin',
            'is_super_admin': False,
            'permissions': user_permissions,
        }

        client_data = {
            'client_id': client_id,
            'client_name': business_name,
            'logo_url': None,
            'address': None,
            'phone': phone or None,
            'email': email,
            'gstin': None,
            'subscription_status': 'trial',
            'trial_end_date': trial_end.isoformat(),
            'trial_days_remaining': 14,
        }

        # Cache user session
        cache = get_cache_manager()
        cache_key = f"user_session:{user_id}"
        cache.set(cache_key, {
            'user': user_data,
            'client': client_data
        }, USER_SESSION_CACHE_TIMEOUT)

        return jsonify({
            'success': True,
            'token': token,
            'client_id': client_id,
            'client_name': business_name,
            'client_logo': None,
            'client_address': None,
            'client_phone': phone or None,
            'client_email': email,
            'client_gstin': None,
            'user': user_data,
            'trial': {
                'status': 'trial',
                'days_remaining': 14,
                'end_date': trial_end.isoformat(),
            }
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Signup failed', 'message': str(e)}), 500


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
