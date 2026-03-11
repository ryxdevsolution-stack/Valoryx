from extensions import db
from database.flexible_types import FlexibleUUID, FlexibleJSON, FlexibleNumeric
from datetime import datetime
import uuid

class User(db.Model):
    """User authentication with client_id foreign key"""
    __tablename__ = 'users'
    __table_args__ = (
        db.Index('idx_users_client_role_deleted', 'client_id', 'role', 'deleted_at'),
    )

    user_id = db.Column(FlexibleUUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    client_id = db.Column(FlexibleUUID, db.ForeignKey('client_entry.client_id'), nullable=False, index=True)
    role = db.Column(db.String(50), default='staff')
    is_super_admin = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime)
    is_active = db.Column(db.Boolean, default=True)

    # New fields for enhanced admin system
    full_name = db.Column(db.String(255), default='')
    phone = db.Column(db.String(20), default='')
    department = db.Column(db.String(100), default='')
    created_by = db.Column(FlexibleUUID, nullable=True)  # UUID stored as string
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by = db.Column(FlexibleUUID, nullable=True)  # UUID stored as string
    deleted_at = db.Column(db.DateTime, nullable=True)  # For soft delete
    synced_at = db.Column(db.DateTime, nullable=True)  # For SQLite-Supabase sync
    telegram_chat_id = db.Column(db.String(50), nullable=True)  # Telegram chat ID for daily reports

    # Branch assignment (nullable — unassigned = access to all branches)
    branch_id = db.Column(FlexibleUUID, db.ForeignKey('branches.branch_id'), nullable=True, index=True)

    # Password reset
    reset_token = db.Column(db.String(64), nullable=True, index=True)
    reset_token_expires = db.Column(db.DateTime, nullable=True)

    # Invite flow
    invite_token = db.Column(db.String(64), nullable=True, index=True)
    invite_token_expires = db.Column(db.DateTime, nullable=True)
    invite_accepted = db.Column(db.Boolean, default=False, nullable=False)

    # Login IP tracking (for new-location email alert)
    last_login_ip = db.Column(db.String(45), nullable=True)  # 45 chars covers IPv6

    # Force password change (set True when admin resets a user's password)
    must_change_password = db.Column(db.Boolean, default=False, nullable=False)

    # 2FA / TOTP
    totp_secret = db.Column(db.String(32), nullable=True)
    totp_enabled = db.Column(db.Boolean, default=False, nullable=False)

    # OAuth / SSO
    google_id = db.Column(db.String(128), nullable=True, unique=True, index=True)
    avatar_url = db.Column(db.String(512), nullable=True)

    def to_dict(self):
        return {
            'user_id': self.user_id,
            'email': self.email,
            'client_id': self.client_id,
            'role': self.role,
            'is_super_admin': self.is_super_admin,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_login': self.last_login.isoformat() if self.last_login else None,
            'is_active': self.is_active,
            'full_name': self.full_name,
            'phone': self.phone,
            'department': self.department,
            'created_by': self.created_by,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'updated_by': self.updated_by,
            'deleted_at': self.deleted_at.isoformat() if self.deleted_at else None,
            'synced_at': self.synced_at.isoformat() if self.synced_at else None,
            'telegram_chat_id': self.telegram_chat_id,
            'branch_id': str(self.branch_id) if self.branch_id else None,
            'invite_accepted': self.invite_accepted,
            'must_change_password': self.must_change_password,
            'totp_enabled': self.totp_enabled,
            'avatar_url': self.avatar_url,
        }
