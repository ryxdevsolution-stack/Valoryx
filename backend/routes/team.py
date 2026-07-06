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
from models.permission_preset_model import PermissionPreset
from utils.auth_middleware import authenticate, require_role
from utils.totp_helper import require_totp_action_token
from utils.email_service import _send_async, _base_layout, _info_table, _info_row, send_invite_email
from utils.rate_limiter import rate_limit
from routes.invite import INVITE_EXPIRY_HOURS
from config import Config
from utils.cache_helper import get_cache_manager
from sqlalchemy import or_
from datetime import datetime, timedelta
import bcrypt
import uuid
import logging

logger = logging.getLogger(__name__)

team_bp = Blueprint('team', __name__)

# ---------------------------------------------------------------------------
# Role hierarchy
# ---------------------------------------------------------------------------
ROLE_HIERARCHY = {'staff': 0, 'manager': 1, 'owner': 2}

# ---------------------------------------------------------------------------
# Default permission sets per role (used as fallback when no client preset exists)
# ---------------------------------------------------------------------------
_ALL_PERMISSIONS = [
    # Create Bill
    'gst_billing', 'non_gst_billing', 'apply_discount', 'add_payment',
    'select_customer', 'add_products', 'set_tax_rate',
    # Manage Bills
    'view_all_bills', 'view_own_bills', 'edit_bill_details', 'delete_bills',
    'print_bills', 'download_pdf', 'send_email', 'mark_paid', 'mark_cancelled',
    'duplicate_bill', 'search_bills', 'show_no_exchange',
    # Customer Management
    'view_customers', 'add_customer', 'edit_customer', 'delete_customer',
    'view_purchase_history', 'import_customers', 'export_customers',
    # Stock Management
    'view_stock', 'add_product', 'edit_product_details', 'edit_pricing',
    'edit_cost_price', 'delete_product', 'adjust_quantity',
    'view_low_stock_alerts', 'import_stock', 'export_stock',
    # Reports & Analytics
    'view_dashboard', 'view_sales_reports', 'view_revenue_reports',
    'view_profit_reports', 'view_inventory_reports', 'view_customer_reports',
    'export_reports', 'print_reports', 'custom_report_filters',
    # Payment Types
    'view_payment_types', 'add_payment_type', 'edit_payment_type',
    'delete_payment_type', 'set_default_payment',
    # User Management
    'view_users', 'add_user', 'edit_user', 'delete_user',
    'activate_deactivate_user', 'assign_permissions',
    # System Settings
    'view_settings', 'edit_company_settings', 'edit_billing_settings',
    'edit_tax_settings', 'edit_notification_settings', 'edit_theme_settings',
    # Audit & Logs
    'view_audit_logs', 'export_audit_logs', 'view_system_logs',
    # Bulk Orders
    'view_bulk_orders', 'create_bulk_order', 'edit_bulk_order',
    'delete_bulk_order', 'approve_bulk_order', 'receive_bulk_order',
    # Notes
    'view_notes', 'view_all_notes', 'create_notes', 'edit_notes', 'delete_notes',
    # Employees
    'view_employees', 'add_employee', 'edit_employee', 'delete_employee',
    'view_attendance', 'mark_attendance',
    # Payroll
    'view_salary', 'manage_salary_cycles', 'record_advance', 'mark_salary_paid',
    # Expenses
    'view_expenses', 'add_expense', 'edit_expense', 'delete_expense',
    'manage_expense_categories',
    # Suppliers
    'view_suppliers', 'add_supplier', 'edit_supplier', 'delete_supplier',
    'manage_deliveries',
    # Branches
    'view_branches', 'add_branch', 'edit_branch', 'delete_branch',
    # Stock Transfers
    'view_stock_transfers', 'create_stock_transfer',
    'approve_stock_transfer', 'receive_stock_transfer',
    # Shop Settings
    'view_shop_settings', 'edit_shop_settings',
    # System Administration (manage_clients, system_backup, system_restore,
    # maintenance_mode) intentionally excluded — see utils.permissions.SUPER_ADMIN_ONLY_PERMISSIONS.
]

