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

    # New fields for enhanced admin system
    full_name = db.Column(db.String(255), default='')
    phone = db.Column(db.String(20), default='')
    department = db.Column(db.String(100), default='')
    created_by = db.Column(db.String(36), nullable=True)  # UUID stored as string
    updated_at = db.Column(db.DateTime)
    updated_by = db.Column(db.String(36), nullable=True)  # UUID stored as string
    deleted_at = db.Column(db.DateTime, nullable=True)  # For soft delete

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
            'deleted_at': self.deleted_at.isoformat() if self.deleted_at else None
        }
