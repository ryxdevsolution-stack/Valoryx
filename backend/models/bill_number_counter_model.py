from extensions import db
from datetime import datetime


class BillNumberCounter(db.Model):
    __tablename__ = 'bill_number_counters'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    client_id = db.Column(db.String(50), nullable=False, unique=True)
    current_gst_bill_number = db.Column(db.Integer, nullable=False, default=0)
    current_non_gst_bill_number = db.Column(db.Integer, nullable=False, default=0)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
