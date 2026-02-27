"""
Team Management Blueprint
-------------------------
Tenant-level team management for business owners and admins.
All operations are scoped to g.user['client_id'] (multi-tenancy).
Role hierarchy prevents users from managing peers or superiors.
"""

import re
import secrets

from flask import Blueprint, jsonify, request, g
from extensions import db
from models.user_model import User
from models.branch_model import Branch
from models.audit_model import AuditLog
from models.client_model import ClientEntry
from models.subscription_model import SubscriptionPlan
from models.permission_model import (
    Permission,
    UserPermission,
    bulk_update_permissions,
    get_all_sections_with_permissions,
    get_user_permissions_by_section,
)
from utils.auth_middleware import authenticate, require_role
from utils.email_service import _send_async, _base_layout, _info_table, _info_row
from sqlalchemy import or_
from datetime import datetime
import bcrypt
import uuid
import logging

logger = logging.getLogger(__name__)

team_bp = Blueprint('team', __name__)

# ---------------------------------------------------------------------------
# Role hierarchy
# ---------------------------------------------------------------------------
ROLE_HIERARCHY = {'cashier': 0, 'staff': 0, 'manager': 1, 'admin': 2, 'owner': 3}


def _can_manage(actor_role: str, target_role: str) -> bool:
    """Return True if actor outranks the target (strictly greater)."""
    return ROLE_HIERARCHY.get(actor_role, 0) > ROLE_HIERARCHY.get(target_role, 0)


# ---------------------------------------------------------------------------
# Plan-based team limits
# ---------------------------------------------------------------------------
PLAN_TEAM_RULES = {
    'Starter':      {'max_members': 0, 'allowed_billing': []},
    'Professional': {'max_members': 1, 'allowed_billing': ['non_gst_billing']},
    'Enterprise':   {'max_members': 2, 'allowed_billing': ['gst_billing', 'non_gst_billing']},
}


def _get_plan_rules(client_id: str):
    """Return (plan_name, rules_dict, is_trial) for the client's subscription.

    Uses a single LEFT JOIN to fetch client + plan in one query.
    Result is memoized on Flask g for the duration of the request.
    """
    cache_key = '_plan_rules'
    if hasattr(g, cache_key):
        return getattr(g, cache_key)

    row = (
        db.session.query(ClientEntry, SubscriptionPlan)
        .outerjoin(
            SubscriptionPlan,
            db.cast(ClientEntry.plan_id, db.String) == db.cast(SubscriptionPlan.plan_id, db.String),
        )
        .filter(ClientEntry.client_id == client_id)
        .first()
    )
    if not row or not row[0]:
        result = (None, PLAN_TEAM_RULES['Starter'], False)
        setattr(g, cache_key, result)
        return result

    client, plan = row
    is_trial = client.subscription_status == 'trial' and not client.is_trial_expired
    plan_name = plan.name if plan else None

    # Trial users get Enterprise-level access
    if is_trial:
        result = (plan_name or 'Trial', PLAN_TEAM_RULES['Enterprise'], True)
        setattr(g, cache_key, result)
        return result

    # Expired or cancelled subscriptions fall back to Starter
    if client.subscription_status in ('expired', 'cancelled'):
        result = (plan_name, PLAN_TEAM_RULES['Starter'], False)
        setattr(g, cache_key, result)
        return result

    rules = PLAN_TEAM_RULES.get(plan_name, PLAN_TEAM_RULES['Starter'])
    result = (plan_name, rules, False)
    setattr(g, cache_key, result)
    return result


