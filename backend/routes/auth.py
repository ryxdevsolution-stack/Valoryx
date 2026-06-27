import jwt
import bcrypt
import uuid
import logging as _logging
import pyotp
import hashlib as _hashlib
import secrets as _secrets
from datetime import datetime, timedelta
from utils.dt import is_past
from flask import Blueprint, request, jsonify, g
from extensions import db
from models.user_model import User
from models.client_model import ClientEntry, DEFAULT_GST_CONFIG
from models.branch_model import Branch
from models.permission_model import get_user_permissions, Permission, UserPermission
from models.session_model import UserSession
from utils.session_manager import enforce_session_limit
from utils.auth_middleware import authenticate
from utils.audit_logger import log_action
from utils.cache_helper import get_cache_manager
from utils.rate_limiter import rate_limit
from utils.request_ip import get_client_ip
from routes.admin import _email_enabled
from utils.email_service import (
    send_welcome_email,
    send_login_notification,
    send_password_reset_email,
    send_password_changed_email,
    send_verification_email,
)
from config import Config

auth_bp = Blueprint('auth', __name__)

# Cache timeout for user session data (24 hours)
USER_SESSION_CACHE_TIMEOUT = 86400

# TOTP brute-force protection: block after this many failed attempts
TOTP_MAX_FAILURES = 10
# Window (seconds) over which failures are counted before auto-expiry
TOTP_FAIL_WINDOW = 900   # 15 minutes
# How long (seconds) a used code is remembered to prevent replay
TOTP_REPLAY_WINDOW = 90  # 90 seconds — covers the ±1 valid_window (3 × 30 s)

# How long (seconds) a trusted device token is valid (30 days)
TRUSTED_DEVICE_TTL = 30 * 24 * 3600

# Login brute-force protection (in-memory, keyed per IP and per account)
import time as _time
import bcrypt as _bcrypt_mod
_LOGIN_FAIL_STORE: dict = {}   # { key: [timestamp, ...] }
LOGIN_MAX_FAILURES = 10          # per-IP: block after 10 failed attempts
LOGIN_MAX_FAILURES_PER_EMAIL = 5  # per-account: block after 5 failed attempts
LOGIN_FAIL_WINDOW  = 300         # within 5 minutes

# Generic message for every credential failure — distinct messages allow
# account enumeration (audit 2026-06-10)
LOGIN_GENERIC_ERROR = 'Invalid email or password'

# Dummy hash so unknown-email requests cost the same bcrypt time as a real
# password check (timing-based enumeration guard)
_DUMMY_PASSWORD_HASH = _bcrypt_mod.hashpw(
    b'valoryx-timing-equalizer', _bcrypt_mod.gensalt()
)


def _login_keys(ip: str, email: str):
    return f'ip:{ip}', f"email:{(email or '').strip().lower()}"


def _check_login_rate_limit(key: str, max_failures: int = LOGIN_MAX_FAILURES):
    """Return (allowed, retry_after_seconds). Prunes old entries automatically."""
    now = _time.time()
    timestamps = [t for t in _LOGIN_FAIL_STORE.get(key, []) if now - t < LOGIN_FAIL_WINDOW]
    if timestamps:
        _LOGIN_FAIL_STORE[key] = timestamps
    else:
        # Never keep empty buckets — every probed email/IP would otherwise
        # leave a permanent dict entry (slow memory exhaustion)
        _LOGIN_FAIL_STORE.pop(key, None)
    if len(timestamps) >= max_failures:
        retry_after = int(LOGIN_FAIL_WINDOW - (now - timestamps[0]))
        return False, retry_after
    return True, 0


def _record_login_failure(*keys: str):
    now = _time.time()
    for key in keys:
        _LOGIN_FAIL_STORE.setdefault(key, []).append(now)


