from extensions import db
from database.flexible_types import FlexibleUUID, FlexibleJSON
from datetime import datetime
import uuid


class PermissionPreset(db.Model):
    """
    Stores a per-client, per-role permission preset.
    Auto-saved each time a team member is created with permissions.
    One preset per (client_id, role) — latest creation always overwrites.
    """
    __tablename__ = 'permission_presets'
    __table_args__ = (
        db.UniqueConstraint('client_id', 'role', name='unique_client_role_preset'),
    )

    preset_id = db.Column(FlexibleUUID, primary_key=True, default=uuid.uuid4)
    client_id = db.Column(FlexibleUUID, db.ForeignKey('client_entry.client_id', ondelete='CASCADE'), nullable=False, index=True)
    role = db.Column(db.String(50), nullable=False)
    permissions = db.Column(FlexibleJSON, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by = db.Column(FlexibleUUID, db.ForeignKey('users.user_id', ondelete='SET NULL'), nullable=True)

    def to_dict(self):
        return {
            'preset_id': str(self.preset_id),
            'client_id': str(self.client_id),
            'role': self.role,
            'permissions': self.permissions or [],
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'updated_by': str(self.updated_by) if self.updated_by else None,
        }