# ---------------------------------------------------------------------------
# Audit helper (mirrors admin.py log_admin_action)
# ---------------------------------------------------------------------------
def _log_team_action(action_type, table_name='users', record_id=None,
                     old_data=None, new_data=None):
    """Log team management actions for audit trail."""
    try:
        audit_log = AuditLog(
            log_id=str(uuid.uuid4()),
            user_id=g.user['user_id'],
            client_id=g.user['client_id'],
            action_type=action_type,
            table_name=table_name,
            record_id=record_id,
            old_data=old_data,
            new_data=new_data,
            ip_address=request.remote_addr,
            user_agent=request.headers.get('User-Agent', ''),
        )
        db.session.add(audit_log)
        # Flush only -- let the caller commit as part of a wider transaction
        db.session.flush()
    except Exception as exc:
        logger.error("Failed to log team action: %s", exc)


# ---------------------------------------------------------------------------
# 1. GET /api/team -- List team members (paginated, searchable, filterable)
# ---------------------------------------------------------------------------
@team_bp.route('', methods=['GET'])
@authenticate
@require_role(['owner', 'admin'])
def list_team_members():
    """List team members for the current tenant with pagination."""
    try:
        client_id = g.user['client_id']
        page = max(1, int(request.args.get('page', 1)))
        per_page = min(100, max(1, int(request.args.get('per_page', 20))))
        search = request.args.get('search', '').strip()
        role_filter = request.args.get('role', '').strip()

        query = User.query.filter(
            User.client_id == client_id,
            User.deleted_at.is_(None),
        )

        if search:
            # Escape LIKE wildcards to prevent pattern manipulation
            escaped = re.sub(r'([%_\\])', r'\\\1', search)
            like = f'%{escaped}%'
            query = query.filter(
                or_(
                    User.full_name.ilike(like),
                    User.email.ilike(like),
                )
            )

        if role_filter:
            query = query.filter(User.role == role_filter)

        total = query.count()
        offset = (page - 1) * per_page
        users = query.order_by(User.created_at.desc()).offset(offset).limit(per_page).all()

        # Batch-fetch branches to avoid N+1
        branch_ids = list({str(u.branch_id) for u in users if u.branch_id})
        branch_map = {}
        if branch_ids:
            branches = Branch.query.filter(Branch.branch_id.in_(branch_ids)).all()
            branch_map = {str(b.branch_id): b.to_dict() for b in branches}

        # Batch-fetch permissions for all listed users
        user_ids = [u.user_id for u in users]
        perm_rows = (
            db.session.query(UserPermission.user_id, Permission.permission_name)
            .join(Permission, UserPermission.permission_id == Permission.permission_id)
            .filter(UserPermission.user_id.in_(user_ids))
            .all()
        ) if user_ids else []

        perm_map = {}
        for uid, pname in perm_rows:
            perm_map.setdefault(str(uid), []).append(pname)

        result = []
        for u in users:
            d = u.to_dict()
            # Never expose password hashes
            d.pop('password_hash', None)
            d['branch'] = branch_map.get(str(u.branch_id)) if u.branch_id else None
            d['permissions'] = perm_map.get(str(u.user_id), [])
            result.append(d)

        return jsonify({
            'success': True,
            'data': result,
            'total': total,
            'page': page,
            'per_page': per_page,
        }), 200

    except Exception as exc:
        logger.error("list_team_members error: %s", exc)
        return jsonify({'success': False, 'error': 'Failed to fetch team members'}), 500


