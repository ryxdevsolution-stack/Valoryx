import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from config import Config


def _is_configured():
    return bool(Config.SMTP_HOST and Config.SMTP_USER and Config.SMTP_PASSWORD)


def send_email(to_email, subject, html_body):
    """Send an HTML email via SMTP. Silently skips if SMTP is not configured."""
    if not _is_configured():
        print(f"[EMAIL] SMTP not configured — skipping email to {to_email}: {subject}")
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

        print(f"[EMAIL] Sent to {to_email}: {subject}")
        return True
    except Exception as e:
        print(f"[EMAIL ERROR] Failed to send to {to_email}: {e}")
        return False


def _format_price(paise):
    """Format paise amount to INR string"""
    return f"\u20b9{paise / 100:,.0f}"


def send_subscription_activated(to_email, client_name, plan_name, billing_cycle, amount, end_date):
    subject = f"Subscription Activated - {plan_name} Plan"
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h2 style="color:#059669">Subscription Activated!</h2>
        <p>Hi {client_name},</p>
        <p>Your subscription has been successfully activated. Here are the details:</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0">
            <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280">Plan</td>
                <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600">{plan_name}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280">Billing</td>
                <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600">{billing_cycle.capitalize()}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280">Amount</td>
                <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600">{_format_price(amount)}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280">Valid Until</td>
                <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600">{end_date}</td></tr>
        </table>
        <p>Thank you for choosing RYX Billing!</p>
        <p style="color:#9ca3af;font-size:12px">— RYX Billing Team</p>
    </div>
    """
    return send_email(to_email, subject, html)


def send_subscription_cancelled(to_email, client_name, plan_name, end_date, reason=''):
    subject = "Subscription Cancelled"
    reason_row = ''
    if reason:
        reason_row = f"""
            <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280">Reason</td>
                <td style="padding:8px;border-bottom:1px solid #e5e7eb">{reason}</td></tr>"""
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h2 style="color:#dc2626">Subscription Cancelled</h2>
        <p>Hi {client_name},</p>
        <p>Your <strong>{plan_name}</strong> subscription has been cancelled.</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0">
            <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280">Plan</td>
                <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600">{plan_name}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280">Access Until</td>
                <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600">{end_date}</td></tr>{reason_row}
        </table>
        <p>You can continue using all features until <strong>{end_date}</strong>. After that, your account will switch to the free tier.</p>
        <p>You can reactivate your subscription anytime from your Profile page.</p>
        <p style="color:#9ca3af;font-size:12px">— RYX Billing Team</p>
    </div>
    """
    return send_email(to_email, subject, html)


def send_plan_switched(to_email, client_name, old_plan, new_plan, billing_cycle, amount, end_date):
    subject = f"Plan Changed to {new_plan}"
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h2 style="color:#2563eb">Plan Updated</h2>
        <p>Hi {client_name},</p>
        <p>Your subscription plan has been changed:</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0">
            <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280">Previous Plan</td>
                <td style="padding:8px;border-bottom:1px solid #e5e7eb">{old_plan}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280">New Plan</td>
                <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600">{new_plan}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280">Billing</td>
                <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600">{billing_cycle.capitalize()}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280">Amount</td>
                <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600">{_format_price(amount)}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280">Valid Until</td>
                <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600">{end_date}</td></tr>
        </table>
        <p>Thank you for staying with RYX Billing!</p>
        <p style="color:#9ca3af;font-size:12px">— RYX Billing Team</p>
    </div>
    """
    return send_email(to_email, subject, html)


def send_subscription_reactivated(to_email, client_name, plan_name, billing_cycle, amount, end_date):
    subject = f"Subscription Reactivated - {plan_name} Plan"
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h2 style="color:#059669">Welcome Back!</h2>
        <p>Hi {client_name},</p>
        <p>Your subscription has been reactivated. Here are the details:</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0">
            <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280">Plan</td>
                <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600">{plan_name}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280">Billing</td>
                <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600">{billing_cycle.capitalize()}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280">Amount</td>
                <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600">{_format_price(amount)}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280">Valid Until</td>
                <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600">{end_date}</td></tr>
        </table>
        <p>We're glad to have you back!</p>
        <p style="color:#9ca3af;font-size:12px">— RYX Billing Team</p>
    </div>
    """
    return send_email(to_email, subject, html)
