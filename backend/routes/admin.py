from flask import Blueprint, jsonify, request, g
from models import db
from models.user_model import User
from models.client_model import ClientEntry
from models.permission_model import Permission, UserPermission, has_permission, get_user_permissions
from models.audit_model import AuditLog
from utils.auth_middleware import authenticate
from utils.permission_middleware import require_super_admin, require_permission
import bcrypt
from datetime import datetime
import uuid
from sqlalchemy import or_, and_, func
from sqlalchemy.orm import joinedload

# Create admin blueprint
admin_bp = Blueprint('admin', __name__)

# Helper function to log admin actions
def log_admin_action(action, target_user_id=None, details=None):
    """Log admin actions for audit trail"""
    try:
        audit_log = AuditLog(
        audit_id=str(uuid.uuid4()),
        user_id=g.user['user_id'],
        client_id=g.user['client_id'],
        action=action,
        entity_type='USER',
        entity_id=target_user_id,
        details=details or {},
        ip_address=request.remote_addr,
        user_agent=request.headers.get('User-Agent', '')
        )
        db.session.add(audit_log)
        db.session.commit()
    except Exception as e:
        print(f"Error logging admin action: {e}")

@admin_bp.route('/users', methods=['GET'])
@authenticate
@require_super_admin
def get_all_users():
    """Get all users with filtering, sorting, and pagination"""
    try:
        # Get query parameters
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 10))
        search = request.args.get('search', '')
        role_filter = request.args.get('role', '')
        status_filter = request.args.get('status', '')
        client_id = request.args.get('client_id', g.user['client_id'])

        # Base query
        query = User.query.filter_by(client_id=client_id)

        # Apply search filter
        if search:
            query = query.filter(
            or_(
            User.email.ilike(f'%{search}%'),
            User.full_name.ilike(f'%{search}%'),
            User.phone.ilike(f'%{search}%')
            )
            )

            # Apply role filter
            if role_filter:
                query = query.filter(User.role == role_filter)

                # Apply status filter
                if status_filter == 'active':
                    query = query.filter(User.is_active == True)
                elif status_filter == 'inactive':
                    query = query.filter(User.is_active == False)
                elif status_filter == 'super_admin':
                    query = query.filter(User.is_super_admin == True)

                    # Get total count
                    total = query.count()

                    # Apply pagination
                    offset = (page - 1) * limit
                    users = query.offset(offset).limit(limit).all()

                    # Get permissions for each user
                    users_data = []
                    for user in users:
                        permissions = get_user_permissions(user.user_id)
                        user_dict = {
                        'user_id': user.user_id,
                        'email': user.email,
                        'full_name': user.full_name,
                        'phone': user.phone,
                        'department': user.department,
                        'role': user.role,
                        'is_super_admin': user.is_super_admin,
                        'is_active': user.is_active,
                        'created_at': user.created_at.isoformat() if user.created_at else None,
                        'last_login': user.last_login.isoformat() if user.last_login else None,
                        'permissions': permissions
                        }
                        users_data.append(user_dict)

        return jsonify({
            'users': users_data,
            'total': total,
            'page': page,
            'limit': limit,
            'pages': (total + limit - 1) // limit
        }), 200

    except Exception as e:
        return jsonify({'error': f'Failed to fetch users: {str(e)}'}), 500

