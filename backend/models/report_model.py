from extensions import db
from database.flexible_types import FlexibleUUID, FlexibleJSON, FlexibleNumeric
from datetime import datetime
from sqlalchemy.dialects.postgresql import JSONB

class Report(db.Model):
    """Auto-generated summary reports"""
    __tablename__ = 'report'

    report_id = db.Column(FlexibleUUID, primary_key=True)
    client_id = db.Column(FlexibleUUID, db.ForeignKey('client_entry.client_id'), nullable=False, index=True)
    report_type = db.Column(db.String(50), nullable=False)
    date_from = db.Column(db.Date, nullable=False)
    date_to = db.Column(db.Date, nullable=False)
    total_gst_bills = db.Column(db.Integer, default=0)
    total_non_gst_bills = db.Column(db.Integer, default=0)
    total_gst_amount = db.Column(FlexibleNumeric, default=0)
    total_non_gst_amount = db.Column(FlexibleNumeric, default=0)
    total_revenue = db.Column(FlexibleNumeric, default=0)
    payment_breakdown = db.Column(FlexibleJSON)
    file_url = db.Column(db.String(500))
    generated_by = db.Column(FlexibleUUID, db.ForeignKey('users.user_id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'report_id': self.report_id,
            'client_id': self.client_id,
            'report_type': self.report_type,
            'date_from': self.date_from.isoformat() if self.date_from else None,
            'date_to': self.date_to.isoformat() if self.date_to else None,
            'total_gst_bills': self.total_gst_bills,
            'total_non_gst_bills': self.total_non_gst_bills,
            'total_gst_amount': str(self.total_gst_amount),
            'total_non_gst_amount': str(self.total_non_gst_amount),
            'total_revenue': str(self.total_revenue),
            'payment_breakdown': self.payment_breakdown,
            'file_url': self.file_url,
            'generated_by': self.generated_by,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
