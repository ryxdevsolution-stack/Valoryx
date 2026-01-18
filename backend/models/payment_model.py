from extensions import db
from database.flexible_types import FlexibleUUID, FlexibleJSON, FlexibleNumeric

class PaymentType(db.Model):
    """Payment method configuration per client"""
    __tablename__ = 'payment_type'

    payment_type_id = db.Column(FlexibleUUID, primary_key=True)
    client_id = db.Column(FlexibleUUID, db.ForeignKey('client_entry.client_id'), nullable=False, index=True)
    payment_name = db.Column(db.String(50), nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime)

    def to_dict(self):
        return {
            'payment_type_id': self.payment_type_id,
            'client_id': self.client_id,
            'payment_name': self.payment_name,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
