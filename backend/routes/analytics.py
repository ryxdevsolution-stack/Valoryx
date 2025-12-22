from flask import Blueprint, jsonify, g, request
from extensions import db
from models.billing_model import GSTBilling, NonGSTBilling
from models.stock_model import StockEntry
from models.payment_model import PaymentType
from utils.auth_middleware import authenticate
from utils.cache_helper import get_cache_manager
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
def get_dashboard_analytics():
    """Get comprehensive analytics for dashboard with real data - OPTIMIZED with SQL and caching"""
    try:
        client_id = g.user['client_id']
        time_range = request.args.get('range', 'today')

        # Try to get from cache first - use dynamic timeout based on time range
        cache = get_cache_manager()
        cache_key = f"analytics:dashboard:{client_id}:{time_range}"
        cache_timeout = ANALYTICS_CACHE_TIMEOUTS.get(time_range, ANALYTICS_CACHE_TIMEOUT)
        cached_data = cache.get(cache_key)
        if cached_data is not None:
            return jsonify(cached_data), 200

        # Calculate date range
        now = datetime.utcnow()
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

        # ==================== SQL AGGREGATIONS (N+1 FIX) ====================
        # Revenue calculations using SQL instead of loading all records

        # Today's revenue - GST
        gst_today = db.session.query(func.coalesce(func.sum(GSTBilling.final_amount), 0)).filter(
            GSTBilling.client_id == client_id,
            GSTBilling.created_at >= today_start
        ).scalar() or 0

        # Today's revenue - Non-GST
        non_gst_today = db.session.query(func.coalesce(func.sum(NonGSTBilling.total_amount), 0)).filter(
            NonGSTBilling.client_id == client_id,
            NonGSTBilling.created_at >= today_start
        ).scalar() or 0

        revenue_today = float(gst_today) + float(non_gst_today)

        # Week's revenue
        gst_week = db.session.query(func.coalesce(func.sum(GSTBilling.final_amount), 0)).filter(
            GSTBilling.client_id == client_id,
            GSTBilling.created_at >= week_start
        ).scalar() or 0

        non_gst_week = db.session.query(func.coalesce(func.sum(NonGSTBilling.total_amount), 0)).filter(
            NonGSTBilling.client_id == client_id,
            NonGSTBilling.created_at >= week_start
        ).scalar() or 0

        revenue_week = float(gst_week) + float(non_gst_week)

        # Month's revenue
        gst_month = db.session.query(func.coalesce(func.sum(GSTBilling.final_amount), 0)).filter(
            GSTBilling.client_id == client_id,
            GSTBilling.created_at >= month_start
        ).scalar() or 0

        non_gst_month = db.session.query(func.coalesce(func.sum(NonGSTBilling.total_amount), 0)).filter(
            NonGSTBilling.client_id == client_id,
            NonGSTBilling.created_at >= month_start
        ).scalar() or 0

        revenue_month = float(gst_month) + float(non_gst_month)

        # Previous month's revenue (for growth calculation)
        gst_prev_month = db.session.query(func.coalesce(func.sum(GSTBilling.final_amount), 0)).filter(
            GSTBilling.client_id == client_id,
            GSTBilling.created_at >= prev_month_start,
            GSTBilling.created_at < month_start
        ).scalar() or 0

        non_gst_prev_month = db.session.query(func.coalesce(func.sum(NonGSTBilling.total_amount), 0)).filter(
            NonGSTBilling.client_id == client_id,
            NonGSTBilling.created_at >= prev_month_start,
            NonGSTBilling.created_at < month_start
        ).scalar() or 0

        revenue_prev_month = float(gst_prev_month) + float(non_gst_prev_month)

        # Bill counts using SQL
        total_gst_bills = db.session.query(func.count(GSTBilling.bill_id)).filter(
            GSTBilling.client_id == client_id
        ).scalar() or 0

        total_non_gst_bills = db.session.query(func.count(NonGSTBilling.bill_id)).filter(
            NonGSTBilling.client_id == client_id
        ).scalar() or 0

        today_gst_count = db.session.query(func.count(GSTBilling.bill_id)).filter(
            GSTBilling.client_id == client_id,
            GSTBilling.created_at >= today_start
        ).scalar() or 0

        today_non_gst_count = db.session.query(func.count(NonGSTBilling.bill_id)).filter(
            NonGSTBilling.client_id == client_id,
            NonGSTBilling.created_at >= today_start
        ).scalar() or 0

        # Calculate growth rate
        growth_rate = 0
        if revenue_prev_month > 0 and revenue_month > 0:
            growth_rate = ((revenue_month - revenue_prev_month) / revenue_prev_month) * 100

        # Calculate bills metrics
        total_bills = total_gst_bills + total_non_gst_bills
        avg_bill_value = (revenue_month / total_bills) if total_bills > 0 else 0

        # ==================== LOAD ONLY RECENT BILLS FOR PRODUCT ANALYSIS ====================
        # Only load bills from start_date for product analysis (not ALL historical bills)
        gst_bills = GSTBilling.query.filter(
            GSTBilling.client_id == client_id,
            GSTBilling.created_at >= prev_month_start  # Only last 60 days max for product analysis
        ).all()

        non_gst_bills = NonGSTBilling.query.filter(
            NonGSTBilling.client_id == client_id,
            NonGSTBilling.created_at >= prev_month_start  # Only last 60 days max
        ).all()

        # Product performance analysis (ALL TIME)
        product_sales = defaultdict(lambda: {'quantity': 0, 'revenue': 0.0, 'category': '', 'recent_sales': 0, 'old_sales': 0})

        # Product performance for selected time range
        product_sales_filtered = defaultdict(lambda: {'quantity': 0, 'revenue': 0.0, 'category': ''})

        # Analyze GST bills
        for bill in gst_bills:
            bill_amount = float(bill.final_amount) if bill.final_amount else 0
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

        # Product performance tiers (for column chart with product names)
        # Get all products from stock
        all_stock_products = StockEntry.query.filter_by(client_id=client_id).all()
        stock_product_names = {item.product_name for item in all_stock_products}

        # Categorize products by performance
        products_sold_set = {name for name, data in product_sales_filtered.items() if data['quantity'] > 0}

        # Get top 5 most selling products
        most_selling_products = [
            {
                'name': name,
                'quantity': data['quantity']
            }
            for name, data in sorted_products_filtered[:5]
        ]

        # Get 5 less selling products (from bottom of sold products)
        less_selling_start = max(5, len(sorted_products_filtered) - 5)
        less_selling_products = [
            {
                'name': name,
                'quantity': data['quantity']
            }
            for name, data in sorted_products_filtered[less_selling_start:] if data['quantity'] > 0
        ]

        # Get 5 non-selling products (in stock but not sold)
        non_selling_product_names = list(stock_product_names - products_sold_set)[:5]
        non_selling_products = [
            {
                'name': name,
                'quantity': 0  # Will be shown as negative in chart
            }
            for name in non_selling_product_names
        ]

        product_performance_tiers = {
            'mostSelling': most_selling_products,
            'lessSelling': less_selling_products,
            'nonSelling': non_selling_products
        }

        # Inventory analysis
        low_stock_items = StockEntry.query.filter(
            StockEntry.client_id == client_id,
            StockEntry.quantity <= StockEntry.low_stock_alert
        ).all()

        inventory_total_value = sum([float(item.rate) * item.quantity for item in low_stock_items])

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

        # Payment preferences
        payment_stats = defaultdict(lambda: {'count': 0, 'amount': 0.0})

        for bill in gst_bills:
            payment_id = str(bill.payment_type) if bill.payment_type else 'Unknown'
            payment_stats[payment_id]['count'] += 1
            payment_stats[payment_id]['amount'] += float(bill.final_amount)

        for bill in non_gst_bills:
            payment_id = str(bill.payment_type) if bill.payment_type else 'Unknown'
            payment_stats[payment_id]['count'] += 1
            payment_stats[payment_id]['amount'] += float(bill.total_amount)

        # Get payment type names
        payment_types = {str(pt.payment_type_id): pt.payment_name for pt in PaymentType.query.filter_by(client_id=client_id).all()}

        payment_preferences = [
            {
                'method': payment_types.get(payment_id, 'Unknown' if payment_id == 'Unknown' else f'Payment {payment_id[:8]}...'),
                'count': data['count'],
                'amount': data['amount']
            }
            for payment_id, data in sorted(payment_stats.items(), key=lambda x: x[1]['amount'], reverse=True)
        ]

        # Peak hours analysis - REAL DATA
        peak_hours_data = defaultdict(lambda: {'sales': 0.0, 'count': 0})

        for bill in gst_bills:
            hour = bill.created_at.hour
            peak_hours_data[hour]['sales'] += float(bill.final_amount)
            peak_hours_data[hour]['count'] += 1

        for bill in non_gst_bills:
            hour = bill.created_at.hour
            peak_hours_data[hour]['sales'] += float(bill.total_amount)
            peak_hours_data[hour]['count'] += 1

        peak_hours = [
            {
                'hour': hour,
                'sales': round(peak_hours_data[hour]['sales'], 2),
                'count': peak_hours_data[hour]['count']
            }
            for hour in sorted(peak_hours_data.keys())
        ]

        # Revenue trend (daily breakdown for charts)
        revenue_trend = defaultdict(lambda: {'date': '', 'revenue': 0.0, 'bills': 0})

        for bill in gst_bills:
            if bill.created_at >= start_date:
                date_key = bill.created_at.strftime('%Y-%m-%d')
                revenue_trend[date_key]['date'] = date_key
                revenue_trend[date_key]['revenue'] += float(bill.final_amount)
                revenue_trend[date_key]['bills'] += 1

        for bill in non_gst_bills:
            if bill.created_at >= start_date:
                date_key = bill.created_at.strftime('%Y-%m-%d')
                revenue_trend[date_key]['date'] = date_key
                revenue_trend[date_key]['revenue'] += float(bill.total_amount)
                revenue_trend[date_key]['bills'] += 1

        revenue_trend_list = sorted(
            [{'date': data['date'], 'revenue': round(data['revenue'], 2), 'bills': data['bills']}
             for data in revenue_trend.values()],
            key=lambda x: x['date']
        )

        # Customer insights
        customer_frequency = defaultdict(int)
        customer_spend = defaultdict(float)

        for bill in gst_bills:
            customer = bill.customer_name or 'Walk-in'
            customer_frequency[customer] += 1
            customer_spend[customer] += float(bill.final_amount)

        for bill in non_gst_bills:
            customer = bill.customer_name or 'Walk-in'
            customer_frequency[customer] += 1
            customer_spend[customer] += float(bill.total_amount)

        # Top customers by spend
        top_customers = [
            {
                'name': customer,
                'total_spend': round(spend, 2),
                'visit_count': customer_frequency[customer],
                'avg_spend': round(spend / customer_frequency[customer], 2)
            }
            for customer, spend in sorted(customer_spend.items(), key=lambda x: x[1], reverse=True)[:10]
        ]

        # Profit margin analysis (based on cost_price vs selling price)
        total_cost = 0
        total_revenue_for_margin = 0

        # Get all stock with cost prices (use cost_price if available, otherwise estimate 70% of selling price)
        all_stock = {
            item.product_name: float(item.cost_price) if item.cost_price else float(item.rate) * 0.7
            for item in StockEntry.query.filter_by(client_id=client_id).all()
        }

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
                'growth': round(growth_rate, 2)
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
                'lowStock': [item.to_dict() for item in low_stock_items],
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

        # Cache the response for faster subsequent requests with dynamic timeout
        cache.set(cache_key, response_data, cache_timeout)

        return jsonify(response_data), 200

    except Exception as e:
        print(f"Analytics error: {str(e)}")
        return jsonify({'error': 'Failed to fetch analytics', 'message': str(e)}), 500
