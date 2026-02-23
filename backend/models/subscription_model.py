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
    monthly_price = db.Column(db.Integer, nullable=False)  # Price in paise (99900 = Rs.999)
    yearly_price = db.Column(db.Integer, nullable=False)    # Price in paise
    features = db.Column(FlexibleJSON)       # List of feature strings
    limits = db.Column(FlexibleJSON)         # {users, bills_per_month, storage_gb}
    is_popular = db.Column(db.Boolean, default=False)
    is_active = db.Column(db.Boolean, default=True)
    display_order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'plan_id': str(self.plan_id) if self.plan_id else None,
            'name': self.name,
            'description': self.description,
            'monthly_price': self.monthly_price,
            'yearly_price': self.yearly_price,
            'features': self.features or [],
            'limits': self.limits or {},
            'is_popular': self.is_popular,
            'is_active': self.is_active,
            'display_order': self.display_order,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class PaymentTransaction(db.Model):
    """Records every Razorpay payment attempt"""
    __tablename__ = 'payment_transaction'

    transaction_id = db.Column(FlexibleUUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id = db.Column(FlexibleUUID, db.ForeignKey('client_entry.client_id'), nullable=False, index=True)
    plan_id = db.Column(FlexibleUUID, db.ForeignKey('subscription_plan.plan_id'), nullable=False)
    razorpay_order_id = db.Column(db.String(100), index=True)
    razorpay_payment_id = db.Column(db.String(100))
    razorpay_signature = db.Column(db.String(255))
    amount = db.Column(db.Integer, nullable=False)  # Amount in paise
    currency = db.Column(db.String(3), default='INR')
    billing_cycle = db.Column(db.String(10), nullable=False)  # 'monthly' | 'yearly'
    status = db.Column(db.String(20), default='created')  # 'created' | 'paid' | 'failed' | 'refunded'
    notes = db.Column(db.String(255))  # e.g., 'manual_activation'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    paid_at = db.Column(db.DateTime)

    def to_dict(self):
        return {
            'transaction_id': str(self.transaction_id) if self.transaction_id else None,
            'client_id': str(self.client_id) if self.client_id else None,
            'plan_id': str(self.plan_id) if self.plan_id else None,
            'razorpay_order_id': self.razorpay_order_id,
            'razorpay_payment_id': self.razorpay_payment_id,
            'amount': self.amount,
            'currency': self.currency,
            'billing_cycle': self.billing_cycle,
            'status': self.status,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'paid_at': self.paid_at.isoformat() if self.paid_at else None,
        }
