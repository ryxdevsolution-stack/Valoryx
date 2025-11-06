import uuid
from datetime import datetime
from flask import Blueprint, request, jsonify, g
from extensions import db
from models.client_model import ClientEntry
from utils.auth_middleware import authenticate, require_role
from utils.permission_middleware import require_super_admin
from utils.audit_logger import log_action

client_bp = Blueprint('client', __name__)


@client_bp.route('', methods=['POST'])
@authenticate
@require_super_admin
def create_client():
    """
    Register new client (super admin only)
    NOTE: This endpoint is deprecated. Use /api/admin/clients instead which also creates the user.
    Returns client_id for user registration
    """
    try:
        data = request.get_json()

        # Validate required fields
        required_fields = ['client_name', 'email', 'phone']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400

        # Check if client already exists
        existing_client = ClientEntry.query.filter_by(email=data['email']).first()
        if existing_client:
            return jsonify({'error': 'Client with this email already exists'}), 409

        # Create client
        new_client = ClientEntry(
            client_id=str(uuid.uuid4()),
            client_name=data['client_name'],
            email=data['email'],
            logo_url=data.get('logo_url'),
            address=data.get('address'),
            gst_number=data.get('gst_number'),
            phone=data['phone'],
            created_at=datetime.utcnow(),
            is_active=True
        )

        db.session.add(new_client)
        db.session.commit()

        return jsonify({
            'success': True,
            'client_id': new_client.client_id,
            'message': 'Client registered successfully'
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to create client', 'message': str(e)}), 500


@client_bp.route('/<client_id>', methods=['GET'])
@authenticate
def get_client(client_id):
    """
    Get client details
    User can only access their own client_id
    """
    try:
        # Verify user is accessing their own client
        if client_id != g.user['client_id']:
            return jsonify({'error': 'Access denied'}), 403

        client = ClientEntry.query.filter_by(client_id=client_id).first()

        if not client:
            return jsonify({'error': 'Client not found'}), 404

        return jsonify({
            'success': True,
            'client': client.to_dict()
        }), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch client', 'message': str(e)}), 500


@client_bp.route('/<client_id>', methods=['PUT'])
@authenticate
def update_client(client_id):
    """Update client information"""
    try:
        # Verify user is accessing their own client
        if client_id != g.user['client_id']:
            return jsonify({'error': 'Access denied'}), 403

        client = ClientEntry.query.filter_by(client_id=client_id).first()

        if not client:
            return jsonify({'error': 'Client not found'}), 404

        # Store old data for audit
        old_data = client.to_dict()

        data = request.get_json()

        # Update fields
        if 'client_name' in data:
            client.client_name = data['client_name']
        if 'logo_url' in data:
            client.logo_url = data['logo_url']
        if 'address' in data:
            client.address = data['address']
        if 'gst_number' in data:
            client.gst_number = data['gst_number']
        if 'phone' in data:
            client.phone = data['phone']

        db.session.commit()

        # Log action
        log_action('UPDATE', 'client_entry', client_id, old_data, client.to_dict())

        return jsonify({
            'success': True,
            'message': 'Client updated successfully',
            'client': client.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to update client', 'message': str(e)}), 500
