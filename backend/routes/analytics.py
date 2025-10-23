from flask import Blueprint, jsonify, g, request
from extensions import db
from models.billing_model import GSTBilling, NonGSTBilling
from models.stock_model import StockEntry
from models.payment_model import PaymentType
from utils.auth_middleware import authenticate
from sqlalchemy import func, desc
from datetime import datetime, timedelta
from collections import defaultdict

analytics_bp = Blueprint('analytics', __name__)


@analytics_bp.route('/dashboard', methods=['GET'])
@authenticate
def get_dashboard_analytics():
    """Get comprehensive analytics for dashboard with real data"""
    try:
        client_id = g.user['client_id']
        time_range = request.args.get('range', 'today')

        # Calculate date range
        now = datetime.utcnow()
        if time_range == 'today':
            start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
        elif time_range == 'week':
            start_date = now - timedelta(days=7)
        else:  # month
            start_date = now - timedelta(days=30)

        # Fetch all bills for the client
        gst_bills = GSTBilling.query.filter_by(client_id=client_id).all()
        non_gst_bills = NonGSTBilling.query.filter_by(client_id=client_id).all()

        # Calculate revenue metrics
        revenue_today = 0
        revenue_week = 0
        revenue_month = 0

        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = now - timedelta(days=7)
        month_start = now - timedelta(days=30)
        prev_month_start = now - timedelta(days=60)

        revenue_prev_month = 0

        for bill in gst_bills:
            amount = float(bill.final_amount)
            if bill.created_at >= today_start:
                revenue_today += amount
            if bill.created_at >= week_start:
                revenue_week += amount
            if bill.created_at >= month_start:
                revenue_month += amount
            elif bill.created_at >= prev_month_start:
                revenue_prev_month += amount

        for bill in non_gst_bills:
            amount = float(bill.total_amount)
            if bill.created_at >= today_start:
                revenue_today += amount
            if bill.created_at >= week_start:
                revenue_week += amount
            if bill.created_at >= month_start:
                revenue_month += amount
            elif bill.created_at >= prev_month_start:
                revenue_prev_month += amount

        # Calculate growth rate
        growth_rate = 0
        if revenue_prev_month > 0 and revenue_month > 0:
            growth_rate = ((revenue_month - revenue_prev_month) / revenue_prev_month) * 100

        # Calculate bills metrics
        total_bills = len(gst_bills) + len(non_gst_bills)
        avg_bill_value = (revenue_month / total_bills) if total_bills > 0 else 0

        # Product performance analysis
        product_sales = defaultdict(lambda: {'quantity': 0, 'revenue': 0.0, 'category': '', 'recent_sales': 0, 'old_sales': 0})

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
            payment_id = bill.payment_type or 'Unknown'
            payment_stats[payment_id]['count'] += 1
            payment_stats[payment_id]['amount'] += float(bill.final_amount)

        for bill in non_gst_bills:
            payment_id = bill.payment_type or 'Unknown'
            payment_stats[payment_id]['count'] += 1
            payment_stats[payment_id]['amount'] += float(bill.total_amount)

        # Get payment type names
        payment_types = {pt.payment_type_id: pt.type_name for pt in PaymentType.query.filter_by(client_id=client_id).all()}

        payment_preferences = [
            {
                'method': payment_types.get(payment_id, payment_id[:20]) if payment_id != 'Unknown' else 'Unknown',
                'count': data['count'],
                'amount': data['amount']
            }
            for payment_id, data in sorted(payment_stats.items(), key=lambda x: x[1]['amount'], reverse=True)
        ]

        # Peak hours analysis (placeholder - can be enhanced)
        peak_hours = [
            {'hour': hour, 'sales': 0}
            for hour in range(9, 21)  # 9 AM to 9 PM
        ]

        return jsonify({
            'revenue': {
                'today': round(revenue_today, 2),
                'thisWeek': round(revenue_week, 2),
                'thisMonth': round(revenue_month, 2),
                'growth': round(growth_rate, 2)
            },
            'bills': {
                'totalGST': len(gst_bills),
                'totalNonGST': len(non_gst_bills),
                'todayCount': len([b for b in gst_bills if b.created_at >= today_start]) + len([b for b in non_gst_bills if b.created_at >= today_start]),
                'avgBillValue': round(avg_bill_value, 2)
            },
            'products': {
                'topSelling': top_selling,
                'lowPerforming': low_performing,
                'trending': trending
            },
            'inventory': {
                'lowStock': [item.to_dict() for item in low_stock_items],
                'totalValue': round(inventory_total_value, 2),
                'criticalCount': len(low_stock_items)
            },
            'insights': {
                'peakHours': peak_hours,
                'paymentPreferences': payment_preferences,
                'categoryPerformance': category_list
            }
        }), 200

    except Exception as e:
        print(f"Analytics error: {str(e)}")
        return jsonify({'error': 'Failed to fetch analytics', 'message': str(e)}), 500
