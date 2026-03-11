import logging
import smtplib
import threading
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders

from config import Config

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Core SMTP utility
# ---------------------------------------------------------------------------

def _is_configured():
    return bool(Config.SMTP_HOST and Config.SMTP_USER and Config.SMTP_PASSWORD)


def send_email(to_email: str, subject: str, html_body: str) -> bool:
    """Send an HTML email via SMTP. Silently skips if SMTP is not configured."""
    if not _is_configured():
        logger.warning('[EMAIL] SMTP not configured — skipping email to %s: %s', to_email, subject)
        return False

    try:
        msg = MIMEMultipart('alternative')
        msg['From'] = f"{Config.SMTP_FROM_NAME} <{Config.SMTP_FROM_EMAIL or Config.SMTP_USER}>"
        msg['To'] = to_email
        msg['Subject'] = subject
        msg.attach(MIMEText(html_body, 'html'))

        with smtplib.SMTP(Config.SMTP_HOST, Config.SMTP_PORT) as server:
            server.starttls()
            server.login(Config.SMTP_USER, Config.SMTP_PASSWORD)
            server.send_message(msg)

        logger.info('[EMAIL] Sent to %s: %s', to_email, subject)
        return True

    except smtplib.SMTPAuthenticationError:
        logger.error('[EMAIL] SMTP authentication failed — check credentials')
        return False
    except smtplib.SMTPConnectError:
        logger.error('[EMAIL] Could not connect to SMTP server %s:%s', Config.SMTP_HOST, Config.SMTP_PORT)
        return False
    except Exception as e:
        logger.error('[EMAIL] Failed to send to %s (%s): %s', to_email, subject, e)
        return False


def _send_async(to_email: str, subject: str, html_body: str):
    """Fire-and-forget — runs send_email in a background daemon thread."""
    t = threading.Thread(target=send_email, args=(to_email, subject, html_body), daemon=True)
    t.start()


def send_email_with_attachment(
    to_email: str,
    subject: str,
    html_body: str,
    attachment_bytes: bytes,
    attachment_filename: str,
    attachment_mime: str = 'application/pdf',
) -> bool:
    """Send an HTML email with a single binary attachment via SMTP."""
    if not _is_configured():
        logger.warning('[EMAIL] SMTP not configured — skipping email to %s: %s', to_email, subject)
        return False

    try:
        msg = MIMEMultipart('mixed')
        msg['From'] = f"{Config.SMTP_FROM_NAME} <{Config.SMTP_FROM_EMAIL or Config.SMTP_USER}>"
        msg['To'] = to_email
        msg['Subject'] = subject

        # HTML body part
        alt = MIMEMultipart('alternative')
        alt.attach(MIMEText(html_body, 'html'))
        msg.attach(alt)

        # Attachment part — guard against malformed MIME type string
        mime_parts = attachment_mime.split('/', 1)
        if len(mime_parts) != 2:
            raise ValueError(f"attachment_mime must be 'type/subtype', got: {attachment_mime!r}")
        part = MIMEBase(*mime_parts)
        part.set_payload(attachment_bytes)
        encoders.encode_base64(part)
        part.add_header('Content-Disposition', 'attachment', filename=attachment_filename)
        msg.attach(part)

        with smtplib.SMTP(Config.SMTP_HOST, Config.SMTP_PORT) as server:
            server.starttls()
            server.login(Config.SMTP_USER, Config.SMTP_PASSWORD)
            server.send_message(msg)

        logger.info('[EMAIL] Sent with attachment to %s: %s', to_email, subject)
        return True

    except smtplib.SMTPAuthenticationError:
        logger.error('[EMAIL] SMTP authentication failed — check credentials')
        return False
    except smtplib.SMTPConnectError:
        logger.error('[EMAIL] Could not connect to SMTP server %s:%s', Config.SMTP_HOST, Config.SMTP_PORT)
        return False
    except Exception as e:
        logger.error('[EMAIL] Failed to send with attachment to %s (%s): %s', to_email, subject, e)
        return False


