import uuid
from datetime import datetime
from flask import Blueprint, request, jsonify, g
from sqlalchemy import func
from extensions import db
from models.report_model import Report
from models.billing_model import GSTBilling, NonGSTBilling
from models.payment_model import PaymentType
from utils.auth_middleware import authenticate
from utils.audit_logger import log_action

report_bp = Blueprint('report', __name__)


@report_bp.route('/generate', methods=['POST'])
@authenticate
def generate_report():
    """
    Generate report with client_id filtering
    Combines GST + Non-GST data
    """
    try:
        data = request.get_json()
        client_id = g.user['client_id']

        # Validate required fields
        required_fields = ['start_date', 'end_date']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400

        date_from = datetime.fromisoformat(data['start_date']).date()
        date_to = datetime.fromisoformat(data['end_date']).date()

        # Query GST billing data
        gst_bills = GSTBilling.query.filter(
            GSTBilling.client_id == client_id,
            func.date(GSTBilling.created_at) >= date_from,
            func.date(GSTBilling.created_at) <= date_to,
            GSTBilling.status == 'final'
        ).all()

        # Query Non-GST billing data
        non_gst_bills = NonGSTBilling.query.filter(
            NonGSTBilling.client_id == client_id,
            func.date(NonGSTBilling.created_at) >= date_from,
            func.date(NonGSTBilling.created_at) <= date_to,
            NonGSTBilling.status == 'final'
        ).all()

        # Calculate totals
        total_gst_bills = len(gst_bills)
        total_non_gst_bills = len(non_gst_bills)
        total_gst_amount = sum(float(bill.final_amount) for bill in gst_bills)
        total_non_gst_amount = sum(float(bill.total_amount) for bill in non_gst_bills)
        total_revenue = total_gst_amount + total_non_gst_amount

        # Calculate payment breakdown
        payment_breakdown = {}

        # Get payment type names
        payment_types = PaymentType.query.filter_by(client_id=client_id).all()
        payment_map = {pt.payment_type_id: pt.payment_name for pt in payment_types}

        for bill in gst_bills:
            payment_name = payment_map.get(bill.payment_type, 'Unknown')
            payment_breakdown[payment_name] = payment_breakdown.get(payment_name, 0) + float(bill.final_amount)

        for bill in non_gst_bills:
            payment_name = payment_map.get(bill.payment_type, 'Unknown')
            payment_breakdown[payment_name] = payment_breakdown.get(payment_name, 0) + float(bill.total_amount)

        # Create report entry
        new_report = Report(
            report_id=str(uuid.uuid4()),
            client_id=client_id,
            report_type='custom',
            date_from=date_from,
            date_to=date_to,
            total_gst_bills=total_gst_bills,
            total_non_gst_bills=total_non_gst_bills,
            total_gst_amount=total_gst_amount,
            total_non_gst_amount=total_non_gst_amount,
            total_revenue=total_revenue,
            payment_breakdown=payment_breakdown,
            file_url=None,  # TODO: Generate CSV/PDF file and upload to storage
            generated_by=g.user['user_id'],
            created_at=datetime.utcnow()
        )

        db.session.add(new_report)
        db.session.commit()

        # Log action
        log_action('CREATE', 'report', new_report.report_id, None, new_report.to_dict())

        return jsonify({
            'success': True,
            'report': {
                'report_id': new_report.report_id,
                'start_date': str(date_from),
                'end_date': str(date_to),
                'total_sales': str(total_revenue),
                'gst_sales': str(total_gst_amount),
                'non_gst_sales': str(total_non_gst_amount),
                'payment_breakdown': payment_breakdown,
                'created_at': new_report.created_at.isoformat()
            }
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to generate report', 'message': str(e)}), 500


@report_bp.route('/list', methods=['GET'])
@authenticate
def get_reports():
    """List reports filtered by client_id"""
    try:
        client_id = g.user['client_id']

        reports = Report.query.filter_by(client_id=client_id).order_by(Report.created_at.desc()).all()

        return jsonify({
            'success': True,
            'reports': [report.to_dict() for report in reports]
        }), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch reports', 'message': str(e)}), 500


@report_bp.route('/<report_id>', methods=['GET'])
@authenticate
def get_report_details(report_id):
    """Get report details with client_id validation"""
    try:
        client_id = g.user['client_id']

        report = Report.query.filter_by(report_id=report_id, client_id=client_id).first()

        if not report:
            return jsonify({'error': 'Report not found'}), 404

        return jsonify({
            'success': True,
            'report': report.to_dict()
        }), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch report', 'message': str(e)}), 500