# ---------------------------------------------------------------------------
# 2. POST /api/team -- Create team member
# ---------------------------------------------------------------------------
@team_bp.route('', methods=['POST'])
@authenticate
@require_role(['owner', 'admin'])
def create_team_member():
    """Create a new team member within the current tenant."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Request body is required'}), 400

        email = (data.get('email') or '').strip().lower()
        password = data.get('password', '').strip()

        if not email:
            return jsonify({'success': False, 'error': 'Email is required'}), 400
        if not password:
            return jsonify({'success': False, 'error': 'Password is required'}), 400
        if len(password) < 6:
            return jsonify({'success': False, 'error': 'Password must be at least 6 characters'}), 400

        # Check for duplicate email
        existing = User.query.filter_by(email=email).first()
        if existing:
            return jsonify({'success': False, 'error': 'A user with this email already exists'}), 409

        client_id = g.user['client_id']
        actor_role = g.user['role']
        target_role = (data.get('role') or 'staff').strip().lower()

        # Validate target role
        if target_role not in ROLE_HIERARCHY:
            return jsonify({
                'success': False,
                'error': f"Invalid role '{target_role}'. Allowed: {', '.join(ROLE_HIERARCHY.keys())}",
            }), 400

        # Enforce hierarchy -- cannot create users at equal or higher level
        if not _can_manage(actor_role, target_role):
            return jsonify({
                'success': False,
                'error': 'You cannot create a user with an equal or higher role',
            }), 403

        # ── Plan-based team member limit ──
        plan_name, rules, is_trial = _get_plan_rules(client_id)
        max_members = rules['max_members']
        current_members = db.session.query(db.func.count(User.user_id)).filter(
            User.client_id == client_id,
            User.role.notin_(['owner', 'admin']),
            User.deleted_at.is_(None),
        ).scalar()
        if current_members >= max_members:
            return jsonify({
                'success': False,
                'error': 'PLAN_LIMIT_REACHED',
                'message': f'Your {plan_name or "current"} plan allows {max_members} additional team member(s). Please upgrade to add more.',
            }), 403

        # Hash password
        password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

        new_user = User(
            user_id=str(uuid.uuid4()),
            email=email,
            password_hash=password_hash,
            client_id=client_id,
            role=target_role,
            full_name=(data.get('full_name') or '').strip(),
            phone=(data.get('phone') or '').strip(),
            department=(data.get('department') or '').strip(),
            is_active=data.get('is_active', True),
            branch_id=data.get('branch_id') or None,
            created_by=g.user['user_id'],
        )

        db.session.add(new_user)
        db.session.flush()  # Get user_id for permission assignment

        # Assign permissions if provided
        permissions_list = data.get('permissions', [])
        if permissions_list and isinstance(permissions_list, list):
            # ── Validate billing permissions against plan ──
            billing_perms = {'gst_billing', 'non_gst_billing'}
            requested_billing = billing_perms & set(permissions_list)
            allowed_billing = set(rules['allowed_billing'])
            disallowed = requested_billing - allowed_billing
            if disallowed:
                db.session.rollback()
                return jsonify({
                    'success': False,
                    'error': 'BILLING_PERMISSION_RESTRICTED',
                    'message': f'Your {plan_name or "current"} plan does not include: {", ".join(sorted(disallowed))}. Please upgrade.',
                }), 403

            bulk_update_permissions(new_user.user_id, permissions_list, g.user['user_id'])

        # Audit log
        _log_team_action(
            action_type='team_member_created',
            record_id=new_user.user_id,
            new_data={
                'email': email,
                'role': target_role,
                'full_name': new_user.full_name,
                'branch_id': str(new_user.branch_id) if new_user.branch_id else None,
            },
        )

        db.session.commit()

        # Send welcome email (fire-and-forget)
        _send_team_welcome_email(
            to_email=email,
            password=password,
            full_name=new_user.full_name or email.split('@')[0],
            role=target_role,
            created_by=g.user.get('full_name') or g.user.get('email', ''),
        )

        user_dict = new_user.to_dict()
        user_dict.pop('password_hash', None)
        user_dict['permissions'] = permissions_list

        return jsonify({
            'success': True,
            'data': user_dict,
            'message': 'Team member created successfully',
        }), 201

    except Exception as exc:
        db.session.rollback()
        logger.error("create_team_member error: %s", exc)
        return jsonify({'success': False, 'error': 'Failed to create team member'}), 500


# ---------------------------------------------------------------------------
# 3. PUT /api/team/<user_id> -- Update team member
# ---------------------------------------------------------------------------
@team_bp.route('/<user_id>', methods=['PUT'])
@authenticate
@require_role(['owner', 'admin'])
def update_team_member(user_id):
    """Update an existing team member (profile, role, branch, status)."""
    try:
        client_id = g.user['client_id']
        actor_role = g.user['role']

        user = User.query.filter_by(
            user_id=user_id,
            client_id=client_id,
        ).filter(User.deleted_at.is_(None)).first()

        if not user:
            return jsonify({'success': False, 'error': 'Team member not found'}), 404

        # Cannot manage someone at your level or above
        if not _can_manage(actor_role, user.role):
            return jsonify({
                'success': False,
                'error': 'You cannot edit a user with an equal or higher role',
            }), 403

        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Request body is required'}), 400

        old_data = {
            'email': user.email,
            'full_name': user.full_name,
            'phone': user.phone,
            'department': user.department,
            'role': user.role,
            'is_active': user.is_active,
            'branch_id': str(user.branch_id) if user.branch_id else None,
        }

        # If changing role, validate hierarchy for the NEW role too
        new_role = data.get('role')
        if new_role is not None:
            new_role = new_role.strip().lower()
            if new_role not in ROLE_HIERARCHY:
                return jsonify({
                    'success': False,
                    'error': f"Invalid role '{new_role}'. Allowed: {', '.join(ROLE_HIERARCHY.keys())}",
                }), 400
            if not _can_manage(actor_role, new_role):
                return jsonify({
                    'success': False,
                    'error': 'You cannot assign a role equal to or higher than your own',
                }), 403
            user.role = new_role

        # Update profile fields
        if 'full_name' in data:
            user.full_name = (data['full_name'] or '').strip()
        if 'phone' in data:
            user.phone = (data['phone'] or '').strip()
        if 'department' in data:
            user.department = (data['department'] or '').strip()
        if 'is_active' in data:
            user.is_active = bool(data['is_active'])
        if 'branch_id' in data:
            user.branch_id = data['branch_id'] or None

        user.updated_at = datetime.utcnow()
        user.updated_by = g.user['user_id']

        new_data = {
            'email': user.email,
            'full_name': user.full_name,
            'phone': user.phone,
            'department': user.department,
            'role': user.role,
            'is_active': user.is_active,
            'branch_id': str(user.branch_id) if user.branch_id else None,
        }

        _log_team_action(
            action_type='team_member_updated',
            record_id=user_id,
            old_data=old_data,
            new_data=new_data,
        )

        db.session.commit()

        user_dict = user.to_dict()
        user_dict.pop('password_hash', None)

        return jsonify({
            'success': True,
            'data': user_dict,
            'message': 'Team member updated successfully',
        }), 200

    except Exception as exc:
        db.session.rollback()
        logger.error("update_team_member error: %s", exc)
        return jsonify({'success': False, 'error': 'Failed to update team member'}), 500


# ---------------------------------------------------------------------------
# 4. DELETE /api/team/<user_id> -- Soft-delete team member
# ---------------------------------------------------------------------------
@team_bp.route('/<user_id>', methods=['DELETE'])
@authenticate
@require_role(['owner', 'admin'])
def delete_team_member(user_id):
    """Soft-delete a team member (sets deleted_at, is_active=False)."""
    try:
        client_id = g.user['client_id']
        actor_role = g.user['role']
        actor_id = g.user['user_id']

        # Prevent self-deletion
        if str(user_id) == str(actor_id):
            return jsonify({'success': False, 'error': 'You cannot delete your own account'}), 400

        user = User.query.filter_by(
            user_id=user_id,
            client_id=client_id,
        ).filter(User.deleted_at.is_(None)).first()

        if not user:
            return jsonify({'success': False, 'error': 'Team member not found'}), 404

        if not _can_manage(actor_role, user.role):
            return jsonify({
                'success': False,
                'error': 'You cannot delete a user with an equal or higher role',
            }), 403

        old_data = {'email': user.email, 'role': user.role, 'is_active': user.is_active}

        user.deleted_at = datetime.utcnow()
        user.is_active = False
        user.updated_at = datetime.utcnow()
        user.updated_by = g.user['user_id']

        _log_team_action(
            action_type='team_member_deleted',
            record_id=user_id,
            old_data=old_data,
            new_data={'deleted_at': user.deleted_at.isoformat(), 'is_active': False},
        )

        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Team member deleted successfully',
        }), 200

    except Exception as exc:
        db.session.rollback()
        logger.error("delete_team_member error: %s", exc)
        return jsonify({'success': False, 'error': 'Failed to delete team member'}), 500


# ---------------------------------------------------------------------------
# 5. POST /api/team/<user_id>/toggle-status -- Toggle is_active
# ---------------------------------------------------------------------------
@team_bp.route('/<user_id>/toggle-status', methods=['POST'])
@authenticate
@require_role(['owner', 'admin'])
def toggle_team_member_status(user_id):
    """Toggle a team member's is_active flag."""
    try:
        client_id = g.user['client_id']
        actor_role = g.user['role']

        user = User.query.filter_by(
            user_id=user_id,
            client_id=client_id,
        ).filter(User.deleted_at.is_(None)).first()

        if not user:
            return jsonify({'success': False, 'error': 'Team member not found'}), 404

        if not _can_manage(actor_role, user.role):
            return jsonify({
                'success': False,
                'error': 'You cannot change the status of a user with an equal or higher role',
            }), 403

        old_active = user.is_active
        user.is_active = not old_active
        user.updated_at = datetime.utcnow()
        user.updated_by = g.user['user_id']

        _log_team_action(
            action_type='team_member_status_toggled',
            record_id=user_id,
            old_data={'is_active': old_active},
            new_data={'is_active': user.is_active},
        )

        db.session.commit()

        status_label = 'activated' if user.is_active else 'deactivated'
        return jsonify({
            'success': True,
            'data': {'is_active': user.is_active},
            'message': f'Team member {status_label} successfully',
        }), 200

    except Exception as exc:
        db.session.rollback()
        logger.error("toggle_team_member_status error: %s", exc)
        return jsonify({'success': False, 'error': 'Failed to toggle team member status'}), 500