def _send_async_with_attachment(
    to_email: str,
    subject: str,
    html_body: str,
    attachment_bytes: bytes,
    attachment_filename: str,
    attachment_mime: str = 'application/pdf',
):
    """Fire-and-forget with attachment."""
    t = threading.Thread(
        target=send_email_with_attachment,
        args=(to_email, subject, html_body, attachment_bytes, attachment_filename, attachment_mime),
        daemon=True,
    )
    t.start()


# ---------------------------------------------------------------------------
# Shared layout & helpers
# ---------------------------------------------------------------------------

SUPPORT_EMAIL = Config.SMTP_FROM_EMAIL if hasattr(Config, 'SMTP_FROM_EMAIL') else 'support@valorxy.com'


def _format_price(paise: int) -> str:
    return f"\u20b9{paise / 100:,.0f}"


def _info_row(label: str, value: str, first: bool = False) -> str:
    border = '' if first else 'border-top:1px solid #ebebeb;'
    return (
        f'<tr>'
        f'<td style="padding:11px 20px;font-size:13px;color:#888;{border}white-space:nowrap">{label}</td>'
        f'<td style="padding:11px 20px;font-size:13px;color:#111;font-weight:500;{border}">{value}</td>'
        f'</tr>'
    )


def _base_layout(preheader: str, body_html: str) -> str:
    """
    Single professional wrapper used by every email template.
    Monochrome — dark header bar, white body, light grey footer.
    Contact: support email only (no phone numbers).
    """
    support = Config.SMTP_FROM_EMAIL or 'support@valorxy.com'
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>VALORXY</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <!-- preheader (hidden preview text) -->
  <span style="display:none;max-height:0;overflow:hidden;mso-hide:all">{preheader}&nbsp;</span>

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:6px;overflow:hidden;border:1px solid #e4e4e7;">

        <!-- Header -->
        <tr>
          <td style="background:#111111;padding:24px 32px;">
            <span style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:0.04em;text-transform:uppercase">
              VALORXY
            </span>
            <span style="font-size:12px;color:#888888;margin-left:10px;font-weight:400;letter-spacing:0.06em;text-transform:uppercase">
              Billing
            </span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 32px 28px 32px;color:#222222;font-size:15px;line-height:1.7;">
            {body_html}
          </td>
        </tr>

        <!-- Divider -->
        <tr><td style="padding:0 32px"><hr style="border:none;border-top:1px solid #ebebeb;margin:0"/></td></tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px 28px 32px;">
            <p style="margin:0 0 4px 0;font-size:12px;color:#aaaaaa;">
              This email was sent by <strong style="color:#888">VALORXY Billing</strong>.
            </p>
            <p style="margin:0;font-size:12px;color:#aaaaaa;">
              Questions? Reply to this email or write to
              <a href="mailto:{support}" style="color:#555555;text-decoration:none;">{support}</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _info_table(rows_html: str) -> str:
    return (
        f'<table width="100%" cellpadding="0" cellspacing="0" '
        f'style="background:#f9f9f9;border:1px solid #ebebeb;border-radius:4px;margin:20px 0;">'
        f'{rows_html}'
        f'</table>'
    )


def _primary_button(label: str, url: str) -> str:
    return (
        f'<div style="text-align:center;margin:28px 0">'
        f'<a href="{url}" style="display:inline-block;background:#111111;color:#ffffff;'
        f'padding:13px 32px;border-radius:4px;text-decoration:none;font-size:14px;'
        f'font-weight:600;letter-spacing:0.03em;">{label}</a>'
        f'</div>'
    )


def _alert_box(text: str, kind: str = 'warning') -> str:
    """kind: 'warning' (amber border) | 'info' (grey border)"""
    border = '#d97706' if kind == 'warning' else '#d4d4d8'
    bg = '#fffbeb' if kind == 'warning' else '#fafafa'
    return (
        f'<div style="background:{bg};border-left:3px solid {border};'
        f'padding:12px 16px;border-radius:2px;margin:20px 0;font-size:13px;color:#555555;">'
        f'{text}'
        f'</div>'
    )


