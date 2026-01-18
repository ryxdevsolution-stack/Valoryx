from extensions import db
from database.flexible_types import FlexibleUUID, FlexibleJSON, FlexibleNumeric
from datetime import datetime
import uuid

class ClientEntry(db.Model):
    """Master client registration table"""
    __tablename__ = 'client_entry'

    client_id = db.Column(FlexibleUUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    client_name = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    logo_url = db.Column(db.String(500))
    address = db.Column(db.Text)
    gst_number = db.Column(db.String(15))
    phone = db.Column(db.String(20))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)

    # Relationships
    users = db.relationship('User', backref='client', lazy=True, cascade='all, delete-orphan')
    stock_entries = db.relationship('StockEntry', backref='client', lazy=True, cascade='all, delete-orphan')
    gst_bills = db.relationship('GSTBilling', backref='client', lazy=True, cascade='all, delete-orphan')
    non_gst_bills = db.relationship('NonGSTBilling', backref='client', lazy=True, cascade='all, delete-orphan')
    payment_types = db.relationship('PaymentType', backref='client', lazy=True, cascade='all, delete-orphan')
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
            'is_active': self.is_active
        }
