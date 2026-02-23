from extensions import db
from datetime import datetime
from database.flexible_types import FlexibleUUID


class Branch(db.Model):
    """Physical branch/location for a client"""
    __tablename__ = 'branches'

    __table_args__ = (
        db.Index('idx_branches_client', 'client_id'),
    )

    branch_id = db.Column(FlexibleUUID, primary_key=True)
    client_id = db.Column(FlexibleUUID, db.ForeignKey('client_entry.client_id'), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    location = db.Column(db.String(500), nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'branch_id': str(self.branch_id) if self.branch_id else None,
            'client_id': str(self.client_id) if self.client_id else None,
            'name': self.name,
            'location': self.location,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
