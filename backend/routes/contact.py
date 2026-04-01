"""
Public contact form endpoint — no auth required.
Sends the inquiry via SMTP to the configured support email.
"""

import logging
import time
from flask import Blueprint, request, jsonify
from config import Config
from utils.email_service import send_email, _base_layout, _info_table, _info_row

logger = logging.getLogger(__name__)

contact_bp = Blueprint('contact', __name__)

# Simple in-memory rate limiter: IP -> last submission timestamp
_rate_limit: dict[str, float] = {}
RATE_LIMIT_SECONDS = 60  # one submission per minute per IP


@contact_bp.route('', methods=['POST'])
def submit_contact():
    """Handle public contact form submission."""
    # --- Rate limit ---
    ip = request.remote_addr or 'unknown'
    now = time.time()
    last = _rate_limit.get(ip, 0)
    if now - last < RATE_LIMIT_SECONDS:
        return jsonify(success=False, error='Please wait before submitting again.'), 429
    _rate_limit[ip] = now

    # Evict stale entries periodically (keep dict small)
    if len(_rate_limit) > 500:
        cutoff = now - RATE_LIMIT_SECONDS * 2
        _rate_limit.clear()

    # --- Validate input ---
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip()
    phone = (data.get('phone') or '').strip()
    business = (data.get('business') or '').strip()
    message = (data.get('message') or '').strip()

    errors = []
    if not name:
        errors.append('Name is required')
    if not email or '@' not in email:
        errors.append('Valid email is required')
    if not message:
        errors.append('Message is required')
    if errors:
        return jsonify(success=False, error=', '.join(errors)), 400

    # --- Build email ---
    to_email = Config.SMTP_FROM_EMAIL or Config.SMTP_USER
    if not to_email:
        logger.error('[CONTACT] No recipient configured (SMTP_FROM_EMAIL / SMTP_USER)')
        return jsonify(success=False, error='Contact form is temporarily unavailable.'), 503

    subject = f"New Contact Inquiry from {name}"
    body = f"""
        <h2 style="margin:0 0 6px 0;font-size:22px;font-weight:700;color:#111111;">New contact form submission.</h2>
        <p style="margin:0 0 20px 0;color:#555555;">A visitor submitted the contact form on the Valoryx landing page.</p>

        {_info_table(
            _info_row('Name', name, first=True) +
            _info_row('Email', f'<a href="mailto:{email}">{email}</a>') +
            (_info_row('Phone', phone) if phone else '') +
            (_info_row('Business', business) if business else '') +
            _info_row('Message', message)
        )}

        <p style="font-size:13px;color:#888888;margin-top:24px;">
            Reply directly to this email to respond to the inquiry, or email
            <a href="mailto:{email}" style="color:#555555;">{email}</a>.
        </p>
    """

    html = _base_layout(
        preheader=f"Contact inquiry from {name} ({email})",
        body_html=body,
    )

    ok = send_email(to_email, subject, html)
    if not ok:
        return jsonify(success=False, error='Failed to send message. Please try again later.'), 500

    # Also send a confirmation to the visitor
    confirm_body = f"""
        <h2 style="margin:0 0 6px 0;font-size:22px;font-weight:700;color:#111111;">We received your message.</h2>
        <p style="margin:0 0 20px 0;color:#555555;">Hi {name}, thanks for reaching out to Valoryx!</p>

        <p>Our team will review your inquiry and get back to you within 24 hours. Here's a copy of what you sent:</p>

        {_info_table(
            _info_row('Message', message, first=True)
        )}

        <p style="font-size:13px;color:#888888;margin-top:24px;">
            If you need immediate assistance, call us at +91 86672 58008 or +91 63748 53277.
        </p>
    """
    confirm_html = _base_layout(
        preheader="Thanks for contacting Valoryx. We'll get back to you within 24 hours.",
        body_html=confirm_body,
    )
    send_email(email, "Thanks for contacting Valoryx!", confirm_html)

    return jsonify(success=True, message='Message sent successfully! We will get back to you soon.'), 200
