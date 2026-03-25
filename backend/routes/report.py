import uuid
import io
from datetime import datetime, time as _time, timedelta as _td
import pytz
from flask import Blueprint, request, jsonify, g, send_file
from sqlalchemy import func
from extensions import db
from models.report_model import Report
from models.billing_model import GSTBilling, NonGSTBilling
from utils.auth_middleware import authenticate
from utils.audit_logger import log_action
from utils.rate_limiter import rate_limit
from utils.permission_middleware import require_permission

report_bp = Blueprint('report', __name__)


@report_bp.route('/generate', methods=['POST'])
@authenticate
@require_permission('view_sales_reports')
def generate_report():
    """
    Generate report with client_id and user permission filtering
    Combines GST + Non-GST data

    Permission-based filtering:
    - view_all_bills: User can see reports for all bills in their client
    - view_own_bills: User can only see reports for bills they created
    """
    try:
        data = request.get_json()
        client_id = g.user['client_id']
        user_id = g.user['user_id']

        # Check user permissions for filtering
        user_permissions = g.user.get('permissions', [])
        is_super_admin = g.user.get('is_super_admin', False)
        has_view_all = is_super_admin or 'view_all_bills' in user_permissions

        # Validate required fields
        required_fields = ['start_date', 'end_date']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400

        date_from = datetime.fromisoformat(data['start_date']).date()
        date_to = datetime.fromisoformat(data['end_date']).date()

        # HIGH-4: Use range comparison on created_at directly so the B-tree index is usable.
        # func.date(created_at) wraps the column in a function, preventing index use.
        dt_from = datetime.combine(date_from, _time.min)
        dt_to   = datetime.combine(date_to + _td(days=1), _time.min)

        # OPTIMIZED: Use SQL aggregation for totals instead of loading all ORM objects
        def _apply_date_user_filter(query, model, amount_col):
            """Apply common date range + user permission filters."""
            query = query.filter(
                model.client_id == client_id,
                model.created_at >= dt_from,
                model.created_at <  dt_to,
                model.status == 'final'
            )
            if not has_view_all:
                query = query.filter(model.created_by == user_id)
            return query

        # Aggregate totals in SQL — no full row loading
        gst_agg = _apply_date_user_filter(
            db.session.query(
                func.count(GSTBilling.bill_id).label('cnt'),
                func.coalesce(func.sum(GSTBilling.final_amount), 0).label('total')
            ), GSTBilling, GSTBilling.final_amount
        ).first()

        nongst_agg = _apply_date_user_filter(
            db.session.query(
                func.count(NonGSTBilling.bill_id).label('cnt'),
                func.coalesce(func.sum(NonGSTBilling.total_amount), 0).label('total')
            ), NonGSTBilling, NonGSTBilling.total_amount
        ).first()

        total_gst_bills = gst_agg.cnt
        total_non_gst_bills = nongst_agg.cnt
        total_gst_amount = float(gst_agg.total)
        total_non_gst_amount = float(nongst_agg.total)
        total_revenue = total_gst_amount + total_non_gst_amount

        # Payment breakdown via SQL GROUP BY
        payment_breakdown = {}

        gst_pay_query = _apply_date_user_filter(
            db.session.query(
                GSTBilling.payment_type,
                func.sum(GSTBilling.final_amount).label('total')
            ), GSTBilling, GSTBilling.final_amount
        ).group_by(GSTBilling.payment_type)

        for row in gst_pay_query.all():
            name = str(row.payment_type).strip() if row.payment_type else 'Unknown'
            payment_breakdown[name] = payment_breakdown.get(name, 0) + float(row.total or 0)

        nongst_pay_query = _apply_date_user_filter(
            db.session.query(
                NonGSTBilling.payment_type,
                func.sum(NonGSTBilling.total_amount).label('total')
            ), NonGSTBilling, NonGSTBilling.total_amount
        ).group_by(NonGSTBilling.payment_type)

        for row in nongst_pay_query.all():
            name = str(row.payment_type).strip() if row.payment_type else 'Unknown'
            payment_breakdown[name] = payment_breakdown.get(name, 0) + float(row.total or 0)

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
@require_permission('view_sales_reports')
def get_reports():
    """List reports filtered by client_id with pagination"""
    try:
        client_id = g.user['client_id']
        page  = max(1, int(request.args.get('page', 1)))
        limit = min(int(request.args.get('limit', 50)), 200)
        offset = (page - 1) * limit

        base_query = Report.query.filter_by(client_id=client_id)
        total   = base_query.count()
        reports = base_query.order_by(Report.created_at.desc()).offset(offset).limit(limit).all()

        return jsonify({
            'success': True,
            'reports': [report.to_dict() for report in reports],
            'total': total,
            'page': page,
            'limit': limit,
        }), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch reports', 'message': str(e)}), 500