@admin_bp.route('/users/<user_id>', methods=['GET'])
@authenticate
@require_super_admin
def get_user_details(user_id):
    """Get detailed information about a specific user"""
    try:
        user = User.query.filter_by(user_id=user_id).first()
        if not user:
            return jsonify({'error': 'User not found'}), 404

        # Get user's permissions
        permissions = get_user_permissions(user_id)

        # Get user's client information
        client = ClientEntry.query.filter_by(client_id=user.client_id).first()

        # Get audit logs for this user (last 10 actions)
        audit_logs = AuditLog.query.filter_by(user_id=user_id).order_by(
            AuditLog.created_at.desc()
        ).limit(10).all()

        user_data = {
            'user_id': user.user_id,
            'email': user.email,
            'full_name': user.full_name,
            'phone': user.phone,
            'department': user.department,
            'role': user.role,
            'is_super_admin': user.is_super_admin,
            'is_active': user.is_active,
            'created_at': user.created_at.isoformat() if user.created_at else None,
            'last_login': user.last_login.isoformat() if user.last_login else None,
            'created_by': user.created_by,
            'updated_at': user.updated_at.isoformat() if user.updated_at else None,
            'updated_by': user.updated_by,
            'permissions': permissions,
            'client': {
                'client_id': client.client_id,
                'client_name': client.client_name,
                'email': client.email
            } if client else None,
            'recent_activity': [
                {
                    'action': log.action,
                    'details': log.details,
                    'created_at': log.created_at.isoformat()
                } for log in audit_logs
            ]
        }

        return jsonify(user_data), 200

    except Exception as e:
        return jsonify({'error': f'Failed to fetch user details: {str(e)}'}), 500

@admin_bp.route('/users', methods=['POST'])
@authenticate
@require_super_admin
def create_user():
    """Create a new user with all options"""
    try:
        data = request.get_json()

        # Required fields
        email = data.get('email')
        password = data.get('password')
        role = data.get('role', 'staff')

        # Validate required fields
        if not email or not password:
            return jsonify({'error': 'Email and password are required'}), 400

            # Check if user already exists
            existing_user = User.query.filter_by(email=email).first()
            if existing_user:
                return jsonify({'error': 'User with this email already exists'}), 400

                # Hash password
                password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

                # Create new user
                new_user = User(
                user_id=str(uuid.uuid4()),
                email=email,
                password_hash=password_hash,
                full_name=data.get('full_name', ''),
                phone=data.get('phone', ''),
                department=data.get('department', ''),
                role=role,
                client_id=data.get('client_id', g.user['client_id']),
                is_super_admin=data.get('is_super_admin', False),
                is_active=data.get('is_active', True),
                created_by=g.user['user_id'],
                created_at=datetime.utcnow()
                )

                db.session.add(new_user)
                db.session.flush()  # Get the user_id before committing

                # Assign permissions if provided
                permissions = data.get('permissions', [])
                if permissions:
                    for perm_name in permissions:
                        permission = Permission.query.filter_by(permission_name=perm_name).first()
                        if permission:
                            user_permission = UserPermission(
                            id=str(uuid.uuid4()),
                            user_id=new_user.user_id,
                            permission_id=permission.permission_id,
                            granted_by=g.user['user_id']
                            )
                            db.session.add(user_permission)

                            db.session.commit()

                            # Log the action
                            log_admin_action(
                            'USER_CREATED',
                            new_user.user_id,
                            {
                            'email': email,
                            'role': role,
                            'is_super_admin': new_user.is_super_admin,
                            'permissions': permissions
                            }
                            )

                            # Send welcome email if requested
                            if data.get('send_welcome_email'):
                                # TODO: Implement email sending
                                pass

                                return jsonify({
                                'message': 'User created successfully',
                                'user_id': new_user.user_id,
                                'email': new_user.email
                                }), 201

                            except Exception as e:
                                db.session.rollback()
                                return jsonify({'error': f'Failed to create user: {str(e)}'}), 500

@admin_bp.route('/users/<user_id>', methods=['PUT'])
@authenticate
@require_super_admin
def update_user(user_id):
    """Update user details (everything except password)"""
    try:
        user = User.query.filter_by(user_id=user_id).first()
        if not user:
            return jsonify({'error': 'User not found'}), 404

            data = request.get_json()

            # Track changes for audit log
            changes = {}

            # Update fields if provided
            if 'email' in data and data['email'] != user.email:
                # Check if new email is already taken
                existing = User.query.filter_by(email=data['email']).first()
                if existing and existing.user_id != user_id:
                    return jsonify({'error': 'Email already in use'}), 400
                    changes['email'] = {'old': user.email, 'new': data['email']}
                    user.email = data['email']

                    if 'full_name' in data:
                        changes['full_name'] = {'old': user.full_name, 'new': data['full_name']}
                        user.full_name = data['full_name']

                        if 'phone' in data:
                            changes['phone'] = {'old': user.phone, 'new': data['phone']}
                            user.phone = data['phone']

                            if 'department' in data:
                                changes['department'] = {'old': user.department, 'new': data['department']}
                                user.department = data['department']

                                if 'role' in data:
                                    changes['role'] = {'old': user.role, 'new': data['role']}
                                    user.role = data['role']

                                    if 'is_active' in data:
                                        changes['is_active'] = {'old': user.is_active, 'new': data['is_active']}
                                        user.is_active = data['is_active']

                                        # Update metadata
                                        user.updated_at = datetime.utcnow()
                                        user.updated_by = g.user['user_id']

                                        db.session.commit()

                                        # Log the action
                                        log_admin_action('USER_UPDATED', user_id, changes)

                                        return jsonify({'message': 'User updated successfully'}), 200

                                    except Exception as e:
                                        db.session.rollback()
                                        return jsonify({'error': f'Failed to update user: {str(e)}'}), 500

