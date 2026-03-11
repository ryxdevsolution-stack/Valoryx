"""
TOTP 2FA Blueprint
------------------
Enable, disable, and verify TOTP two-factor authentication.

Endpoints:
  POST /api/totp/setup   — generate secret + QR code for current user
  POST /api/totp/enable  — confirm setup by verifying a code
  POST /api/totp/disable — disable 2FA after verifying current code
"""
import io
import base64
import pyotp
import qrcode

from flask import Blueprint, jsonify, request, g
from extensions import db
from models.user_model import User
from utils.auth_middleware import authenticate
from utils.audit_logger import log_action
from utils.cache_helper import get_cache_manager

totp_bp = Blueprint('totp', __name__)

# TOTP brute-force protection: block after this many failed attempts
TOTP_MAX_FAILURES = 10
# Window (seconds) over which failures are counted before auto-expiry
TOTP_FAIL_WINDOW = 900   # 15 minutes
# How long (seconds) a used code is remembered to prevent replay
TOTP_REPLAY_WINDOW = 90  # 90 seconds — covers the ±1 valid_window (3 × 30 s)


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

    # Generate a new random base32 secret (16-char = 80-bit entropy)
    secret = pyotp.random_base32()
    user.totp_secret = secret
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({'success': False, 'error': 'Failed to save 2FA setup. Please try again.'}), 500

    # Build OTP Auth URI so authenticator apps can parse it
    totp = pyotp.TOTP(secret)
    otp_uri = totp.provisioning_uri(name=user.email, issuer_name='Valoryx')

    # Render QR code as base64-encoded PNG data URI
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

    # --- Brute-force protection ---
    fail_key = f"totp_fail:{user_id}"
    fails = cache.get(fail_key) or 0
    if fails >= TOTP_MAX_FAILURES:
        return jsonify({
            'success': False,
            'error': 'Too many failed attempts. Try again in 15 minutes.',
        }), 429

    # --- Replay protection ---
    replay_key = f"totp_used:{user_id}:{code}"
    if cache.get(replay_key):
        return jsonify({
            'success': False,
            'error': 'Code already used. Wait for the next code.',
        }), 400

    totp = pyotp.TOTP(user.totp_secret)
    # valid_window=1 accepts ±1 time step (90-second window total)
    if not totp.verify(code, valid_window=1):
        cache.set(fail_key, fails + 1, TOTP_FAIL_WINDOW)
        return jsonify({'success': False, 'error': 'Invalid code. Check your authenticator app and try again.'}), 400

    # Successful verify: mark this code as consumed and reset failure counter
    cache.set(replay_key, 1, TOTP_REPLAY_WINDOW)
    cache.delete(fail_key)

    user.totp_enabled = True
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({'success': False, 'error': 'Failed to enable 2FA. Please try again.'}), 500

    log_action('2fa_enabled', 'users', str(user.user_id),
               old_data={}, new_data={'totp_enabled': True}, auto_commit=True)

    return jsonify({'success': True, 'message': '2FA enabled successfully'}), 200


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

    # --- Brute-force protection ---
    fail_key = f"totp_fail:{user_id}"
    fails = cache.get(fail_key) or 0
    if fails >= TOTP_MAX_FAILURES:
        return jsonify({
            'success': False,
            'error': 'Too many failed attempts. Try again in 15 minutes.',
        }), 429

    # --- Replay protection ---
    replay_key = f"totp_used:{user_id}:{code}"
    if cache.get(replay_key):
        return jsonify({
            'success': False,
            'error': 'Code already used. Wait for the next code.',
        }), 400

    totp = pyotp.TOTP(user.totp_secret)
    # valid_window=1 accepts ±1 time step (90-second window total)
    if not totp.verify(code, valid_window=1):
        cache.set(fail_key, fails + 1, TOTP_FAIL_WINDOW)
        return jsonify({'success': False, 'error': 'Invalid code'}), 400

    # Successful verify: mark this code as consumed and reset failure counter
    cache.set(replay_key, 1, TOTP_REPLAY_WINDOW)
    cache.delete(fail_key)

    user.totp_enabled = False
    user.totp_secret = None
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({'success': False, 'error': 'Failed to disable 2FA. Please try again.'}), 500

    log_action('2fa_disabled', 'users', str(user.user_id),
               old_data={'totp_enabled': True}, new_data={'totp_enabled': False}, auto_commit=True)

    return jsonify({'success': True, 'message': '2FA disabled'}), 200
