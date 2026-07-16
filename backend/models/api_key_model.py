import uuid
from datetime import datetime
from extensions import db
from database.flexible_types import FlexibleUUID


class ApiKey(db.Model):
    """External API key. Either dev-level (client_provisioning) or client-level (stock_management) —
    never both on one row, enforced by api_keys_owner_check at the DB level."""
    __tablename__ = 'api_keys'

    api_key_id = db.Column(FlexibleUUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id = db.Column(FlexibleUUID, db.ForeignKey('client_entry.client_id', ondelete='CASCADE'), nullable=True, index=True)
    dev_id = db.Column(FlexibleUUID, db.ForeignKey('developers.dev_id', ondelete='CASCADE'), nullable=True, index=True)

    key_hash = db.Column(db.String(255), nullable=False, index=True)
    key_prefix = db.Column(db.String(20), nullable=False)
    label = db.Column(db.String(255), nullable=True)
    scope = db.Column(db.String(50), nullable=False, default='stock_management')

    is_active = db.Column(db.Boolean, default=True)
    last_used_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    revoked_at = db.Column(db.DateTime, nullable=True)

    def to_dict(self):
        return {
            'api_key_id': str(self.api_key_id) if self.api_key_id else None,
            'client_id': str(self.client_id) if self.client_id else None,
            'dev_id': str(self.dev_id) if self.dev_id else None,
            'key_prefix': self.key_prefix,
            'label': self.label,
            'scope': self.scope,
            'is_active': self.is_active,
            'last_used_at': self.last_used_at.isoformat() if self.last_used_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'revoked_at': self.revoked_at.isoformat() if self.revoked_at else None,
        }
