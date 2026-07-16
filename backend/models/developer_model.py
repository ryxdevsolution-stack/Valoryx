import uuid
from datetime import datetime
from extensions import db
from database.flexible_types import FlexibleUUID


class Developer(db.Model):
    """External dev/partner registered to get API access and provision clients."""
    __tablename__ = 'developers'

    dev_id = db.Column(FlexibleUUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    company = db.Column(db.String(255))
    phone = db.Column(db.String(20))
    status = db.Column(db.String(20), nullable=False, default='pending', index=True)  # pending | approved | suspended
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    approved_at = db.Column(db.DateTime, nullable=True)

    def to_dict(self):
        return {
            'dev_id': str(self.dev_id) if self.dev_id else None,
            'name': self.name,
            'email': self.email,
            'company': self.company,
            'phone': self.phone,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'approved_at': self.approved_at.isoformat() if self.approved_at else None,
        }
