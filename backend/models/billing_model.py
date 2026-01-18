from extensions import db
from datetime import datetime
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from database.flexible_types import FlexibleUUID, FlexibleJSON, FlexibleNumeric

class GSTBilling(db.Model):
    """GST-enabled billing with percentage calculation"""
    __tablename__ = 'gst_billing'

    # Performance indexes for common query patterns
    __table_args__ = (
        db.Index('idx_gst_client_created', 'client_id', 'created_at'),  # For date range queries
        db.Index('idx_gst_client_billnum', 'client_id', 'bill_number'),  # For bill number lookups
    )

    bill_id = db.Column(FlexibleUUID, primary_key=True)
    client_id = db.Column(FlexibleUUID, db.ForeignKey('client_entry.client_id'), nullable=False, index=True)
    bill_number = db.Column(db.Integer)
    customer_name = db.Column(db.String(255), nullable=True)
    customer_phone = db.Column(db.String(20))
    customer_gstin = db.Column(db.String(15))
    items = db.Column(FlexibleJSON, nullable=False)
    subtotal = db.Column(FlexibleNumeric, nullable=False)
    gst_percentage = db.Column(FlexibleNumeric, nullable=False)
    gst_amount = db.Column(FlexibleNumeric, nullable=False)
    final_amount = db.Column(FlexibleNumeric, nullable=False)
    payment_type = db.Column(db.Text)
    amount_received = db.Column(FlexibleNumeric)
    discount_percentage = db.Column(FlexibleNumeric)
    discount_amount = db.Column(FlexibleNumeric)
    negotiable_amount = db.Column(FlexibleNumeric)
    status = db.Column(db.String(20), default='final')
    created_by = db.Column(FlexibleUUID, db.ForeignKey('users.user_id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    synced_at = db.Column(db.DateTime, nullable=True)  # Phase 1: Track sync to Supabase

    # Relationship to User model
    creator = relationship('User', foreign_keys=[created_by], lazy='joined')

    def to_dict(self):
        return {
            'bill_id': str(self.bill_id) if self.bill_id else None,
            'client_id': str(self.client_id) if self.client_id else None,
            'bill_number': self.bill_number,
            'customer_name': self.customer_name,
            'customer_phone': self.customer_phone,
            'customer_gstin': self.customer_gstin,
            'items': self.items,
            'subtotal': str(self.subtotal),
            'gst_percentage': str(self.gst_percentage),
            'gst_amount': str(self.gst_amount),
            'final_amount': str(self.final_amount),
            'payment_type': self.payment_type,
            'amount_received': str(self.amount_received) if self.amount_received else None,
            'discount_percentage': str(self.discount_percentage) if self.discount_percentage else None,
            'discount_amount': str(self.discount_amount) if self.discount_amount else None,
            'negotiable_amount': str(self.negotiable_amount) if self.negotiable_amount else None,
            'status': self.status,
            'created_by': str(self.created_by) if self.created_by else None,
            'created_by_name': self.creator.full_name if self.creator and self.creator.full_name else (self.creator.email if self.creator else None),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'type': 'gst'
        }


class NonGSTBilling(db.Model):
    """Non-GST billing entries"""
    __tablename__ = 'non_gst_billing'

    # Performance indexes for common query patterns
    __table_args__ = (
        db.Index('idx_nongst_client_created', 'client_id', 'created_at'),  # For date range queries
        db.Index('idx_nongst_client_billnum', 'client_id', 'bill_number'),  # For bill number lookups
    )

    bill_id = db.Column(FlexibleUUID, primary_key=True)
    client_id = db.Column(FlexibleUUID, db.ForeignKey('client_entry.client_id'), nullable=False, index=True)
    bill_number = db.Column(db.Integer)
    customer_name = db.Column(db.String(255), nullable=True)
    customer_phone = db.Column(db.String(20))
    customer_gstin = db.Column(db.String(15))
    items = db.Column(FlexibleJSON, nullable=False)
    total_amount = db.Column(FlexibleNumeric, nullable=False)
    payment_type = db.Column(db.Text)
    amount_received = db.Column(FlexibleNumeric)
    discount_percentage = db.Column(FlexibleNumeric)
    discount_amount = db.Column(FlexibleNumeric)
    negotiable_amount = db.Column(FlexibleNumeric)
    status = db.Column(db.String(20), default='final')
    created_by = db.Column(FlexibleUUID, db.ForeignKey('users.user_id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    synced_at = db.Column(db.DateTime, nullable=True)  # Phase 1: Track sync to Supabase

    # Relationship to User model
    creator = relationship('User', foreign_keys=[created_by], lazy='joined')

    def to_dict(self):
        return {
            'bill_id': str(self.bill_id) if self.bill_id else None,
            'client_id': str(self.client_id) if self.client_id else None,
            'bill_number': self.bill_number,
            'customer_name': self.customer_name,
            'customer_phone': self.customer_phone,
            'customer_gstin': self.customer_gstin,
            'items': self.items,
            'total_amount': str(self.total_amount),
            'payment_type': self.payment_type,
            'amount_received': str(self.amount_received) if self.amount_received else None,
            'discount_percentage': str(self.discount_percentage) if self.discount_percentage else None,
            'discount_amount': str(self.discount_amount) if self.discount_amount else None,
            'negotiable_amount': str(self.negotiable_amount) if self.negotiable_amount else None,
            'status': self.status,
            'created_by': str(self.created_by) if self.created_by else None,
            'created_by_name': self.creator.full_name if self.creator and self.creator.full_name else (self.creator.email if self.creator else None),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'type': 'non_gst'
        }
