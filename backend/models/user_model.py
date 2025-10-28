from extensions import db
from datetime import datetime
import uuid

class User(db.Model):
    """User authentication with client_id foreign key"""
    __tablename__ = 'users'

    user_id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    client_id = db.Column(db.String(36), db.ForeignKey('client_entry.client_id'), nullable=False, index=True)
    role = db.Column(db.String(50), default='staff')
    is_super_admin = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime)
    is_active = db.Column(db.Boolean, default=True)

    def to_dict(self):
        return {
            'user_id': self.user_id,
            'email': self.email,
            'client_id': self.client_id,
            'role': self.role,
            'is_super_admin': self.is_super_admin,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_login': self.last_login.isoformat() if self.last_login else None,
            'is_active': self.is_active
        }