@admin_bp.route('/users/<user_id>/password', methods=['POST'])
@authenticate
@require_super_admin
def reset_user_password(user_id):
    """Reset user password"""
    try:
        user = User.query.filter_by(user_id=user_id).first()
        if not user:
            return jsonify({'error': 'User not found'}), 404

            data = request.get_json()
            new_password = data.get('password')

            if not new_password:
                # Generate random password
                import string
                import random
                new_password = ''.join(random.choices(
                string.ascii_letters + string.digits + string.punctuation,
                k=12
                ))

                # Hash new password
                password_hash = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
                user.password_hash = password_hash
                user.updated_at = datetime.utcnow()
                user.updated_by = g.user['user_id']

                db.session.commit()

                # Log the action
                log_admin_action('PASSWORD_RESET', user_id, {
                'reset_by': g.user['email'],
                'generated': data.get('password') is None
                })

                response = {'message': 'Password reset successfully'}
                if data.get('password') is None:
                    response['generated_password'] = new_password

                    return jsonify(response), 200

                except Exception as e:
                    db.session.rollback()
                    return jsonify({'error': f'Failed to reset password: {str(e)}'}), 500

@admin_bp.route('/users/<user_id>/toggle-status', methods=['POST'])
@authenticate
@require_super_admin
def toggle_user_status(user_id):
    """Activate/Deactivate user"""
    try:
        user = User.query.filter_by(user_id=user_id).first()
        if not user:
            return jsonify({'error': 'User not found'}), 404

            # Prevent deactivating self
            if user_id == g.user['user_id']:
                return jsonify({'error': 'Cannot deactivate your own account'}), 400

                old_status = user.is_active
                user.is_active = not user.is_active
                user.updated_at = datetime.utcnow()
                user.updated_by = g.user['user_id']

                db.session.commit()

                # Log the action
                log_admin_action(
                'USER_STATUS_CHANGED',
                user_id,
                {'old_status': old_status, 'new_status': user.is_active}
                )

                return jsonify({
                'message': f"User {'activated' if user.is_active else 'deactivated'} successfully",
                'is_active': user.is_active
                }), 200

            except Exception as e:
                db.session.rollback()
                return jsonify({'error': f'Failed to toggle user status: {str(e)}'}), 500

