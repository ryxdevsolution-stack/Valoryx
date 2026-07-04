from flask import Blueprint, jsonify, g, request
from extensions import db
from models.billing_model import GSTBilling, NonGSTBilling
from models.stock_model import StockEntry
from utils.auth_middleware import authenticate
from utils.cache_helper import get_cache_manager
from utils.rate_limiter import rate_limit
from utils.permission_middleware import require_permission
from sqlalchemy import func, desc
from datetime import datetime, timedelta
from collections import defaultdict

analytics_bp = Blueprint('analytics', __name__)

# Cache timeouts in seconds - optimized for better performance
# Dynamic cache timeouts based on time range for optimal performance
ANALYTICS_CACHE_TIMEOUTS = {
    'today': 180,   # 3 minutes - more frequent updates for daily data
    'week': 600,    # 10 minutes - weekly data changes less frequently
    'month': 1800   # 30 minutes - monthly data is relatively stable
}
ANALYTICS_CACHE_TIMEOUT = 300  # Default fallback


@analytics_bp.route('/dashboard', methods=['GET'])
@authenticate
@require_permission('view_dashboard')
@rate_limit(max_requests=20, window_seconds=60, key_func=lambda: g.user['user_id'])
def get_dashboard_analytics():
    """
    Get comprehensive analytics for dashboard with real data - OPTIMIZED with SQL and caching

    Permission-based filtering:
    - view_all_bills: User can see analytics for all bills in their client
    - view_own_bills: User can only see analytics for bills they created
    """
    try:
        client_id = g.user['client_id']
        user_id = g.user['user_id']
        time_range = request.args.get('range', 'today')

        # Check user permissions for filtering
        user_permissions = g.user.get('permissions', [])
        is_super_admin = g.user.get('is_super_admin', False)
        has_view_all = is_super_admin or 'view_all_bills' in user_permissions

        # No caching — always return fresh data

        # Calculate date range
        # Bills are stored as IST naive datetimes; use local time so "today_start" etc.
        # align with the actual calendar day — not UTC midnight (which is 05:30 IST).
        now = datetime.now()
        if time_range == 'today':
            start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
        elif time_range == 'week':
            start_date = now - timedelta(days=7)
        else:  # month
            start_date = now - timedelta(days=30)

        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = now - timedelta(days=7)
        month_start = now - timedelta(days=30)
        prev_month_start = now - timedelta(days=60)

        # ==================== BATCHED SQL AGGREGATIONS (12 queries → 2) ====================
        # All revenue + count metrics computed in a single round-trip per billing table.
        # Previously: 12 separate .scalar() calls × ~300ms Supabase latency = 3.6s wasted.
        # Now: 2 queries return all 6 aggregates each via CASE WHEN — 1 scan, 1 round-trip.

        from sqlalchemy import case, or_

        # Revenue counts only PAID bills. "paid" = anything NOT explicitly
        # 'pending' (so legacy/NULL payment_status rows still count as revenue).
        # Pending (unpaid) bills are summed separately as "outstanding".
        _gst_paid = or_(GSTBilling.payment_status != 'pending', GSTBilling.payment_status.is_(None))
        _gst_pend = GSTBilling.payment_status == 'pending'
        _non_paid = or_(NonGSTBilling.payment_status != 'pending', NonGSTBilling.payment_status.is_(None))
        _non_pend = NonGSTBilling.payment_status == 'pending'

        def _gst_aggs(extra_filter=None):
            q = db.session.query(
                func.coalesce(func.sum(case(((GSTBilling.created_at >= today_start) & _gst_paid, GSTBilling.final_amount))), 0).label('today_rev'),
                func.coalesce(func.sum(case(((GSTBilling.created_at >= week_start) & _gst_paid, GSTBilling.final_amount))), 0).label('week_rev'),
                func.coalesce(func.sum(case(((GSTBilling.created_at >= month_start) & _gst_paid, GSTBilling.final_amount))), 0).label('month_rev'),
                func.coalesce(func.sum(case((((GSTBilling.created_at >= prev_month_start) & (GSTBilling.created_at < month_start)) & _gst_paid, GSTBilling.final_amount))), 0).label('prev_rev'),
                func.coalesce(func.sum(case(((GSTBilling.created_at >= today_start) & _gst_pend, GSTBilling.final_amount))), 0).label('today_pend'),
                func.coalesce(func.sum(case(((GSTBilling.created_at >= week_start) & _gst_pend, GSTBilling.final_amount))), 0).label('week_pend'),
                func.coalesce(func.sum(case(((GSTBilling.created_at >= month_start) & _gst_pend, GSTBilling.final_amount))), 0).label('month_pend'),
                func.count(GSTBilling.bill_id).label('total_count'),
                func.count(case((GSTBilling.created_at >= today_start, GSTBilling.bill_id))).label('today_count'),
            ).filter(GSTBilling.client_id == client_id, GSTBilling.status == 'final')
            if extra_filter is not None:
                q = q.filter(extra_filter)
            return q.one()

        def _non_gst_aggs(extra_filter=None):
            q = db.session.query(
                func.coalesce(func.sum(case(((NonGSTBilling.created_at >= today_start) & _non_paid, NonGSTBilling.total_amount))), 0).label('today_rev'),
                func.coalesce(func.sum(case(((NonGSTBilling.created_at >= week_start) & _non_paid, NonGSTBilling.total_amount))), 0).label('week_rev'),
                func.coalesce(func.sum(case(((NonGSTBilling.created_at >= month_start) & _non_paid, NonGSTBilling.total_amount))), 0).label('month_rev'),
                func.coalesce(func.sum(case((((NonGSTBilling.created_at >= prev_month_start) & (NonGSTBilling.created_at < month_start)) & _non_paid, NonGSTBilling.total_amount))), 0).label('prev_rev'),
                func.coalesce(func.sum(case(((NonGSTBilling.created_at >= today_start) & _non_pend, NonGSTBilling.total_amount))), 0).label('today_pend'),
                func.coalesce(func.sum(case(((NonGSTBilling.created_at >= week_start) & _non_pend, NonGSTBilling.total_amount))), 0).label('week_pend'),
                func.coalesce(func.sum(case(((NonGSTBilling.created_at >= month_start) & _non_pend, NonGSTBilling.total_amount))), 0).label('month_pend'),
                func.count(NonGSTBilling.bill_id).label('total_count'),
                func.count(case((NonGSTBilling.created_at >= today_start, NonGSTBilling.bill_id))).label('today_count'),
            ).filter(NonGSTBilling.client_id == client_id, NonGSTBilling.status == 'final')
            if extra_filter is not None:
                q = q.filter(extra_filter)
            return q.one()

        user_filter_gst = GSTBilling.created_by == user_id if not has_view_all else None
        user_filter_non_gst = NonGSTBilling.created_by == user_id if not has_view_all else None

        ga = _gst_aggs(user_filter_gst)
        na = _non_gst_aggs(user_filter_non_gst)

        revenue_today      = float(ga.today_rev or 0)    + float(na.today_rev or 0)
        revenue_week       = float(ga.week_rev or 0)     + float(na.week_rev or 0)
        revenue_month      = float(ga.month_rev or 0)    + float(na.month_rev or 0)
        revenue_prev_month = float(ga.prev_rev or 0)     + float(na.prev_rev or 0)
        # Outstanding (billed but not yet paid) — shown alongside revenue.
        pending_today      = float(ga.today_pend or 0)   + float(na.today_pend or 0)
        pending_week       = float(ga.week_pend or 0)    + float(na.week_pend or 0)
        pending_month      = float(ga.month_pend or 0)   + float(na.month_pend or 0)
        total_gst_bills    = int(ga.total_count or 0)
        total_non_gst_bills= int(na.total_count or 0)
        today_gst_count    = int(ga.today_count or 0)
        today_non_gst_count= int(na.today_count or 0)

        # Calculate growth rate
        growth_rate = 0
        if revenue_prev_month > 0 and revenue_month > 0:
            growth_rate = ((revenue_month - revenue_prev_month) / revenue_prev_month) * 100

        # Calculate bills metrics
        total_bills = total_gst_bills + total_non_gst_bills
        avg_bill_value = (revenue_month / total_bills) if total_bills > 0 else 0

        # ==================== LOAD BILLS FOR PRODUCT / PROFIT ANALYSIS ONLY ====================
        # customer_name, payment_type, peak_hours, revenue_trend are now computed via
        # SQL GROUP BY queries below — no need to load those columns into Python here.
        _gst_q = db.session.query(
            GSTBilling.final_amount, GSTBilling.items, GSTBilling.created_at
        ).filter(
            GSTBilling.client_id == client_id,
            GSTBilling.status == 'final',
            GSTBilling.created_at >= prev_month_start
        )
        if not has_view_all:
            _gst_q = _gst_q.filter(GSTBilling.created_by == user_id)
        gst_bills = _gst_q.all()

        _non_q = db.session.query(
            NonGSTBilling.total_amount, NonGSTBilling.items, NonGSTBilling.created_at
        ).filter(
            NonGSTBilling.client_id == client_id,
            NonGSTBilling.status == 'final',
            NonGSTBilling.created_at >= prev_month_start
        )
        if not has_view_all:
            _non_q = _non_q.filter(NonGSTBilling.created_by == user_id)
        non_gst_bills = _non_q.all()

        # ==================== SQL GROUP BY: peak hours, revenue trend, customers, payments ====================
        # These 4 computations don't need the items JSON column — push aggregation to the DB.
        # For N bills this reduces Python-side work from O(N) to O(distinct groups) ≈ O(1).

        import json as _json
        import re as _re
        _UUID_RE = _re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', _re.I)

        def _resolve_payment_label(raw):
            if not raw:
                return 'Unknown'
            raw_str = str(raw).strip()
            if raw_str.startswith('[') or raw_str.startswith('{'):
                try:
                    parsed = _json.loads(raw_str)
                    if isinstance(parsed, list):
                        labels = []
                        for p in parsed:
                            if not isinstance(p, dict):
                                continue
                            label = p.get('payment_type') or p.get('PAYMENT_TYPE') or ''
                            if label:
                                labels.append(str(label).title())
                        return '+'.join(labels) if labels else 'Unknown'
                    if isinstance(parsed, dict):
                        label = parsed.get('payment_type') or parsed.get('PAYMENT_TYPE') or ''
                        return str(label).title() if label else 'Unknown'
                except (ValueError, KeyError):
                    pass
            return raw_str  # UUID resolved via payment_types map later

        def _apply_user_filter_gst(q):
            return q.filter(GSTBilling.created_by == user_id) if not has_view_all else q

        def _apply_user_filter_non(q):
            return q.filter(NonGSTBilling.created_by == user_id) if not has_view_all else q

        # — Peak hours (GROUP BY hour) —
        # Use func.extract() — dialect-agnostic, works on both SQLite and PostgreSQL
        _gst_ph = _apply_user_filter_gst(db.session.query(
            func.extract('hour', GSTBilling.created_at).cast(db.Integer).label('hour'),
            func.sum(GSTBilling.final_amount).label('sales'),
            func.count(GSTBilling.bill_id).label('cnt'),
        ).filter(GSTBilling.client_id == client_id, GSTBilling.status == 'final', GSTBilling.created_at >= prev_month_start)
        ).group_by(func.extract('hour', GSTBilling.created_at)).all()

        _non_ph = _apply_user_filter_non(db.session.query(
            func.extract('hour', NonGSTBilling.created_at).cast(db.Integer).label('hour'),
            func.sum(NonGSTBilling.total_amount).label('sales'),
            func.count(NonGSTBilling.bill_id).label('cnt'),
        ).filter(NonGSTBilling.client_id == client_id, NonGSTBilling.status == 'final', NonGSTBilling.created_at >= prev_month_start)
        ).group_by(func.extract('hour', NonGSTBilling.created_at)).all()

        _ph_agg = defaultdict(lambda: {'sales': 0.0, 'count': 0})
        for r in _gst_ph:
            _ph_agg[r.hour]['sales'] += float(r.sales or 0)
            _ph_agg[r.hour]['count'] += int(r.cnt or 0)
        for r in _non_ph:
            _ph_agg[r.hour]['sales'] += float(r.sales or 0)
            _ph_agg[r.hour]['count'] += int(r.cnt or 0)
        peak_hours = [
            {'hour': h, 'sales': round(d['sales'], 2), 'count': d['count']}
            for h, d in sorted(_ph_agg.items())
        ]

        # — Revenue trend (GROUP BY date) —
        _gst_tr = _apply_user_filter_gst(db.session.query(
            func.date(GSTBilling.created_at).label('dt'),
            func.sum(GSTBilling.final_amount).label('revenue'),
            func.count(GSTBilling.bill_id).label('bills'),
        ).filter(GSTBilling.client_id == client_id, GSTBilling.status == 'final', GSTBilling.created_at >= start_date)
        ).group_by(func.date(GSTBilling.created_at)).all()

        _non_tr = _apply_user_filter_non(db.session.query(
            func.date(NonGSTBilling.created_at).label('dt'),
            func.sum(NonGSTBilling.total_amount).label('revenue'),
            func.count(NonGSTBilling.bill_id).label('bills'),
        ).filter(NonGSTBilling.client_id == client_id, NonGSTBilling.status == 'final', NonGSTBilling.created_at >= start_date)
        ).group_by(func.date(NonGSTBilling.created_at)).all()

        _tr_agg = defaultdict(lambda: {'revenue': 0.0, 'bills': 0})
        for r in _gst_tr:
            _tr_agg[str(r.dt)]['revenue'] += float(r.revenue or 0)
            _tr_agg[str(r.dt)]['bills'] += int(r.bills or 0)
        for r in _non_tr:
            _tr_agg[str(r.dt)]['revenue'] += float(r.revenue or 0)
            _tr_agg[str(r.dt)]['bills'] += int(r.bills or 0)
        revenue_trend_list = sorted(
            [{'date': dt, 'revenue': round(d['revenue'], 2), 'bills': d['bills']} for dt, d in _tr_agg.items()],
            key=lambda x: x['date'],
        )

        # — Top customers (GROUP BY customer_name) —
        _gst_cu = _apply_user_filter_gst(db.session.query(
            func.coalesce(GSTBilling.customer_name, 'Walk-in').label('customer'),
            func.sum(GSTBilling.final_amount).label('spend'),
            func.count(GSTBilling.bill_id).label('visits'),
        ).filter(GSTBilling.client_id == client_id, GSTBilling.status == 'final', GSTBilling.created_at >= prev_month_start)
        ).group_by(func.coalesce(GSTBilling.customer_name, 'Walk-in')).all()

        _non_cu = _apply_user_filter_non(db.session.query(
            func.coalesce(NonGSTBilling.customer_name, 'Walk-in').label('customer'),
            func.sum(NonGSTBilling.total_amount).label('spend'),
            func.count(NonGSTBilling.bill_id).label('visits'),
        ).filter(NonGSTBilling.client_id == client_id, NonGSTBilling.status == 'final', NonGSTBilling.created_at >= prev_month_start)
        ).group_by(func.coalesce(NonGSTBilling.customer_name, 'Walk-in')).all()

        _cu_agg = defaultdict(lambda: {'spend': 0.0, 'visits': 0})
        for r in _gst_cu:
            _cu_agg[r.customer]['spend'] += float(r.spend or 0)
            _cu_agg[r.customer]['visits'] += int(r.visits or 0)
        for r in _non_cu:
            _cu_agg[r.customer]['spend'] += float(r.spend or 0)
            _cu_agg[r.customer]['visits'] += int(r.visits or 0)
        top_customers = sorted(
            [{'name': n, 'total_spend': round(d['spend'], 2), 'visit_count': d['visits'],
              'avg_spend': round(d['spend'] / d['visits'], 2) if d['visits'] > 0 else 0}
             for n, d in _cu_agg.items()],
            key=lambda x: x['total_spend'], reverse=True,
        )[:10]

        # — Payment preferences (GROUP BY payment_type) —
        _gst_py = _apply_user_filter_gst(db.session.query(
            GSTBilling.payment_type,
            func.count(GSTBilling.bill_id).label('cnt'),
            func.sum(GSTBilling.final_amount).label('amount'),
        ).filter(GSTBilling.client_id == client_id, GSTBilling.status == 'final', GSTBilling.created_at >= prev_month_start)
        ).group_by(GSTBilling.payment_type).all()

        _non_py = _apply_user_filter_non(db.session.query(
            NonGSTBilling.payment_type,
            func.count(NonGSTBilling.bill_id).label('cnt'),
            func.sum(NonGSTBilling.total_amount).label('amount'),
        ).filter(NonGSTBilling.client_id == client_id, NonGSTBilling.status == 'final', NonGSTBilling.created_at >= prev_month_start)
        ).group_by(NonGSTBilling.payment_type).all()

        _py_agg = defaultdict(lambda: {'count': 0, 'amount': 0.0})
        for r in _gst_py:
            label = _resolve_payment_label(r.payment_type)
            _py_agg[label]['count'] += int(r.cnt or 0)
            _py_agg[label]['amount'] += float(r.amount or 0)
        for r in _non_py:
            label = _resolve_payment_label(r.payment_type)
            _py_agg[label]['count'] += int(r.cnt or 0)
            _py_agg[label]['amount'] += float(r.amount or 0)

        payment_preferences = sorted(
            [{'method': pid, 'count': d['count'], 'amount': d['amount']}
             for pid, d in _py_agg.items()],
            key=lambda x: x['amount'], reverse=True,
        )

        # Product performance analysis (ALL TIME)
        product_sales = defaultdict(lambda: {'quantity': 0, 'revenue': 0.0, 'category': '', 'recent_sales': 0, 'old_sales': 0})

        # Product performance for selected time range
        product_sales_filtered = defaultdict(lambda: {'quantity': 0, 'revenue': 0.0, 'category': ''})

        # Analyze GST bills (partial-column named tuples)
        for bill in gst_bills:
            bill_amount = float(bill.final_amount) if bill.final_amount else 0
            items = (bill.items if isinstance(bill.items, list) else []) if bill.items else []

            for item in items:
                product_name = item.get('product_name', 'Unknown')
                quantity = item.get('quantity', 0)
                rate = float(item.get('rate', 0))
                category = item.get('category', 'Other')

                product_sales[product_name]['quantity'] += quantity
                product_sales[product_name]['revenue'] += quantity * rate
                product_sales[product_name]['category'] = category

                # Track for filtered time range
                if bill.created_at >= start_date:
                    product_sales_filtered[product_name]['quantity'] += quantity
                    product_sales_filtered[product_name]['revenue'] += quantity * rate
                    product_sales_filtered[product_name]['category'] = category

                # Track recent vs old sales for trending
                if bill.created_at >= week_start:
                    product_sales[product_name]['recent_sales'] += quantity
                elif bill.created_at >= (week_start - timedelta(days=7)):
                    product_sales[product_name]['old_sales'] += quantity

        # Analyze Non-GST bills
        for bill in non_gst_bills:
            items = bill.items if isinstance(bill.items, list) else []

            for item in items:
                product_name = item.get('product_name', 'Unknown')
                quantity = item.get('quantity', 0)
                rate = float(item.get('rate', 0))
                category = item.get('category', 'Other')

                product_sales[product_name]['quantity'] += quantity
                product_sales[product_name]['revenue'] += quantity * rate
                product_sales[product_name]['category'] = category

                # Track for filtered time range
                if bill.created_at >= start_date:
                    product_sales_filtered[product_name]['quantity'] += quantity
                    product_sales_filtered[product_name]['revenue'] += quantity * rate
                    product_sales_filtered[product_name]['category'] = category

                if bill.created_at >= week_start:
                    product_sales[product_name]['recent_sales'] += quantity
                elif bill.created_at >= (week_start - timedelta(days=7)):
                    product_sales[product_name]['old_sales'] += quantity

        # Sort products by quantity sold
        sorted_products = sorted(product_sales.items(), key=lambda x: x[1]['quantity'], reverse=True)

        # Top selling products
        top_selling = [
            {
                'product_name': name,
                'quantity_sold': data['quantity'],
                'revenue': data['revenue'],
                'category': data['category']
            }
            for name, data in sorted_products[:10]
        ]

        # Low performing products
        low_performing = [
            {
                'product_name': name,
                'quantity_sold': data['quantity'],
                'revenue': data['revenue'],
                'category': data['category']
            }
            for name, data in sorted_products[-10:] if data['quantity'] > 0
        ]

        # Trending products (based on growth rate)
        trending = []
        for name, data in product_sales.items():
            if data['old_sales'] > 0:
                growth = ((data['recent_sales'] - data['old_sales']) / data['old_sales']) * 100
                if growth > 0:
                    trending.append({
                        'product_name': name,
                        'growth_rate': growth,
                        'category': data['category']
                    })

        trending = sorted(trending, key=lambda x: x['growth_rate'], reverse=True)[:10]

        # Top products for filtered time range (for pie chart)
        sorted_products_filtered = sorted(product_sales_filtered.items(), key=lambda x: x[1]['revenue'], reverse=True)

        # Determine limit based on time range: day=7, week=15, month=25
        product_limit = 7 if time_range == 'today' else (15 if time_range == 'week' else 25)

        top_products_filtered = [
            {
                'product_name': name,
                'revenue': round(data['revenue'], 2),
                'quantity': data['quantity'],
                'category': data['category']
            }
            for name, data in sorted_products_filtered[:product_limit] if data['revenue'] > 0
        ]

        # Single stock query — fetches all needed columns (low-stock + cost-price) in one round-trip.
        # Eliminates the second cost_rows query that was firing lower in the function.
        all_stock_rows = db.session.query(
            StockEntry.product_name,
            StockEntry.quantity,
            StockEntry.low_stock_alert,
            StockEntry.rate,
            StockEntry.cost_price,
        ).filter_by(client_id=client_id).all()

        stock_product_names = {row.product_name for row in all_stock_rows}
        low_stock_items = [
            row for row in all_stock_rows
            if row.quantity is not None and row.low_stock_alert is not None
            and row.quantity <= row.low_stock_alert
        ]
        # Total inventory value across ALL products, using cost_price when available
        inventory_total_value = sum(
            (float(row.cost_price) if row.cost_price else float(row.rate or 0)) * (row.quantity or 0)
            for row in all_stock_rows
        )
        # Build cost lookup from the same rows (avoids a second stock query below)
        all_stock = {
            row.product_name: float(row.cost_price) if row.cost_price else float(row.rate or 0) * 0.7
            for row in all_stock_rows
        }

        # Categorize products by performance
        products_sold_set = {name for name, data in product_sales_filtered.items() if data['quantity'] > 0}

        # Get top 5 most selling products
        most_selling_products = [
            {'name': name, 'quantity': data['quantity']}
            for name, data in sorted_products_filtered[:5]
        ]

        # Get 5 less selling products (from bottom of sold products)
        less_selling_start = max(5, len(sorted_products_filtered) - 5)
        less_selling_products = [
            {'name': name, 'quantity': data['quantity']}
            for name, data in sorted_products_filtered[less_selling_start:] if data['quantity'] > 0
        ]

        # Get 5 non-selling products (in stock but not sold)
        non_selling_product_names = list(stock_product_names - products_sold_set)[:5]
        non_selling_products = [{'name': name, 'quantity': 0} for name in non_selling_product_names]

        product_performance_tiers = {
            'mostSelling': most_selling_products,
            'lessSelling': less_selling_products,
            'nonSelling': non_selling_products
        }

        # Category performance
        category_performance = defaultdict(lambda: {'revenue': 0.0, 'items_sold': 0})
        for name, data in product_sales.items():
            category = data['category'] or 'Uncategorized'
            category_performance[category]['revenue'] += data['revenue']
            category_performance[category]['items_sold'] += data['quantity']

        category_list = [
            {
                'category': cat,
                'revenue': data['revenue'],
                'items_sold': data['items_sold']
            }
            for cat, data in sorted(category_performance.items(), key=lambda x: x[1]['revenue'], reverse=True)
        ]

        # peak_hours, revenue_trend_list, top_customers, payment_preferences
        # are now computed via SQL GROUP BY above — no Python loops needed here.

        # Profit margin analysis (based on cost_price vs selling price)
        total_cost = 0
        total_revenue_for_margin = 0

        # all_stock dict is built from all_stock_rows above — no second stock query needed.

        for bill in gst_bills:
            items = bill.items if isinstance(bill.items, list) else []
            for item in items:
                product_name = item.get('product_name', '')
                quantity = item.get('quantity', 0)
                selling_rate = float(item.get('rate', 0))
                # Use cost_price from stock if available, otherwise estimate
                cost_rate = all_stock.get(product_name, selling_rate * 0.7)

                total_cost += quantity * cost_rate
                total_revenue_for_margin += quantity * selling_rate

        for bill in non_gst_bills:
            items = bill.items if isinstance(bill.items, list) else []
            for item in items:
                product_name = item.get('product_name', '')
                quantity = item.get('quantity', 0)
                selling_rate = float(item.get('rate', 0))
                # Use cost_price from stock if available, otherwise estimate
                cost_rate = all_stock.get(product_name, selling_rate * 0.7)

                total_cost += quantity * cost_rate
                total_revenue_for_margin += quantity * selling_rate

        profit_margin = 0
        if total_revenue_for_margin > 0:
            profit_margin = ((total_revenue_for_margin - total_cost) / total_revenue_for_margin) * 100

        # Build response data
        response_data = {
            'revenue': {
                'today': round(revenue_today, 2),
                'thisWeek': round(revenue_week, 2),
                'thisMonth': round(revenue_month, 2),
                'growth': round(growth_rate, 2),
                # Outstanding (billed but not yet paid) — 'today'/week/month above
                # are PAID-only; these are the pending amounts for the same periods.
                'pendingToday': round(pending_today, 2),
                'pendingWeek': round(pending_week, 2),
                'pendingMonth': round(pending_month, 2),
            },
            'bills': {
                'totalGST': total_gst_bills,
                'totalNonGST': total_non_gst_bills,
                'todayCount': today_gst_count + today_non_gst_count,
                'avgBillValue': round(avg_bill_value, 2)
            },
            'products': {
                'topSelling': top_selling,
                'lowPerforming': low_performing,
                'trending': trending,
                'topProductsFiltered': top_products_filtered,
                'performanceTiers': product_performance_tiers
            },
            'inventory': {
                'lowStock': [{'product_name': r.product_name, 'quantity': r.quantity, 'low_stock_alert': r.low_stock_alert} for r in low_stock_items],
                'totalValue': round(inventory_total_value, 2),
                'criticalCount': len(low_stock_items)
            },
            'insights': {
                'peakHours': peak_hours,
                'paymentPreferences': payment_preferences,
                'categoryPerformance': category_list,
                'revenueTrend': revenue_trend_list,
                'topCustomers': top_customers,
                'profitMargin': round(profit_margin, 2),
                'totalProfit': round(total_revenue_for_margin - total_cost, 2)
            }
        }

        return jsonify(response_data), 200

    except Exception as e:
        print(f"Analytics error: {str(e)}")
        return jsonify({'error': 'Failed to fetch analytics', 'message': str(e)}), 500
