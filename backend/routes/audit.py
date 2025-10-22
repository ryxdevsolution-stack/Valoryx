from flask import Blueprint, request, jsonify, g
from extensions import db
from models.audit_model import AuditLog
from models.user_model import User
from utils.auth_middleware import authenticate

audit_bp = Blueprint('audit', __name__)


@audit_bp.route('/logs', methods=['GET'])
@authenticate
def get_audit_logs():
    """
    Get audit logs filtered by client_id
    Supports filtering by action_type and date range
    """
    try:
        client_id = g.user['client_id']

        # Get query parameters
        action = request.args.get('action')
        date_from = request.args.get('date_from')
        date_to = request.args.get('date_to')
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 50))

        # Build query
        query = AuditLog.query.filter_by(client_id=client_id)

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
