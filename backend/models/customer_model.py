from extensions import db
from database.flexible_types import FlexibleUUID, FlexibleJSON, FlexibleNumeric
from datetime import datetime
import pytz

def get_current_time():
    """Returns current datetime in Asia/Kolkata timezone"""
    kolkata_tz = pytz.timezone('Asia/Kolkata')
    return datetime.now(kolkata_tz)

class Customer(db.Model):
    """Customer master data table"""
    __tablename__ = 'customer'

    __table_args__ = (
        db.Index('idx_customer_client_phone', 'client_id', 'customer_phone'),  # For phone lookups
        db.Index('idx_customer_client_status', 'client_id', 'status'),  # For active/inactive filtering
    )

    customer_id = db.Column(FlexibleUUID, primary_key=True)
    client_id = db.Column(FlexibleUUID, db.ForeignKey('client_entry.client_id'), nullable=False, index=True)
    customer_code = db.Column(db.Integer, unique=True, index=True)
    customer_name = db.Column(db.String(255), nullable=False)
    customer_phone = db.Column(db.String(20), nullable=False)
    customer_email = db.Column(db.String(255))
    customer_address = db.Column(db.Text)
    customer_gstin = db.Column(db.String(15))
    customer_city = db.Column(db.String(100))
    customer_state = db.Column(db.String(100))
    customer_pincode = db.Column(db.String(10))
    total_bills = db.Column(db.Integer, default=0)
    total_spent = db.Column(FlexibleNumeric, default=0.00)
    loyalty_points = db.Column(db.Integer, default=0)  # accumulated loyalty points
    last_purchase_date = db.Column(db.DateTime)
    first_purchase_date = db.Column(db.DateTime)
    status = db.Column(db.String(20), default='active')
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=get_current_time)
    updated_at = db.Column(db.DateTime, default=get_current_time, onupdate=get_current_time)
    synced_at = db.Column(db.DateTime, nullable=True)  # Track sync to Supabase

    def to_dict(self):
        return {
            'customer_id': self.customer_id,
            'client_id': self.client_id,
            'customer_code': self.customer_code,
            'customer_name': self.customer_name,
            'customer_phone': self.customer_phone,
            'customer_email': self.customer_email,
            'customer_address': self.customer_address,
            'customer_gstin': self.customer_gstin,
            'customer_city': self.customer_city,
            'customer_state': self.customer_state,
            'customer_pincode': self.customer_pincode,
            'total_bills': self.total_bills,
            'total_spent': str(self.total_spent) if self.total_spent else '0.00',
            'loyalty_points': self.loyalty_points or 0,
            'last_purchase_date': self.last_purchase_date.isoformat() if self.last_purchase_date else None,
            'first_purchase_date': self.first_purchase_date.isoformat() if self.first_purchase_date else None,
            'status': self.status,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
