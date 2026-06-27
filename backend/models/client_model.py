from extensions import db
from database.flexible_types import FlexibleUUID, FlexibleJSON, FlexibleNumeric
from datetime import datetime, timezone
from utils.dt import is_past, utcnow
import uuid

# Default tax configuration for India (GST split into CGST + SGST).
# Used as the fallback when a client has no tax_config and as the wizard's India preset.
DEFAULT_GST_CONFIG = {
    "name": "GST",
    "mode": "split",          # 'split' | 'single' | 'none'
    "default_rate": 18,
    "inclusive": False,
    "components": [
        {"name": "CGST", "ratio": 0.5},
        {"name": "SGST", "ratio": 0.5},
    ],
}

class ClientEntry(db.Model):
    """Master client registration table"""
    __tablename__ = 'client_entry'

    client_id = db.Column(FlexibleUUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    client_name = db.Column(db.String(255), nullable=False, index=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    logo_url = db.Column(db.String(500))
    address = db.Column(db.Text)
    gst_number = db.Column(db.String(15))
    phone = db.Column(db.String(20))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)

    # Trial / Subscription fields
    subscription_status = db.Column(db.String(20), nullable=True)  # 'trial' | 'active' | 'cancelled' | 'expired'
    trial_start_date = db.Column(db.DateTime, nullable=True)
    trial_end_date = db.Column(db.DateTime, nullable=True)
    plan_id = db.Column(FlexibleUUID, nullable=True)
    subscription_end_date = db.Column(db.DateTime, nullable=True)
    razorpay_subscription_id = db.Column(db.String(100), nullable=True)  # set after first invoice.paid webhook
    telegram_chat_id = db.Column(db.String(50), nullable=True)  # Telegram chat ID for daily summary reports
    role_quotas = db.Column(FlexibleJSON, nullable=True)  # {"admin": 1, "manager": 2, "staff": 3, "cashier": 3}; null key = unlimited

    # Shop / Receipt settings
    address2 = db.Column(db.Text, nullable=True)           # secondary address line
    upi_id = db.Column(db.String(100), nullable=True)      # e.g. shop@upi
    receipt_footer = db.Column(db.Text, nullable=True)      # custom footer text on receipts
    points_per_100 = db.Column(db.Integer, nullable=True, default=0)  # loyalty points earned per ₹100 spent

    # Regional customization (country / currency / tax) — collected in first-login setup wizard
    country = db.Column(db.String(2), nullable=True, default='IN')          # ISO-3166 alpha-2, e.g. 'IN', 'AE', 'US'
    currency_code = db.Column(db.String(3), nullable=True, default='INR')   # ISO-4217, e.g. 'INR', 'AED', 'USD'
    currency_symbol = db.Column(db.String(8), nullable=True, default='₹')   # display symbol, e.g. '₹', '$', 'د.إ'
    locale = db.Column(db.String(10), nullable=True, default='en-IN')       # number/date formatting, e.g. 'en-IN', 'en-US'
    tax_config = db.Column(FlexibleJSON, nullable=True)                     # {name, mode, default_rate, inclusive, components:[{name, ratio}]}
    setup_completed_at = db.Column(db.DateTime, nullable=True)             # set when the setup wizard is completed; null => show wizard

    # Apparel label defaults (v13) — applied when per-SKU fields are empty
    label_importer_name = db.Column(db.String(160), nullable=True)
    label_importer_address = db.Column(db.Text, nullable=True)
    label_origin_country = db.Column(db.String(60), nullable=True)
    label_care_phone = db.Column(db.String(20), nullable=True)
    label_care_email = db.Column(db.String(120), nullable=True)

    # Email verification
    email_verified = db.Column(db.Boolean, default=False, nullable=False)
    email_verification_token = db.Column(db.String(64), nullable=True, index=True)
    email_verification_expires = db.Column(db.DateTime, nullable=True)

    # Account deletion / GDPR
    deletion_requested_at = db.Column(db.DateTime, nullable=True)
    deletion_scheduled_at = db.Column(db.DateTime, nullable=True)
    deletion_requested_by = db.Column(db.String(36), nullable=True)
    deletion_reactivation_token = db.Column(db.String(64), nullable=True, index=True)

    @property
    def is_trial_expired(self):
        if self.subscription_status != 'trial' or not self.trial_end_date:
            return False
        return is_past(self.trial_end_date)

    @property
    def trial_days_remaining(self):
        if self.subscription_status != 'trial' or not self.trial_end_date:
            return None
        end = self.trial_end_date
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        return max(0, (end - utcnow()).days)

    @property
    def is_subscription_expired(self):
        """True when status is 'active' and the end date has passed."""
        if self.subscription_status != 'active' or not self.subscription_end_date:
            return False
        return is_past(self.subscription_end_date)

    @property
    def subscription_days_remaining(self):
        """Days until subscription_end_date for active subscriptions. None if not active."""
        if self.subscription_status != 'active' or not self.subscription_end_date:
            return None
        end = self.subscription_end_date
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        return max(0, (end - utcnow()).days)

    # Relationships
    users = db.relationship('User', backref='client', lazy=True, cascade='all, delete-orphan')
    stock_entries = db.relationship('StockEntry', backref='client', lazy=True, cascade='all, delete-orphan')
    gst_bills = db.relationship('GSTBilling', backref='client', lazy=True, cascade='all, delete-orphan')
    non_gst_bills = db.relationship('NonGSTBilling', backref='client', lazy=True, cascade='all, delete-orphan')
    reports = db.relationship('Report', backref='client', lazy=True, cascade='all, delete-orphan')
    audit_logs = db.relationship('AuditLog', backref='client', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'client_id': self.client_id,
            'client_name': self.client_name,
            'email': self.email,
            'logo_url': self.logo_url,
            'address': self.address,
            'gst_number': self.gst_number,
            'phone': self.phone,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'is_active': self.is_active,
            'subscription_status': self.subscription_status,
            'trial_start_date': self.trial_start_date.isoformat() if self.trial_start_date else None,
            'trial_end_date': self.trial_end_date.isoformat() if self.trial_end_date else None,
            'trial_days_remaining': self.trial_days_remaining,
            'subscription_days_remaining': self.subscription_days_remaining,
            'plan_id': str(self.plan_id) if self.plan_id else None,
            'subscription_end_date': self.subscription_end_date.isoformat() if self.subscription_end_date else None,
            'razorpay_subscription_id': self.razorpay_subscription_id,
            'telegram_chat_id': self.telegram_chat_id,
            'address2': self.address2,
            'upi_id': self.upi_id,
            'receipt_footer': self.receipt_footer,
            'points_per_100': self.points_per_100 or 0,
            'country': self.country or 'IN',
            'currency_code': self.currency_code or 'INR',
            'currency_symbol': self.currency_symbol or '₹',
            'locale': self.locale or 'en-IN',
            'tax_config': self.tax_config or DEFAULT_GST_CONFIG,
            'setup_completed_at': self.setup_completed_at.isoformat() if self.setup_completed_at else None,
            'setup_completed': self.setup_completed_at is not None,
            'label_importer_name': self.label_importer_name,
            'label_importer_address': self.label_importer_address,
            'label_origin_country': self.label_origin_country,
            'label_care_phone': self.label_care_phone,
            'label_care_email': self.label_care_email,
            'email_verified': self.email_verified,
            'deletion_scheduled_at': self.deletion_scheduled_at.isoformat() if self.deletion_scheduled_at else None,
            'role_quotas': self.role_quotas or {},
        }