# ---------------------------------------------------------------------------
# Auth emails
# ---------------------------------------------------------------------------

def send_welcome_email(to_email: str, client_name: str, trial_end_date: str):
    """Sent when a new account is created via signup."""
    subject = "Welcome to VALORXY Billing — Your free trial has started"
    body = f"""
        <h2 style="margin:0 0 6px 0;font-size:22px;font-weight:700;color:#111111;">Welcome aboard, {client_name}.</h2>
        <p style="margin:0 0 20px 0;color:#555555;">Your VALORXY Billing account has been created successfully.</p>

        <p>You are now on a <strong>14-day free trial</strong> with full access to all features — no credit card required.</p>

        {_info_table(
            _info_row('Account', client_name, first=True) +
            _info_row('Email', to_email) +
            _info_row('Trial ends on', trial_end_date)
        )}

        <p>During your trial you can explore all billing features, manage your stock, generate reports, and invite your team. When you're ready to continue, upgrade from your <strong>Profile → Subscription</strong> page before the trial ends.</p>

        <p style="color:#888888;font-size:13px;margin-top:24px;">
            If you did not create this account, please contact us immediately by replying to this email.
        </p>
    """
    _send_async(to_email, subject, _base_layout(
        preheader=f"Your 14-day free trial has started. Trial ends {trial_end_date}.",
        body_html=body
    ))


def send_login_notification(to_email: str, client_name: str, login_time: str, ip_address: str = ''):
    """Sent when a login is detected from a new/different IP address."""
    subject = "New sign-in detected on your VALORXY account"
    body = f"""
        <h2 style="margin:0 0 6px 0;font-size:22px;font-weight:700;color:#111111;">New sign-in detected.</h2>
        <p style="margin:0 0 20px 0;color:#555555;">A sign-in was recorded from a location we haven't seen before.</p>

        {_info_table(
            _info_row('Account', to_email, first=True) +
            _info_row('Time (UTC)', login_time) +
            _info_row('IP Address', ip_address or 'Unknown')
        )}

        {_alert_box(
            'If this was you, no action is needed. '
            'If you do not recognise this sign-in, please change your password immediately '
            'from <strong>Profile → Security</strong> and contact us by replying to this email.',
            kind='warning'
        )}
    """
    _send_async(to_email, subject, _base_layout(
        preheader="A new sign-in was detected on your account. Review the details.",
        body_html=body
    ))


def send_password_reset_email(to_email: str, client_name: str, reset_link: str):
    """Sent when a user requests a password reset."""
    subject = "Reset your VALORXY Billing password"
    body = f"""
        <h2 style="margin:0 0 6px 0;font-size:22px;font-weight:700;color:#111111;">Password reset request.</h2>
        <p style="margin:0 0 20px 0;color:#555555;">We received a request to reset the password for your account.</p>

        <p>Click the button below to choose a new password. This link is valid for <strong>1 hour</strong> and can only be used once.</p>

        {_primary_button('Reset My Password', reset_link)}

        <p style="font-size:13px;color:#888888;">
            If the button above does not work, copy and paste the following link into your browser:<br/>
            <span style="color:#555555;word-break:break-all">{reset_link}</span>
        </p>

        {_alert_box(
            'If you did not request a password reset, you can safely ignore this email. '
            'Your password will remain unchanged.',
            kind='info'
        )}
    """
    _send_async(to_email, subject, _base_layout(
        preheader="Reset your VALORXY Billing password. Link expires in 1 hour.",
        body_html=body
    ))