@admin_bp.route('/users/<user_id>/promote', methods=['POST'])
@authenticate
@require_super_admin
def toggle_super_admin(user_id):
    """Toggle super admin status"""
    try:
        user = User.query.filter_by(user_id=user_id).first()
        if not user:
            return jsonify({'error': 'User not found'}), 404

            # Prevent demoting self if last super admin
            if user_id == g.user['user_id']:
                # Check if there are other super admins
                other_super_admins = User.query.filter(
                User.is_super_admin == True,
                User.user_id != user_id,
                User.client_id == g.user['client_id']
                ).count()

                if other_super_admins == 0:
                    return jsonify({'error': 'Cannot demote the last super admin'}), 400

                    old_status = user.is_super_admin
                    user.is_super_admin = not user.is_super_admin
                    user.updated_at = datetime.utcnow()
                    user.updated_by = g.user['user_id']

                    # If promoting to super admin, grant all permissions
                    if user.is_super_admin:
                        # Get all permissions
                        all_permissions = Permission.query.all()
                        for permission in all_permissions:
                            # Check if permission already exists
                            existing = UserPermission.query.filter_by(
                            user_id=user_id,
                            permission_id=permission.permission_id
                            ).first()

                            if not existing:
                                user_permission = UserPermission(
                                id=str(uuid.uuid4()),
                                user_id=user_id,
                                permission_id=permission.permission_id,
                                granted_by=g.user['user_id']
                                )
                                db.session.add(user_permission)

                                db.session.commit()

                                # Log the action
                                log_admin_action(
                                'SUPER_ADMIN_STATUS_CHANGED',
                                user_id,
                                {'old_status': old_status, 'new_status': user.is_super_admin}
                                )

                                return jsonify({
                                'message': f"User {'promoted to' if user.is_super_admin else 'demoted from'} super admin successfully",
                                'is_super_admin': user.is_super_admin
                                }), 200

                            except Exception as e:
                                db.session.rollback()
                                return jsonify({'error': f'Failed to toggle super admin status: {str(e)}'}), 500

@admin_bp.route('/users/bulk', methods=['POST'])
@authenticate
@require_super_admin
def bulk_user_operations():
    """Perform bulk operations on multiple users"""
    try:
        data = request.get_json()
        user_ids = data.get('user_ids', [])
        operation = data.get('operation')

        if not user_ids or not operation:
            return jsonify({'error': 'User IDs and operation are required'}), 400

            # Prevent operations on self
            if g.user['user_id'] in user_ids:
                user_ids.remove(g.user['user_id'])

                if not user_ids:
                    return jsonify({'error': 'No valid users to operate on'}), 400

                    results = {'success': [], 'failed': []}

                    if operation == 'activate':
                        for user_id in user_ids:
                            user = User.query.filter_by(user_id=user_id).first()
                            if user:
                                user.is_active = True
                                user.updated_at = datetime.utcnow()
                                user.updated_by = g.user['user_id']
                                results['success'].append(user_id)
                            else:
                                results['failed'].append(user_id)

                            elif operation == 'deactivate':
                                for user_id in user_ids:
                                    user = User.query.filter_by(user_id=user_id).first()
                                    if user:
                                        user.is_active = False
                                        user.updated_at = datetime.utcnow()
                                        user.updated_by = g.user['user_id']
                                        results['success'].append(user_id)
                                    else:
                                        results['failed'].append(user_id)

                                    elif operation == 'delete':
                                        for user_id in user_ids:
                                            user = User.query.filter_by(user_id=user_id).first()
                                            if user:
                                                # Soft delete by setting deleted_at timestamp
                                                user.is_active = False
                                                user.deleted_at = datetime.utcnow()
                                                user.updated_by = g.user['user_id']
                                                results['success'].append(user_id)
                                            else:
                                                results['failed'].append(user_id)

                                            elif operation == 'assign_permissions':
                                                permissions = data.get('permissions', [])
                                                for user_id in user_ids:
                                                    user = User.query.filter_by(user_id=user_id).first()
                                                    if user:
                                                        for perm_name in permissions:
                                                            permission = Permission.query.filter_by(permission_name=perm_name).first()
                                                            if permission:
                                                                existing = UserPermission.query.filter_by(
                                                                user_id=user_id,
                                                                permission_id=permission.permission_id
                                                                ).first()

                                                                if not existing:
                                                                    user_permission = UserPermission(
                                                                    id=str(uuid.uuid4()),
                                                                    user_id=user_id,
                                                                    permission_id=permission.permission_id,
                                                                    granted_by=g.user['user_id']
                                                                    )
                                                                    db.session.add(user_permission)
                                                                    results['success'].append(user_id)
                                                                else:
                                                                    results['failed'].append(user_id)

                                                                else:
                                                                    return jsonify({'error': 'Invalid operation'}), 400

                                                                    db.session.commit()

                                                                    # Log the bulk action
                                                                    log_admin_action(
                                                                    f'BULK_{operation.upper()}',
                                                                    None,
                                                                    {
                                                                    'operation': operation,
                                                                    'affected_users': results['success'],
                                                                    'failed_users': results['failed']
                                                                    }
                                                                    )

                                                                    return jsonify({
                                                                    'message': f'Bulk {operation} completed',
                                                                    'results': results
                                                                    }), 200

                                                                except Exception as e:
                                                                    db.session.rollback()
                                                                    return jsonify({'error': f'Failed to perform bulk operation: {str(e)}'}), 500

