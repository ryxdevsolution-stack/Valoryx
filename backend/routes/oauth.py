"""
OAuth Blueprint
---------------
Google OAuth2 Authorization Code flow for signup and login.
Uses Redis (via CacheManager) for CSRF state storage — multi-process safe.
Falls back gracefully when Redis is unavailable (state check will fail-open is
avoided: if cache is disabled the state is always treated as invalid).
"""
import os
import uuid
import jwt
import bcrypt
import secrets
import logging

from datetime import datetime, timedelta
from flask import Blueprint, jsonify, request
from extensions import db
from models.user_model import User
from models.client_model import ClientEntry
from models.branch_model import Branch
from models.permission_model import get_user_permissions, Permission, UserPermission
from models.session_model import UserSession
from config import Config
from utils.cache_helper import get_cache_manager
import requests as http_requests

logger = logging.getLogger(__name__)

oauth_bp = Blueprint('oauth', __name__)

GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'
GOOGLE_SCOPES = 'openid email profile'
OAUTH_STATE_TTL = 600  # 10 minutes

# In-memory fallback CSRF state store (used when Redis is unavailable).
# Safe for single-process deployments (dev / desktop app).
_state_store: dict = {}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_redirect_uri() -> str | None:
    """
    Derive the OAuth redirect URI from the incoming request's Origin or Referer header.
    Validated against CORS_ORIGINS so only known frontends are accepted.
    Works on any port — no hardcoded URLs.
    """
    origin = (request.headers.get('Origin') or '').rstrip('/')
    # Browsers don't send Origin on same-origin GET requests — fall back to Referer
    if not origin:
        referer = request.headers.get('Referer') or ''
        if referer:
            from urllib.parse import urlparse
            parsed = urlparse(referer)
            origin = f"{parsed.scheme}://{parsed.netloc}".rstrip('/')
    if not origin:
        return None
    allowed = [o.strip().rstrip('/') for o in os.getenv('CORS_ORIGINS', '').split(',') if o.strip()]
    if origin not in allowed:
        logger.warning('OAuth: rejected unknown origin: %s', origin)
        return None
    return f"{origin}/frontend/oauth/callback"


def _parse_device(user_agent: str) -> str:
    """Derive a simple device category from the User-Agent string."""
    ua = user_agent.lower()
    if 'mobile' in ua or 'android' in ua:
        return 'Mobile'
    if 'tablet' in ua or 'ipad' in ua:
        return 'Tablet'
    return 'Desktop'


def _safe_avatar_url(url: str) -> str | None:
    """Accept only HTTPS Google profile picture URLs."""
    if not url:
        return None
    if url.startswith('https://lh3.googleusercontent.com/'):
        return url
    return None


def _assign_default_permissions(user_id: str) -> None:
    """Assign standard admin permissions to a brand-new Google OAuth user."""
    default_perms = [
        'view_dashboard', 'gst_billing', 'non_gst_billing',
        'view_all_bills', 'view_own_bills', 'view_customers',
        'view_stock', 'add_product', 'edit_product_details',
        'view_sales_reports', 'export_reports', 'view_audit_logs',
        'edit_bill_details', 'print_bills',
    ]
    perms = Permission.query.filter(Permission.permission_name.in_(default_perms)).all()
    if len(perms) < len(default_perms):
        logger.warning('_assign_default_permissions: expected %d permissions, found %d. Missing: %s',
                       len(default_perms), len(perms),
                       set(default_perms) - {p.permission_name for p in perms})
    for perm in perms:
        db.session.add(UserPermission(
            id=str(uuid.uuid4()),
            user_id=user_id,
            permission_id=perm.permission_id,
            granted_by=user_id,
        ))


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@oauth_bp.route('/google/authorize', methods=['GET'])
def google_authorize():
    """
    Generate and return the Google OAuth authorization URL.
    GET /api/oauth/google/authorize
    """
    if not Config.GOOGLE_CLIENT_ID:
        return jsonify({'success': False, 'error': 'Google OAuth is not configured'}), 501

    state = secrets.token_urlsafe(16)
    cache = get_cache_manager()

    if cache.enabled:
        cache.set(f'oauth_state:{state}', 1, OAUTH_STATE_TTL)
    else:
        # Redis unavailable — use in-memory fallback (dev / single-process)
        _state_store[state] = datetime.utcnow()
        # Evict states older than 10 minutes
        cutoff = datetime.utcnow() - timedelta(seconds=OAUTH_STATE_TTL)
        expired = [k for k, v in _state_store.items() if v < cutoff]
        for k in expired:
            _state_store.pop(k, None)

    redirect_uri = _get_redirect_uri()
    if not redirect_uri:
        return jsonify({'success': False, 'error': 'Unknown request origin'}), 400
    from urllib.parse import urlencode
    params = {
        'client_id': Config.GOOGLE_CLIENT_ID,
        'redirect_uri': redirect_uri,
        'response_type': 'code',
        'scope': GOOGLE_SCOPES,
        'state': state,
        'access_type': 'offline',
        'prompt': 'select_account',
    }
    auth_url = f"{GOOGLE_AUTH_URL}?{urlencode(params)}"
    return jsonify({'success': True, 'auth_url': auth_url}), 200