# ---------------------------------------------------------------------------
# 6. POST /api/team/<user_id>/reset-password -- Reset password
# ---------------------------------------------------------------------------
@team_bp.route('/<user_id>/reset-password', methods=['POST'])
@authenticate
@require_role(['owner', 'admin'])
def reset_team_member_password(user_id):
    """Reset a team member's password (accept in body or auto-generate)."""
    try:
        client_id = g.user['client_id']
        actor_role = g.user['role']

        user = User.query.filter_by(
            user_id=user_id,
            client_id=client_id,
        ).filter(User.deleted_at.is_(None)).first()

        if not user:
            return jsonify({'success': False, 'error': 'Team member not found'}), 404

        if not _can_manage(actor_role, user.role):
            return jsonify({
                'success': False,
                'error': 'You cannot reset the password of a user with an equal or higher role',
            }), 403

        data = request.get_json() or {}
        new_password = (data.get('password') or '').strip()

        if not new_password:
            # Auto-generate a 12-character password with high entropy
            new_password = secrets.token_urlsafe(12)

        if len(new_password) < 6:
            return jsonify({'success': False, 'error': 'Password must be at least 6 characters'}), 400

        password_hash = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        user.password_hash = password_hash
        user.updated_at = datetime.utcnow()
        user.updated_by = g.user['user_id']

        _log_team_action(
            action_type='team_member_password_reset',
            record_id=user_id,
            new_data={'reset_by': g.user['user_id']},
        )

        db.session.commit()

        return jsonify({
            'success': True,
            'data': {'temporary_password': new_password},
            'message': 'Password reset successfully',
        }), 200

    except Exception as exc:
        db.session.rollback()
        logger.error("reset_team_member_password error: %s", exc)
        return jsonify({'success': False, 'error': 'Failed to reset password'}), 500


