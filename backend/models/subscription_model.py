from extensions import db
from database.flexible_types import FlexibleUUID, FlexibleJSON
from datetime import datetime
import uuid


class SubscriptionPlan(db.Model):
    """Pricing plans for the billing app"""
    __tablename__ = 'subscription_plan'

    plan_id = db.Column(FlexibleUUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(50), nullable=False)
    description = db.Column(db.String(255))
    monthly_price = db.Column(db.Integer, nullable=False)  # Price in currency subunits (99900 = Rs.999 / AED 999)
    yearly_price = db.Column(db.Integer, nullable=False)    # Price in currency subunits
    currency = db.Column(db.String(3), nullable=False, default='INR')  # ISO-4217; plans are shown to clients whose region matches
    features = db.Column(FlexibleJSON)       # List of feature strings
    limits = db.Column(FlexibleJSON)         # {users, bills_per_month, storage_gb}
    is_popular = db.Column(db.Boolean, default=False)
    is_active = db.Column(db.Boolean, default=True)
    display_order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    # Razorpay plan IDs for auto-renewal subscriptions (seeded via admin endpoint)
    razorpay_monthly_plan_id = db.Column(db.String(100), nullable=True)
    razorpay_yearly_plan_id = db.Column(db.String(100), nullable=True)

    def to_dict(self):
        return {
            'plan_id': str(self.plan_id) if self.plan_id else None,
            'name': self.name,
            'description': self.description,
            'monthly_price': self.monthly_price,
            'yearly_price': self.yearly_price,
            'currency': self.currency or 'INR',
            'features': self.features or [],
            'limits': self.limits or {},
            'is_popular': self.is_popular,
            'is_active': self.is_active,
            'display_order': self.display_order,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'razorpay_monthly_plan_id': self.razorpay_monthly_plan_id,
            'razorpay_yearly_plan_id': self.razorpay_yearly_plan_id,
        }


class PaymentTransaction(db.Model):
    """Records every Razorpay payment attempt"""
    __tablename__ = 'payment_transaction'

    transaction_id = db.Column(FlexibleUUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id = db.Column(FlexibleUUID, db.ForeignKey('client_entry.client_id'), nullable=False, index=True)
    plan_id = db.Column(FlexibleUUID, db.ForeignKey('subscription_plan.plan_id'), nullable=False)
    razorpay_order_id = db.Column(db.String(100), index=True)          # order flow (legacy)
    razorpay_subscription_id = db.Column(db.String(100), nullable=True, index=True)  # subscription flow
    invoice_id = db.Column(db.String(100), nullable=True, unique=True)  # unique per invoice — prevents duplicate webhook processing
    invoice_number = db.Column(db.String(100), nullable=True)
    razorpay_payment_id = db.Column(db.String(100))
    razorpay_signature = db.Column(db.String(255))
    amount = db.Column(db.Integer, nullable=False)  # Amount in paise
    currency = db.Column(db.String(3), default='INR')
    billing_cycle = db.Column(db.String(10), nullable=False)  # 'monthly' | 'yearly'
    # status: 'created' | 'authorized' | 'paid' | 'failed' | 'refunded'
    # authorized = signature verified by frontend, waiting for webhook confirmation
    status = db.Column(db.String(20), default='created')
    payment_failure_count = db.Column(db.Integer, default=0)   # tracks Razorpay retry attempts
    last_failure_at = db.Column(db.DateTime, nullable=True)     # timestamp of most recent failure
    notes = db.Column(db.String(255))  # e.g., 'manual_activation'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    paid_at = db.Column(db.DateTime)

    def to_dict(self):
        return {
            'transaction_id': str(self.transaction_id) if self.transaction_id else None,
            'client_id': str(self.client_id) if self.client_id else None,
            'plan_id': str(self.plan_id) if self.plan_id else None,
            'razorpay_order_id': self.razorpay_order_id,
            'razorpay_subscription_id': self.razorpay_subscription_id,
            'invoice_id': self.invoice_id,
            'invoice_number': self.invoice_number,
            'razorpay_payment_id': self.razorpay_payment_id,
            'amount': self.amount,
            'currency': self.currency,
            'billing_cycle': self.billing_cycle,
            'status': self.status,
            'payment_failure_count': self.payment_failure_count or 0,
            'last_failure_at': self.last_failure_at.isoformat() if self.last_failure_at else None,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'paid_at': self.paid_at.isoformat() if self.paid_at else None,
        }
