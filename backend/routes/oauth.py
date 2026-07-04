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
import base64
import hashlib
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

# Desktop handoff assertion: very short-lived because it travels through a
# deep link (valoryx://) that other local processes could observe.
DESKTOP_ASSERTION_TTL = 120  # 2 minutes
# In-memory single-use nonce cache for desktop assertions {nonce: expiry_ts}.
# The desktop (offline) backend is a single process, so an in-memory set is
# sufficient; entries are pruned lazily and assertions also expire on their own.
_desktop_nonce_cache: dict[str, float] = {}


def _pkce_challenge(verifier: str) -> str:
    """Compute the PKCE S256 challenge for a verifier: base64url(sha256(v)),
    padding stripped. Matches Node's crypto base64url encoding used by the
    desktop app so the two sides agree."""
    digest = hashlib.sha256(verifier.encode('utf-8')).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b'=').decode('ascii')


def _issue_state_token(desktop: bool = False, challenge: str = '') -> str:
    """
    Issue a stateless, short-lived, HMAC-signed OAuth state token.
    Multi-process safe: any worker can verify a token issued by any other
    worker using only the shared JWT_SECRET. No Redis/DB required.
    The returned token acts as the `state` param sent to Google.

    `desktop` records whether this flow originated from the desktop app, so the
    callback can return a handoff assertion instead of a web session.
    `challenge` is the PKCE S256 challenge that binds the eventual assertion to
    the Electron process that started the flow (it alone holds the verifier).

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
    if desktop:
        payload['desktop'] = True
    if challenge:
        payload['challenge'] = challenge
    return jwt.encode(payload, Config.JWT_SECRET, algorithm=Config.JWT_ALGORITHM)


def _verify_state_token(token: str):
    """Verify an OAuth state token. Returns the decoded payload dict for a valid
    token, or None otherwise."""
    if not token:
        return None
    try:
        payload = jwt.decode(token, Config.JWT_SECRET, algorithms=[Config.JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        logger.info('OAuth state token expired')
        return None
    except jwt.InvalidTokenError as e:
        logger.warning('OAuth state token invalid: %s', e)
        return None
    if payload.get('purpose') != 'oauth_state':
        return None
    return payload


def _issue_desktop_assertion(email: str, google_id: str, name: str = '', avatar: str = '', challenge: str = '') -> str:
    """Sign a short-lived handoff assertion that bridges a verified cloud Google
    identity into the offline desktop app. Signed with the SHARED
    DESKTOP_OAUTH_SECRET (not the per-install JWT_SECRET) so the local backend
    can verify it offline. `challenge` is the PKCE S256 challenge — the local
    backend will only accept the assertion alongside the matching verifier, so a
    stolen deep link (assertion only) is useless."""
    now = datetime.utcnow()
    payload = {
        'purpose': 'desktop_oauth',
        'email': email,
        'google_id': google_id,
        'name': name or '',
        'avatar': avatar or '',
        'challenge': challenge or '',
        'nonce': secrets.token_urlsafe(16),
        'iat': now,
        'exp': now + timedelta(seconds=DESKTOP_ASSERTION_TTL),
    }
    return jwt.encode(payload, Config.DESKTOP_OAUTH_SECRET, algorithm=Config.JWT_ALGORITHM)


def _verify_desktop_assertion(token: str):
    """Verify a desktop handoff assertion. Returns the payload for a valid,
    unexpired, single-use token, or None. Enforces single-use via an in-memory
    nonce cache."""
    if not token or not Config.DESKTOP_OAUTH_SECRET:
        return None
    try:
        payload = jwt.decode(
            token,
            Config.DESKTOP_OAUTH_SECRET,
            algorithms=[Config.JWT_ALGORITHM],
            options={'require': ['exp', 'purpose', 'nonce']},
        )
    except jwt.ExpiredSignatureError:
        logger.info('Desktop assertion expired')
        return None
    except jwt.InvalidTokenError as e:
        logger.warning('Desktop assertion invalid: %s', e)
        return None
    if payload.get('purpose') != 'desktop_oauth':
        return None
    # Single-use: reject a replayed nonce. Prune expired entries opportunistically.
    import time as _time
    now_ts = _time.time()
    for n, exp_ts in list(_desktop_nonce_cache.items()):
        if exp_ts < now_ts:
            _desktop_nonce_cache.pop(n, None)
    nonce = payload.get('nonce')
    if not nonce or nonce in _desktop_nonce_cache:
        logger.warning('Desktop assertion replayed or missing nonce')
        return None
    _desktop_nonce_cache[nonce] = payload.get('exp', now_ts + DESKTOP_ASSERTION_TTL)
    return payload


def _finalize_login(user, client, client_ip: str, platform: str = 'web'):
    """Create a session, mint the local JWT, and build the {token,user,client}
    response. Shared by the web Google callback and the desktop-login endpoint
    so both issue identical login payloads with no duplication.

    `platform` ('web' or 'desktop') scopes single-device enforcement so the
    desktop app and the browser can be logged in at once without evicting each
    other — matching the same behaviour as password login."""
    session_id = secrets.token_urlsafe(32)
    user_agent_str = request.headers.get('User-Agent', '')

    session_record = UserSession(
        session_id=session_id,
        user_id=str(user.user_id),
        client_id=str(user.client_id),
        ip_address=client_ip[:45] if client_ip else None,
        user_agent=user_agent_str[:512] if user_agent_str else None,
        device=_parse_device(user_agent_str),
        platform=platform,
        expires_at=datetime.utcnow() + timedelta(hours=Config.JWT_EXPIRATION_HOURS),
        is_active=True,
    )
    db.session.add(session_record)
    # Single-device policy, scoped per platform (web vs desktop).
    enforce_session_limit(
        user.user_id, session_id, Config.MAX_CONCURRENT_SESSIONS_PER_USER,
        platform=platform,
    )
    try:
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        logger.error('OAuth session creation failed: %s', exc)
        return jsonify({'success': False, 'error': 'Login failed. Please try again.'}), 500

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
    # Carry the desktop flag + PKCE challenge so the callback can return a
    # handoff assertion bound to the originating desktop process.
    desktop = request.args.get('desktop') in ('1', 'true', 'valoryx')
    challenge = (request.args.get('challenge') or '').strip() if desktop else ''
    state = _issue_state_token(desktop=desktop, challenge=challenge)

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
    state_payload = _verify_state_token(state)
    if not state_payload:
        return jsonify({'success': False, 'error': 'Invalid or expired state (CSRF check failed)'}), 400
    is_desktop = bool(state_payload.get('desktop'))

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

    # Reject unverified Google emails. Without this, an account whose primary
    # email is unverified could be auto-linked (below) to an existing Valoryx
    # user that shares the same address — an account-takeover path. v2 userinfo
    # returns `verified_email`; OIDC returns `email_verified`.
    if google_user.get('verified_email') is not True and google_user.get('email_verified') is not True:
        logger.warning('OAuth: rejected unverified Google email: %s', email)
        return jsonify({'success': False, 'error': 'Your Google email address is not verified.'}), 400

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
    # Desktop handoff: the cloud has now verified the Google identity. Instead
    # of creating a web session, return a short-lived signed assertion the
    # offline desktop app exchanges with its LOCAL backend for a local JWT.
    # ------------------------------------------------------------------
    if is_desktop:
        if not Config.DESKTOP_OAUTH_SECRET:
            return jsonify({'success': False, 'error': 'Desktop sign-in is not configured'}), 501
        # PKCE challenge is mandatory for desktop — it binds the assertion to the
        # Electron process that holds the verifier, so a stolen deep link is useless.
        challenge = (state_payload.get('challenge') or '').strip()
        if not challenge:
            return jsonify({'success': False, 'error': 'Invalid desktop sign-in request'}), 400
        assertion = _issue_desktop_assertion(
            email=user.email,
            google_id=user.google_id or '',
            name=user.full_name or '',
            avatar=user.avatar_url or '',
            challenge=challenge,
        )
        return jsonify({'success': True, 'desktop': True, 'assertion': assertion}), 200

    return _finalize_login(user, client, client_ip)


@oauth_bp.route('/desktop-login', methods=['POST'])
def desktop_login():
    """
    Exchange a desktop handoff assertion (minted by the cloud after a verified
    Google login) for a LOCAL session + JWT. Runs against the offline desktop
    backend. The Google identity is only trusted via the shared-secret HMAC
    signature — this endpoint never talks to Google.
    POST /api/oauth/desktop-login
    Body: { "assertion": "<jwt>" }
    """
    if not Config.DESKTOP_OAUTH_SECRET:
        return jsonify({'success': False, 'error': 'Desktop sign-in is not configured'}), 501

    client_ip = get_client_ip()
    data = request.get_json() or {}
    assertion = (data.get('assertion') or '').strip()
    verifier = (data.get('verifier') or '').strip()

    payload = _verify_desktop_assertion(assertion)
    if not payload:
        return jsonify({'success': False, 'error': 'Invalid or expired sign-in. Please try again.'}), 401

    # PKCE: the assertion is only honored alongside the verifier whose SHA-256
    # matches the embedded challenge. The verifier never travels in the deep
    # link, so an app that intercepts the deep link cannot redeem the assertion.
    challenge = (payload.get('challenge') or '').strip()
    if not challenge or not verifier or _pkce_challenge(verifier) != challenge:
        logger.warning('Desktop login PKCE verification failed')
        return jsonify({'success': False, 'error': 'Invalid or expired sign-in. Please try again.'}), 401

    email = (payload.get('email') or '').lower().strip()
    google_id = (payload.get('google_id') or '').strip()
    if not email:
        return jsonify({'success': False, 'error': 'Invalid sign-in assertion'}), 401

    # The user must already exist on this device (synced from the cloud).
    user = User.query.filter_by(email=email, is_active=True).first()
    if not user:
        return jsonify({
            'success': False,
            'error': 'This Google account is not set up on this device yet. '
                     'Sign in once online to sync, or contact your administrator.',
        }), 403

    # If the local record is already linked to a Google account, it must match.
    if user.google_id and google_id and user.google_id != google_id:
        logger.warning('Desktop login google_id mismatch for %s', email)
        return jsonify({'success': False, 'error': 'Account mismatch. Please contact your administrator.'}), 401

    # Link the Google id on first desktop login if the synced record lacks one.
    if not user.google_id and google_id:
        try:
            user.google_id = google_id
            db.session.commit()
        except Exception:
            db.session.rollback()

    client = ClientEntry.query.filter_by(client_id=user.client_id, is_active=True).first()
    if not client:
        return jsonify({'success': False, 'error': 'Client account is inactive'}), 401

    # This is the offline desktop app exchanging its Google assertion for a local JWT.
    return _finalize_login(user, client, client_ip, platform='desktop')