DEFAULT_ROLE_PERMISSIONS: dict[str, list[str]] = {
    'owner': _ALL_PERMISSIONS,

    'manager': [
        # Create Bill
        'gst_billing', 'non_gst_billing', 'apply_discount', 'add_payment',
        'select_customer', 'add_products', 'set_tax_rate',
        # Manage Bills
        'view_all_bills', 'view_own_bills', 'print_bills', 'download_pdf',
        'send_email', 'mark_paid', 'mark_cancelled', 'duplicate_bill', 'search_bills',
        # Customer Management
        'view_customers', 'add_customer', 'edit_customer', 'view_purchase_history',
        # Stock Management
        'view_stock', 'add_product', 'edit_product_details', 'edit_pricing',
        'adjust_quantity', 'view_low_stock_alerts',
        # Reports & Analytics
        'view_dashboard', 'view_sales_reports', 'view_revenue_reports',
        'view_profit_reports', 'view_inventory_reports', 'view_customer_reports',
        'print_reports',
        # Payment Types
        'view_payment_types',
        # User Management
        'view_users',
        # System Settings
        'view_settings',
        # Audit & Logs
        'view_audit_logs',
        # Bulk Orders
        'view_bulk_orders', 'create_bulk_order', 'receive_bulk_order',
        # Notes
        'view_notes', 'create_notes', 'edit_notes',
        # Employees (view + attendance only — no CRUD)
        'view_employees', 'view_attendance', 'mark_attendance',
        # Expenses (full — managers handle day-to-day expenses)
        'view_expenses', 'add_expense', 'edit_expense', 'delete_expense',
        # Suppliers (view only)
        'view_suppliers',
        # Stock Transfers
        'view_stock_transfers', 'create_stock_transfer',
        'approve_stock_transfer', 'receive_stock_transfer',
    ],

    'staff': [
        # Create Bill
        'gst_billing', 'non_gst_billing', 'add_payment', 'select_customer', 'add_products',
        # Manage Bills
        'view_own_bills', 'print_bills', 'duplicate_bill', 'search_bills',
        # Customer Management
        'view_customers', 'add_customer', 'view_purchase_history',
        # Stock Management
        'view_stock', 'view_low_stock_alerts',
        # Reports & Analytics
        'view_dashboard',
        # Notes
        'view_notes', 'create_notes',
    ],

}


def _can_manage(actor_role: str, target_role: str) -> bool:
    """Return True if actor outranks the target (strictly greater)."""
    return ROLE_HIERARCHY.get(actor_role, 0) > ROLE_HIERARCHY.get(target_role, 0)


def _disallowed_grants(actor_user_id, requested_perms, is_super_admin: bool) -> list:
    """
    No-escalation check: a non-superadmin can only grant permissions they
    themselves hold. Returns the list of perms the actor is trying to grant
    but doesn't own. Empty list means the request is fully grantable.
    """
    if is_super_admin:
        return []
    actor_perms = set(get_user_permissions(actor_user_id))
    return sorted(set(requested_perms) - actor_perms)


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
@require_role(['owner', 'manager'])
def list_team_members():
    """List team members for the current tenant with pagination."""
    try:
        client_id = g.user['client_id']
        page = max(1, int(request.args.get('page', 1)))
        per_page = min(100, max(1, int(request.args.get('per_page', 20))))
        search = request.args.get('search', '').strip()
        role_filter = request.args.get('role', '').strip()

        # Cache unfiltered first-page requests (most common case)
        cache = get_cache_manager()
        if not search and not role_filter and page == 1:
            cache_key = f"team:list:{client_id}:{per_page}"
            cached = cache.get(cache_key)
            if cached is not None:
                return jsonify(cached), 200

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

        response = {
            'success': True,
            'data': result,
            'total': total,
            'page': page,
            'per_page': per_page,
        }
        if not search and not role_filter and page == 1:
            cache.set(f"team:list:{client_id}:{per_page}", response, 60)
        return jsonify(response), 200

    except Exception as exc:
        logger.error("list_team_members error: %s", exc)
        return jsonify({'success': False, 'error': 'Failed to fetch team members'}), 500


