from extensions import db
from datetime import datetime
from sqlalchemy.dialects.postgresql import JSONB

class Expense(db.Model):
    """Daily expense tracking"""
    __tablename__ = 'expense'

    expense_id = db.Column(db.String(36), primary_key=True)
    client_id = db.Column(db.String(36), db.ForeignKey('client_entry.client_id'), nullable=False, index=True)
    category = db.Column(db.String(100), nullable=False)  # e.g., 'rent', 'utilities', 'salary', 'supplies', 'maintenance', 'other'
    description = db.Column(db.Text)
    amount = db.Column(db.Numeric(12, 2), nullable=False)
    expense_date = db.Column(db.Date, nullable=False, index=True)
    payment_method = db.Column(db.String(50))  # e.g., 'cash', 'bank_transfer', 'card'
    receipt_url = db.Column(db.String(500))  # Optional receipt/invoice upload
    notes = db.Column(db.Text)
    extra_data = db.Column(JSONB)  # Additional flexible data
    created_by = db.Column(db.String(36), db.ForeignKey('users.user_id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'expense_id': self.expense_id,
            'client_id': self.client_id,
            'category': self.category,
            'description': self.description,
            'amount': str(self.amount),
            'expense_date': self.expense_date.isoformat() if self.expense_date else None,
            'payment_method': self.payment_method,
            'receipt_url': self.receipt_url,
            'notes': self.notes,
            'extra_data': self.extra_data,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class ExpenseSummary(db.Model):
    """Aggregated expense summaries by time period"""
    __tablename__ = 'expense_summary'

    summary_id = db.Column(db.String(36), primary_key=True)
    client_id = db.Column(db.String(36), db.ForeignKey('client_entry.client_id'), nullable=False, index=True)
    period_type = db.Column(db.String(20), nullable=False)  # 'day', 'week', 'month', 'year'
    period_start = db.Column(db.Date, nullable=False, index=True)
    period_end = db.Column(db.Date, nullable=False)
    total_expenses = db.Column(db.Numeric(12, 2), default=0)
    category_breakdown = db.Column(JSONB)  # {'rent': 5000, 'utilities': 1000, ...}
    expense_count = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'summary_id': self.summary_id,
            'client_id': self.client_id,
            'period_type': self.period_type,
            'period_start': self.period_start.isoformat() if self.period_start else None,
            'period_end': self.period_end.isoformat() if self.period_end else None,
            'total_expenses': str(self.total_expenses),
            'category_breakdown': self.category_breakdown,
            'expense_count': self.expense_count,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
