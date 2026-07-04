from extensions import db
from database.flexible_types import FlexibleUUID
from datetime import datetime
import uuid


class UserSession(db.Model):
    """Tracks active login sessions per user."""
    __tablename__ = 'user_sessions'
    __table_args__ = (
        db.Index('idx_sessions_user_id', 'user_id'),
        # session_id index is handled by unique=True on the column
    )

    id = db.Column(FlexibleUUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = db.Column(db.String(64), unique=True, nullable=False)
    user_id = db.Column(FlexibleUUID, db.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False)
    client_id = db.Column(FlexibleUUID, nullable=False)

    ip_address = db.Column(db.String(45), nullable=True)
    user_agent = db.Column(db.String(512), nullable=True)
    device = db.Column(db.String(100), nullable=True)   # Parsed from user_agent
    # 'web' or 'desktop' (Electron app). Single-device enforcement is scoped per
    # platform so a user's browser and desktop-app sessions coexist instead of
    # displacing each other. NULL = legacy row, treated as 'web'.
    platform = db.Column(db.String(16), nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_seen = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime, nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    revoked_at = db.Column(db.DateTime, nullable=True)

    def to_dict(self):
        return {
            'id': str(self.id) if self.id else None,
            'session_id': self.session_id,
            'ip_address': self.ip_address,
            'device': self.device,
            'platform': self.platform,
            'user_agent': self.user_agent,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_seen': self.last_seen.isoformat() if self.last_seen else None,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'is_active': self.is_active,
        }
