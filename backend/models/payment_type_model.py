from extensions import db
from datetime import datetime
import pytz
from database.flexible_types import FlexibleUUID


def get_current_time():
    kolkata_tz = pytz.timezone('Asia/Kolkata')
    return datetime.now(kolkata_tz)


class PaymentType(db.Model):
    __tablename__ = 'payment_type'

    payment_type_id = db.Column(FlexibleUUID, primary_key=True)
    client_id = db.Column(FlexibleUUID, db.ForeignKey('client_entry.client_id'), nullable=False, index=True)
    payment_name = db.Column(db.String(100), nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=get_current_time)
    synced_at = db.Column(db.DateTime, nullable=True)

    def to_dict(self):
        return {
            'payment_type_id': str(self.payment_type_id) if self.payment_type_id else None,
            'client_id': str(self.client_id) if self.client_id else None,
            'payment_name': self.payment_name,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
