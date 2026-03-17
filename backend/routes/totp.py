"""
TOTP 2FA Blueprint
------------------
Enable, disable, and verify TOTP two-factor authentication.

Endpoints:
  POST /api/totp/setup                 — generate secret + QR code for current user
  POST /api/totp/enable                — confirm setup by verifying a code (returns backup codes)
  POST /api/totp/disable               — disable 2FA after verifying current code
  GET  /api/totp/backup-codes          — check how many backup codes remain (count only)
  POST /api/totp/regenerate-backup-codes — regenerate backup codes (requires TOTP code)
  POST /api/totp/recover               — request 2FA recovery email when device is lost
"""
import io
import json
import base64
import hashlib
import secrets as _secrets
import pyotp
import qrcode

from datetime import datetime, timedelta, timezone
from flask import Blueprint, jsonify, request, g
from extensions import db
from models.user_model import User
from models.client_model import ClientEntry
from utils.auth_middleware import authenticate
from utils.audit_logger import log_action
from utils.cache_helper import get_cache_manager
from config import Config

totp_bp = Blueprint('totp', __name__)

# TOTP brute-force protection: block after this many failed attempts
TOTP_MAX_FAILURES = 10
# Window (seconds) over which failures are counted before auto-expiry
TOTP_FAIL_WINDOW = 900   # 15 minutes
# How long (seconds) a used code is remembered to prevent replay
TOTP_REPLAY_WINDOW = 90  # 90 seconds — covers the ±1 valid_window (3 × 30 s)
# Number of backup codes generated per setup
BACKUP_CODE_COUNT = 10


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _hash_code(code: str) -> str:
    """SHA-256 hash a backup code for safe storage."""
    return hashlib.sha256(code.encode()).hexdigest()


def _generate_backup_codes() -> tuple[list[str], list[str]]:
    """
    Generate BACKUP_CODE_COUNT random 8-char hex codes.
    Returns (plaintext_list, hashed_list).
    Plaintext is shown once to the user; hashed list is stored in DB.
    """
    plain = [_secrets.token_hex(4).upper() for _ in range(BACKUP_CODE_COUNT)]
    hashed = [_hash_code(c) for c in plain]
    return plain, hashed


def _check_brute_force(cache, user_id: str):
    """Return 429 response if too many failures, else None."""
    fail_key = f"totp_fail:{user_id}"
    fails = cache.get(fail_key) or 0
    if fails >= TOTP_MAX_FAILURES:
        return jsonify({
            'success': False,
            'error': 'Too many failed attempts. Try again in 15 minutes.',
        }), 429
    return None


def _check_replay(cache, user_id: str, code: str):
    """Return 400 response if code was recently used, else None."""
    replay_key = f"totp_used:{user_id}:{code}"
    if cache.get(replay_key):
        return jsonify({
            'success': False,
            'error': 'Code already used. Wait for the next code.',
        }), 400
    return None


def _record_failure(cache, user_id: str):
    fail_key = f"totp_fail:{user_id}"
    fails = cache.get(fail_key) or 0
    cache.set(fail_key, fails + 1, TOTP_FAIL_WINDOW)


def _clear_failure_and_mark_replay(cache, user_id: str, code: str):
    cache.set(f"totp_used:{user_id}:{code}", 1, TOTP_REPLAY_WINDOW)
    cache.delete(f"totp_fail:{user_id}")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@totp_bp.route('/setup', methods=['POST'])
