from extensions import db
from datetime import datetime
import uuid
from sqlalchemy.dialects.postgresql import UUID

class Permission(db.Model):
    """Permission definition model"""
    __tablename__ = 'permissions'

    permission_id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    permission_name = db.Column(db.String(100), unique=True, nullable=False, index=True)
    description = db.Column(db.String(255))
    category = db.Column(db.String(50))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationship to user_permissions
    user_permissions = db.relationship('UserPermission', back_populates='permission', cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'permission_id': str(self.permission_id),
            'permission_name': self.permission_name,
            'description': self.description,
            'category': self.category,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class UserPermission(db.Model):
    """User-Permission association model"""
    __tablename__ = 'user_permissions'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False, index=True)
    permission_id = db.Column(UUID(as_uuid=True), db.ForeignKey('permissions.permission_id', ondelete='CASCADE'), nullable=False, index=True)
    granted_at = db.Column(db.DateTime, default=datetime.utcnow)
    granted_by = db.Column(UUID(as_uuid=True), db.ForeignKey('users.user_id', ondelete='SET NULL'))

    # Relationships
    user = db.relationship('User', foreign_keys=[user_id], backref='user_permissions')
    permission = db.relationship('Permission', back_populates='user_permissions')
    grantor = db.relationship('User', foreign_keys=[granted_by])

    # Unique constraint to prevent duplicate permissions for a user
    __table_args__ = (
        db.UniqueConstraint('user_id', 'permission_id', name='unique_user_permission'),
    )

    def to_dict(self):
        return {
            'id': str(self.id),
            'user_id': str(self.user_id),
            'permission_id': str(self.permission_id),
            'permission_name': self.permission.permission_name if self.permission else None,
            'granted_at': self.granted_at.isoformat() if self.granted_at else None,
            'granted_by': str(self.granted_by) if self.granted_by else None
        }


def get_user_permissions(user_id):
    """Get all permission names for a user"""
    permissions = db.session.query(Permission.permission_name).join(
        UserPermission, Permission.permission_id == UserPermission.permission_id
    ).filter(
        UserPermission.user_id == user_id
    ).all()

    return [p[0] for p in permissions]


def has_permission(user_id, permission_name, is_super_admin=False):
    """Check if a user has a specific permission"""
    # Super admins have all permissions
    if is_super_admin:
        return True

    # Check specific permission
    exists = db.session.query(UserPermission).join(
        Permission, UserPermission.permission_id == Permission.permission_id
    ).filter(
        UserPermission.user_id == user_id,
        Permission.permission_name == permission_name
    ).first()

    return exists is not None


def grant_permission(user_id, permission_name, granted_by_id):
    """Grant a permission to a user"""
    # Get permission by name
    permission = Permission.query.filter_by(permission_name=permission_name).first()
    if not permission:
        raise ValueError(f"Permission '{permission_name}' does not exist")

    # Check if already granted
    existing = UserPermission.query.filter_by(
        user_id=user_id,
        permission_id=permission.permission_id
    ).first()

    if existing:
        return False  # Already has this permission

    # Grant the permission
    user_permission = UserPermission(
        user_id=user_id,
        permission_id=permission.permission_id,
        granted_by=granted_by_id
    )

    db.session.add(user_permission)
    db.session.commit()
    return True


def revoke_permission(user_id, permission_name):
    """Revoke a permission from a user"""
    # Get permission by name
    permission = Permission.query.filter_by(permission_name=permission_name).first()
    if not permission:
        raise ValueError(f"Permission '{permission_name}' does not exist")

    # Find and delete the user permission
    user_permission = UserPermission.query.filter_by(
        user_id=user_id,
        permission_id=permission.permission_id
    ).first()

    if not user_permission:
        return False  # User doesn't have this permission

    db.session.delete(user_permission)
    db.session.commit()
    return True


def bulk_update_permissions(user_id, permission_names, granted_by_id):
    """Update user's permissions to match the provided list"""
    # Get current permissions
    current_permissions = set(get_user_permissions(user_id))
    new_permissions = set(permission_names)

    # Permissions to add
    to_add = new_permissions - current_permissions

    # Permissions to remove
    to_remove = current_permissions - new_permissions

    # Add new permissions
    for perm_name in to_add:
        grant_permission(user_id, perm_name, granted_by_id)

    # Remove old permissions
    for perm_name in to_remove:
        revoke_permission(user_id, perm_name)

    return {
        'added': list(to_add),
        'removed': list(to_remove)
    }