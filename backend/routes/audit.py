from flask import Blueprint, request, jsonify, g
from extensions import db
from models.audit_model import AuditLog
from models.user_model import User
from models.permission_model import get_user_permissions
from utils.auth_middleware import authenticate

audit_bp = Blueprint('audit', __name__)


@audit_bp.route('/logs', methods=['GET'])
@authenticate
def get_audit_logs():
    """
    Get audit logs filtered by client_id and user permissions

    Permission-based filtering:
    - view_all_bills: User can see all bills from all staff in their client
    - view_own_bills: User can only see their own bills
    - gst_billing: User can see GST billing logs
    - non_gst_billing: User can see non-GST billing logs
    """
    try:
        client_id = g.user['client_id']
        user_id = g.user['user_id']
        is_super_admin = g.user.get('is_super_admin', False)

        # Get user's permissions
        user_permissions = g.user.get('permissions', [])
        if not user_permissions:
            user_permissions = get_user_permissions(user_id)

        # Get query parameters
        action = request.args.get('action')
        date_from = request.args.get('date_from')
        date_to = request.args.get('date_to')
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 50))

        # Build query - ALWAYS filter by client_id first (mandatory)
        query = AuditLog.query.filter_by(client_id=client_id)

        # Permission-based user filtering
        # Super admin or users with view_all_bills can see all bills
        # Users with only view_own_bills see only their own bills
        has_view_all = is_super_admin or 'view_all_bills' in user_permissions
        has_view_own = 'view_own_bills' in user_permissions

        if not has_view_all:
            # User can only see their own audit logs
            query = query.filter(AuditLog.user_id == user_id)

        # Filter by billing table based on permissions (for billing-related logs)
        # Determine which billing tables user can see
        allowed_tables = []
        if is_super_admin or 'gst_billing' in user_permissions:
            allowed_tables.append('gst_billing')
        if is_super_admin or 'non_gst_billing' in user_permissions:
            allowed_tables.append('non_gst_billing')

        # If filtering for billing logs only, apply table filter
        # Otherwise show all logs (including non-billing actions)
        billing_only = request.args.get('billing_only', 'false').lower() == 'true'
        if billing_only and allowed_tables:
            query = query.filter(AuditLog.table_name.in_(allowed_tables))

        if action:
            query = query.filter_by(action_type=action)

        if date_from:
            query = query.filter(AuditLog.timestamp >= date_from)

        if date_to:
            query = query.filter(AuditLog.timestamp <= date_to)

        # Get total count
        total_records = query.count()

        # Paginate
        logs = query.order_by(AuditLog.timestamp.desc()).offset((page - 1) * limit).limit(limit).all()

        # Enrich logs with user emails
        log_list = []
        for log in logs:
            log_dict = {
                'log_id': log.log_id,
                'action_type': log.action_type,
                'table_name': log.table_name,
                'record_id': log.record_id,
                'user_id': log.user_id,
                'old_data': log.old_data,
                'new_data': log.new_data,
                'ip_address': log.ip_address,
                'user_agent': log.user_agent,
                'timestamp': log.timestamp.isoformat() if log.timestamp else None
            }

            # Get user email
            if log.user_id:
                user = User.query.filter_by(user_id=log.user_id).first()
                log_dict['user_email'] = user.email if user else 'Unknown'
            else:
                log_dict['user_email'] = 'System'

            log_list.append(log_dict)

        return jsonify({
            'success': True,
            'logs': log_list,
            'total_pages': (total_records + limit - 1) // limit
        }), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch audit logs', 'message': str(e)}), 500


@audit_bp.route('/export', methods=['GET'])
@authenticate
def export_audit_logs():
    """Export audit trail for client_id"""
    try:
        client_id = g.user['client_id']

        # Get all logs for this client
        logs = AuditLog.query.filter_by(client_id=client_id).order_by(AuditLog.timestamp.desc()).all()

        # TODO: Generate CSV/PDF export file

        return jsonify({
            'success': True,
            'message': 'Audit export functionality coming soon',
            'total_logs': len(logs)
        }), 200

    except Exception as e:
        return jsonify({'error': 'Failed to export audit logs', 'message': str(e)}), 500
