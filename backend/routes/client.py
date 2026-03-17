import uuid
import secrets as _secrets
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, g
from extensions import db
from models.client_model import ClientEntry
from models.user_model import User
from utils.auth_middleware import authenticate
from utils.permission_middleware import require_super_admin
from utils.audit_logger import log_action
from utils.supabase_storage import delete_logo, replace_logo
from utils.email_service import (
    send_account_deletion_scheduled_email,
    send_deletion_cancelled_email,
)
from config import Config
from utils.totp_helper import require_totp_action_token

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
@authenticate(allow_expired=True)
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
        if 'telegram_chat_id' in data:
            client.telegram_chat_id = data['telegram_chat_id'] or None

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


@client_bp.route('/<client_id>/upload-logo', methods=['POST'])
@authenticate
def upload_client_logo(client_id):
    """
    Upload or replace client logo
    User can upload logo for their own client_id, or super admin can upload for any client
    Accepts multipart/form-data with 'logo' file field
    """
    try:
        # Verify user is accessing their own client OR is super admin
        is_super_admin = g.user.get('is_super_admin', False)
        if not is_super_admin and client_id != g.user['client_id']:
            return jsonify({'error': 'Access denied'}), 403

        # Get client
        client = ClientEntry.query.filter_by(client_id=client_id).first()

        if not client:
            return jsonify({'error': 'Client not found'}), 404

        # Check if file is present
        if 'logo' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['logo']

        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        # Store old data for audit
        old_data = client.to_dict()
        old_logo_url = client.logo_url

        # Upload logo (will replace old one if exists)
        success, new_url, error = replace_logo(old_logo_url, file, client_id)

        if not success:
            return jsonify({'error': error}), 400

        # Update database
        client.logo_url = new_url
        db.session.commit()

        # Log action
        log_action('UPDATE', 'client_entry', client_id, old_data, client.to_dict())

        return jsonify({
            'success': True,
            'message': 'Logo uploaded successfully',
            'logo_url': new_url
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to upload logo', 'message': str(e)}), 500


@client_bp.route('/<client_id>/delete-logo', methods=['DELETE'])
@authenticate
def delete_client_logo(client_id):
    """
    Delete client logo
    User can delete logo for their own client_id, or super admin can delete for any client
    """
    try:
        # Verify user is accessing their own client OR is super admin
        is_super_admin = g.user.get('is_super_admin', False)
        if not is_super_admin and client_id != g.user['client_id']:
            return jsonify({'error': 'Access denied'}), 403

        # Get client
        client = ClientEntry.query.filter_by(client_id=client_id).first()

        if not client:
            return jsonify({'error': 'Client not found'}), 404

        if not client.logo_url:
            return jsonify({'error': 'No logo to delete'}), 404

        # Store old data for audit
        old_data = client.to_dict()

        # Delete from storage
        success, error = delete_logo(client.logo_url, client_id)

        if not success:
            return jsonify({'error': error}), 400

        # Update database
        client.logo_url = None
        db.session.commit()

        # Log action
        log_action('UPDATE', 'client_entry', client_id, old_data, client.to_dict())

        return jsonify({
            'success': True,
            'message': 'Logo deleted successfully'
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to delete logo', 'message': str(e)}), 500


# ---------------------------------------------------------------------------
# Account Deletion / GDPR
# ---------------------------------------------------------------------------

_DELETION_GRACE_DAYS = 30


@client_bp.route('/<client_id>/request-deletion', methods=['POST'])
@authenticate
def request_account_deletion(client_id):
    """
    Schedule account for deletion 30 days from now.
    Only the account owner (role=owner) may request this.
    Generates a reactivation token and emails it so the user can cancel.
    """
    try:
        if client_id != g.user['client_id']:
            return jsonify({'error': 'Access denied'}), 403

        if g.user.get('role') != 'owner':
            return jsonify({'error': 'Only the account owner can request deletion'}), 403

        client = ClientEntry.query.filter_by(client_id=client_id).first()
        if not client:
            return jsonify({'error': 'Client not found'}), 404

        if client.deletion_scheduled_at:
            return jsonify({
                'success': True,
                'message': 'Deletion already scheduled',
                'deletion_scheduled_at': client.deletion_scheduled_at.isoformat(),
            }), 200

        data = request.get_json() or {}

        # TOTP gate: self-registered owners with 2FA must verify before deletion
        owner = User.query.filter_by(user_id=g.user['user_id']).first()
        if owner:
            totp_err = require_totp_action_token(owner, data)
            if totp_err:
                return totp_err

        reason = data.get('reason', '')

        now = datetime.utcnow()
        deletion_date = now + timedelta(days=_DELETION_GRACE_DAYS)
        reactivation_token = _secrets.token_hex(32)

        client.deletion_requested_at = now
        client.deletion_scheduled_at = deletion_date
        client.deletion_requested_by = g.user['user_id']
        client.deletion_reactivation_token = reactivation_token
        db.session.commit()

        log_action('DELETE_REQUESTED', 'client_entry', client_id,
                   {'reason': reason}, {'deletion_scheduled_at': deletion_date.isoformat()})

        reactivation_link = f"{Config.FRONTEND_URL}/reactivate-account?token={reactivation_token}"
        send_account_deletion_scheduled_email(
            client.email,
            client.client_name,
            deletion_date.strftime('%B %d, %Y'),
            reactivation_link,
        )

        return jsonify({
            'success': True,
            'message': f'Account scheduled for deletion on {deletion_date.strftime("%B %d, %Y")}. '
                       'Check your email for a reactivation link if you change your mind.',
            'deletion_scheduled_at': deletion_date.isoformat(),
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to schedule deletion', 'message': str(e)}), 500


@client_bp.route('/reactivate', methods=['POST'])
def reactivate_account():
    """
    Cancel a pending deletion using the reactivation token from the email.
    No auth required — the token IS the credential.
    """
    try:
        data = request.get_json() or {}
        token = (data.get('token') or '').strip()
        if not token:
            return jsonify({'error': 'Reactivation token is required'}), 400

        client = ClientEntry.query.filter_by(deletion_reactivation_token=token).first()
        if not client:
            return jsonify({'error': 'Invalid or expired reactivation token'}), 400

        if not client.deletion_scheduled_at:
            return jsonify({'error': 'No pending deletion for this account'}), 400

        client.deletion_requested_at = None
        client.deletion_scheduled_at = None
        client.deletion_requested_by = None
        client.deletion_reactivation_token = None
        db.session.commit()

        log_action('DELETE_CANCELLED', 'client_entry', client.client_id, {}, {})

        send_deletion_cancelled_email(client.email, client.client_name)

        return jsonify({
            'success': True,
            'message': 'Account deletion cancelled. Your account is active again.',
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to reactivate account', 'message': str(e)}), 500


@client_bp.route('/<client_id>/export-data', methods=['GET'])
@authenticate
def export_account_data(client_id):
    """
    Export all client data as JSON (GDPR right-to-access).
    Only the account owner may call this.
    """
    try:
        if client_id != g.user['client_id']:
            return jsonify({'error': 'Access denied'}), 403

        if g.user.get('role') != 'owner':
            return jsonify({'error': 'Only the account owner can export data'}), 403

        client = ClientEntry.query.filter_by(client_id=client_id).first()
        if not client:
            return jsonify({'error': 'Client not found'}), 404

        users = User.query.filter_by(client_id=client_id).all()

        export = {
            'exported_at': datetime.utcnow().isoformat(),
            'client': client.to_dict(),
            'users': [
                {
                    'user_id': u.user_id,
                    'email': u.email,
                    'full_name': u.full_name,
                    'role': u.role,
                    'is_active': u.is_active,
                    'created_at': u.created_at.isoformat() if u.created_at else None,
                }
                for u in users
            ],
        }

        log_action('DATA_EXPORTED', 'client_entry', client_id, {}, {})

        return jsonify({'success': True, 'data': export}), 200

    except Exception as e:
        return jsonify({'error': 'Failed to export data', 'message': str(e)}), 500
