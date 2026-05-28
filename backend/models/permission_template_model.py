"""SQLAlchemy model for the permission_templates table (Migration v22).

Stores custom (user-defined) permission templates that super admins can save
from the CreateClient page and reuse across new client onboardings.

- Shared across all super admins (no client_id scoping).
- Soft delete via deleted_at column.
- permissions stored as JSON-encoded list of permission_name strings.
"""
import json
import uuid
from datetime import datetime

from extensions import db
from database.flexible_types import FlexibleUUID


class PermissionTemplate(db.Model):
    __tablename__ = 'permission_templates'

    template_id = db.Column(FlexibleUUID, primary_key=True, default=uuid.uuid4)
    name        = db.Column(db.String(40), nullable=False)
    description = db.Column(db.String(200), nullable=True)
    permissions = db.Column(db.Text, nullable=False)  # JSON-encoded list[str]
    created_by  = db.Column(FlexibleUUID, db.ForeignKey('users.user_id'), nullable=False)
    created_at  = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at  = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    deleted_at  = db.Column(db.DateTime, nullable=True)

    @property
    def permissions_list(self) -> list[str]:
        """Decode the JSON-encoded permissions column. Returns [] if invalid."""
        try:
            data = json.loads(self.permissions) if self.permissions else []
            return data if isinstance(data, list) else []
        except (json.JSONDecodeError, TypeError):
            return []

    def to_dict(self, created_by_email: str | None = None) -> dict:
        """Serialize to API response shape.

        created_by_email is passed in (rather than joined inside the model) so
        the caller can fetch all emails in a single batch query instead of N+1.
        """
        return {
            'template_id':       str(self.template_id),
            'name':              self.name,
            'description':       self.description or '',
            'permissions':       self.permissions_list,
            'is_custom':         True,
            'business_type':     'custom',
            'created_by':        str(self.created_by),
            'created_by_email':  created_by_email,
            'created_at':        self.created_at.isoformat() if self.created_at else None,
            'updated_at':        self.updated_at.isoformat() if self.updated_at else None,
        }