def _clear_login_failures(*keys: str):
    for key in keys:
        _LOGIN_FAIL_STORE.pop(key, None)


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

        # Rate-limit by trusted IP (10 failures / 5 min) AND by account
        # (5 failures / 5 min) so neither IP rotation nor header spoofing
        # bypasses the brute-force brake.
        client_ip = get_client_ip()
        ip_key, email_key = _login_keys(client_ip, email)
        ip_allowed, ip_retry = _check_login_rate_limit(ip_key, LOGIN_MAX_FAILURES)
        email_allowed, email_retry = _check_login_rate_limit(
            email_key, LOGIN_MAX_FAILURES_PER_EMAIL
        )
        if not ip_allowed or not email_allowed:
            retry_after = max(ip_retry, email_retry)
            return jsonify({
                'error': f'Too many failed login attempts. Try again in {retry_after} seconds.'
            }), 429

        # OPTIMIZED: Single JOIN query to get User + Client + Branch together
        result = db.session.query(User, ClientEntry, Branch).join(
            ClientEntry, User.client_id == ClientEntry.client_id
        ).outerjoin(
            Branch, User.branch_id == Branch.branch_id
        ).filter(User.email == email).first()

        if not result:
            # Burn the same bcrypt time as a real check so response timing
            # does not reveal whether the account exists
            bcrypt.checkpw(password.encode('utf-8'), _DUMMY_PASSWORD_HASH)
            _record_login_failure(ip_key, email_key)
            return jsonify({'error': LOGIN_GENERIC_ERROR}), 401

        user, client, branch = result

        # Block pending invite users before bcrypt attempt — their password_hash is empty
        # which would raise ValueError: Invalid salt inside bcrypt.checkpw.
        # Same generic error as unknown email: a distinct message would let an
        # attacker enumerate invite-pending accounts (invited users complete
        # signup via the invite email, not this form).
        if hasattr(user, 'invite_accepted') and not user.invite_accepted and not user.password_hash:
            bcrypt.checkpw(password.encode('utf-8'), _DUMMY_PASSWORD_HASH)
            _record_login_failure(ip_key, email_key)
            return jsonify({'error': LOGIN_GENERIC_ERROR}), 401

        # Verify password
        if not bcrypt.checkpw(password.encode('utf-8'), user.password_hash.encode('utf-8')):
            _record_login_failure(ip_key, email_key)
            return jsonify({'error': LOGIN_GENERIC_ERROR}), 401

        # Clear the per-account counter on successful auth. The per-IP counter
        # is left to expire naturally — clearing it would let an attacker who
        # controls one valid account launder their IP budget between attempts.
        _clear_login_failures(email_key)

        # Check if user is active
        if not user.is_active:
            return jsonify({'error': 'Account is inactive'}), 401

        # Check if client is active (already fetched via JOIN)
        if not client.is_active:
            return jsonify({'error': 'Client account is inactive'}), 401

        # Block login if email not verified
        if not getattr(client, 'email_verified', False):
            return jsonify({
                'success': False,
                'email_unverified': True,
                'email': user.email,
                'message': 'Please verify your email address before logging in.'
            }), 403

        # Block login if account is pending deletion
        if getattr(client, 'deletion_scheduled_at', None):
            return jsonify({
                'success': False,
                'account_pending_deletion': True,
                'deletion_date': client.deletion_scheduled_at.isoformat(),
                'message': 'Your account is scheduled for deletion.'
            }), 403

        # Serialize concurrent logins for this account so two near-simultaneous
        # logins (double-click / two tabs / two workers) can't both pass the
        # single-session check and create two sessions. On Postgres this takes a
        # row-level lock held until commit; on SQLite writes already serialize, so
        # with_for_update is a harmless no-op there.
        db.session.query(User).filter_by(user_id=user.user_id).with_for_update().first()

        # Single-device policy: if the account already has an active session and
        # the caller hasn't explicitly chosen to take over, surface a 409 so the
        # UI can warn and confirm before displacing the other device. Placed BEFORE
        # the 2FA step so a takeover never re-consumes a one-time TOTP/backup code.
        max_sessions = Config.MAX_CONCURRENT_SESSIONS_PER_USER
        force_login = bool(data.get('force_login'))
        if max_sessions > 0 and not force_login:
            existing_sessions = (
                UserSession.query
                .filter_by(user_id=str(user.user_id), is_active=True)
                .filter(UserSession.expires_at > datetime.utcnow())
                .order_by(UserSession.last_seen.desc())
                .all()
            )
            if len(existing_sessions) >= max_sessions:
                latest = existing_sessions[0]
                return jsonify({
                    'success': False,
                    'code': 'SESSION_EXISTS',
                    'error': 'This account is already logged in on another system.',
                    'active_session': {
                        'device': latest.device,
                        'ip_address': latest.ip_address,
                        'last_seen': latest.last_seen.isoformat() if latest.last_seen else None,
                    },
                }), 409

        # 2FA check: only for self-registered owners (created_by IS NULL) with TOTP enabled.
        # Admin-created sub-users are never prompted even if totp_enabled=True.
        new_device_token = None  # Set after successful 2FA if client requests device trust
        if user.totp_enabled and user.created_by is None:
            totp_code = (data.get('totp_code') or '').strip()
            device_token_raw = (data.get('device_token') or '').strip()

            cache_2fa = get_cache_manager()
            user_id_str = str(user.user_id)

            # --- Trusted device check: skip TOTP if this device was trusted before ---
            device_trusted = False
            if device_token_raw:
                dt_hash = _hashlib.sha256(device_token_raw.encode()).hexdigest()
                if cache_2fa.get(f"trusted_device:{user_id_str}:{dt_hash}"):
                    device_trusted = True

            if not device_trusted:
                if not totp_code:
                    # Password was valid — signal frontend to show the TOTP step
                    return jsonify({
                        'success': False,
                        'requires_totp': True,
                        'message': 'Enter your 2FA code to continue',
                    }), 200  # 200, not 4xx — this is a flow step, not an error

                # Guard: totp_secret must exist for a TOTP-enabled account
                if not user.totp_secret:
                    return jsonify({'success': False, 'error': 'Invalid 2FA state'}), 500

                # --- Brute-force protection ---
                fail_key = f"totp_fail:{user_id_str}"
                fails = cache_2fa.get(fail_key) or 0
                if fails >= TOTP_MAX_FAILURES:
                    return jsonify({
                        'success': False,
                        'error': 'Too many failed attempts. Try again in 15 minutes.',
                    }), 429

                # --- Try backup code first (8 uppercase hex chars) ---
                import json as _json
                normalized = totp_code.upper().replace('-', '').replace(' ', '')
                backup_codes = _json.loads(user.totp_backup_codes) if user.totp_backup_codes else []
                code_hash = _hashlib.sha256(normalized.encode()).hexdigest()
                if normalized and len(normalized) == 8 and code_hash in backup_codes:
                    # Valid backup code — consume it (one-time use)
                    backup_codes.remove(code_hash)
                    user.totp_backup_codes = _json.dumps(backup_codes)
                    cache_2fa.delete(fail_key)
                    try:
                        db.session.commit()
                    except Exception:
                        db.session.rollback()
                    log_action('2fa_backup_code_used', 'users', user_id_str,
                               old_data={}, new_data={'remaining': len(backup_codes)}, auto_commit=True)
                else:
                    # --- Replay protection (TOTP codes only) ---
                    replay_key = f"totp_used:{user_id_str}:{totp_code}"
                    if cache_2fa.get(replay_key):
                        return jsonify({
                            'success': False,
                            'error': 'Code already used. Wait for the next code.',
                        }), 400

                    totp = pyotp.TOTP(user.totp_secret)
                    # valid_window=1 accepts ±1 time step (90-second window total)
                    if not totp.verify(totp_code, valid_window=1):
                        cache_2fa.set(fail_key, fails + 1, TOTP_FAIL_WINDOW)
                        return jsonify({'success': False, 'error': 'Invalid 2FA code. Try again.'}), 401

                    # Successful verify: mark this code as consumed and reset failure counter
                    cache_2fa.set(replay_key, 1, TOTP_REPLAY_WINDOW)
                    cache_2fa.delete(fail_key)

                # Generate a trusted device token if the client opted in
                if data.get('trust_device'):
                    new_device_token = _secrets.token_hex(32)
                    dt_hash = _hashlib.sha256(new_device_token.encode()).hexdigest()
                    cache_2fa.set(f"trusted_device:{user_id_str}:{dt_hash}", 1, TRUSTED_DEVICE_TTL)

        # OPTIMIZED: Get permissions with eager loading
        user_permissions = get_user_permissions(str(user.user_id))

        # Generate a unique session ID for this login
        session_id = _secrets.token_urlsafe(32)

        # Generate JWT token with client_id and permissions (convert UUIDs to strings)
        token_payload = {
            'user_id': str(user.user_id),
            'email': user.email,
            'client_id': str(user.client_id),
            'role': user.role,
            'is_super_admin': user.is_super_admin,
            'permissions': user_permissions,
            'session_id': session_id,
            'exp': datetime.utcnow() + timedelta(hours=Config.JWT_EXPIRATION_HOURS)
        }

        token = jwt.encode(token_payload, Config.JWT_SECRET, algorithm=Config.JWT_ALGORITHM)

        # Prepare user data for caching (branch resolved via outerjoin above)
        user_data = {
            'user_id': str(user.user_id),
            'email': user.email,
            'full_name': user.full_name or user.email.split('@')[0],
            'phone': user.phone,
            'department': user.department,
            'role': user.role,
            'is_super_admin': user.is_super_admin,
            'permissions': user_permissions,
            'branch_id': str(user.branch_id) if user.branch_id else None,
            'branch_name': branch.name if branch else None,
            'must_change_password': user.must_change_password,
            'totp_enabled': user.totp_enabled,
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
            'points_per_100': getattr(client, 'points_per_100', 0) or 0,
            'subscription_status': client.subscription_status,
            'trial_end_date': client.trial_end_date.isoformat() if client.trial_end_date else None,
            'trial_days_remaining': client.trial_days_remaining,
            # Regional customization — drives currency/tax rendering and the setup wizard
            'country': getattr(client, 'country', None) or 'IN',
            'currency_code': getattr(client, 'currency_code', None) or 'INR',
            'currency_symbol': getattr(client, 'currency_symbol', None) or '₹',
            'locale': getattr(client, 'locale', None) or 'en-IN',
            'tax_config': getattr(client, 'tax_config', None) or DEFAULT_GST_CONFIG,
            'setup_completed': getattr(client, 'setup_completed_at', None) is not None,
        }

        # Cache user and client data in Redis
        cache = get_cache_manager()
        cache_key = f"user_session:{user.user_id}"
        cache.set(cache_key, {
            'user': user_data,
            'client': client_data
        }, USER_SESSION_CACHE_TIMEOUT)

        # Detect IP — remote_addr only (ProxyFix resolves the proxy hop;
        # raw X-Forwarded-For is client-spoofable)
        incoming_ip = get_client_ip() or 'unknown'
        is_new_ip = user.last_login_ip != incoming_ip

        # Update last_login and last_login_ip
        user.last_login = datetime.utcnow()
        user.last_login_ip = incoming_ip

        # Create a tracked session record for this login
        ua_string = request.headers.get('User-Agent', '')
        if 'Mobile' in ua_string:
            device = 'Mobile'
        elif 'Tablet' in ua_string:
            device = 'Tablet'
        else:
            device = 'Desktop'

        session_expires = datetime.utcnow() + timedelta(hours=Config.JWT_EXPIRATION_HOURS)
        new_session = UserSession(
            id=str(uuid.uuid4()),
            session_id=session_id,
            user_id=str(user.user_id),
            client_id=str(user.client_id),
            ip_address=incoming_ip,
            user_agent=ua_string[:512],
            device=device,
            expires_at=session_expires,
            is_active=True,
        )
        db.session.add(new_session)

        # Single-device policy: revoke the user's other active sessions so the
        # newest login wins. Displaced devices auto-logout on their next request
        # via the SESSION_REVOKED check in auth_middleware.
        enforce_session_limit(
            user.user_id, session_id, Config.MAX_CONCURRENT_SESSIONS_PER_USER
        )

        # Commit the session record + revocations. Unlike last_login, the session
        # row is REQUIRED for the just-issued token to authenticate, so a failure
        # here must fail the login closed — otherwise we'd hand out a token whose
        # session was rolled back (instant self-logout) while the old device that
        # enforce_session_limit tried to revoke stays alive.
        try:
            db.session.commit()
        except Exception as commit_err:
            db.session.rollback()
            _logging.getLogger(__name__).error(
                "Login session persist failed for user %s: %s", user.user_id, commit_err
            )
            return jsonify({'error': 'Login failed', 'message': 'Could not establish session'}), 500

        # Send login notification only when IP is new/different
        if is_new_ip and _email_enabled('email_on_login'):
            login_time = datetime.utcnow().strftime('%d %b %Y, %H:%M')
            send_login_notification(user.email, client.client_name, login_time, incoming_ip)

        # Build trial info if on trial
        trial_info = None
        if client.subscription_status == 'trial':
            trial_info = {
                'status': client.subscription_status,
                'days_remaining': client.trial_days_remaining,
                'end_date': client.trial_end_date.isoformat() if client.trial_end_date else None,
            }

        # Return token with client info and permissions (convert all UUIDs to strings)
        login_response = {
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
            'must_change_password': user.must_change_password,
            # Regional customization — drives currency/tax rendering and the setup wizard
            'country': getattr(client, 'country', None) or 'IN',
            'currency_code': getattr(client, 'currency_code', None) or 'INR',
            'currency_symbol': getattr(client, 'currency_symbol', None) or '₹',
            'locale': getattr(client, 'locale', None) or 'en-IN',
            'tax_config': getattr(client, 'tax_config', None) or DEFAULT_GST_CONFIG,
            'setup_completed': getattr(client, 'setup_completed_at', None) is not None,
        }
        if new_device_token:
            login_response['device_token'] = new_device_token
        return jsonify(login_response), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Login failed', 'message': str(e)}), 500


