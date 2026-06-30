from extensions import db
from datetime import datetime
import pytz
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from database.flexible_types import FlexibleUUID, FlexibleJSON, FlexibleNumeric

def get_current_time():
    """Returns current datetime in Asia/Kolkata timezone"""
    kolkata_tz = pytz.timezone('Asia/Kolkata')
    return datetime.now(kolkata_tz)

class GSTBilling(db.Model):
    """GST-enabled billing with percentage calculation"""
    __tablename__ = 'gst_billing'

    # Performance indexes for common query patterns
    __table_args__ = (
        db.Index('idx_gst_client_created', 'client_id', 'created_at'),  # For date range queries
        db.Index('idx_gst_client_billnum', 'client_id', 'bill_number'),  # For bill number lookups
        db.Index('idx_gst_client_createdby', 'client_id', 'created_by'),  # For permission-based filtering
        db.Index('idx_gst_client_phone', 'client_id', 'customer_phone'),  # For customer detail lookups
        db.Index('idx_gst_client_payment', 'client_id', 'payment_type'),  # For payment breakdown queries
    )

    bill_id = db.Column(FlexibleUUID, primary_key=True)
    client_id = db.Column(FlexibleUUID, db.ForeignKey('client_entry.client_id'), nullable=False, index=True)
    bill_number = db.Column(db.Integer)
    customer_name = db.Column(db.String(255), nullable=True)
    customer_phone = db.Column(db.String(20))
    customer_gstin = db.Column(db.String(15))
    items = db.Column(FlexibleJSON, nullable=False)
    audit_overrides = db.Column(FlexibleJSON, nullable=True)  # Audit annotation (corrected items); does NOT alter original `items`
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
    payment_status = db.Column(db.String(20), default='paid')  # 'paid' | 'pending'
    # Regional snapshot — frozen at creation so historical receipts stay correct
    # even if the client later changes currency or tax config.
    currency_code = db.Column(db.String(3), nullable=True)        # e.g. 'INR', 'AED'
    tax_breakdown = db.Column(FlexibleJSON, nullable=True)        # [{name, amount}] resolved from tax_config
    created_by = db.Column(FlexibleUUID, db.ForeignKey('users.user_id'))
    created_at = db.Column(db.DateTime, default=get_current_time)
    updated_at = db.Column(db.DateTime, default=get_current_time, onupdate=get_current_time)
    customer_id = db.Column(db.String(36), nullable=True)
    customer_email = db.Column(db.String(255), nullable=True)
    customer_address = db.Column(db.Text, nullable=True)
    synced_at = db.Column(db.DateTime, nullable=True)  # Phase 1: Track sync to Supabase
    bill_prefix = db.Column(db.String(8), nullable=True)  # Offline device code; NULL on web

    # lazy='select' — prevents silent JOIN on every COUNT/SUM/aggregate query
    creator = relationship('User', foreign_keys=[created_by], lazy='select')

    def to_dict(self):
        return {
            'bill_id': str(self.bill_id) if self.bill_id else None,
            'client_id': str(self.client_id) if self.client_id else None,
            'bill_number': self.bill_number,
            'bill_prefix': self.bill_prefix,
            'bill_no_display': f"{self.bill_prefix}-{self.bill_number}" if self.bill_prefix else (
                str(self.bill_number) if self.bill_number is not None else None),
            'customer_name': self.customer_name,
            'customer_phone': self.customer_phone,
            'customer_gstin': self.customer_gstin,
            'items': self.items,
            'audit_overrides': self.audit_overrides,
            'subtotal': str(self.subtotal),
            'gst_percentage': str(self.gst_percentage),
            'gst_amount': str(self.gst_amount),
            'final_amount': str(self.final_amount),
            'currency_code': self.currency_code,
            'tax_breakdown': self.tax_breakdown,
            'payment_type': self.payment_type,
            'amount_received': str(self.amount_received) if self.amount_received else None,
            'discount_percentage': str(self.discount_percentage) if self.discount_percentage else None,
            'discount_amount': str(self.discount_amount) if self.discount_amount else None,
            'negotiable_amount': str(self.negotiable_amount) if self.negotiable_amount else None,
            'status': self.status,
            'payment_status': self.payment_status or 'paid',
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
        db.Index('idx_nongst_client_createdby', 'client_id', 'created_by'),  # For permission-based filtering
        db.Index('idx_nongst_client_phone', 'client_id', 'customer_phone'),  # For customer detail lookups
        db.Index('idx_nongst_client_payment', 'client_id', 'payment_type'),  # For payment breakdown queries
    )

    bill_id = db.Column(FlexibleUUID, primary_key=True)
    client_id = db.Column(FlexibleUUID, db.ForeignKey('client_entry.client_id'), nullable=False, index=True)
    bill_number = db.Column(db.Integer)
    customer_name = db.Column(db.String(255), nullable=True)
    customer_phone = db.Column(db.String(20))
    customer_gstin = db.Column(db.String(15))
    items = db.Column(FlexibleJSON, nullable=False)
    audit_overrides = db.Column(FlexibleJSON, nullable=True)  # Audit annotation (corrected items); does NOT alter original `items`
    total_amount = db.Column(FlexibleNumeric, nullable=False)
    payment_type = db.Column(db.Text)
    amount_received = db.Column(FlexibleNumeric)
    discount_percentage = db.Column(FlexibleNumeric)
    discount_amount = db.Column(FlexibleNumeric)
    negotiable_amount = db.Column(FlexibleNumeric)
    status = db.Column(db.String(20), default='final')
    payment_status = db.Column(db.String(20), default='paid')  # 'paid' | 'pending'
    # Regional snapshot — frozen at creation (currency only; non-GST has no tax block)
    currency_code = db.Column(db.String(3), nullable=True)        # e.g. 'INR', 'AED'
    created_by = db.Column(FlexibleUUID, db.ForeignKey('users.user_id'))
    created_at = db.Column(db.DateTime, default=get_current_time)
    updated_at = db.Column(db.DateTime, default=get_current_time, onupdate=get_current_time)
    customer_id = db.Column(db.String(36), nullable=True)
    customer_email = db.Column(db.String(255), nullable=True)
    customer_address = db.Column(db.Text, nullable=True)
    synced_at = db.Column(db.DateTime, nullable=True)  # Phase 1: Track sync to Supabase
    bill_prefix = db.Column(db.String(8), nullable=True)  # Offline device code; NULL on web

    # lazy='select' — prevents silent JOIN on every COUNT/SUM/aggregate query
    creator = relationship('User', foreign_keys=[created_by], lazy='select')

    def to_dict(self):
        return {
            'bill_id': str(self.bill_id) if self.bill_id else None,
            'client_id': str(self.client_id) if self.client_id else None,
            'bill_number': self.bill_number,
            'bill_prefix': self.bill_prefix,
            'bill_no_display': f"{self.bill_prefix}-{self.bill_number}" if self.bill_prefix else (
                str(self.bill_number) if self.bill_number is not None else None),
            'customer_name': self.customer_name,
            'customer_phone': self.customer_phone,
            'customer_gstin': self.customer_gstin,
            'items': self.items,
            'audit_overrides': self.audit_overrides,
            'total_amount': str(self.total_amount),
            'currency_code': self.currency_code,
            'payment_type': self.payment_type,
            'amount_received': str(self.amount_received) if self.amount_received else None,
            'discount_percentage': str(self.discount_percentage) if self.discount_percentage else None,
            'discount_amount': str(self.discount_amount) if self.discount_amount else None,
            'negotiable_amount': str(self.negotiable_amount) if self.negotiable_amount else None,
            'status': self.status,
            'payment_status': self.payment_status or 'paid',
            'created_by': str(self.created_by) if self.created_by else None,
            'created_by_name': self.creator.full_name if self.creator and self.creator.full_name else (self.creator.email if self.creator else None),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'type': 'non_gst'
        }