@oauth_bp.route('/google/callback', methods=['POST'])
def google_callback():
    """
    Exchange the authorization code for user info and issue a JWT.
    POST /api/oauth/google/callback
    Body: { "code": "...", "state": "..." }
    """
    # Rate limit per IP to prevent code brute-force
    client_ip = request.headers.get('X-Forwarded-For', request.remote_addr or '').split(',')[0].strip()
    cache = get_cache_manager()
    rate_key = f'oauth_rate:{client_ip}'
    attempts = cache.get(rate_key) or 0
    if attempts >= 20:  # 20 attempts per 5 minutes per IP
        return jsonify({'success': False, 'error': 'Too many requests. Try again later.'}), 429
    cache.set(rate_key, attempts + 1, 300)  # 5 min TTL

    data = request.get_json() or {}
    code = (data.get('code') or '').strip()
    state = (data.get('state') or '').strip()

    if not code:
        return jsonify({'success': False, 'error': 'Authorization code is required'}), 400

    # ------------------------------------------------------------------
    # CSRF state validation (Redis or in-memory fallback)
    # ------------------------------------------------------------------
    if not state:
        return jsonify({'success': False, 'error': 'Invalid or expired state (CSRF check failed)'}), 400

    state_key = f'oauth_state:{state}'
    if cache.enabled:
        if not cache.get(state_key):
            return jsonify({'success': False, 'error': 'Invalid or expired state (CSRF check failed)'}), 400
        cache.delete(state_key)
    else:
        # In-memory fallback
        ts = _state_store.pop(state, None)
        if not ts:
            return jsonify({'success': False, 'error': 'Invalid or expired state (CSRF check failed)'}), 400
        if (datetime.utcnow() - ts).total_seconds() > OAUTH_STATE_TTL:
            return jsonify({'success': False, 'error': 'State expired. Please try again.'}), 400

    # ------------------------------------------------------------------
    # Exchange code for Google access token
    # ------------------------------------------------------------------
    redirect_uri = _get_redirect_uri()
    if not redirect_uri:
        return jsonify({'success': False, 'error': 'Unknown request origin'}), 400
    try:
        token_resp = http_requests.post(
            GOOGLE_TOKEN_URL,
            data={
                'code': code,
                'client_id': Config.GOOGLE_CLIENT_ID,
                'client_secret': Config.GOOGLE_CLIENT_SECRET,
                'redirect_uri': redirect_uri,
                'grant_type': 'authorization_code',
            },
            timeout=10,
        )
    except Exception as exc:
        logger.error('OAuth token exchange network error: %s', exc)
        return jsonify({'success': False, 'error': 'Failed to connect to Google'}), 502

    if not token_resp.ok:
        logger.warning('Google token exchange failed: %s %s', token_resp.status_code, token_resp.text)
        return jsonify({'success': False, 'error': 'Failed to exchange code with Google'}), 400

    access_token = token_resp.json().get('access_token')
    if not access_token:
        return jsonify({'success': False, 'error': 'No access token received from Google'}), 400

    # ------------------------------------------------------------------
    # Fetch user profile from Google
    # ------------------------------------------------------------------
    try:
        userinfo_resp = http_requests.get(
            GOOGLE_USERINFO_URL,
            headers={'Authorization': f'Bearer {access_token}'},
            timeout=10,
        )
    except Exception as exc:
        logger.error('OAuth userinfo network error: %s', exc)
        return jsonify({'success': False, 'error': 'Failed to connect to Google'}), 502

    if not userinfo_resp.ok:
        logger.warning('Google userinfo failed: %s %s', userinfo_resp.status_code, userinfo_resp.text)
        return jsonify({'success': False, 'error': 'Failed to fetch user info from Google'}), 400

    google_user = userinfo_resp.json()
    google_id = google_user.get('id', '').strip()
    email = (google_user.get('email') or '').lower().strip()
    name = (google_user.get('name') or '').strip()
    avatar = (google_user.get('picture') or '').strip()

    if not email or not google_id:
        return jsonify({'success': False, 'error': 'Could not retrieve user info from Google'}), 400

    # ------------------------------------------------------------------
    # Find or create user
    # ------------------------------------------------------------------
    try:
        user = User.query.filter_by(google_id=google_id).first()

        if not user:
            # Try to link to an existing account that shares the same email
            user = User.query.filter_by(email=email).first()
            if user:
                user.google_id = google_id
                user.avatar_url = _safe_avatar_url(avatar)
                db.session.commit()
            else:
                # Entirely new user — provision a client + default branch + admin account
                new_client_id = str(uuid.uuid4())
                business_name = name or email.split('@')[0]

                new_client = ClientEntry(
                    client_id=new_client_id,
                    client_name=business_name,
                    email=email,
                    subscription_status='trial',
                    trial_start_date=datetime.utcnow(),
                    trial_end_date=datetime.utcnow() + timedelta(days=14),
                    is_active=True,
                )
                db.session.add(new_client)
                db.session.flush()

                default_branch = Branch(
                    branch_id=str(uuid.uuid4()),
                    client_id=new_client_id,
                    name='Main Branch',
                    is_active=True,
                )
                db.session.add(default_branch)

                # Dummy password — user authenticates via Google, but the column is NOT NULL
                dummy_pw = bcrypt.hashpw(secrets.token_bytes(32), bcrypt.gensalt()).decode('utf-8')

                user = User(
                    user_id=str(uuid.uuid4()),
                    email=email,
                    password_hash=dummy_pw,
                    client_id=new_client_id,
                    role='owner',
                    full_name=name,
                    google_id=google_id,
                    avatar_url=_safe_avatar_url(avatar),
                    is_active=True,
                    invite_accepted=True,
                )
                db.session.add(user)
                db.session.flush()

                _assign_default_permissions(str(user.user_id))
                db.session.commit()

    except Exception as exc:
        db.session.rollback()
        logger.exception('OAuth user find/create failed: %s', exc)
        return jsonify({'success': False, 'error': 'Failed to create or update account'}), 500

    # ------------------------------------------------------------------
    # Gate checks
    # ------------------------------------------------------------------
    if not user.is_active:
        return jsonify({'success': False, 'error': 'Account is inactive. Contact your administrator.'}), 401

    client = ClientEntry.query.filter_by(client_id=user.client_id, is_active=True).first()
    if not client:
        return jsonify({'success': False, 'error': 'Client account is inactive'}), 401

    # ------------------------------------------------------------------
    # Create session record
    # ------------------------------------------------------------------
    session_id = secrets.token_urlsafe(32)
    ip_address = client_ip
    user_agent_str = request.headers.get('User-Agent', '')

    session_record = UserSession(
        session_id=session_id,
        user_id=str(user.user_id),
        client_id=str(user.client_id),
        ip_address=ip_address[:45] if ip_address else None,
        user_agent=user_agent_str[:512] if user_agent_str else None,
        device=_parse_device(user_agent_str),
        expires_at=datetime.utcnow() + timedelta(hours=Config.JWT_EXPIRATION_HOURS),
        is_active=True,
    )
    db.session.add(session_record)
    try:
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        logger.error('OAuth session creation failed: %s', exc)
        return jsonify({'success': False, 'error': 'Login failed. Please try again.'}), 500

    # ------------------------------------------------------------------
    # Issue JWT (same shape as the regular login endpoint)
    # ------------------------------------------------------------------
    permissions = get_user_permissions(str(user.user_id))
    token_payload = {
        'user_id': str(user.user_id),
        'email': user.email,
        'client_id': str(user.client_id),
        'role': user.role,
        'is_super_admin': user.is_super_admin or False,
        'permissions': permissions,
        'session_id': session_id,
        'exp': datetime.utcnow() + timedelta(hours=Config.JWT_EXPIRATION_HOURS),
    }
    jwt_token = jwt.encode(token_payload, Config.JWT_SECRET, algorithm=Config.JWT_ALGORITHM)

    # Update last login timestamp and IP
    user.last_login = datetime.utcnow()
    user.last_login_ip = client_ip
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()

    user_dict = user.to_dict()
    user_dict['permissions'] = permissions  # to_dict() omits permissions; add here

    return jsonify({
        'success': True,
        'token': jwt_token,
        'user': user_dict,
        'client': {
            'client_id': str(client.client_id),
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
        },
    }), 200
