import uuid
from datetime import datetime
from flask import Blueprint, request, jsonify, g
from extensions import db
from models.branch_model import Branch
from utils.auth_middleware import authenticate
from utils.audit_logger import log_action

branch_bp = Blueprint('branches', __name__)


@branch_bp.route('', methods=['GET'])
@authenticate
def list_branches():
    """List all active branches for the authenticated user's client."""
    try:
        client_id = g.user['client_id']

        branches = Branch.query.filter_by(
            client_id=client_id,
            is_active=True
        ).order_by(Branch.name).all()

        return jsonify({
            'success': True,
            'data': [branch.to_dict() for branch in branches]
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@branch_bp.route('', methods=['POST'])
@authenticate
def create_branch():
    """Create a new branch. Only owners and admins are allowed."""
    try:
        # Role check
        user_role = (g.user.get('role') or '').lower().strip()
        if user_role not in ('owner', 'admin'):
            return jsonify({
                'success': False,
                'error': 'Only owners and admins can create branches'
            }), 403

        data = request.get_json()
        client_id = g.user['client_id']

        # Validate required fields
        if not data or not data.get('name', '').strip():
            return jsonify({
                'success': False,
                'error': 'Branch name is required'
            }), 400

        branch_id = str(uuid.uuid4())

        new_branch = Branch(
            branch_id=branch_id,
            client_id=client_id,
            name=data['name'].strip(),
            location=data.get('location', '').strip() or None,
            is_active=True,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )

        db.session.add(new_branch)

        # Audit log (added to session, committed together)
        log_action('CREATE', 'branches', branch_id, None, new_branch.to_dict())

        db.session.commit()

        return jsonify({
            'success': True,
            'data': new_branch.to_dict(),
            'message': 'Branch created successfully'
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@branch_bp.route('/<branch_id>', methods=['PUT'])
@authenticate
def update_branch(branch_id):
    """Update an existing branch. Only owners and admins are allowed."""
    try:
        # Role check
        user_role = (g.user.get('role') or '').lower().strip()
        if user_role not in ('owner', 'admin'):
            return jsonify({
                'success': False,
                'error': 'Only owners and admins can update branches'
            }), 403

        client_id = g.user['client_id']
        data = request.get_json()

        # Find the branch scoped to this client
        branch = Branch.query.filter_by(
            branch_id=branch_id,
            client_id=client_id
        ).first()

        if not branch:
            return jsonify({
                'success': False,
                'error': 'Branch not found'
            }), 404

        # Store old data for audit
        old_data = branch.to_dict()

        # Update fields from request body
        if data and 'name' in data:
            branch.name = data['name'].strip()
        if data and 'location' in data:
            branch.location = data['location'].strip() or None

        branch.updated_at = datetime.utcnow()

        # Audit log
        log_action('UPDATE', 'branches', branch_id, old_data, branch.to_dict())

        db.session.commit()

        return jsonify({
            'success': True,
            'data': branch.to_dict(),
            'message': 'Branch updated successfully'
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@branch_bp.route('/<branch_id>', methods=['DELETE'])
@authenticate
def delete_branch(branch_id):
    """Soft-delete a branch (set is_active=False). Only owners and admins are allowed."""
    try:
        # Role check
        user_role = (g.user.get('role') or '').lower().strip()
        if user_role not in ('owner', 'admin'):
            return jsonify({
                'success': False,
                'error': 'Only owners and admins can delete branches'
            }), 403

        client_id = g.user['client_id']

        # Find the branch scoped to this client
        branch = Branch.query.filter_by(
            branch_id=branch_id,
            client_id=client_id
        ).first()

        if not branch:
            return jsonify({
                'success': False,
                'error': 'Branch not found'
            }), 404

        # Store old data for audit
        old_data = branch.to_dict()

        # Soft delete
        branch.is_active = False
        branch.updated_at = datetime.utcnow()

        # Audit log
        log_action('DELETE', 'branches', branch_id, old_data, branch.to_dict())

        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Branch deactivated successfully'
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