# ---------------------------------------------------------------------------
# 1b. GET /api/team/tree -- Return hierarchy scoped to caller's role
# ---------------------------------------------------------------------------
@team_bp.route('/tree', methods=['GET'])
@authenticate
@require_role(['owner', 'manager'])
def get_team_tree():
    """Return the team hierarchy scoped to the caller's role.

    Owner: full {owner, managers[], direct_reports[]}.
    Manager: {self, staff[]} (only their own subtree).
    Staff: 403 (handled by @require_role).
    """
    client_id = g.user['client_id']
    caller_role = g.user['role']

    def _serialize(u):
        return {
            'user_id': str(u.user_id),
            'full_name': u.full_name,
            'email': u.email,
            'role': u.role,
        }

    if caller_role == 'manager':
        staff = User.query.filter_by(
            client_id=client_id,
            reports_to_id=g.user['user_id'],
        ).order_by(User.full_name).all()
        self_user = User.query.filter_by(user_id=g.user['user_id']).first()
        return jsonify({
            'self': _serialize(self_user),
            'staff': [_serialize(s) for s in staff],
        }), 200

    # owner branch
    owner = User.query.filter_by(client_id=client_id, role='owner').first()
    if not owner:
        return jsonify({'error': 'Owner not found for this client'}), 500
    managers = User.query.filter_by(
        client_id=client_id, role='manager',
    ).order_by(User.full_name).all()

    # Batch-fetch all staff in this client to assemble manager-keyed lists in one query.
    all_staff = User.query.filter_by(client_id=client_id, role='staff').order_by(User.full_name).all()
    staff_by_parent = {}
    direct_reports = []
    for s in all_staff:
        parent = str(s.reports_to_id) if s.reports_to_id else None
        if parent == str(owner.user_id):
            direct_reports.append(s)
        else:
            staff_by_parent.setdefault(parent, []).append(s)

    return jsonify({
        'owner': _serialize(owner),
        'managers': [
            {
                **_serialize(m),
                'staff': [_serialize(s) for s in staff_by_parent.get(str(m.user_id), [])],
            }
            for m in managers
        ],
        'direct_reports': [_serialize(s) for s in direct_reports],
    }), 200