def send_password_changed_email(to_email: str, client_name: str, changed_at: str):
    """Sent after a password reset is successfully completed."""
    subject = "Your VALORXY Billing password has been changed"
    body = f"""
        <h2 style="margin:0 0 6px 0;font-size:22px;font-weight:700;color:#111111;">Password updated.</h2>
        <p style="margin:0 0 20px 0;color:#555555;">Your account password was successfully changed.</p>

        {_info_table(
            _info_row('Account', to_email, first=True) +
            _info_row('Changed at (UTC)', changed_at)
        )}

        {_alert_box(
            'If you did not make this change, your account may be compromised. '
            'Please contact us immediately by replying to this email.',
            kind='warning'
        )}
    """
    _send_async(to_email, subject, _base_layout(
        preheader="Your VALORXY Billing password was changed successfully.",
        body_html=body
    ))


# ---------------------------------------------------------------------------
# Account admin emails
# ---------------------------------------------------------------------------

def send_account_deactivated_email(to_email: str, client_name: str):
    """Sent when a user or client account is deactivated by an admin."""
    subject = "Your VALORXY Billing account has been deactivated"
    body = f"""
        <h2 style="margin:0 0 6px 0;font-size:22px;font-weight:700;color:#111111;">Account deactivated.</h2>
        <p style="margin:0 0 20px 0;color:#555555;">Hi {client_name}, your VALORXY Billing account has been deactivated by an administrator.</p>

        <p>You will not be able to sign in while your account is inactive. Your data remains intact and will be available if the account is reactivated.</p>

        {_alert_box(
            'If you believe this was done in error, please reply to this email or contact your administrator directly.',
            kind='info'
        )}
    """
    _send_async(to_email, subject, _base_layout(
        preheader="Your VALORXY Billing account has been deactivated.",
        body_html=body
    ))


def send_account_reactivated_email(to_email: str, client_name: str):
    """Sent when a user or client account is reactivated by an admin."""
    subject = "Your VALORXY Billing account has been reactivated"
    body = f"""
        <h2 style="margin:0 0 6px 0;font-size:22px;font-weight:700;color:#111111;">Account reactivated.</h2>
        <p style="margin:0 0 20px 0;color:#555555;">Hi {client_name}, your VALORXY Billing account has been reactivated.</p>

        <p>You can now sign in and access your account as usual. All your data is intact and ready to use.</p>

        <p style="font-size:13px;color:#888888;margin-top:24px;">
            If you have any questions, reply to this email and we will be happy to help.
        </p>
    """
    _send_async(to_email, subject, _base_layout(
        preheader="Your VALORXY Billing account is active again. You can sign in now.",
        body_html=body
    ))


def send_account_deleted_email(to_email: str, client_name: str):
    """Sent when a client or user account is permanently deleted by an admin."""
    subject = "Your VALORXY Billing account has been removed"
    body = f"""
        <h2 style="margin:0 0 6px 0;font-size:22px;font-weight:700;color:#111111;">Account removed.</h2>
        <p style="margin:0 0 20px 0;color:#555555;">Hi {client_name}, your VALORXY Billing account and all associated data have been permanently removed.</p>

        <p>This action is irreversible. All billing records, stock data, and user information linked to this account have been deleted.</p>

        {_alert_box(
            'If you believe this was done in error, please reply to this email immediately. '
            'While data cannot be recovered once deleted, we can investigate the request.',
            kind='warning'
        )}
    """
    _send_async(to_email, subject, _base_layout(
        preheader="Your VALORXY Billing account has been permanently removed.",
        body_html=body
    ))


# ---------------------------------------------------------------------------
# Subscription emails
# ---------------------------------------------------------------------------