@admin_bp.route('/dashboard', methods=['GET'])
@authenticate
@require_super_admin
def get_admin_dashboard():
    """Get admin dashboard statistics"""
    try:
        client_id = g.user['client_id']

        # Get user statistics
        total_users = User.query.filter_by(client_id=client_id).count()
        active_users = User.query.filter_by(client_id=client_id, is_active=True).count()
        inactive_users = User.query.filter_by(client_id=client_id, is_active=False).count()
        super_admins = User.query.filter_by(client_id=client_id, is_super_admin=True).count()

        # Get users by role
        role_distribution = db.session.query(
        User.role,
        func.count(User.user_id)
        ).filter_by(client_id=client_id).group_by(User.role).all()

        # Get recent users (last 7 days)
        from datetime import datetime, timedelta
        seven_days_ago = datetime.utcnow() - timedelta(days=7)
        recent_users = User.query.filter(
        User.client_id == client_id,
        User.created_at >= seven_days_ago
        ).count()

        # Get users with recent activity (last 24 hours)
        one_day_ago = datetime.utcnow() - timedelta(days=1)
        active_today = User.query.filter(
        User.client_id == client_id,
        User.last_login >= one_day_ago
        ).count()

        # Get recent admin actions
        recent_actions = AuditLog.query.filter(
        AuditLog.client_id == client_id,
        AuditLog.entity_type == 'USER'
        ).order_by(AuditLog.created_at.desc()).limit(10).all()

        return jsonify({
        'statistics': {
        'total_users': total_users,
        'active_users': active_users,
        'inactive_users': inactive_users,
        'super_admins': super_admins,
        'recent_users': recent_users,
        'active_today': active_today,
        'role_distribution': {role: count for role, count in role_distribution}
        },
        'recent_actions': [
        {
        'action': action.action,
        'user_id': action.user_id,
        'entity_id': action.entity_id,
        'details': action.details,
        'created_at': action.created_at.isoformat()
        } for action in recent_actions
        ]
        }), 200

    except Exception as e:
        return jsonify({'error': f'Failed to fetch dashboard data: {str(e)}'}), 500

@admin_bp.route('/roles', methods=['GET'])
@authenticate
@require_super_admin
def get_available_roles():
    """Get all available roles"""
    try:
        roles = ['admin', 'manager', 'staff']
        return jsonify({'roles': roles}), 200
    except Exception as e:
        return jsonify({'error': f'Failed to fetch roles: {str(e)}'}), 500

@admin_bp.route('/permission-templates', methods=['GET'])
@authenticate
@require_super_admin
def get_permission_templates():
    """Get permission templates/presets"""
    try:
        templates = {
        'full_access': {
        'name': 'Full Access',
        'description': 'All permissions granted',
        'permissions': [p.permission_name for p in Permission.query.all()]
        },
        'billing_manager': {
        'name': 'Billing Manager',
        'description': 'Full billing and customer access',
        'permissions': [
        'view_dashboard', 'view_billing', 'create_bill',
        'edit_bill', 'delete_bill', 'view_customers',
        'manage_customers', 'view_reports'
        ]
        },
        'stock_manager': {
        'name': 'Stock Manager',
        'description': 'Full stock management access',
        'permissions': [
        'view_dashboard', 'view_stock', 'manage_stock',
        'view_reports'
        ]
        },
        'view_only': {
        'name': 'View Only',
        'description': 'Read-only access to all modules',
        'permissions': [
        'view_dashboard', 'view_billing', 'view_customers',
        'view_stock', 'view_reports', 'view_audit'
        ]
        }
        }

        return jsonify({'templates': templates}), 200

    except Exception as e:
        return jsonify({'error': f'Failed to fetch permission templates: {str(e)}'}), 500