from extensions import db
from datetime import datetime
import uuid
from sqlalchemy.dialects.postgresql import UUID

class PermissionSection(db.Model):
    """Permission section model for organizing permissions"""
    __tablename__ = 'permission_sections'

    section_id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    section_name = db.Column(db.String(100), unique=True, nullable=False)
    description = db.Column(db.Text)
    display_order = db.Column(db.Integer, nullable=False)
    icon = db.Column(db.String(50))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationship to permissions
    permissions = db.relationship('Permission', back_populates='section', cascade='all, delete-orphan', order_by='Permission.display_order')

    def to_dict(self):
        return {
            'section_id': str(self.section_id),
            'section_name': self.section_name,
            'description': self.description,
            'display_order': self.display_order,
            'icon': self.icon,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'permissions': [p.to_dict() for p in self.permissions] if hasattr(self, '_permissions_loaded') else []
        }


class Permission(db.Model):
    """Permission definition model"""
    __tablename__ = 'permissions'

    permission_id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    permission_name = db.Column(db.String(100), unique=True, nullable=False, index=True)
    description = db.Column(db.String(255))
    section_id = db.Column(UUID(as_uuid=True), db.ForeignKey('permission_sections.section_id', ondelete='CASCADE'))
    display_order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    section = db.relationship('PermissionSection', back_populates='permissions')
    user_permissions = db.relationship('UserPermission', back_populates='permission', cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'permission_id': str(self.permission_id),
            'permission_name': self.permission_name,
            'description': self.description,
            'section_id': str(self.section_id) if self.section_id else None,
            'section_name': self.section.section_name if self.section else None,
            'display_order': self.display_order,
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
    """Update user's permissions to match the provided list (optimized for bulk operations)"""
    # Get current permissions
    current_permissions = set(get_user_permissions(user_id))
    new_permissions = set(permission_names)

    # Permissions to add
    to_add = new_permissions - current_permissions

    # Permissions to remove
    to_remove = current_permissions - new_permissions

    # Bulk add new permissions
    if to_add:
        # Get all permission IDs in one query
        permissions = Permission.query.filter(Permission.permission_name.in_(to_add)).all()
        perm_map = {p.permission_name: p.permission_id for p in permissions}

        # Bulk insert
        new_user_perms = [
            UserPermission(
                user_id=user_id,
                permission_id=perm_map[perm_name],
                granted_by=granted_by_id
            )
            for perm_name in to_add if perm_name in perm_map
        ]
        db.session.bulk_save_objects(new_user_perms)

    # Bulk remove old permissions
    if to_remove:
        # Get all permission IDs in one query
        permissions = Permission.query.filter(Permission.permission_name.in_(to_remove)).all()
        perm_ids = [p.permission_id for p in permissions]

        # Bulk delete
        UserPermission.query.filter(
            UserPermission.user_id == user_id,
            UserPermission.permission_id.in_(perm_ids)
        ).delete(synchronize_session=False)

    # Single commit for all changes
    db.session.commit()

    return {
        'added': list(to_add),
        'removed': list(to_remove)
    }


def get_all_sections_with_permissions():
    """Get all permission sections with their permissions in a tree structure"""
    sections = PermissionSection.query.order_by(PermissionSection.display_order).all()

    result = []
    for section in sections:
        section._permissions_loaded = True
        result.append(section.to_dict())

    return result


def get_user_permissions_by_section(user_id):
    """Get user's permissions organized by section"""
    # Get all sections with permissions
    sections = get_all_sections_with_permissions()

    # Get user's permission names
    user_perms = set(get_user_permissions(user_id))

    # Mark which permissions the user has
    for section in sections:
        for perm in section['permissions']:
            perm['has_permission'] = perm['permission_name'] in user_perms

    return sections