def send_subscription_activated(to_email: str, client_name: str, plan_name: str,
                                 billing_cycle: str, amount: int, end_date: str):
    subject = f"Subscription confirmed — {plan_name} Plan"
    body = f"""
        <h2 style="margin:0 0 6px 0;font-size:22px;font-weight:700;color:#111111;">Subscription confirmed.</h2>
        <p style="margin:0 0 20px 0;color:#555555;">Hi {client_name}, your subscription is now active.</p>

        <p>Thank you for subscribing to VALORXY Billing. Here is a summary of your plan:</p>

        {_info_table(
            _info_row('Plan', plan_name, first=True) +
            _info_row('Billing cycle', billing_cycle.capitalize()) +
            _info_row('Amount', _format_price(amount)) +
            _info_row('Valid until', end_date)
        )}

        <p style="font-size:13px;color:#888888;margin-top:24px;">
            You can manage your subscription at any time from <strong>Profile → Subscription</strong>.
            For billing queries, reply to this email.
        </p>
    """
    _send_async(to_email, subject, _base_layout(
        preheader=f"Your {plan_name} subscription is active. Valid until {end_date}.",
        body_html=body
    ))


def send_subscription_cancelled(to_email: str, client_name: str, plan_name: str,
                                 end_date: str, reason: str = ''):
    subject = "Your VALORXY subscription has been cancelled"
    reason_row = _info_row('Reason', reason) if reason else ''
    body = f"""
        <h2 style="margin:0 0 6px 0;font-size:22px;font-weight:700;color:#111111;">Subscription cancelled.</h2>
        <p style="margin:0 0 20px 0;color:#555555;">Hi {client_name}, your subscription has been cancelled as requested.</p>

        {_info_table(
            _info_row('Plan', plan_name, first=True) +
            _info_row('Access until', end_date) +
            reason_row
        )}

        <p>You will retain full access to all features until <strong>{end_date}</strong>. After that date, your account will revert to the free tier.</p>

        <p style="font-size:13px;color:#888888;margin-top:24px;">
            Changed your mind? You can reactivate your subscription at any time from <strong>Profile → Subscription</strong>.
        </p>
    """
    _send_async(to_email, subject, _base_layout(
        preheader=f"Your subscription has been cancelled. Access continues until {end_date}.",
        body_html=body
    ))


def send_plan_switched(to_email: str, client_name: str, old_plan: str, new_plan: str,
                        billing_cycle: str, amount: int, end_date: str):
    subject = f"Your VALORXY plan has been updated to {new_plan}"
    body = f"""
        <h2 style="margin:0 0 6px 0;font-size:22px;font-weight:700;color:#111111;">Plan updated.</h2>
        <p style="margin:0 0 20px 0;color:#555555;">Hi {client_name}, your subscription plan has been changed successfully.</p>

        {_info_table(
            _info_row('Previous plan', old_plan, first=True) +
            _info_row('New plan', new_plan) +
            _info_row('Billing cycle', billing_cycle.capitalize()) +
            _info_row('Amount', _format_price(amount)) +
            _info_row('Valid until', end_date)
        )}

        <p style="font-size:13px;color:#888888;margin-top:24px;">
            For any questions about your plan or billing, reply to this email.
        </p>
    """
    _send_async(to_email, subject, _base_layout(
        preheader=f"Your plan has changed from {old_plan} to {new_plan}.",
        body_html=body
    ))


def send_subscription_reactivated(to_email: str, client_name: str, plan_name: str,
                                   billing_cycle: str, amount: int, end_date: str):
    subject = f"Subscription reactivated — {plan_name} Plan"
    body = f"""
        <h2 style="margin:0 0 6px 0;font-size:22px;font-weight:700;color:#111111;">Subscription reactivated.</h2>
        <p style="margin:0 0 20px 0;color:#555555;">Hi {client_name}, your subscription is active again.</p>

        <p>Welcome back. Your account has full access to all features.</p>

        {_info_table(
            _info_row('Plan', plan_name, first=True) +
            _info_row('Billing cycle', billing_cycle.capitalize()) +
            _info_row('Amount', _format_price(amount)) +
            _info_row('Valid until', end_date)
        )}

        <p style="font-size:13px;color:#888888;margin-top:24px;">
            You can manage your subscription at any time from <strong>Profile → Subscription</strong>.
        </p>
    """
    _send_async(to_email, subject, _base_layout(
        preheader=f"Your {plan_name} subscription has been reactivated. Valid until {end_date}.",
        body_html=body
    ))


