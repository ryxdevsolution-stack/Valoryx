import uuid
from datetime import datetime
from flask import Blueprint, request, jsonify, g
from extensions import db
from models.branch_model import Branch
from models.user_model import User
from utils.auth_middleware import authenticate
from utils.audit_logger import log_action
from utils.cache_helper import get_cache_manager

branch_bp = Blueprint('branches', __name__)

BRANCH_CACHE_TTL = 600  # 10 minutes — branches rarely change


def _bust_branch_cache(client_id):
    try:
        get_cache_manager().delete_pattern(f"branches:list:{client_id}")
    except Exception:
        pass


@branch_bp.route('', methods=['GET'])
@authenticate
def list_branches():
    """List all active branches. Includes manager info."""
    try:
        client_id = g.user['client_id']
        cache     = get_cache_manager()
        cache_key = f"branches:list:{client_id}"

        cached = cache.get(cache_key)
        if cached is not None:
            return jsonify(cached), 200

        branches = Branch.query.filter_by(
            client_id=client_id, is_active=True
        ).order_by(Branch.name).all()

        # Determine the main branch — the one created first (can never be deactivated/edited)
        if branches:
            oldest = min(branches, key=lambda b: b.created_at or datetime.min)
            main_branch_id = str(oldest.branch_id)
        else:
            main_branch_id = None

        # Fetch all active users for this client to attach as branch members
        all_users = User.query.filter(
            User.client_id == client_id,
            User.is_active == True,
            User.deleted_at.is_(None),
        ).all()

        # Group users by branch_id
        branch_members: dict[str, list] = {}
        unassigned_users: list = []
        for u in all_users:
            member = {
                'user_id': str(u.user_id),
                'full_name': u.full_name or u.email,
                'email': u.email,
                'role': u.role,
            }
            if u.branch_id:
                bid = str(u.branch_id)
                branch_members.setdefault(bid, []).append(member)
            else:
                unassigned_users.append(member)

        def branch_to_dict_with_main(b):
            d = b.to_dict()
            bid = str(b.branch_id)
            d['is_main'] = (bid == main_branch_id)
            d['members'] = branch_members.get(bid, [])
            # Main branch also shows unassigned users (they have access to all)
            if d['is_main']:
                d['members'] = d['members'] + unassigned_users
            return d

        response = {'success': True, 'data': [branch_to_dict_with_main(b) for b in branches]}
        cache.set(cache_key, response, BRANCH_CACHE_TTL)
        return jsonify(response), 200

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@branch_bp.route('', methods=['POST'])
@authenticate
def create_branch():
    """
    Create a new branch.
    Requires a manager_user_id (must be admin or manager role, same client).
    The assigned user's branch_id is updated to point to the new branch.
    """
    try:
        user_role = (g.user.get('role') or '').lower().strip()
        if user_role not in ('owner', 'manager'):
            return jsonify({
                'success': False,
                'error': 'Only owners and admins can create branches'
            }), 403

        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Request body required'}), 400

        client_id       = g.user['client_id']
        name            = (data.get('name', '') or '').strip()
        manager_user_id = (data.get('manager_user_id', '') or '').strip()

        if not name:
            return jsonify({'success': False, 'error': 'Branch name is required'}), 400

        # ── Hard block: manager assignment is mandatory ──────────────────────
        if not manager_user_id:
            return jsonify({
                'success': False,
                'error': 'A branch manager (admin or manager role) must be assigned before creating a branch'
            }), 400

        # Validate the assigned user
        manager = User.query.filter_by(
            user_id=manager_user_id,
            client_id=client_id,
            is_active=True
        ).filter(User.deleted_at.is_(None)).first()

        if not manager:
            return jsonify({'success': False, 'error': 'Assigned user not found or inactive'}), 404

        if manager.role not in ('admin', 'manager'):
            return jsonify({
                'success': False,
                'error': f'The assigned user must have admin or manager role (current role: {manager.role})'
            }), 400

        # Check for duplicate branch name within the same tenant
        existing = Branch.query.filter_by(client_id=client_id, name=name, is_active=True).first()
        if existing:
            return jsonify({
                'success': True,
                'data':    existing.to_dict(),
                'message': 'Branch already exists',
            }), 200

        branch_id = str(uuid.uuid4())

        new_branch = Branch(
            branch_id  = branch_id,
            client_id  = client_id,
            name       = name,
            location   = (data.get('location', '') or '').strip() or None,
            manager_id = manager_user_id,
            is_active  = True,
            created_at = datetime.utcnow(),
            updated_at = datetime.utcnow(),
        )
        db.session.add(new_branch)

        # Assign user to this branch
        manager.branch_id = branch_id
        manager.updated_at = datetime.utcnow()

        log_action('CREATE', 'branches', branch_id, None, new_branch.to_dict())
        db.session.commit()
        _bust_branch_cache(client_id)

        return jsonify({
            'success': True,
            'data':    new_branch.to_dict(),
            'message': f'Branch created and {manager.full_name or manager.email} assigned as manager'
        }), 201

    except Exception:
        db.session.rollback()
        return jsonify({'success': False, 'error': 'Failed to create branch'}), 500


