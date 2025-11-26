import uuid
import io
from datetime import datetime
from flask import Blueprint, request, jsonify, g, send_file
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


@report_bp.route('/export-pdf', methods=['POST'])
@authenticate
def export_pdf():
    """
    Generate professional PDF report for GST bills with business header and logo watermark
    """
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch, cm, mm
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable, Image
        from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
        from reportlab.pdfgen import canvas
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        import urllib.request
        import tempfile
        import os

        data = request.get_json()
        bills = data.get('bills', [])
        start_date = data.get('start_date', '')
        end_date = data.get('end_date', '')

        # Get client and user info from g object (populated by auth middleware from Redis cache)
        client_info = {
            'client_name': g.client.get('client_name', ''),
            'address': g.client.get('address', ''),
            'phone': g.client.get('phone', ''),
            'email': g.client.get('email', ''),
            'gstin': g.client.get('gstin', '')
        }

        # Get logo URL for watermark
        logo_url = g.client.get('logo_url', '')

        # Get user info for footer
        user_full_name = g.user.get('full_name', g.user.get('email', 'User'))

        if not bills:
            return jsonify({'error': 'No bills to export'}), 400

        # Create PDF buffer
        buffer = io.BytesIO()

        # Download logo if available for watermark
        logo_temp_path = None
        if logo_url:
            try:
                logo_temp_path = tempfile.NamedTemporaryFile(delete=False, suffix='.png').name
                urllib.request.urlretrieve(logo_url, logo_temp_path)
            except Exception as e:
                logo_temp_path = None

        # Custom canvas class to add logo watermark on each page
        class WatermarkCanvas(canvas.Canvas):
            def __init__(self, *args, **kwargs):
                self.logo_path = kwargs.pop('logo_path', None)
                canvas.Canvas.__init__(self, *args, **kwargs)

            def showPage(self):
                self._draw_watermark()
                canvas.Canvas.showPage(self)

            def save(self):
                self._draw_watermark()
                canvas.Canvas.save(self)

            def _draw_watermark(self):
                if self.logo_path and os.path.exists(self.logo_path):
                    try:
                        self.saveState()
                        # Center the logo watermark
                        self.translate(A4[0]/2, A4[1]/2)
                        # Make it very transparent
                        self.setFillAlpha(0.06)
                        # Draw logo centered, larger size for watermark
                        self.drawImage(self.logo_path, -100, -100, width=200, height=200,
                                      preserveAspectRatio=True, mask='auto')
                        self.restoreState()
                    except:
                        pass

        # Create PDF document (Portrait A4)
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=1.5*cm,
            leftMargin=1.5*cm,
            topMargin=1*cm,
            bottomMargin=1*cm
        )

        elements = []
        styles = getSampleStyleSheet()

        # Custom styles using Times-Roman for professional look
        company_name_style = ParagraphStyle(
            'CompanyName',
            parent=styles['Heading1'],
            fontSize=22,
            alignment=TA_CENTER,
            spaceAfter=4,
            textColor=colors.HexColor('#1e293b'),
            fontName='Times-Bold'
        )

        company_details_style = ParagraphStyle(
            'CompanyDetails',
            parent=styles['Normal'],
            fontSize=9,
            alignment=TA_CENTER,
            spaceAfter=2,
            textColor=colors.HexColor('#475569'),
            leading=12,
            fontName='Times-Roman'
        )

        gstin_style = ParagraphStyle(
            'GSTIN',
            parent=styles['Normal'],
            fontSize=10,
            alignment=TA_CENTER,
            spaceAfter=8,
            textColor=colors.HexColor('#1e293b'),
            fontName='Times-Bold'
        )

        report_title_style = ParagraphStyle(
            'ReportTitle',
            parent=styles['Heading2'],
            fontSize=14,
            alignment=TA_CENTER,
            spaceBefore=10,
            spaceAfter=5,
            textColor=colors.HexColor('#1e293b'),
            fontName='Times-Bold'
        )

        period_style = ParagraphStyle(
            'Period',
            parent=styles['Normal'],
            fontSize=10,
            alignment=TA_CENTER,
            spaceAfter=15,
            textColor=colors.HexColor('#64748b'),
            fontName='Times-Roman'
        )

        # === HEADER SECTION ===
        # Company Name
        company_name = client_info.get('client_name', 'Business Name') if client_info else 'Business Name'
        elements.append(Paragraph(company_name, company_name_style))

        # Company Address and Contact
        address = client_info.get('address', '') if client_info else ''
        phone = client_info.get('phone', '') if client_info else ''
        email = client_info.get('email', '') if client_info else ''

        contact_parts = []
        if address:
            contact_parts.append(address)
        if phone:
            contact_parts.append(f"Phone: {phone}")
        if email:
            contact_parts.append(f"Email: {email}")

        if contact_parts:
            elements.append(Paragraph(" | ".join(contact_parts), company_details_style))

        # GSTIN
        gstin = client_info.get('gstin', '') if client_info else ''
        if gstin:
            elements.append(Paragraph(f"GSTIN: {gstin}", gstin_style))

        # Divider line
        elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#e2e8f0'), spaceBefore=5, spaceAfter=10))

        # Report Title
        elements.append(Paragraph("GST BILLS REPORT", report_title_style))

        # Period
        elements.append(Paragraph(f"Period: {start_date} to {end_date}", period_style))

        # Calculate totals
        total_subtotal = sum(float(bill.get('subtotal', 0)) for bill in bills)
        total_gst = sum(float(bill.get('gst_amount', 0)) for bill in bills)
        total_final = sum(float(bill.get('final_amount', 0)) for bill in bills)

        # === SUMMARY SECTION ===
        summary_data = [
            ['Total Bills', 'Total Subtotal', 'Total GST', 'Grand Total'],
            [
                str(len(bills)),
                f"Rs. {total_subtotal:,.2f}",
                f"Rs. {total_gst:,.2f}",
                f"Rs. {total_final:,.2f}"
            ]
        ]

        summary_table = Table(summary_data, colWidths=[4*cm, 4.5*cm, 4*cm, 4.5*cm])
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e293b')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Times-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
            ('TOPPADDING', (0, 0), (-1, 0), 10),
            ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f1f5f9')),
            ('FONTNAME', (0, 1), (-1, -1), 'Times-Bold'),
            ('FONTSIZE', (0, 1), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 10),
            ('TOPPADDING', (0, 1), (-1, -1), 10),
            ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#cbd5e1')),
            ('LINEBELOW', (0, 0), (-1, 0), 1, colors.HexColor('#cbd5e1')),
        ]))

        elements.append(summary_table)
        elements.append(Spacer(1, 20))

        # === BILLS TABLE ===
        table_header = ['#', 'Date', 'Customer', 'Subtotal', 'GST %', 'GST Amt', 'Final Amt']
        table_data = [table_header]

        # Add bill rows
        for idx, bill in enumerate(bills, 1):
            created_at = bill.get('created_at', '')
            if created_at:
                try:
                    date_obj = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                    date_str = date_obj.strftime('%d/%m/%Y')
                except:
                    date_str = created_at[:10] if len(created_at) >= 10 else created_at
            else:
                date_str = '-'

            row = [
                str(idx),
                date_str,
                str(bill.get('customer_name', 'Walk-in'))[:20],
                f"Rs. {float(bill.get('subtotal', 0)):,.2f}",
                f"{bill.get('gst_percentage', 0)}%",
                f"Rs. {float(bill.get('gst_amount', 0)):,.2f}",
                f"Rs. {float(bill.get('final_amount', 0)):,.2f}"
            ]
            table_data.append(row)

        # Add totals row
        table_data.append([
            '', '', 'TOTAL',
            f"Rs. {total_subtotal:,.2f}",
            '',
            f"Rs. {total_gst:,.2f}",
            f"Rs. {total_final:,.2f}"
        ])

        # Create table with appropriate column widths
        col_widths = [1*cm, 2.2*cm, 4.5*cm, 2.8*cm, 1.5*cm, 2.5*cm, 2.8*cm]
        bills_table = Table(table_data, colWidths=col_widths, repeatRows=1)

        bills_table.setStyle(TableStyle([
            # Header styling
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e293b')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Times-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 8),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
            ('TOPPADDING', (0, 0), (-1, 0), 8),

            # Data rows styling
            ('FONTNAME', (0, 1), (-1, -2), 'Times-Roman'),
            ('FONTSIZE', (0, 1), (-1, -2), 8),
            ('BOTTOMPADDING', (0, 1), (-1, -2), 5),
            ('TOPPADDING', (0, 1), (-1, -2), 5),

            # Totals row styling
            ('FONTNAME', (0, -1), (-1, -1), 'Times-Bold'),
            ('FONTSIZE', (0, -1), (-1, -1), 9),
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#e2e8f0')),
            ('BOTTOMPADDING', (0, -1), (-1, -1), 8),
            ('TOPPADDING', (0, -1), (-1, -1), 8),

            # Alignment
            ('ALIGN', (0, 1), (0, -1), 'CENTER'),  # # column
            ('ALIGN', (1, 1), (1, -1), 'CENTER'),  # Date column
            ('ALIGN', (2, 1), (2, -1), 'LEFT'),    # Customer column
            ('ALIGN', (3, 1), (-1, -1), 'RIGHT'),  # Amount columns
            ('ALIGN', (4, 1), (4, -1), 'CENTER'),  # GST % column

            # Grid
            ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#cbd5e1')),
            ('LINEBELOW', (0, 0), (-1, 0), 1, colors.HexColor('#cbd5e1')),
            ('LINEABOVE', (0, -1), (-1, -1), 1, colors.HexColor('#94a3b8')),
            ('INNERGRID', (0, 0), (-1, -2), 0.5, colors.HexColor('#e2e8f0')),

            # Alternating row colors
            ('ROWBACKGROUNDS', (0, 1), (-1, -2), [colors.white, colors.HexColor('#f8fafc')]),
        ]))

        elements.append(bills_table)

        # Footer note
        elements.append(Spacer(1, 20))
        footer_style = ParagraphStyle(
            'Footer',
            parent=styles['Normal'],
            fontSize=8,
            alignment=TA_CENTER,
            textColor=colors.HexColor('#94a3b8'),
            fontName='Times-Roman'
        )
        elements.append(Paragraph(f"Generated on {datetime.now().strftime('%d/%m/%Y %H:%M')} by {user_full_name} | This is a computer-generated document", footer_style))

        # Build PDF with logo watermark
        # Create a factory function that passes the logo path
        def canvas_maker(filename, **kwargs):
            return WatermarkCanvas(filename, logo_path=logo_temp_path, **kwargs)

        doc.build(elements, canvasmaker=canvas_maker)

        # Cleanup temp logo file
        if logo_temp_path and os.path.exists(logo_temp_path):
            try:
                os.unlink(logo_temp_path)
            except:
                pass

        # Get PDF bytes
        buffer.seek(0)

        return send_file(
            buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=f'GST_Bills_{start_date}_to_{end_date}.pdf'
        )

    except ImportError as e:
        return jsonify({'error': 'PDF generation library not installed', 'message': str(e)}), 500
    except Exception as e:
        # Cleanup temp logo file on error
        if 'logo_temp_path' in locals() and logo_temp_path and os.path.exists(logo_temp_path):
            try:
                os.unlink(logo_temp_path)
            except:
                pass
        return jsonify({'error': 'Failed to generate PDF', 'message': str(e)}), 500