# ---------------------------------------------------------------------------
# 7. GET /api/team/<user_id>/permissions -- Get user permissions by section
# ---------------------------------------------------------------------------
@team_bp.route('/<user_id>/permissions', methods=['GET'])
@authenticate
@require_role(['owner', 'admin'])
def get_member_permissions(user_id):
    """Get a team member's permissions organized by section."""
    try:
        client_id = g.user['client_id']

        user = User.query.filter_by(
            user_id=user_id,
            client_id=client_id,
        ).filter(User.deleted_at.is_(None)).first()

        if not user:
            return jsonify({'success': False, 'error': 'Team member not found'}), 404

        sections = get_user_permissions_by_section(user_id)

        return jsonify({
            'success': True,
            'data': sections,
        }), 200

    except Exception as exc:
        logger.error("get_member_permissions error: %s", exc)
        return jsonify({'success': False, 'error': 'Failed to fetch permissions'}), 500


# ---------------------------------------------------------------------------
# 8. POST /api/team/<user_id>/permissions -- Bulk-update permissions
# ---------------------------------------------------------------------------
@team_bp.route('/<user_id>/permissions', methods=['POST'])
@authenticate
@require_role(['owner', 'admin'])
def update_member_permissions(user_id):
    """Bulk-update a team member's permissions."""
    try:
        client_id = g.user['client_id']
        actor_role = g.user['role']

        user = User.query.filter_by(
            user_id=user_id,
            client_id=client_id,
        ).filter(User.deleted_at.is_(None)).first()

        if not user:
            return jsonify({'success': False, 'error': 'Team member not found'}), 404

        if not _can_manage(actor_role, user.role):
            return jsonify({
                'success': False,
                'error': 'You cannot modify permissions of a user with an equal or higher role',
            }), 403

        data = request.get_json()
        if not data or 'permissions' not in data:
            return jsonify({'success': False, 'error': 'permissions array is required'}), 400

        permissions_list = data['permissions']
        if not isinstance(permissions_list, list):
            return jsonify({'success': False, 'error': 'permissions must be an array'}), 400

        # ── Validate billing permissions against plan ──
        plan_name, rules, is_trial = _get_plan_rules(client_id)
        billing_perms = {'gst_billing', 'non_gst_billing'}
        requested_billing = billing_perms & set(permissions_list)
        allowed_billing = set(rules['allowed_billing'])
        disallowed = requested_billing - allowed_billing
        if disallowed:
            return jsonify({
                'success': False,
                'error': 'BILLING_PERMISSION_RESTRICTED',
                'message': f'Your {plan_name or "current"} plan does not include: {", ".join(sorted(disallowed))}. Please upgrade.',
            }), 403

        result = bulk_update_permissions(user_id, permissions_list, g.user['user_id'])

        _log_team_action(
            action_type='team_member_permissions_updated',
            record_id=user_id,
            new_data={'permissions': permissions_list, 'added': result['added'], 'removed': result['removed']},
        )

        db.session.commit()

        return jsonify({
            'success': True,
            'data': result,
            'message': 'Permissions updated successfully',
        }), 200

    except Exception as exc:
        db.session.rollback()
        logger.error("update_member_permissions error: %s", exc)
        return jsonify({'success': False, 'error': 'Failed to update permissions'}), 500