# ---------------------------------------------------------------------------
# 2. POST /api/team -- Create team member
# ---------------------------------------------------------------------------
@team_bp.route('', methods=['POST'])
@authenticate
@require_role(['owner', 'manager'])
def create_team_member():
    """Create a new team member within the current tenant."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Request body is required'}), 400

        # TOTP gate: self-registered owners with 2FA must verify before adding users
        actor = User.query.filter_by(user_id=g.user['user_id']).first()
        if actor:
            totp_err = require_totp_action_token(actor, data)
            if totp_err:
                return totp_err

        email = (data.get('email') or '').strip().lower()

        if not email:
            return jsonify({'success': False, 'error': 'Email is required'}), 400

        # Check for duplicate email (global — email must be unique across all tenants)
        existing = User.query.filter_by(email=email).first()
        if existing:
            return jsonify({
                'success': False,
                'error': 'EMAIL_EXISTS',
                'message': 'A user with this email already exists',
                'field': 'email',
            }), 409

        # Check for duplicate full_name within the same client (business-level uniqueness)
        full_name = (data.get('full_name') or '').strip()
        if full_name:
            name_conflict = User.query.filter(
                User.client_id == g.user['client_id'],
                User.full_name.ilike(full_name),
                User.deleted_at.is_(None),
            ).first()
            if name_conflict:
                return jsonify({
                    'success': False,
                    'error': 'NAME_EXISTS',
                    'message': f'A team member named "{full_name}" already exists in your organization',
                    'field': 'full_name',
                }), 409

        client_id = g.user['client_id']
        actor_role = g.user['role']
        target_role = (data.get('role') or 'staff').strip().lower()

        # Validate target role
        if target_role not in ROLE_HIERARCHY:
            return jsonify({
                'success': False,
                'error': f"Invalid role '{target_role}'. Allowed: {', '.join(ROLE_HIERARCHY.keys())}",
            }), 400

        # ── Role-hierarchy enforcement (Phase: hierarchy redesign) ───────────
        # Owner role is never user-creatable — only one per client.
        # Check this BEFORE the generic _can_manage guard so we return 400, not 403.
        if target_role == 'owner':
            return jsonify({'success': False, 'error': 'Cannot create another owner — only one per client'}), 400

        # Enforce hierarchy -- cannot create users at equal or higher level
        if not _can_manage(actor_role, target_role):
            return jsonify({
                'success': False,
                'error': 'You cannot create a user with an equal or higher role',
            }), 403

        # Manager can only create staff, never another manager or higher.
        if actor_role == 'manager' and target_role != 'staff':
            return jsonify({'success': False, 'error': 'Managers can only create staff users'}), 403

        # Resolve reports_to_id based on caller + target role combination.
        if actor_role == 'manager':
            # Manager creating staff → always reports to this manager; ignore client-supplied value.
            resolved_reports_to = g.user['user_id']
        elif actor_role == 'owner' and target_role == 'manager':
            # Owner creating manager → manager always reports directly to the owner.
            resolved_reports_to = g.user['user_id']
        elif actor_role == 'owner' and target_role == 'staff':
            # Owner creating staff → defaults to owner, unless client picks a specific manager.
            requested = data.get('reports_to_id')
            if requested:
                target_mgr = User.query.filter_by(
                    user_id=requested,
                    client_id=client_id,
                    role='manager',
                ).first()
                if not target_mgr:
                    return jsonify({
                        'success': False,
                        'error': 'reports_to_id must reference a manager in this client',
                    }), 400
                resolved_reports_to = requested
            else:
                resolved_reports_to = g.user['user_id']
        else:
            # Fallback — shouldn't reach here given @require_role guards above.
            resolved_reports_to = None
        # ── End hierarchy enforcement ────────────────────────────────────────

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

        # ── Per-role quota set by superadmin ──
        client_obj = ClientEntry.query.filter_by(client_id=client_id).first()
        if client_obj and client_obj.role_quotas:
            quota = client_obj.role_quotas.get(target_role)
            if quota is not None:
                role_count = db.session.query(db.func.count(User.user_id)).filter(
                    User.client_id == client_id,
                    User.role == target_role,
                    User.deleted_at.is_(None),
                ).scalar()
                if role_count >= quota:
                    return jsonify({
                        'success': False,
                        'error': 'ROLE_QUOTA_REACHED',
                        'message': f'Your account allows a maximum of {quota} {target_role}(s). Please contact support to increase the limit.',
                        'role': target_role,
                        'quota': quota,
                        'current': role_count,
                    }), 403

        # Generate invite token — password is set by the user when they accept the invite
        invite_token = secrets.token_urlsafe(32)
        invite_expires = datetime.utcnow() + timedelta(hours=INVITE_EXPIRY_HOURS)

        new_user = User(
            user_id=str(uuid.uuid4()),
            email=email,
            password_hash='',  # No password until invite is accepted
            client_id=client_id,
            role=target_role,
            full_name=(data.get('full_name') or '').strip(),
            phone=(data.get('phone') or '').strip(),
            department=(data.get('department') or '').strip(),
            is_active=False,          # Inactive until invite accepted
            branch_id=data.get('branch_id') or None,
            created_by=g.user['user_id'],
            reports_to_id=resolved_reports_to,
            invite_token=invite_token,
            invite_token_expires=invite_expires,
            invite_accepted=False,
        )

        db.session.add(new_user)
        db.session.flush()  # Get user_id for permission assignment

        # Assign permissions if provided
        permissions_list = data.get('permissions', [])
        if permissions_list and isinstance(permissions_list, list):
            # ── No-escalation: actor can only grant perms they hold ──
            not_grantable = _disallowed_grants(
                g.user['user_id'], permissions_list, g.user.get('is_super_admin', False)
            )
            if not_grantable:
                db.session.rollback()
                return jsonify({
                    'success': False,
                    'error': 'PERMISSION_NOT_GRANTABLE',
                    'message': f'You cannot grant permissions you do not hold: {", ".join(not_grantable)}',
                    'permissions': not_grantable,
                }), 403

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

            # Auto-save permission preset for this role (isolated via savepoint)
            try:
                nested = db.session.begin_nested()
                existing_preset = PermissionPreset.query.filter_by(
                    client_id=client_id, role=target_role,
                ).first()
                if existing_preset:
                    existing_preset.permissions = permissions_list
                    existing_preset.updated_at = datetime.utcnow()
                    existing_preset.updated_by = g.user['user_id']
                else:
                    db.session.add(PermissionPreset(
                        client_id=client_id,
                        role=target_role,
                        permissions=permissions_list,
                        updated_by=g.user['user_id'],
                    ))
                nested.commit()
            except Exception as preset_exc:
                nested.rollback()
                logger.warning("Failed to save permission preset: %s", preset_exc)

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

        # Fire webhook event — user.created
        try:
            from flask import current_app
            from services.webhook_service import dispatch_event
            dispatch_event(current_app._get_current_object(), client_id, 'user.created', {
                'event': 'user.created',
                'user_id': new_user.user_id,
                'email': email,
                'role': target_role,
                'full_name': new_user.full_name,
            })
        except Exception as _wh_err:
            logger.warning("webhook dispatch failed (user.created): %s", _wh_err)

        # Send invite email (fire-and-forget) — user will set their own password via the link
        client = ClientEntry.query.filter_by(client_id=client_id).first()
        frontend_url = Config.get_frontend_url()
        invite_url = f"{frontend_url}/accept-invite?token={invite_token}"
        send_invite_email(
            to_email=email,
            inviter_name=g.user.get('full_name') or g.user.get('email', ''),
            business_name=client.client_name if client else '',
            role=target_role,
            invite_url=invite_url,
        )

        user_dict = new_user.to_dict()
        user_dict.pop('password_hash', None)
        user_dict['permissions'] = permissions_list

        return jsonify({
            'success': True,
            'data': user_dict,
            'message': f'Invite sent to {email}. They will receive an email to set their password.',
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
@require_role(['owner', 'manager'])
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

        caller_role = g.user['role']

        # Subtree filter: manager can only edit users whose reports_to_id is themselves.
        if caller_role == 'manager':
            if str(user.reports_to_id or '') != str(g.user['user_id']):
                return jsonify({'error': 'Manager can only edit users they manage'}), 403

        # Only owner can change reports_to_id; ignore the field for non-owner callers.
        if 'reports_to_id' in data and caller_role != 'owner':
            data.pop('reports_to_id', None)

        # If owner is changing reports_to_id, validate the target is a manager in the same client.
        if caller_role == 'owner' and 'reports_to_id' in data and data['reports_to_id']:
            target_mgr = User.query.filter_by(
                user_id=data['reports_to_id'],
                client_id=g.user['client_id'],
                role='manager',
            ).first()
            if not target_mgr:
                return jsonify({'error': 'reports_to_id must reference a manager in this client'}), 400

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
        if 'reports_to_id' in data:
            user.reports_to_id = data['reports_to_id'] or None

        user.updated_at = datetime.utcnow()
        user.updated_by = g.user['user_id']
        user.synced_at = None  # re-queue for cloud upload (uploader skips non-NULL synced_at)

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

        # Fire webhook event — user.updated
        try:
            from flask import current_app
            from services.webhook_service import dispatch_event
            dispatch_event(current_app._get_current_object(), g.user['client_id'], 'user.updated', {
                'event': 'user.updated',
                'user_id': user_id,
                'changes': new_data,
            })
        except Exception as _wh_err:
            logger.warning("webhook dispatch failed (user.updated): %s", _wh_err)

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
@require_role(['owner', 'manager'])
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

        # Pre-delete bubble-up: if target is a manager with direct reports,
        # bubble those reports up to the manager's own reports_to_id (typically the owner).
        if user.role == 'manager':
            new_parent = user.reports_to_id  # typically the owner.user_id
            User.query.filter_by(reports_to_id=user.user_id).update(
                {'reports_to_id': new_parent},
                synchronize_session='fetch',
            )
            db.session.flush()

        user.deleted_at = datetime.utcnow()
        user.is_active = False
        user.updated_at = datetime.utcnow()
        user.updated_by = g.user['user_id']
        user.synced_at = None  # re-queue for cloud upload (uploader skips non-NULL synced_at)

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
@require_role(['owner', 'manager'])
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
        user.synced_at = None  # re-queue for cloud upload (uploader skips non-NULL synced_at)

        _log_team_action(
            action_type='team_member_status_toggled',
            record_id=user_id,
            old_data={'is_active': old_active},
            new_data={'is_active': user.is_active},
        )

        db.session.commit()

        # Fire webhook event — user.activated / user.deactivated
        try:
            from flask import current_app
            from services.webhook_service import dispatch_event
            evt = 'user.activated' if user.is_active else 'user.deactivated'
            dispatch_event(current_app._get_current_object(), g.user['client_id'], evt, {
                'event': evt,
                'user_id': user_id,
                'email': user.email,
                'is_active': user.is_active,
            })
        except Exception as _wh_err:
            logger.warning("webhook dispatch failed (%s): %s", 'toggle', _wh_err)

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
@rate_limit(max_requests=10, window_seconds=60, key_func=lambda: g.user['user_id'], error_message='Too many password resets. Please wait.')
@require_role(['owner', 'manager'])
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
        user.must_change_password = True  # Force user to change password on next login
        user.updated_at = datetime.utcnow()
        user.updated_by = g.user['user_id']
        # re-queue for cloud upload so the new password_hash propagates. NOTE:
        # must_change_password is NOT yet in the _sync_users upsert columns, so
        # the force-change flag itself won't reach the cloud (follow-up).
        user.synced_at = None

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
@require_role(['owner', 'manager'])
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
@require_role(['owner', 'manager'])
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

        # ── No-escalation: actor can only grant perms they hold ──
        not_grantable = _disallowed_grants(
            g.user['user_id'], permissions_list, g.user.get('is_super_admin', False)
        )
        if not_grantable:
            return jsonify({
                'success': False,
                'error': 'PERMISSION_NOT_GRANTABLE',
                'message': f'You cannot grant permissions you do not hold: {", ".join(not_grantable)}',
                'permissions': not_grantable,
            }), 403

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
@require_role(['owner', 'manager'])
def get_all_permissions():
    """Get all available permissions organized by section."""
    try:
        cache = get_cache_manager()
        cache_key = "team:permissions:all"
        cached = cache.get(cache_key)
        if cached is not None:
            return jsonify(cached), 200

        sections = get_all_sections_with_permissions()
        result = {'success': True, 'data': sections}
        cache.set(cache_key, result, 600)
        return jsonify(result), 200

    except Exception as exc:
        logger.error("get_all_permissions error: %s", exc)
        return jsonify({'success': False, 'error': 'Failed to fetch permissions'}), 500


# ---------------------------------------------------------------------------
# 10. GET /api/team/branches -- Get active branches for the form dropdown
# ---------------------------------------------------------------------------
@team_bp.route('/branches', methods=['GET'])
@authenticate
@require_role(['owner', 'manager'])
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
@require_role(['owner', 'manager'])
def get_plan_info():
    """Return plan name, team member limits, and allowed billing types."""
    try:
        client_id = g.user['client_id']

        cache = get_cache_manager()
        cache_key = f"team:plan-info:{client_id}"
        cached = cache.get(cache_key)
        if cached is not None:
            return jsonify(cached), 200

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

        # Build per-role quota status for the frontend
        client_obj = ClientEntry.query.filter_by(client_id=client_id).first()
        role_quotas = (client_obj.role_quotas or {}) if client_obj else {}
        role_usage: dict = {}
        if role_quotas:
            quota_roles = list(role_quotas.keys())
            rows = db.session.query(User.role, db.func.count(User.user_id)).filter(
                User.client_id == client_id,
                User.role.in_(quota_roles),
                User.deleted_at.is_(None),
            ).group_by(User.role).all()
            counts = {row[0]: row[1] for row in rows}
            for qrole, limit in role_quotas.items():
                used = counts.get(qrole, 0)
                role_usage[qrole] = {
                    'quota': limit,
                    'used': used,
                    'remaining': max(0, limit - used),
                    'at_limit': used >= limit,
                }

        result = {
            'success': True,
            'data': {
                'plan_name': plan_name,
                'is_trial': is_trial,
                'max_members': max_members,
                'current_members': current_members,
                'can_add_member': can_add,
                'allowed_billing': rules['allowed_billing'],
                'slots_remaining': max(0, max_members - current_members),
                'role_quotas': role_quotas,    # raw quotas {"admin":1, ...}
                'role_usage': role_usage,       # {"admin": {quota,used,remaining,at_limit}}
            },
        }
        cache.set(cache_key, result, 60)
        return jsonify(result), 200

    except Exception as exc:
        logger.error("get_plan_info error: %s", exc)
        return jsonify({'success': False, 'error': 'Failed to fetch plan info'}), 500


# ---------------------------------------------------------------------------
# 12. GET /api/team/presets/<role> -- Permission preset for a role
# ---------------------------------------------------------------------------
@team_bp.route('/presets/<role>', methods=['GET'])
@authenticate
@require_role(['owner', 'manager'])
def get_permission_preset(role):
    """Get the saved permission preset for a specific role (per client)."""
    try:
        client_id = g.user['client_id']

        if role not in ROLE_HIERARCHY:
            return jsonify({'success': False, 'error': 'Invalid role'}), 400

        preset = PermissionPreset.query.filter_by(
            client_id=client_id, role=role,
        ).first()

        if preset:
            data = preset.to_dict()
        else:
            # Return hardcoded defaults so fresh clients always get sensible starting permissions
            data = {
                'role': role,
                'permissions': DEFAULT_ROLE_PERMISSIONS.get(role, []),
                'is_default': True,  # signals frontend this is a system default, not a saved preset
            }

        return jsonify({
            'success': True,
            'data': data,
        }), 200

    except Exception as exc:
        logger.error("get_permission_preset error: %s", exc)
        return jsonify({'success': False, 'error': 'Failed to fetch preset'}), 500