@report_bp.route('/<report_id>', methods=['GET'])
@authenticate
@require_permission('view_sales_reports')
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


@report_bp.route('/export-pdf', methods=['POST'])
@authenticate
@require_permission('export_reports')
@rate_limit(max_requests=10, window_seconds=60, key_func=lambda: g.user['user_id'], error_message='PDF export limit reached. Please wait.')
def export_pdf():
    """
    Generate professional PDF report for GST bills with business header and logo watermark.
    Re-queries client/user from DB for accurate data (never trusts Redis cache).
    """
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable
        from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
        from reportlab.pdfgen import canvas
        import urllib.request
        import tempfile
        import os

        data = request.get_json(silent=True)
        if not data:
            return jsonify({'error': 'Request body must be valid JSON'}), 400

        start_date = (data.get('start_date') or '').strip()
        end_date = (data.get('end_date') or '').strip()

        client_id = g.user['client_id']
        user_id = g.user['user_id']

        if not start_date or not end_date:
            return jsonify({'error': 'start_date and end_date are required'}), 400

        try:
            date_from_obj = datetime.fromisoformat(start_date).date()
            date_to_obj = datetime.fromisoformat(end_date).date()
        except ValueError:
            return jsonify({'error': 'Invalid date format. Use ISO 8601 (YYYY-MM-DD)'}), 400

        if date_from_obj > date_to_obj:
            return jsonify({'error': 'start_date must not be after end_date'}), 400

        # Re-query bills from DB (never trust client-supplied financial data)
        user_permissions = g.user.get('permissions', [])
        is_super_admin = g.user.get('is_super_admin', False)
        has_view_all = is_super_admin or 'view_all_bills' in user_permissions

        from models.billing_model import GSTBilling
        from models.client_model import ClientEntry as _ClientEntry
        from models.user_model import User as _User

        # Use datetime range (avoids func.date() which prevents index use)
        from datetime import time as _time, timedelta as _td
        dt_from = datetime.combine(date_from_obj, _time.min)
        dt_to   = datetime.combine(date_to_obj + _td(days=1), _time.min)

        gst_query = GSTBilling.query.filter(
            GSTBilling.client_id == client_id,
            GSTBilling.created_at >= dt_from,
            GSTBilling.created_at <  dt_to,
            GSTBilling.status == 'final',
        )
        if not has_view_all:
            gst_query = gst_query.filter(GSTBilling.created_by == user_id)

        # with_entities: only fetch needed columns — skips large items JSON blob
        db_bills = gst_query.with_entities(
            GSTBilling.customer_name,
            GSTBilling.created_at,
            GSTBilling.subtotal,
            GSTBilling.gst_percentage,
            GSTBilling.gst_amount,
            GSTBilling.final_amount,
        ).order_by(GSTBilling.created_at.asc()).limit(5000).all()

        if not db_bills:
            return jsonify({'error': 'No GST bills found for the selected date range'}), 400

        bills = [
            {
                'customer_name': b.customer_name or 'Walk-in',
                'created_at': b.created_at.isoformat() if b.created_at else '',
                'subtotal': float(b.subtotal or 0),
                'gst_percentage': float(b.gst_percentage or 0),
                'gst_amount': float(b.gst_amount or 0),
                'final_amount': float(b.final_amount or 0),
            }
            for b in db_bills
        ]

        # Always re-query client/user from DB for fresh, accurate data
        db_client = _ClientEntry.query.filter_by(client_id=client_id).first()
        db_user = _User.query.filter_by(user_id=user_id).first()

        if not db_client:
            return jsonify({'error': 'Client record not found'}), 404
        if not db_user:
            return jsonify({'error': 'User record not found'}), 404

        client_info = {
            'client_name': db_client.client_name or '',
            'address': db_client.address or '',
            'phone': db_client.phone or '',
            'email': db_client.email or '',
            'gstin': db_client.gst_number or '',
        }
        logo_url = db_client.logo_url or ''
        subscription_status = db_client.subscription_status or ''
        is_trial = subscription_status == 'trial'

        user_full_name = (db_user.full_name or '').strip()
        if not user_full_name:
            user_full_name = db_user.email.split('@')[0]

        # Totals
        total_subtotal = sum(b['subtotal'] for b in bills)
        total_gst = sum(b['gst_amount'] for b in bills)
        total_final = sum(b['final_amount'] for b in bills)

        kolkata_tz = pytz.timezone('Asia/Kolkata')
        generated_at = datetime.now(kolkata_tz).strftime('%d/%m/%Y %H:%M')
        buffer = io.BytesIO()

        # Download logo for watermark — only allow http/https to prevent SSRF
        # 3-second hard cap prevents a slow CDN from stalling the Gunicorn worker
        logo_temp_path = None
        if logo_url:
            try:
                from urllib.parse import urlparse as _urlparse
                import httpx as _httpx
                _parsed = _urlparse(logo_url)
                if _parsed.scheme in ('http', 'https'):
                    with tempfile.NamedTemporaryFile(delete=False, suffix='.png') as _tmp:
                        logo_temp_path = _tmp.name
                    with _httpx.Client(timeout=3.0) as _client:
                        _resp = _client.get(logo_url)
                        if _resp.status_code == 200:
                            with open(logo_temp_path, 'wb') as _f:
                                _f.write(_resp.content)
                        else:
                            logo_temp_path = None
            except Exception:
                logo_temp_path = None

        # Capture closure vars
        _generated_at = generated_at
        _user_full_name = user_full_name
        _is_trial = is_trial

        class ExportWatermarkCanvas(canvas.Canvas):
            def __init__(self, *args, **kwargs):
                self._logo_path = kwargs.pop('logo_path', None)
                canvas.Canvas.__init__(self, *args, **kwargs)

            def showPage(self):
                self._draw_watermarks()
                self._draw_footer()
                canvas.Canvas.showPage(self)

            def save(self):
                self._draw_watermarks()
                self._draw_footer()
                canvas.Canvas.save(self)

            def _draw_watermarks(self):
                self.saveState()
                page_w, page_h = A4
                if self._logo_path and os.path.exists(self._logo_path):
                    try:
                        self.translate(page_w / 2, page_h / 2)
                        self.setFillAlpha(0.05)
                        self.drawImage(
                            self._logo_path, -90, -90, width=180, height=180,
                            preserveAspectRatio=True, mask='auto',
                        )
                        self.translate(-page_w / 2, -page_h / 2)
                    except Exception:
                        pass
                if _is_trial:
                    self.setFillColorRGB(0.8, 0.1, 0.1, alpha=0.08)
                    self.setFont('Helvetica-Bold', 64)
                    self.translate(page_w / 2, page_h / 2)
                    self.rotate(45)
                    self.drawCentredString(0, 0, 'TRIAL')
                self.restoreState()

            def _draw_footer(self):
                self.saveState()
                page_w, _ = A4
                trial_note = ' · TRIAL ACCOUNT' if _is_trial else ''
                footer_text = (
                    f'Generated on {_generated_at} by {_user_full_name} · '
                    f'VALOValoryx{trial_note} · Computer-generated document'
                )
                self.setFont('Helvetica', 6.5)
                self.setFillColorRGB(0.6, 0.6, 0.6)
                self.setStrokeColorRGB(0.85, 0.85, 0.85)
                self.setLineWidth(0.5)
                self.line(1.2 * cm, 1.1 * cm, page_w - 1.2 * cm, 1.1 * cm)
                self.drawCentredString(page_w / 2, 0.7 * cm, footer_text)
                self.restoreState()

        # Tight margins — maximize usable space
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=1.2 * cm,
            leftMargin=1.2 * cm,
            topMargin=0.8 * cm,
            bottomMargin=1.6 * cm,
        )

        elements = []
        styles = getSampleStyleSheet()

        co_name_style = ParagraphStyle(
            'CoName', parent=styles['Normal'],
            fontSize=16, alignment=TA_CENTER, spaceAfter=2,
            textColor=colors.HexColor('#1e293b'), fontName='Times-Bold', leading=18,
        )
        co_detail_style = ParagraphStyle(
            'CoDetail', parent=styles['Normal'],
            fontSize=8, alignment=TA_CENTER, spaceAfter=1,
            textColor=colors.HexColor('#475569'), leading=11, fontName='Times-Roman',
        )
        gstin_style = ParagraphStyle(
            'GSTIN', parent=styles['Normal'],
            fontSize=8, alignment=TA_CENTER, spaceAfter=4,
            textColor=colors.HexColor('#1e293b'), fontName='Times-Bold',
        )
        title_style = ParagraphStyle(
            'Title', parent=styles['Normal'],
            fontSize=11, alignment=TA_CENTER, spaceBefore=4, spaceAfter=1,
            textColor=colors.HexColor('#1e293b'), fontName='Times-Bold',
        )
        period_style = ParagraphStyle(
            'Period', parent=styles['Normal'],
            fontSize=8, alignment=TA_CENTER, spaceAfter=6,
            textColor=colors.HexColor('#64748b'), fontName='Times-Roman',
        )

        # Header
        elements.append(Paragraph(client_info['client_name'] or 'Business', co_name_style))
        contact_parts = []
        if client_info.get('address'):
            contact_parts.append(client_info['address'])
        if client_info.get('phone'):
            contact_parts.append(f"Ph: {client_info['phone']}")
        if client_info.get('email'):
            contact_parts.append(client_info['email'])
        if contact_parts:
            elements.append(Paragraph('  |  '.join(contact_parts), co_detail_style))
        if client_info.get('gstin'):
            elements.append(Paragraph(f"GSTIN: {client_info['gstin']}", gstin_style))

        elements.append(HRFlowable(
            width='100%', thickness=0.8, color=colors.HexColor('#cbd5e1'),
            spaceBefore=3, spaceAfter=4,
        ))
        elements.append(Paragraph('GST BILLS REPORT', title_style))
        elements.append(Paragraph(f'Period: {start_date}  to  {end_date}', period_style))

        # Summary bar
        usable_w = A4[0] - 2.4 * cm
        col_w = usable_w / 4
        summary_data = [
            ['Total Bills', 'Total Subtotal', 'Total GST', 'Grand Total'],
            [str(len(bills)), f'Rs. {total_subtotal:,.2f}', f'Rs. {total_gst:,.2f}', f'Rs. {total_final:,.2f}'],
        ]
        summary_table = Table(summary_data, colWidths=[col_w] * 4)
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e293b')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 7),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 5),
            ('TOPPADDING', (0, 0), (-1, 0), 5),
            ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f1f5f9')),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
            ('TOPPADDING', (0, 1), (-1, -1), 6),
            ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
            ('LINEBELOW', (0, 0), (-1, 0), 0.5, colors.HexColor('#cbd5e1')),
        ]))
        elements.append(summary_table)
        elements.append(Spacer(1, 6))

        # Bills table — columns fill full usable width
        cw = [0.7 * cm, 1.9 * cm, 0, 2.6 * cm, 1.4 * cm, 2.3 * cm, 2.6 * cm]
        cw[2] = usable_w - sum(c for c in cw if c)  # customer col takes remaining space

        table_data = [['#', 'Date', 'Customer', 'Subtotal', 'GST%', 'GST Amt', 'Total']]
        for idx, bill in enumerate(bills, 1):
            created_at = bill.get('created_at', '')
            if created_at:
                try:
                    date_obj = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                    if date_obj.tzinfo is None:
                        date_obj = pytz.utc.localize(date_obj)
                    date_str = date_obj.astimezone(kolkata_tz).strftime('%d/%m/%y')
                except Exception:
                    date_str = created_at[:10] if len(created_at) >= 10 else created_at
            else:
                date_str = '-'

            table_data.append([
                str(idx),
                date_str,
                str(bill.get('customer_name', 'Walk-in'))[:25],
                f"Rs. {bill['subtotal']:,.2f}",
                f"{bill['gst_percentage']}%",
                f"Rs. {bill['gst_amount']:,.2f}",
                f"Rs. {bill['final_amount']:,.2f}",
            ])

        table_data.append([
            '', '', 'TOTAL',
            f'Rs. {total_subtotal:,.2f}', '',
            f'Rs. {total_gst:,.2f}',
            f'Rs. {total_final:,.2f}',
        ])

        bills_table = Table(table_data, colWidths=cw, repeatRows=1)
        bills_table.setStyle(TableStyle([
            # Header
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#334155')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 7),
            ('TOPPADDING', (0, 0), (-1, 0), 5),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 5),
            # Data rows
            ('FONTNAME', (0, 1), (-1, -2), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -2), 7.5),
            ('TOPPADDING', (0, 1), (-1, -2), 3),
            ('BOTTOMPADDING', (0, 1), (-1, -2), 3),
            # Totals row
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, -1), (-1, -1), 8),
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#e2e8f0')),
            ('TOPPADDING', (0, -1), (-1, -1), 5),
            ('BOTTOMPADDING', (0, -1), (-1, -1), 5),
            # Alignment
            ('ALIGN', (0, 0), (1, -1), 'CENTER'),
            ('ALIGN', (2, 0), (2, -1), 'LEFT'),
            ('ALIGN', (3, 0), (-1, -1), 'RIGHT'),
            ('ALIGN', (4, 0), (4, -1), 'CENTER'),
            # Grid
            ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
            ('LINEBELOW', (0, 0), (-1, 0), 0.5, colors.HexColor('#94a3b8')),
            ('LINEABOVE', (0, -1), (-1, -1), 0.8, colors.HexColor('#94a3b8')),
            ('INNERGRID', (0, 1), (-1, -2), 0.3, colors.HexColor('#e2e8f0')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -2), [colors.white, colors.HexColor('#f8fafc')]),
        ]))
        elements.append(bills_table)

        def canvas_maker(filename, **kwargs):
            return ExportWatermarkCanvas(filename, logo_path=logo_temp_path, **kwargs)

        try:
            doc.build(elements, canvasmaker=canvas_maker)
        finally:
            if logo_temp_path and os.path.exists(logo_temp_path):
                try:
                    os.unlink(logo_temp_path)
                except Exception:
                    pass

        buffer.seek(0)
        return send_file(
            buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=f'GST_Bills_{start_date}_to_{end_date}.pdf',
        )

    except ImportError as e:
        return jsonify({'error': 'PDF generation library not installed', 'message': str(e)}), 500
    except Exception as e:
        if 'logo_temp_path' in locals() and logo_temp_path and os.path.exists(logo_temp_path):
            try:
                os.unlink(logo_temp_path)
            except Exception:
                pass
        return jsonify({'error': 'Failed to generate PDF', 'message': str(e)}), 500


