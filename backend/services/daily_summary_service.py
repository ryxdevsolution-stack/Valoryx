"""
Daily business summary generator for Telegram reports.

Queries the live billing database for a given client and date, then returns
a formatted HTML string ready to be sent via send_telegram_message().

Follows the same patterns used in:
  - routes/report.py  (date filtering with func.date)
  - routes/analytics.py  (items JSON parsing, top product aggregation)
"""
import logging
from collections import defaultdict
from datetime import date, datetime

import pytz
from sqlalchemy import func

logger = logging.getLogger(__name__)

IST = pytz.timezone('Asia/Kolkata')


def generate_daily_summary(client_id: str, report_date: date = None) -> str:
    """
    Build a daily business summary message for a single client.

    Must be called inside an active Flask application context (the scheduler
    handles this via `with app.app_context()`).

    Args:
        client_id:   UUID string of the client.
        report_date: Date to summarise (defaults to today in IST).

    Returns:
        HTML-formatted string for Telegram. Never raises — returns a safe
        error message string if anything goes wrong.
    """
    if report_date is None:
        report_date = datetime.now(IST).date()

    try:
        from extensions import db
        from models.billing_model import GSTBilling, NonGSTBilling
        from models.client_model import ClientEntry

        # ------------------------------------------------------------------
        # Client name
        # ------------------------------------------------------------------
        client = db.session.query(ClientEntry).filter_by(client_id=client_id).first()
        client_name = client.client_name if client else "Your Shop"

        date_str = report_date.strftime('%Y-%m-%d')   # for func.date comparison
        date_display = report_date.strftime('%d %B %Y')  # "25 February 2026"

        # ------------------------------------------------------------------
        # Query today's finalised bills (same pattern as routes/report.py:47-73)
        # func.date() works on both SQLite and PostgreSQL
        # ------------------------------------------------------------------
        gst_bills = (
            db.session.query(GSTBilling)
            .filter(
                GSTBilling.client_id == client_id,
                func.date(GSTBilling.created_at) == date_str,
                GSTBilling.status == 'final',
            )
            .all()
        )

        non_gst_bills = (
            db.session.query(NonGSTBilling)
            .filter(
                NonGSTBilling.client_id == client_id,
                func.date(NonGSTBilling.created_at) == date_str,
                NonGSTBilling.status == 'final',
            )
            .all()
        )

        # ------------------------------------------------------------------
        # Revenue & invoice count
        # ------------------------------------------------------------------
        gst_revenue = sum(float(b.final_amount or 0) for b in gst_bills)
        non_gst_revenue = sum(float(b.total_amount or 0) for b in non_gst_bills)
        total_revenue = gst_revenue + non_gst_revenue
        total_invoices = len(gst_bills) + len(non_gst_bills)
        avg_bill = total_revenue / total_invoices if total_invoices > 0 else 0.0

        # ------------------------------------------------------------------
        # Top-selling item by quantity
        # Parsing pattern from routes/analytics.py:217-264
        # ------------------------------------------------------------------
        item_totals: dict = defaultdict(float)
        for bill in gst_bills + non_gst_bills:
            items = bill.items if isinstance(bill.items, list) else []
            for item in items:
                name = (
                    item.get('product_name')
                    or item.get('name')
                    or item.get('item_name')
                    or 'Unknown'
                )
                qty = float(item.get('quantity', 0) or 0)
                item_totals[name] += qty

        top_item = None
        top_qty = 0
        if item_totals:
            top_item = max(item_totals, key=lambda k: item_totals[k])
            top_qty = item_totals[top_item]

        # ------------------------------------------------------------------
        # Build the Telegram HTML message
        # ------------------------------------------------------------------
        lines = [
            "📊 <b>Daily Business Report</b>",
            f"<b>{client_name}</b>",
            f"📅 {date_display}",
            "",
            f"💰 <b>Total Revenue:</b> ₹{total_revenue:,.2f}",
            f"🧾 <b>Invoices Generated:</b> {total_invoices}",
            f"📈 <b>Average Bill Value:</b> ₹{avg_bill:,.2f}",
        ]

        if top_item:
            lines.append(f"🏆 <b>Top Selling Item:</b> {top_item} ({int(top_qty)} units)")

        if total_invoices == 0:
            lines.append("")
            lines.append("<i>No sales recorded today.</i>")

        lines.append("")
        lines.append("<i>— Valoryx</i>")

        return "\n".join(lines)

    except Exception as e:
        logger.error(f"[DailySummary] Error generating summary for client {client_id}: {e}")
        return (
            "📊 <b>Daily Business Report</b>\n"
            f"<i>Could not generate report: {e}</i>"
        )