@branch_bp.route('/<branch_id>', methods=['PUT'])
@authenticate
def update_branch(branch_id):
    """Update branch name/location, and optionally reassign manager."""
    try:
        user_role = (g.user.get('role') or '').lower().strip()
        if user_role not in ('owner', 'manager'):
            return jsonify({'success': False, 'error': 'Only owners and admins can update branches'}), 403

        client_id = g.user['client_id']
        data      = request.get_json()

        branch = Branch.query.filter_by(branch_id=branch_id, client_id=client_id).first()
        if not branch:
            return jsonify({'success': False, 'error': 'Branch not found'}), 404

        old_data = branch.to_dict()

        if data and 'name' in data:
            branch.name = data['name'].strip()
        if data and 'location' in data:
            branch.location = (data['location'] or '').strip() or None

        # Optional: reassign manager
        new_manager_id = (data or {}).get('manager_user_id', '').strip() if data else ''
        if new_manager_id and new_manager_id != str(branch.manager_id or ''):
            new_mgr = User.query.filter_by(
                user_id=new_manager_id, client_id=client_id, is_active=True
            ).filter(User.deleted_at.is_(None)).first()

            if not new_mgr:
                return jsonify({'success': False, 'error': 'New manager user not found'}), 404
            if new_mgr.role not in ('admin', 'manager'):
                return jsonify({'success': False,
                                'error': 'New manager must have admin or manager role'}), 400

            # Remove old manager's branch assignment
            if branch.manager_id:
                old_mgr = User.query.filter_by(
                    user_id=str(branch.manager_id), client_id=client_id
                ).first()
                if old_mgr and str(old_mgr.branch_id or '') == str(branch_id):
                    old_mgr.branch_id = None

            new_mgr.branch_id  = branch_id
            branch.manager_id  = new_manager_id

        branch.updated_at = datetime.utcnow()
        log_action('UPDATE', 'branches', branch_id, old_data, branch.to_dict())
        db.session.commit()
        _bust_branch_cache(client_id)

        return jsonify({
            'success': True,
            'data':    branch.to_dict(),
            'message': 'Branch updated successfully'
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@branch_bp.route('/<branch_id>', methods=['DELETE'])
@authenticate
def delete_branch(branch_id):
    """Soft-delete a branch."""
    try:
        user_role = (g.user.get('role') or '').lower().strip()
        if user_role not in ('owner', 'manager'):
            return jsonify({'success': False, 'error': 'Only owners and admins can delete branches'}), 403

        client_id = g.user['client_id']
        branch    = Branch.query.filter_by(branch_id=branch_id, client_id=client_id).first()
        if not branch:
            return jsonify({'success': False, 'error': 'Branch not found'}), 404

        # Protect the main branch (oldest created_at) from deactivation
        oldest = Branch.query.filter_by(
            client_id=client_id, is_active=True
        ).order_by(Branch.created_at).first()
        if oldest and str(oldest.branch_id) == str(branch_id):
            return jsonify({'success': False, 'error': 'The main branch cannot be deactivated'}), 400

        old_data = branch.to_dict()
        branch.is_active  = False
        branch.updated_at = datetime.utcnow()

        log_action('DELETE', 'branches', branch_id, old_data, branch.to_dict())
        db.session.commit()
        _bust_branch_cache(client_id)

        return jsonify({'success': True, 'message': 'Branch deactivated successfully'}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@branch_bp.route('/available-managers', methods=['GET'])
@authenticate
def list_available_managers():
    """
    Returns admin/manager users who are not yet assigned to any branch.
    Used in the branch creation UI.
    """
    try:
        user_role = (g.user.get('role') or '').lower().strip()
        if user_role not in ('owner', 'manager'):
            return jsonify({'success': False, 'error': 'Access denied'}), 403

        client_id = g.user['client_id']

        # Collect all user IDs that are already "taken":
        # 1. Users with branch_id set (assigned to a specific branch)
        # 2. Users listed as manager_id on any active branch
        # 3. Active users with branch_id=NULL (they appear under Main Branch)
        #
        # Only truly new users (pending invite, not yet placed) are available.

        assigned_mgr_rows = db.session.query(Branch.manager_id).filter(
            Branch.client_id == client_id,
            Branch.is_active == True,
            Branch.manager_id.isnot(None),
        ).all()
        assigned_mgr_ids = {str(r[0]) for r in assigned_mgr_rows}

        all_candidates = User.query.filter(
            User.client_id == client_id,
            User.role.in_(['admin', 'manager']),
            db.or_(
                User.is_active == True,
                db.and_(User.invite_accepted == False, User.deleted_at.is_(None))
            ),
            User.deleted_at.is_(None),
        ).order_by(User.full_name).all()

        users = [
            u for u in all_candidates
            if str(u.user_id) not in assigned_mgr_ids  # not already a branch manager
            and u.branch_id is None                     # not assigned to any branch
            and not u.is_active                         # not an active main-branch member
        ]

        return jsonify({
            'success': True,
            'data': [
                {
                    'user_id':   str(u.user_id),
                    'full_name': u.full_name or u.email,
                    'email':     u.email,
                    'role':      u.role,
                }
                for u in users
            ]
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