@report_bp.route('/send-auditor-email', methods=['POST'])
@authenticate
@require_permission('export_reports')
@rate_limit(max_requests=5, window_seconds=300, key_func=lambda: g.user['user_id'], error_message='Email send limit reached. Please wait 5 minutes.')
def send_auditor_email():
    """
    Generate a GST bills PDF (with VALORYX watermark and optional TRIAL watermark)
    and email it as an attachment to the provided auditor email address.
    Restricted to admin / owner / manager roles.
    """
    import re as _re

    # Role check — only admin-level roles may export financial data to external email
    user_role = g.user.get('role', '')
    is_super_admin = g.user.get('is_super_admin', False)
    allowed_roles = {'owner', 'admin', 'manager'}
    if not is_super_admin and user_role not in allowed_roles:
        return jsonify({'error': 'Insufficient permissions to send audit reports'}), 403

    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable
        from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
        from reportlab.pdfgen import canvas
        import urllib.request
        import tempfile
        import os
        from utils.email_service import send_audit_report_email

        data = request.get_json()
        to_email = (data.get('email') or '').strip()
        start_date = (data.get('start_date') or '').strip()
        end_date = (data.get('end_date') or '').strip()

        # Validate email format (also prevents SMTP header injection)
        _EMAIL_RE = _re.compile(r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$')
        if not to_email or not _EMAIL_RE.match(to_email):
            return jsonify({'error': 'A valid auditor email address is required'}), 400

        if not start_date or not end_date:
            return jsonify({'error': 'start_date and end_date are required'}), 400

        if start_date > end_date:
            return jsonify({'error': 'start_date must not be after end_date'}), 400

        # Re-query bills from the database (never trust client-supplied financial data)
        client_id = g.user['client_id']
        user_id = g.user['user_id']
        user_permissions = g.user.get('permissions', [])
        has_view_all = is_super_admin or 'view_all_bills' in user_permissions

        from models.billing_model import GSTBilling

        date_from_obj = datetime.fromisoformat(start_date).date()
        date_to_obj   = datetime.fromisoformat(end_date).date()

        # Use datetime range (avoids func.date() which prevents index use)
        from datetime import time as _time, timedelta as _td
        dt_from = datetime.combine(date_from_obj, _time.min)
        dt_to   = datetime.combine(date_to_obj + _td(days=1), _time.min)

        gst_query = GSTBilling.query.filter(
            GSTBilling.client_id == client_id,
            GSTBilling.created_at >= dt_from,
            GSTBilling.created_at <  dt_to,
            GSTBilling.status == 'final',
        )
        if not has_view_all:
            gst_query = gst_query.filter(GSTBilling.created_by == user_id)

        # with_entities: only fetch needed columns — skips large items JSON blob
        db_bills = gst_query.with_entities(
            GSTBilling.bill_id,
            GSTBilling.customer_name,
            GSTBilling.created_at,
            GSTBilling.subtotal,
            GSTBilling.gst_percentage,
            GSTBilling.gst_amount,
            GSTBilling.final_amount,
        ).order_by(GSTBilling.created_at.asc()).limit(5000).all()

        # Convert to the dict shape the PDF builder expects
        bills = [
            {
                'bill_id': str(b.bill_id),
                'customer_name': b.customer_name or 'Walk-in',
                'created_at': b.created_at.isoformat() if b.created_at else '',
                'subtotal': float(b.subtotal or 0),
                'gst_percentage': float(b.gst_percentage or 0),
                'gst_amount': float(b.gst_amount or 0),
                'final_amount': float(b.final_amount or 0),
            }
            for b in db_bills
        ]

        if not bills:
            return jsonify({'error': 'No GST bills found for the selected date range'}), 404

        # Always re-query client from DB to get fresh, accurate data
        from models.client_model import ClientEntry as _ClientEntry
        from models.user_model import User as _User
        db_client = _ClientEntry.query.filter_by(client_id=client_id).first()
        db_user = _User.query.filter_by(user_id=user_id).first()

        client_info = {
            'client_name': db_client.client_name if db_client else '',
            'address': db_client.address or '' if db_client else '',
            'phone': db_client.phone or '' if db_client else '',
            'email': db_client.email or '' if db_client else '',
            'gstin': db_client.gst_number or '' if db_client else '',
        }
        logo_url = db_client.logo_url or '' if db_client else ''
        subscription_status = db_client.subscription_status or '' if db_client else ''
        is_trial = subscription_status == 'trial'
        # Use DB user name; fall back to email prefix only if name is genuinely blank
        user_full_name = (db_user.full_name or '').strip() if db_user else ''
        if not user_full_name:
            user_full_name = (db_user.email.split('@')[0] if db_user else g.user.get('email', 'User'))

        # ---- Build PDF in memory ----
        kolkata_tz = pytz.timezone('Asia/Kolkata')
        generated_at = datetime.now(kolkata_tz).strftime('%d/%m/%Y %H:%M')
        buffer = io.BytesIO()

        # Download logo for watermark — only allow http/https to prevent SSRF
        # 3-second hard cap prevents a slow CDN from stalling the Gunicorn worker
        logo_temp_path = None
        if logo_url:
            try:
                from urllib.parse import urlparse as _urlparse
                import httpx as _httpx
                _parsed = _urlparse(logo_url)
                if _parsed.scheme in ('http', 'https'):
                    with tempfile.NamedTemporaryFile(delete=False, suffix='.png') as _tmp:
                        logo_temp_path = _tmp.name
                    with _httpx.Client(timeout=3.0) as _client:
                        _resp = _client.get(logo_url)
                        if _resp.status_code == 200:
                            with open(logo_temp_path, 'wb') as _f:
                                _f.write(_resp.content)
                        else:
                            logo_temp_path = None
            except Exception:
                logo_temp_path = None

        # Totals (compute early so canvas footer can use them)
        total_subtotal = sum(float(b.get('subtotal', 0)) for b in bills)
        total_gst = sum(float(b.get('gst_amount', 0)) for b in bills)
        total_final = sum(float(b.get('final_amount', 0)) for b in bills)

        # Custom canvas: watermarks + fixed footer on every page
        _generated_at = generated_at
        _user_full_name = user_full_name
        _is_trial = is_trial

        class AuditWatermarkCanvas(canvas.Canvas):
            def __init__(self, *args, **kwargs):
                self._logo_path = kwargs.pop('logo_path', None)
                canvas.Canvas.__init__(self, *args, **kwargs)

            def showPage(self):
                self._draw_watermarks()
                self._draw_footer()
                canvas.Canvas.showPage(self)

            def save(self):
                self._draw_watermarks()
                self._draw_footer()
                canvas.Canvas.save(self)

            def _draw_watermarks(self):
                self.saveState()
                page_w, page_h = A4
                if self._logo_path and os.path.exists(self._logo_path):
                    try:
                        self.translate(page_w / 2, page_h / 2)
                        self.setFillAlpha(0.05)
                        self.drawImage(
                            self._logo_path, -90, -90, width=180, height=180,
                            preserveAspectRatio=True, mask='auto',
                        )
                        self.translate(-page_w / 2, -page_h / 2)
                    except Exception:
                        pass
                if _is_trial:
                    self.setFillColorRGB(0.8, 0.1, 0.1, alpha=0.08)
                    self.setFont('Helvetica-Bold', 64)
                    self.translate(page_w / 2, page_h / 2)
                    self.rotate(45)
                    self.drawCentredString(0, 0, 'TRIAL')
                self.restoreState()

            def _draw_footer(self):
                self.saveState()
                page_w, page_h = A4
                trial_note = ' · TRIAL ACCOUNT' if _is_trial else ''
                footer_text = (
                    f'Generated on {_generated_at} by {_user_full_name} · '
                    f'VALOValoryx{trial_note} · Computer-generated document'
                )
                self.setFont('Helvetica', 6.5)
                self.setFillColorRGB(0.6, 0.6, 0.6)
                # Thin separator line
                self.setStrokeColorRGB(0.85, 0.85, 0.85)
                self.setLineWidth(0.5)
                self.line(1.2 * cm, 1.1 * cm, page_w - 1.2 * cm, 1.1 * cm)
                self.drawCentredString(page_w / 2, 0.7 * cm, footer_text)
                self.restoreState()

        # Tight margins — more usable space on page
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=1.2 * cm,
            leftMargin=1.2 * cm,
            topMargin=0.8 * cm,
            bottomMargin=1.6 * cm,  # leave room for fixed footer
        )

        elements = []
        styles = getSampleStyleSheet()

        # ── Compact styles ──
        co_name_style = ParagraphStyle(
            'CoName', parent=styles['Normal'],
            fontSize=16, alignment=TA_CENTER, spaceAfter=2,
            textColor=colors.HexColor('#1e293b'), fontName='Times-Bold', leading=18,
        )
        co_detail_style = ParagraphStyle(
            'CoDetail', parent=styles['Normal'],
            fontSize=8, alignment=TA_CENTER, spaceAfter=1,
            textColor=colors.HexColor('#475569'), leading=11, fontName='Times-Roman',
        )
        gstin_style = ParagraphStyle(
            'GSTIN', parent=styles['Normal'],
            fontSize=8, alignment=TA_CENTER, spaceAfter=4,
            textColor=colors.HexColor('#1e293b'), fontName='Times-Bold',
        )
        title_style = ParagraphStyle(
            'Title', parent=styles['Normal'],
            fontSize=11, alignment=TA_CENTER, spaceBefore=4, spaceAfter=1,
            textColor=colors.HexColor('#1e293b'), fontName='Times-Bold',
        )
        period_style = ParagraphStyle(
            'Period', parent=styles['Normal'],
            fontSize=8, alignment=TA_CENTER, spaceAfter=6,
            textColor=colors.HexColor('#64748b'), fontName='Times-Roman',
        )

        # ── Header ──
        elements.append(Paragraph(client_info['client_name'] or 'Business', co_name_style))

        contact_parts = []
        if client_info.get('address'):
            contact_parts.append(client_info['address'])
        if client_info.get('phone'):
            contact_parts.append(f"Ph: {client_info['phone']}")
        if client_info.get('email'):
            contact_parts.append(client_info['email'])
        if contact_parts:
            elements.append(Paragraph('  |  '.join(contact_parts), co_detail_style))
        if client_info.get('gstin'):
            elements.append(Paragraph(f"GSTIN: {client_info['gstin']}", gstin_style))

        elements.append(HRFlowable(
            width='100%', thickness=0.8, color=colors.HexColor('#cbd5e1'),
            spaceBefore=3, spaceAfter=4,
        ))
        elements.append(Paragraph('GST BILLS REPORT', title_style))
        elements.append(Paragraph(f'Period: {start_date}  to  {end_date}', period_style))

        # ── Summary bar (inline, single row) ──
        usable_w = A4[0] - 2.4 * cm
        col_w = usable_w / 4
        summary_data = [
            ['Total Bills', 'Total Subtotal', 'Total GST', 'Grand Total'],
            [str(len(bills)), f'Rs. {total_subtotal:,.2f}', f'Rs. {total_gst:,.2f}', f'Rs. {total_final:,.2f}'],
        ]
        summary_table = Table(summary_data, colWidths=[col_w] * 4)
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e293b')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 7),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 5),
            ('TOPPADDING', (0, 0), (-1, 0), 5),
            ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f1f5f9')),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
            ('TOPPADDING', (0, 1), (-1, -1), 6),
            ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
            ('LINEBELOW', (0, 0), (-1, 0), 0.5, colors.HexColor('#cbd5e1')),
        ]))
        elements.append(summary_table)
        elements.append(Spacer(1, 6))

        # ── Bills table ──
        # Column widths fill the full usable width
        cw = [0.7*cm, 1.9*cm, 0, 2.6*cm, 1.4*cm, 2.3*cm, 2.6*cm]
        cw[2] = usable_w - sum(c for c in cw if c)  # customer col takes remaining space

        table_data = [['#', 'Date', 'Customer', 'Subtotal', 'GST%', 'GST Amt', 'Total']]
        for idx, bill in enumerate(bills, 1):
            created_at = bill.get('created_at', '')
            if created_at:
                try:
                    date_obj = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                    if date_obj.tzinfo is None:
                        date_obj = pytz.utc.localize(date_obj)
                    date_str = date_obj.astimezone(kolkata_tz).strftime('%d/%m/%y')
                except Exception:
                    date_str = created_at[:10] if len(created_at) >= 10 else created_at
            else:
                date_str = '-'

            table_data.append([
                str(idx),
                date_str,
                str(bill.get('customer_name', 'Walk-in'))[:25],
                f"Rs. {float(bill.get('subtotal', 0)):,.2f}",
                f"{bill.get('gst_percentage', 0)}%",
                f"Rs. {float(bill.get('gst_amount', 0)):,.2f}",
                f"Rs. {float(bill.get('final_amount', 0)):,.2f}",
            ])

        table_data.append([
            '', '', 'TOTAL',
            f'Rs. {total_subtotal:,.2f}', '',
            f'Rs. {total_gst:,.2f}',
            f'Rs. {total_final:,.2f}',
        ])

        bills_table = Table(table_data, colWidths=cw, repeatRows=1)
        bills_table.setStyle(TableStyle([
            # Header
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#334155')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 7),
            ('TOPPADDING', (0, 0), (-1, 0), 5),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 5),
            # Data rows
            ('FONTNAME', (0, 1), (-1, -2), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -2), 7.5),
            ('TOPPADDING', (0, 1), (-1, -2), 3),
            ('BOTTOMPADDING', (0, 1), (-1, -2), 3),
            # Totals row
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, -1), (-1, -1), 8),
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#e2e8f0')),
            ('TOPPADDING', (0, -1), (-1, -1), 5),
            ('BOTTOMPADDING', (0, -1), (-1, -1), 5),
            # Alignment
            ('ALIGN', (0, 0), (1, -1), 'CENTER'),
            ('ALIGN', (2, 0), (2, -1), 'LEFT'),
            ('ALIGN', (3, 0), (-1, -1), 'RIGHT'),
            ('ALIGN', (4, 0), (4, -1), 'CENTER'),
            # Grid
            ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
            ('LINEBELOW', (0, 0), (-1, 0), 0.5, colors.HexColor('#94a3b8')),
            ('LINEABOVE', (0, -1), (-1, -1), 0.8, colors.HexColor('#94a3b8')),
            ('INNERGRID', (0, 1), (-1, -2), 0.3, colors.HexColor('#e2e8f0')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -2), [colors.white, colors.HexColor('#f8fafc')]),
        ]))
        elements.append(bills_table)

        # Build PDF
        def canvas_maker(filename, **kwargs):
            return AuditWatermarkCanvas(
                filename,
                logo_path=logo_temp_path,
                **kwargs,
            )

        try:
            doc.build(elements, canvasmaker=canvas_maker)
        finally:
            # Always clean up temp logo file, even if PDF build fails
            if logo_temp_path and os.path.exists(logo_temp_path):
                try:
                    os.unlink(logo_temp_path)
                except Exception:
                    pass

        # Capture PDF bytes BEFORE passing to email thread (bytes are immutable — thread-safe)
        buffer.seek(0)
        pdf_bytes = buffer.read()

        # Fire-and-forget email (returns False silently if SMTP not configured)
        queued = send_audit_report_email(
            to_email=to_email,
            client_name=client_info.get('client_name', ''),
            start_date=start_date,
            end_date=end_date,
            total_bills=len(bills),
            grand_total=f'Rs. {total_final:,.2f}',
            pdf_bytes=pdf_bytes,
            is_trial=is_trial,
            sent_by=user_full_name,
        )

        if queued is False:
            return jsonify({'error': 'Email service is not configured on the server'}), 503

        return jsonify({
            'success': True,
            'message': f'Report has been sent to {to_email}',
        }), 200

    except ImportError as e:
        return jsonify({'error': 'PDF generation library not installed', 'message': str(e)}), 500
    except Exception as e:
        return jsonify({'error': 'Failed to send audit report', 'message': str(e)}), 500