@auth_bp.route('/session-check', methods=['GET'])
@authenticate
def session_check():
    """Lightweight authenticated ping for the client heartbeat. Returns 200 while
    the session is valid; auth_middleware returns 401 SESSION_REVOKED once the
    session has been revoked by a takeover login."""
    return jsonify({'success': True}), 200


@auth_bp.route('/register', methods=['POST'])
@rate_limit(max_requests=5, window_seconds=60, error_message='Too many registration attempts. Please wait.')
def register():
    """Register new user (requires client_id)"""
    try:
        data = request.get_json()

        # Validate input
        email = data.get('email')
        password = data.get('password')
        client_id = data.get('client_id')
        role = 'owner'  # Self-registration always creates an owner

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
            role='owner',
            created_at=datetime.utcnow(),
            is_active=True
        )

        db.session.add(new_user)
        db.session.flush()

        # Owners receive every permission in the system — same as trial signup.
        # Super admin can revoke specific perms later via the permissions UI.
        all_perms = Permission.query.all()
        for perm in all_perms:
            db.session.add(UserPermission(
                id=str(uuid.uuid4()),
                user_id=new_user.user_id,
                permission_id=perm.permission_id,
                granted_by=new_user.user_id,
            ))

        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'User registered successfully',
            'user_id': new_user.user_id
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Registration failed', 'message': str(e)}), 500


