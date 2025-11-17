from extensions import db
from datetime import datetime

class Customer(db.Model):
    """Customer master data table"""
    __tablename__ = 'customer'

    customer_id = db.Column(db.String(36), primary_key=True)
    client_id = db.Column(db.String(36), db.ForeignKey('client_entry.client_id'), nullable=False, index=True)
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
    total_spent = db.Column(db.Numeric(15, 2), default=0.00)
    last_purchase_date = db.Column(db.DateTime)
    first_purchase_date = db.Column(db.DateTime)
    status = db.Column(db.String(20), default='active')
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

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
            'last_purchase_date': self.last_purchase_date.isoformat() if self.last_purchase_date else None,
            'first_purchase_date': self.first_purchase_date.isoformat() if self.first_purchase_date else None,
            'status': self.status,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