@authenticate
def setup_totp():
    """
    Generate TOTP secret and QR code for the current user.
    POST /api/totp/setup
    Returns: { secret, qr_code (base64 PNG data URI) }
    """
    user = User.query.filter_by(user_id=g.user['user_id']).first()
    if not user:
        return jsonify({'success': False, 'error': 'User not found'}), 404

    if user.totp_enabled:
        return jsonify({'success': False, 'error': '2FA is already enabled'}), 409

    secret = pyotp.random_base32()
    user.totp_secret = secret
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({'success': False, 'error': 'Failed to save 2FA setup. Please try again.'}), 500

    totp = pyotp.TOTP(secret)
    otp_uri = totp.provisioning_uri(name=user.email, issuer_name='Valoryx')

    qr = qrcode.make(otp_uri)
    buffer = io.BytesIO()
    qr.save(buffer, format='PNG')
    qr_b64 = base64.b64encode(buffer.getvalue()).decode('utf-8')

    return jsonify({
        'success': True,
        'data': {
            'secret': secret,
            'qr_code': f'data:image/png;base64,{qr_b64}',
        }
    }), 200


@totp_bp.route('/enable', methods=['POST'])
@authenticate
def enable_totp():
    """
    Confirm TOTP setup by verifying a code from the authenticator app.
    POST /api/totp/enable
    Body: { "code": "123456" }
    Returns backup codes (shown only once — user must save them).
    """
    data = request.get_json() or {}
    code = (data.get('code') or '').strip()

    if not code:
        return jsonify({'success': False, 'error': 'Verification code is required'}), 400

    user = User.query.filter_by(user_id=g.user['user_id']).first()
    if not user or not user.totp_secret:
        return jsonify({'success': False, 'error': 'Run /totp/setup first'}), 400

    if user.totp_enabled:
        return jsonify({'success': False, 'error': '2FA is already enabled'}), 409

    user_id = str(user.user_id)
    cache = get_cache_manager()

    bf = _check_brute_force(cache, user_id)
    if bf:
        return bf

    rp = _check_replay(cache, user_id, code)
    if rp:
        return rp

    totp = pyotp.TOTP(user.totp_secret)
    if not totp.verify(code, valid_window=1):
        _record_failure(cache, user_id)
        return jsonify({'success': False, 'error': 'Invalid code. Check your authenticator app and try again.'}), 400

    _clear_failure_and_mark_replay(cache, user_id, code)

    # Generate backup codes — plaintext returned once, hashed stored
    plain_codes, hashed_codes = _generate_backup_codes()
    user.totp_enabled = True
    user.totp_backup_codes = json.dumps(hashed_codes)

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({'success': False, 'error': 'Failed to enable 2FA. Please try again.'}), 500

    log_action('2fa_enabled', 'users', str(user.user_id),
               old_data={}, new_data={'totp_enabled': True}, auto_commit=True)

    return jsonify({
        'success': True,
        'message': '2FA enabled successfully',
        'backup_codes': plain_codes,  # Shown once — user must save these
    }), 200


@totp_bp.route('/disable', methods=['POST'])
@authenticate
def disable_totp():
    """
    Disable 2FA. Requires the current TOTP code as confirmation.
    POST /api/totp/disable
    Body: { "code": "123456" }
    """
    data = request.get_json() or {}
    code = (data.get('code') or '').strip()

    if not code:
        return jsonify({'success': False, 'error': 'Enter your current 2FA code to confirm'}), 400

    user = User.query.filter_by(user_id=g.user['user_id']).first()
    if not user or not user.totp_enabled:
        return jsonify({'success': False, 'error': '2FA is not enabled'}), 400

    user_id = str(user.user_id)
    cache = get_cache_manager()

    bf = _check_brute_force(cache, user_id)
    if bf:
        return bf

    rp = _check_replay(cache, user_id, code)
    if rp:
        return rp

    totp = pyotp.TOTP(user.totp_secret)
    if not totp.verify(code, valid_window=1):
        _record_failure(cache, user_id)
        return jsonify({'success': False, 'error': 'Invalid code'}), 400

    _clear_failure_and_mark_replay(cache, user_id, code)

    user.totp_enabled = False
    user.totp_secret = None
    user.totp_backup_codes = None
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({'success': False, 'error': 'Failed to disable 2FA. Please try again.'}), 500

    log_action('2fa_disabled', 'users', str(user.user_id),
               old_data={'totp_enabled': True}, new_data={'totp_enabled': False}, auto_commit=True)

    return jsonify({'success': True, 'message': '2FA disabled'}), 200