# ---------------------------------------------------------------------------
# 9. GET /api/team/permissions/all -- Get all available permissions by section
# ---------------------------------------------------------------------------
@team_bp.route('/permissions/all', methods=['GET'])
@authenticate
@require_role(['owner', 'admin'])
def get_all_permissions():
    """Get all available permissions organized by section."""
    try:
        sections = get_all_sections_with_permissions()
        return jsonify({
            'success': True,
            'data': sections,
        }), 200

    except Exception as exc:
        logger.error("get_all_permissions error: %s", exc)
        return jsonify({'success': False, 'error': 'Failed to fetch permissions'}), 500


# ---------------------------------------------------------------------------
# 10. GET /api/team/branches -- Get active branches for the form dropdown
# ---------------------------------------------------------------------------
@team_bp.route('/branches', methods=['GET'])
@authenticate
@require_role(['owner', 'admin'])
def get_team_branches():
    """Get all active branches for the current tenant (for dropdown selects)."""
    try:
        client_id = g.user['client_id']
        branches = Branch.query.filter_by(
            client_id=client_id,
            is_active=True,
        ).order_by(Branch.name).all()

        return jsonify({
            'success': True,
            'data': [b.to_dict() for b in branches],
        }), 200

    except Exception as exc:
        logger.error("get_team_branches error: %s", exc)
        return jsonify({'success': False, 'error': 'Failed to fetch branches'}), 500