# ---------------------------------------------------------------------------
# Audit report email (PDF attachment)
# ---------------------------------------------------------------------------

def send_invite_email(to_email: str, inviter_name: str, business_name: str, role: str, invite_url: str):
    """Send invite link email to new team member."""
    from html import escape
    safe_inviter = escape(inviter_name)
    safe_business = escape(business_name)
    safe_role = escape(role.capitalize())

    body = f"""
        <h2 style="margin:0 0 6px 0;font-size:22px;font-weight:700;color:#111111;">You have been invited.</h2>
        <p style="margin:0 0 20px 0;color:#555555;">
            <strong>{safe_inviter}</strong> has invited you to join
            <strong>{safe_business}</strong> as a <strong>{safe_role}</strong>.
        </p>

        {_info_table(
            _info_row('Business', safe_business, first=True) +
            _info_row('Role', safe_role) +
            _info_row('Invite expires in', '48 hours')
        )}

        {_primary_button('Accept Invitation &amp; Set Password', invite_url)}

        <p style="font-size:13px;color:#888888;margin-top:24px;">
            If the button above does not work, copy and paste the following link into your browser:<br/>
            <span style="color:#555555;word-break:break-all">{invite_url}</span>
        </p>

        {_alert_box(
            'If you did not expect this invitation, you can safely ignore this email. '
            'This link expires in 48 hours.',
            kind='info'
        )}
    """
    _send_async(to_email, f'You have been invited to join {business_name}', _base_layout(
        preheader=f"You have been invited to join {business_name} as {role.capitalize()}. Link expires in 48 hours.",
        body_html=body,
    ))


def send_audit_report_email(
    to_email: str,
    client_name: str,
    start_date: str,
    end_date: str,
    total_bills: int,
    grand_total: str,
    pdf_bytes: bytes,
    is_trial: bool = False,
    sent_by: str = '',
) -> bool | None:
    """
    Send audit/GST report as a PDF attachment.
    Returns False immediately if SMTP is not configured.
    Otherwise queues a background thread and returns None (fire-and-forget).
    """
    if not _is_configured():
        logger.warning('[EMAIL] SMTP not configured — audit report to %s dropped', to_email)
        return False

    trial_note = (
        _alert_box(
            'This report was generated from a <strong>trial account</strong>. '
            'The PDF includes a TRIAL watermark. Upgrade your subscription to remove it.',
            kind='warning',
        )
        if is_trial else ''
    )

    sent_by_row = _info_row('Sent by', sent_by) if sent_by else ''

    subject = f"GST Bills Report — {start_date} to {end_date} | {client_name}"
    body = f"""
        <h2 style="margin:0 0 6px 0;font-size:22px;font-weight:700;color:#111111;">Audit report attached.</h2>
        <p style="margin:0 0 20px 0;color:#555555;">
            Please find the GST bills report for <strong>{client_name}</strong> attached to this email.
        </p>

        {_info_table(
            _info_row('Business', client_name, first=True) +
            _info_row('Period', f"{start_date} to {end_date}") +
            _info_row('Total bills', str(total_bills)) +
            _info_row('Grand total', grand_total) +
            sent_by_row
        )}

        {trial_note}

        <p style="font-size:13px;color:#888888;margin-top:24px;">
            The attached PDF contains the complete GST bills detail for the selected period.
            If you have questions about this report, reply to this email.
        </p>
    """

    # Sanitize dates for use in filename
    safe_start = start_date.replace('/', '-').replace('\\', '')
    safe_end = end_date.replace('/', '-').replace('\\', '')
    filename = f"GST_Bills_{safe_start}_to_{safe_end}.pdf"

    _send_async_with_attachment(
        to_email=to_email,
        subject=subject,
        html_body=_base_layout(
            preheader=f"GST report for {client_name} — {start_date} to {end_date}. {total_bills} bills.",
            body_html=body,
        ),
        attachment_bytes=pdf_bytes,
        attachment_filename=filename,
        attachment_mime='application/pdf',
    )