@totp_bp.route('/backup-codes', methods=['GET'])
@authenticate
def get_backup_codes_count():
    """
    Return how many backup codes remain (count only — codes are never re-shown).
    GET /api/totp/backup-codes
    """
    user = User.query.filter_by(user_id=g.user['user_id']).first()
    if not user or not user.totp_enabled:
        return jsonify({'success': False, 'error': '2FA is not enabled'}), 400

    codes = json.loads(user.totp_backup_codes) if user.totp_backup_codes else []
    return jsonify({
        'success': True,
        'remaining': len(codes),
        'total': BACKUP_CODE_COUNT,
    }), 200


@totp_bp.route('/regenerate-backup-codes', methods=['POST'])
@authenticate
def regenerate_backup_codes():
    """
    Regenerate backup codes. Requires current TOTP code to confirm.
    Old codes are immediately invalidated.
    POST /api/totp/regenerate-backup-codes
    Body: { "code": "123456" }
    """
    data = request.get_json() or {}
    code = (data.get('code') or '').strip()

    if not code:
        return jsonify({'success': False, 'error': 'Enter your current 2FA code to confirm'}), 400

    user = User.query.filter_by(user_id=g.user['user_id']).first()
    if not user or not user.totp_enabled:
        return jsonify({'success': False, 'error': '2FA is not enabled'}), 400

    user_id = str(user.user_id)
    cache = get_cache_manager()

    bf = _check_brute_force(cache, user_id)
    if bf:
        return bf

    rp = _check_replay(cache, user_id, code)
    if rp:
        return rp

    totp = pyotp.TOTP(user.totp_secret)
    if not totp.verify(code, valid_window=1):
        _record_failure(cache, user_id)
        return jsonify({'success': False, 'error': 'Invalid code'}), 400

    _clear_failure_and_mark_replay(cache, user_id, code)

    plain_codes, hashed_codes = _generate_backup_codes()
    user.totp_backup_codes = json.dumps(hashed_codes)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({'success': False, 'error': 'Failed to regenerate backup codes'}), 500

    log_action('2fa_backup_codes_regenerated', 'users', str(user.user_id),
               old_data={}, new_data={}, auto_commit=True)

    return jsonify({
        'success': True,
        'backup_codes': plain_codes,
        'message': 'New backup codes generated. Old codes are now invalid.',
    }), 200


@totp_bp.route('/verify-action', methods=['POST'])
@authenticate
def verify_action():
    """
    Verify a TOTP code for a sensitive in-app action (not login).
    Returns a short-lived one-time action token (60s) that the caller passes
    with the real action request (delete account, add user, etc.).

    POST /api/totp/verify-action
    Body: { "code": "123456" }
    Returns: { success: true, action_token: "..." }
    """
    import json as _json, hashlib as _hashlib

    data = request.get_json() or {}
    code = (data.get('code') or '').strip()

    if not code:
        return jsonify({'success': False, 'error': 'Code is required'}), 400

    user = User.query.filter_by(user_id=g.user['user_id']).first()
    if not user or not user.totp_enabled:
        return jsonify({'success': False, 'error': '2FA is not enabled'}), 400

    if not user.totp_secret:
        return jsonify({'success': False, 'error': 'Invalid 2FA state'}), 500

    user_id = str(user.user_id)
    cache = get_cache_manager()

    bf = _check_brute_force(cache, user_id)
    if bf:
        return bf

    # Try backup code first (8 uppercase hex chars)
    normalized = code.upper().replace('-', '').replace(' ', '')
    backup_codes = _json.loads(user.totp_backup_codes) if user.totp_backup_codes else []
    code_hash = _hashlib.sha256(normalized.encode()).hexdigest()

    if normalized and len(normalized) == 8 and code_hash in backup_codes:
        backup_codes.remove(code_hash)
        user.totp_backup_codes = _json.dumps(backup_codes)
        cache.delete(f"totp_fail:{user_id}")
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()
    else:
        rp = _check_replay(cache, user_id, code)
        if rp:
            return rp

        totp = pyotp.TOTP(user.totp_secret)
        if not totp.verify(code, valid_window=1):
            _record_failure(cache, user_id)
            return jsonify({'success': False, 'error': 'Invalid code. Try again.'}), 401

        _clear_failure_and_mark_replay(cache, user_id, code)

    # Issue a short-lived single-use action token (60 seconds)
    import secrets as _sec
    action_token = _sec.token_hex(16)
    cache.set(f"totp_action:{user_id}:{action_token}", 1, 60)

    return jsonify({'success': True, 'action_token': action_token}), 200


