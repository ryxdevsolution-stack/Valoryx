"""
Business summary generator for report emails (daily or weekly cadence).

Queries the live billing database for a given client and date range, then
returns a structured summary dict ready to be rendered into an email.

Follows the same patterns used in:
  - routes/report.py      (date filtering with func.date)
  - routes/analytics.py   (items JSON parsing, top product aggregation,
                            excluding payment_status == 'pending' from revenue)
"""
import logging
from collections import defaultdict
from datetime import date, datetime, timedelta

import pytz
from sqlalchemy import func

logger = logging.getLogger(__name__)

IST = pytz.timezone('Asia/Kolkata')


def compute_summary_range(client_id: str, start_date: date, end_date: date) -> dict:
    """
    Build a business summary for a single client over [start_date, end_date] inclusive.

    Must be called inside an active Flask application context.

    Revenue counts MONEY RECEIVED, not whole bills (v42 partial payment):
    a ₹5000 bill with ₹3000 paid adds ₹3000 to revenue and ₹2000 to
    `pending_amount`. Matches routes/analytics.py and routes/report.py.

    Returns a dict:
        {
            'client_name': str,
            'date_display': str,           # single date, or "start – end" range
            'total_revenue': float,
            'pending_amount': float,
            'total_invoices': int,
            'avg_bill': float,
            'top_item': str | None,
            'top_qty': float,
            'has_activity': bool,          # False when there were zero bills in range
        }
    """
    from extensions import db
    from models.billing_model import GSTBilling, NonGSTBilling
    from models.client_model import ClientEntry

    client = db.session.query(ClientEntry).filter_by(client_id=client_id).first()
    client_name = client.client_name if client else "Your Shop"

    start_str = start_date.strftime('%Y-%m-%d')
    end_str = end_date.strftime('%Y-%m-%d')
    date_display = (
        start_date.strftime('%d %B %Y') if start_date == end_date
        else f"{start_date.strftime('%d %b')} – {end_date.strftime('%d %b %Y')}"
    )

    gst_bills = (
        db.session.query(GSTBilling)
        .filter(
            GSTBilling.client_id == client_id,
            func.date(GSTBilling.created_at) >= start_str,
            func.date(GSTBilling.created_at) <= end_str,
            GSTBilling.status == 'final',
        )
        .all()
    )

    non_gst_bills = (
        db.session.query(NonGSTBilling)
        .filter(
            NonGSTBilling.client_id == client_id,
            func.date(NonGSTBilling.created_at) >= start_str,
            func.date(NonGSTBilling.created_at) <= end_str,
            NonGSTBilling.status == 'final',
        )
        .all()
    )

    def _is_pending(bill) -> bool:
        return bill.payment_status == 'pending'

    def _received(bill, total: float) -> float:
        """Money actually received on this bill (v42 partial payment).
        paid_amount is NULL on pre-v42 rows — fall back to the old binary rule."""
        if bill.paid_amount is not None:
            return min(float(bill.paid_amount), total)
        return 0.0 if _is_pending(bill) else total

    paid_gst = [b for b in gst_bills if not _is_pending(b)]
    paid_non_gst = [b for b in non_gst_bills if not _is_pending(b)]
    pending_gst = [b for b in gst_bills if _is_pending(b)]
    pending_non_gst = [b for b in non_gst_bills if _is_pending(b)]

    # Revenue is what came IN; a part-paid bill contributes only its paid share
    # and the rest lands in pending_amount, so the two always sum to what was billed.
    gst_revenue = sum(_received(b, float(b.final_amount or 0)) for b in gst_bills)
    non_gst_revenue = sum(_received(b, float(b.total_amount or 0)) for b in non_gst_bills)
    total_revenue = gst_revenue + non_gst_revenue
    total_invoices = len(paid_gst) + len(paid_non_gst)
    avg_bill = total_revenue / total_invoices if total_invoices > 0 else 0.0

    pending_amount = (
        sum(float(b.final_amount or 0) - _received(b, float(b.final_amount or 0)) for b in gst_bills)
        + sum(float(b.total_amount or 0) - _received(b, float(b.total_amount or 0)) for b in non_gst_bills)
    )

    # Top-selling item by quantity — across paid bills only, same as revenue.
    item_totals: dict = defaultdict(float)
    for bill in paid_gst + paid_non_gst:
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

    return {
        'client_name': client_name,
        'date_display': date_display,
        'total_revenue': total_revenue,
        'pending_amount': pending_amount,
        'total_invoices': total_invoices,
        'avg_bill': avg_bill,
        'top_item': top_item,
        'top_qty': top_qty,
        'has_activity': bool(gst_bills or non_gst_bills),
    }


def compute_daily_summary(client_id: str, report_date: date = None) -> dict:
    """Summary for a single day (defaults to today in IST)."""
    if report_date is None:
        report_date = datetime.now(IST).date()
    return compute_summary_range(client_id, report_date, report_date)


def compute_weekly_summary(client_id: str, week_end: date = None) -> dict:
    """Summary for the 7 days ending on week_end (defaults to yesterday in IST — the
    most recently completed day), i.e. the preceding Mon–Sun when called on a Monday."""
    if week_end is None:
        week_end = datetime.now(IST).date() - timedelta(days=1)
    week_start = week_end - timedelta(days=6)
    return compute_summary_range(client_id, week_start, week_end)