@auth_bp.route('/check-duplicate', methods=['POST'])
def check_duplicate():
    """Check if email or business name already exists — used for real-time field validation.
    Uses EXISTS queries (fastest possible — stops at first match, no full scan).
    """
    from sqlalchemy import exists, func
    data = request.get_json() or {}
    email = (data.get('email') or '').strip().lower()
    business_name = (data.get('business_name') or '').strip()

    if email:
        email_taken = db.session.query(
            exists().where(User.email == email)
        ).scalar() or db.session.query(
            exists().where(ClientEntry.email == email)
        ).scalar()
        if email_taken:
            return jsonify({'error': 'An account with this email already exists', 'field': 'email'}), 409

    if business_name:
        name_taken = db.session.query(
            exists().where(func.lower(ClientEntry.client_name) == business_name.lower())
        ).scalar()
        if name_taken:
            return jsonify({'error': 'A business with this name already exists. Please use a different name.', 'field': 'business_name'}), 409

    return jsonify({'success': True}), 200


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

        # Check for duplicate email/business — use EXISTS for fastest short-circuit
        from sqlalchemy import exists, func as sqlfunc
        if db.session.query(exists().where(User.email == email)).scalar() or \
           db.session.query(exists().where(ClientEntry.email == email)).scalar():
            return jsonify({
                'error': 'An account with this email already exists',
                'field': 'email',
            }), 409

        if db.session.query(
            exists().where(sqlfunc.lower(ClientEntry.client_name) == business_name.lower())
        ).scalar():
            return jsonify({
                'error': 'A business with this name already exists. Please use a different name.',
                'field': 'business_name',
            }), 409

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
            role='owner',  # first user of a new client is always owner
            is_super_admin=False,
            created_at=now,
            is_active=True,
            full_name=business_name,
        )

        main_branch = Branch(
            branch_id=str(uuid.uuid4()),
            client_id=client_id,
            name='Main Branch',
            is_active=True,
        )

        db.session.add(new_client)
        db.session.flush()  # Commit client first so FK constraints are satisfied

        db.session.add(new_user)
        db.session.add(main_branch)
        db.session.flush()

        # Grant trial owner every permission in the system — full access for 14 days
        from models.permission_model import Permission, UserPermission
        all_perms = Permission.query.all()
        for perm in all_perms:
            db.session.add(UserPermission(
                id=str(uuid.uuid4()),
                user_id=user_id,
                permission_id=perm.permission_id,
                granted_by=user_id,
            ))

        # Generate email verification token atomically with the rest of signup
        verification_token = _secrets.token_hex(32)
        new_client.email_verification_token = verification_token
        new_client.email_verification_expires = now + timedelta(hours=24)

        db.session.commit()

        # Send verification email instead of welcome email
        verify_link = f"{Config.get_frontend_url()}/verify-email?token={verification_token}"
        if _email_enabled('email_on_verification'):
            send_verification_email(email, business_name, verify_link)

        return jsonify({
            'success': True,
            'email_unverified': True,
            'email': email,
            'message': 'Account created. Please check your email to verify your account.'
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Signup failed', 'message': str(e)}), 500


@auth_bp.route('/logout', methods=['POST'])
@authenticate
def logout():
    """User logout - Revokes session, logs action to audit, and clears cache"""
    try:
        log_action('LOGOUT', 'users', g.user['user_id'])

        # Revoke the session record if session_id is present in the JWT
        auth_header = request.headers.get('Authorization', '')
        if auth_header:
            try:
                token = auth_header.split(' ')[-1]
                decoded = jwt.decode(token, Config.JWT_SECRET, algorithms=[Config.JWT_ALGORITHM])
                session_id_from_token = decoded.get('session_id')
                if session_id_from_token:
                    session_record = UserSession.query.filter_by(
                        session_id=session_id_from_token, is_active=True
                    ).first()
                    if session_record:
                        session_record.is_active = False
                        session_record.revoked_at = datetime.utcnow()
                        try:
                            db.session.commit()
                        except Exception:
                            db.session.rollback()
            except Exception:
                pass  # Don't fail logout if session revocation fails

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


@auth_bp.route('/forgot-password', methods=['POST'])
@rate_limit(max_requests=5, window_seconds=300, error_message='Too many password reset requests. Please wait 5 minutes.')
def forgot_password():
    """
    Request a password reset link.
    Generates a secure token, stores it on the user, and emails the reset link.
    Always returns 200 to avoid exposing whether an email exists.
    """
    import secrets
    try:
        data = request.get_json() or {}
        email = (data.get('email') or '').strip().lower()

        if not email:
            return jsonify({'error': 'Email is required'}), 400

        user = User.query.filter_by(email=email).first()
        if not user:
            # Return 200 to avoid user enumeration
            return jsonify({'success': True, 'message': 'If that email exists, a reset link has been sent.'}), 200

        client = ClientEntry.query.filter_by(client_id=str(user.client_id)).first()
        client_name = client.client_name if client else user.full_name or email

        # Generate a secure 32-byte (64 hex char) token
        token = secrets.token_hex(32)
        user.reset_token = token
        user.reset_token_expires = datetime.utcnow() + timedelta(hours=1)
        db.session.commit()

        reset_link = f"{Config.get_frontend_url()}/reset-password?token={token}"
        if _email_enabled('email_on_password_changed'):
            send_password_reset_email(email, client_name, reset_link)

        return jsonify({'success': True, 'message': 'If that email exists, a reset link has been sent.'}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to process request', 'message': str(e)}), 500


@auth_bp.route('/reset-password', methods=['POST'])
@rate_limit(max_requests=10, window_seconds=300, error_message='Too many reset attempts. Please wait.')
def reset_password():
    """
    Complete a password reset using the token from the email link.
    Validates token expiry, sets the new password, invalidates the token.
    """
    try:
        data = request.get_json() or {}
        token = (data.get('token') or '').strip()
        new_password = data.get('new_password') or ''

        if not token or not new_password:
            return jsonify({'error': 'Token and new_password are required'}), 400

        if len(new_password) < 8:
            return jsonify({'error': 'Password must be at least 8 characters'}), 400

        user = User.query.filter_by(reset_token=token).first()

        if not user:
            return jsonify({'error': 'Invalid or expired reset link'}), 400

        if is_past(user.reset_token_expires):
            # Invalidate expired token
            user.reset_token = None
            user.reset_token_expires = None
            db.session.commit()
            return jsonify({'error': 'Reset link has expired. Please request a new one.'}), 400

        # Set new password and clear token
        user.password_hash = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        user.reset_token = None
        user.reset_token_expires = None
        db.session.commit()

        # Invalidate any cached sessions for this user
        cache = get_cache_manager()
        cache.delete(f"user_session:{str(user.user_id)}")

        client = ClientEntry.query.filter_by(client_id=str(user.client_id)).first()
        client_name = client.client_name if client else user.full_name or user.email
        changed_at = datetime.utcnow().strftime('%d %b %Y, %H:%M')
        if _email_enabled('email_on_password_changed'):
            send_password_changed_email(user.email, client_name, changed_at)

        return jsonify({'success': True, 'message': 'Password reset successfully. You can now log in.'}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Password reset failed', 'message': str(e)}), 500


@auth_bp.route('/verify-email', methods=['GET'])
def verify_email():
    """
    Validate email verification token. Issues JWT on success (auto-login).
    """
    token = (request.args.get('token') or '').strip()
    if not token:
        return jsonify({'error': 'Verification token is required'}), 400

    client = ClientEntry.query.filter_by(email_verification_token=token).first()

    if not client:
        return jsonify({'error': 'Invalid or expired verification link'}), 400

    if is_past(client.email_verification_expires):
        client.email_verification_token = None
        client.email_verification_expires = None
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()
        return jsonify({'error': 'Verification link has expired. Please request a new one.'}), 400

    # Mark verified
    client.email_verified = True
    client.email_verification_token = None
    client.email_verification_expires = None

    # Find the owner user for this client
    owner = User.query.filter_by(client_id=str(client.client_id), role='owner').first()
    if not owner:
        db.session.rollback()
        return jsonify({'error': 'Account setup error — contact support'}), 500

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Verification failed', 'message': str(e)}), 500

    # Issue JWT (same as login)
    user_permissions = get_user_permissions(str(owner.user_id))
    session_id = _secrets.token_urlsafe(32)

    token_payload = {
        'user_id': str(owner.user_id),
        'email': owner.email,
        'client_id': str(owner.client_id),
        'role': owner.role,
        'is_super_admin': owner.is_super_admin,
        'permissions': user_permissions,
        'session_id': session_id,
        'exp': datetime.utcnow() + timedelta(hours=Config.JWT_EXPIRATION_HOURS)
    }
    jwt_token = jwt.encode(token_payload, Config.JWT_SECRET, algorithm=Config.JWT_ALGORITHM)

    user_data = {
        'user_id': str(owner.user_id),
        'email': owner.email,
        'full_name': owner.full_name or client.client_name,
        'role': owner.role,
        'is_super_admin': owner.is_super_admin,
        'permissions': user_permissions,
        'branch_id': None,
        'branch_name': None,
        'must_change_password': owner.must_change_password,
        'totp_enabled': owner.totp_enabled,
    }

    client_data = {
        'client_id': str(client.client_id),
        'client_name': client.client_name,
        'logo_url': client.logo_url,
        'email': client.email,
        'subscription_status': client.subscription_status,
        'trial_end_date': client.trial_end_date.isoformat() if client.trial_end_date else None,
        'trial_days_remaining': client.trial_days_remaining,
    }

    # Create a tracked session record (same as login)
    incoming_ip = get_client_ip() or 'unknown'
    ua_string = request.headers.get('User-Agent', '')
    if 'Mobile' in ua_string:
        device = 'Mobile'
    elif 'Tablet' in ua_string:
        device = 'Tablet'
    else:
        device = 'Desktop'

    session_expires = datetime.utcnow() + timedelta(hours=Config.JWT_EXPIRATION_HOURS)
    new_session = UserSession(
        id=str(uuid.uuid4()),
        session_id=session_id,
        user_id=str(owner.user_id),
        client_id=str(owner.client_id),
        ip_address=incoming_ip,
        user_agent=ua_string[:512],
        device=device,
        expires_at=session_expires,
        is_active=True,
    )
    db.session.add(new_session)

    # Same single-device policy as login: this is an auto-login, so respect the cap.
    enforce_session_limit(
        owner.user_id, session_id, Config.MAX_CONCURRENT_SESSIONS_PER_USER
    )

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()  # Don't fail verification if session record fails

    cache = get_cache_manager()
    cache.set(f"user_session:{owner.user_id}", {'user': user_data, 'client': client_data}, USER_SESSION_CACHE_TIMEOUT)

    return jsonify({
        'success': True,
        'token': jwt_token,
        'client_id': str(client.client_id),
        'client_name': client.client_name,
        'client_logo': client.logo_url,
        'client_address': client.address,
        'client_phone': client.phone,
        'client_email': client.email,
        'client_gstin': client.gst_number,
        'user': user_data,
        'subscription_status': client.subscription_status,
        'plan_id': str(client.plan_id) if client.plan_id else None,
        'subscription_end_date': client.subscription_end_date.isoformat() if client.subscription_end_date else None,
        'trial': {
            'status': client.subscription_status,
            'days_remaining': client.trial_days_remaining,
            'end_date': client.trial_end_date.isoformat() if client.trial_end_date else None,
        },
        # Regional customization — new clients land here on first login; setup_completed
        # will be false so the frontend routes them to the setup wizard.
        'country': getattr(client, 'country', None) or 'IN',
        'currency_code': getattr(client, 'currency_code', None) or 'INR',
        'currency_symbol': getattr(client, 'currency_symbol', None) or '₹',
        'locale': getattr(client, 'locale', None) or 'en-IN',
        'tax_config': getattr(client, 'tax_config', None) or DEFAULT_GST_CONFIG,
        'setup_completed': getattr(client, 'setup_completed_at', None) is not None,
    }), 200


@auth_bp.route('/resend-verification', methods=['POST'])
def resend_verification():
    """Resend email verification link. Rate-limited to 3 per hour."""
    data = request.get_json() or {}
    email = (data.get('email') or '').strip().lower()
    if not email:
        return jsonify({'error': 'Email is required'}), 400

    # Rate limit: 3 resends per hour — always increment to prevent email enumeration
    cache = get_cache_manager()
    rate_key = f"verify_resend:{email}"
    count = cache.get(rate_key) or 0
    if count >= 3:
        return jsonify({'error': 'Too many resend attempts. Please wait before trying again.'}), 429

    # Increment counter before any DB/email work (prevents enumeration via timing)
    cache.set(rate_key, count + 1, 3600)

    # Find client by email (always return 200 to avoid enumeration)
    client = ClientEntry.query.filter_by(email=email).first()
    if not client or client.email_verified:
        return jsonify({'success': True, 'message': 'If that email is unverified, a new link has been sent.'}), 200

    verification_token = _secrets.token_hex(32)
    client.email_verification_token = verification_token
    client.email_verification_expires = datetime.utcnow() + timedelta(hours=24)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({'error': 'Failed to generate new token'}), 500

    verify_link = f"{Config.get_frontend_url()}/verify-email?token={verification_token}"
    if _email_enabled('email_on_verification'):
        send_verification_email(email, client.client_name, verify_link)

    return jsonify({'success': True, 'message': 'Verification email sent.'}), 200