@totp_bp.route('/recover', methods=['POST'])
def request_2fa_recovery():
    """
    Send a 2FA recovery email when user has lost their authenticator device.
    Does NOT require authentication — user proves identity via email + password.
    POST /api/totp/recover
    Body: { "email": "...", "password": "..." }
    A recovery link is sent to their email to disable 2FA.
    """
    import bcrypt

    data = request.get_json() or {}
    email = (data.get('email') or '').strip().lower()
    password = (data.get('password') or '').strip()

    # Generic response to avoid user enumeration
    generic_ok = jsonify({
        'success': True,
        'message': 'If that account exists and 2FA is enabled, a recovery email has been sent.',
    }), 200

    if not email or not password:
        return jsonify({'success': False, 'error': 'Email and password are required'}), 400

    user = User.query.filter_by(email=email).first()
    if not user or not user.totp_enabled:
        return generic_ok

    # Verify password before sending recovery email
    if not bcrypt.checkpw(password.encode('utf-8'), user.password_hash.encode('utf-8')):
        return generic_ok

    # Generate a one-time recovery token (valid 1 hour)
    token = _secrets.token_hex(32)
    user.reset_token = f'2fa_recover:{token}'
    user.reset_token_expires = datetime.now(timezone.utc) + timedelta(hours=1)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return generic_ok

    recovery_link = f"{Config.FRONTEND_URL}/2fa-recover?token={token}"
    from utils.email_service import send_2fa_recovery_email
    send_2fa_recovery_email(user.email, recovery_link)

    log_action('2fa_recovery_requested', 'users', str(user.user_id),
               old_data={}, new_data={}, auto_commit=True)

    return generic_ok


@totp_bp.route('/recover/confirm', methods=['POST'])
def confirm_2fa_recovery():
    """
    Disable 2FA using a recovery token from the email link.
    POST /api/totp/recover/confirm
    Body: { "token": "..." }
    """
    data = request.get_json() or {}
    token = (data.get('token') or '').strip()

    if not token:
        return jsonify({'success': False, 'error': 'Recovery token is required'}), 400

    user = User.query.filter_by(reset_token=f'2fa_recover:{token}').first()
    if not user:
        return jsonify({'success': False, 'error': 'Invalid or expired recovery token'}), 400

    now = datetime.now(timezone.utc)
    expires = user.reset_token_expires
    if expires:
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if now > expires:
            return jsonify({'success': False, 'error': 'Recovery token has expired. Please request a new one.'}), 400

    user.totp_enabled = False
    user.totp_secret = None
    user.totp_backup_codes = None
    user.reset_token = None
    user.reset_token_expires = None

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({'success': False, 'error': 'Failed to disable 2FA. Please try again.'}), 500

    log_action('2fa_recovered', 'users', str(user.user_id),
               old_data={'totp_enabled': True}, new_data={'totp_enabled': False}, auto_commit=True)

    return jsonify({
        'success': True,
        'message': '2FA has been disabled. You can now log in with your password.',
    }), 200