# ---------------------------------------------------------------------------
# 11. GET /api/team/plan-info -- Plan-based team limits for the current tenant
# ---------------------------------------------------------------------------
@team_bp.route('/plan-info', methods=['GET'])
@authenticate
@require_role(['owner', 'admin'])
def get_plan_info():
    """Return plan name, team member limits, and allowed billing types."""
    try:
        client_id = g.user['client_id']
        plan_name, rules, is_trial = _get_plan_rules(client_id)

        # Count subordinate team members only (exclude owner + admin)
        # Use db.func.count with .scalar() — returns only the count integer,
        # avoiding ORM object hydration overhead.
        current_members = db.session.query(db.func.count(User.user_id)).filter(
            User.client_id == client_id,
            User.role.notin_(['owner', 'admin']),
            User.deleted_at.is_(None),
        ).scalar()

        max_members = rules['max_members']
        can_add = current_members < max_members

        return jsonify({
            'success': True,
            'data': {
                'plan_name': plan_name,
                'is_trial': is_trial,
                'max_members': max_members,
                'current_members': current_members,
                'can_add_member': can_add,
                'allowed_billing': rules['allowed_billing'],
                'slots_remaining': max(0, max_members - current_members),
            },
        }), 200

    except Exception as exc:
        logger.error("get_plan_info error: %s", exc)
        return jsonify({'success': False, 'error': 'Failed to fetch plan info'}), 500


# ---------------------------------------------------------------------------
# Welcome email helper
# ---------------------------------------------------------------------------
def _send_team_welcome_email(to_email: str, password: str, full_name: str, role: str, created_by: str):
    """Send a welcome email to a newly created team member (fire-and-forget)."""
    from html import escape
    from config import Config

    login_url = f"{Config.FRONTEND_URL}/login"
    safe_name = escape(full_name)
    safe_created_by = escape(created_by)

    subject = "You have been added to a VALORYX Billing team"
    body = f"""
        <h2 style="margin:0 0 6px 0;font-size:22px;font-weight:700;color:#111111;">Welcome to the team, {safe_name}.</h2>
        <p style="margin:0 0 20px 0;color:#555555;">An account has been created for you on VALORYX Billing. You can sign in right away using the credentials below.</p>

        {_info_table(
            _info_row('Name', safe_name, first=True) +
            _info_row('Email', escape(to_email)) +
            _info_row('Password', escape(password)) +
            _info_row('Role', escape(role.capitalize())) +
            _info_row('Added by', safe_created_by)
        )}

        <div style="text-align:center;margin:28px 0 24px 0;">
            <a href="{login_url}" style="display:inline-block;padding:12px 32px;background-color:#111111;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;">
                Sign In to VALORYX
            </a>
        </div>

        <p style="color:#555555;font-size:14px;">We recommend changing your password after your first login from <strong>Profile &rarr; Security</strong>.</p>

        <p style="color:#888888;font-size:13px;margin-top:24px;">
            If you did not expect this invitation, please contact your administrator or reply to this email.
        </p>
    """
    _send_async(to_email, subject, _base_layout(
        preheader=f"You have been added to a team on VALORYX Billing as {role.capitalize()}.",
        body_html=body,
    ))