def send_verification_email(to_email: str, business_name: str, verify_link: str):
    """Send email verification link after signup."""
    subject = "Verify your Valoryx account"
    html = _base_layout(
        preheader="Please verify your email address to activate your account.",
        body_html=f"""
        <h2 style="color:#1a1a2e;margin:0 0 16px">Verify your email address</h2>
        <p style="color:#444;line-height:1.6">
            Thanks for signing up, <strong>{business_name}</strong>!<br>
            Please verify your email address to activate your account.
        </p>
        <div style="text-align:center;margin:32px 0">
            <a href="{verify_link}"
               style="background:#4f46e5;color:#fff;padding:14px 32px;border-radius:8px;
                      text-decoration:none;font-weight:600;display:inline-block">
                Verify Email Address
            </a>
        </div>
        <p style="color:#888;font-size:13px">
            This link expires in 24 hours. If you didn't sign up, ignore this email.
        </p>
        <p style="color:#888;font-size:12px;word-break:break-all">
            Or copy this link: {verify_link}
        </p>
    """)
    _send_async(to_email, subject, html)


def send_account_deletion_scheduled_email(to_email: str, business_name: str, deletion_date: str, reactivation_link: str):
    """Notify client that account deletion has been scheduled."""
    subject = "Your Valoryx account is scheduled for deletion"
    html = _base_layout(
        preheader=f"Your account will be permanently deleted on {deletion_date}.",
        body_html=f"""
        <h2 style="color:#dc2626;margin:0 0 16px">Account Deletion Scheduled</h2>
        <p style="color:#444;line-height:1.6">
            Your account <strong>{business_name}</strong> has been scheduled for permanent deletion on
            <strong>{deletion_date}</strong>.
        </p>
        <p style="color:#444;line-height:1.6">
            All your data including bills, stock, customers, and users will be permanently removed.
        </p>
        <div style="text-align:center;margin:32px 0">
            <a href="{reactivation_link}"
               style="background:#16a34a;color:#fff;padding:14px 32px;border-radius:8px;
                      text-decoration:none;font-weight:600;display:inline-block">
                Cancel Deletion — Keep My Account
            </a>
        </div>
        <p style="color:#888;font-size:13px">
            This cancellation link is valid until {deletion_date}.
        </p>
    """)
    _send_async(to_email, subject, html)


def send_deletion_cancelled_email(to_email: str, business_name: str):
    """Notify client that account deletion was cancelled (30-day grace period reactivation)."""
    subject = "Your Valoryx account has been reactivated"
    html = _base_layout(
        preheader="Your account has been successfully reactivated.",
        body_html=f"""
        <h2 style="color:#16a34a;margin:0 0 16px">Account Reactivated</h2>
        <p style="color:#444;line-height:1.6">
            Great news! Your account <strong>{business_name}</strong> has been successfully reactivated.
            All your data is safe. You can log in now.
        </p>
    """)
    _send_async(to_email, subject, html)


def send_webhook_disabled_email(to_email: str, business_name: str, webhook_url: str):
    """Notify client that a webhook was auto-disabled due to repeated failures."""
    subject = "Valoryx webhook disabled due to repeated failures"
    html = _base_layout(
        preheader="A webhook endpoint has been disabled after 3 consecutive failures.",
        body_html=f"""
        <h2 style="color:#dc2626;margin:0 0 16px">Webhook Disabled</h2>
        <p style="color:#444;line-height:1.6">
            The webhook endpoint for <strong>{business_name}</strong> has been automatically disabled
            after 3 consecutive delivery failures:
        </p>
        <p style="color:#444;font-family:monospace;background:#f5f5f5;padding:8px;border-radius:4px">
            {webhook_url}
        </p>
        <p style="color:#444;line-height:1.6">
            Please check that your endpoint is reachable and returns a 2xx response,
            then re-enable it from your Profile → Webhooks settings.
        </p>
    """)
    _send_async(to_email, subject, html)
