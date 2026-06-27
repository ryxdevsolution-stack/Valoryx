"""
OAuth Blueprint
---------------
Google OAuth2 Authorization Code flow for signup and login.

CSRF state is carried in a short-lived, HMAC-signed JWT — stateless, so any
gunicorn worker can verify a state issued by any other worker without Redis
or a shared database. Replay protection is enforced by Google's own
single-use authorization code.
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
from models.client_model import ClientEntry, DEFAULT_GST_CONFIG
from models.branch_model import Branch
from models.permission_model import get_user_permissions, Permission, UserPermission
from models.session_model import UserSession
from utils.request_ip import get_client_ip
from config import Config
from utils.session_manager import enforce_session_limit
import requests as http_requests

logger = logging.getLogger(__name__)

oauth_bp = Blueprint('oauth', __name__)

GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'
GOOGLE_SCOPES = 'openid email profile'
OAUTH_STATE_TTL = 600  # 10 minutes


def _issue_state_token() -> str:
    """
    Issue a stateless, short-lived, HMAC-signed OAuth state token.
    Multi-process safe: any worker can verify a token issued by any other
    worker using only the shared JWT_SECRET. No Redis/DB required.
    The returned token acts as the `state` param sent to Google.

    Replay protection is delegated to Google's single-use authorization
    code — Google rejects a code reused after first exchange.
    """
    now = datetime.utcnow()
    payload = {
        'purpose': 'oauth_state',
        'nonce': secrets.token_urlsafe(8),
        'iat': now,
        'exp': now + timedelta(seconds=OAUTH_STATE_TTL),
    }
    return jwt.encode(payload, Config.JWT_SECRET, algorithm=Config.JWT_ALGORITHM)


def _verify_state_token(token: str) -> bool:
    """Verify an OAuth state token. Returns True only for our signed tokens."""
    if not token:
        return False
    try:
        payload = jwt.decode(token, Config.JWT_SECRET, algorithms=[Config.JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        logger.info('OAuth state token expired')
        return False
    except jwt.InvalidTokenError as e:
        logger.warning('OAuth state token invalid: %s', e)
        return False
    return payload.get('purpose') == 'oauth_state'


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
    """Grant every permission to a new owner created via Google OAuth.
    Mirrors trial-signup behavior; super admin can revoke specific perms later.
    """
    all_perms = Permission.query.all()
    for perm in all_perms:
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

    # Stateless JWT-signed state token — multi-process safe without Redis/DB.
    state = _issue_state_token()

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
    # Client IP for the session record / last_login_ip — remote_addr only
    # (ProxyFix resolves the proxy hop; raw X-Forwarded-For is spoofable).
    client_ip = get_client_ip()

    data = request.get_json() or {}
    code = (data.get('code') or '').strip()
    state = (data.get('state') or '').strip()

    if not code:
        return jsonify({'success': False, 'error': 'Authorization code is required'}), 400

    # ------------------------------------------------------------------
    # CSRF state validation — stateless JWT verification (multi-process safe).
    # Replay protection is enforced by Google: authorization codes are
    # single-use and invalidated after the first exchange attempt.
    # ------------------------------------------------------------------
    if not _verify_state_token(state):
        return jsonify({'success': False, 'error': 'Invalid or expired state (CSRF check failed)'}), 400

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
    # Single-device policy: revoke other active sessions for this user.
    enforce_session_limit(
        user.user_id, session_id, Config.MAX_CONCURRENT_SESSIONS_PER_USER
    )
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
            # Regional customization — drives the first-login setup wizard for OAuth signups
            'country': getattr(client, 'country', None) or 'IN',
            'currency_code': getattr(client, 'currency_code', None) or 'INR',
            'currency_symbol': getattr(client, 'currency_symbol', None) or '₹',
            'locale': getattr(client, 'locale', None) or 'en-IN',
            'tax_config': getattr(client, 'tax_config', None) or DEFAULT_GST_CONFIG,
            'setup_completed': getattr(client, 'setup_completed_at', None) is not None,
        },
    }), 200
