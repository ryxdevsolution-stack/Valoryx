from flask import Blueprint, jsonify, g, request
from extensions import db
from models.billing_model import GSTBilling, NonGSTBilling
from utils.auth_middleware import authenticate
from sqlalchemy import func, desc
from datetime import datetime, timedelta

customer_bp = Blueprint('customer', __name__)


@customer_bp.route('/list', methods=['GET'])
@authenticate
def get_customers():
    """Get all customers with their billing statistics"""
    try:
        client_id = g.user['client_id']

        # Get all customers from billing tables
        gst_customers = db.session.query(
            GSTBilling.customer_name,
            GSTBilling.customer_phone,
            func.count(GSTBilling.bill_id).label('total_bills'),
            func.sum(GSTBilling.final_amount).label('total_amount'),
            func.max(GSTBilling.created_at).label('last_purchase'),
            func.min(GSTBilling.created_at).label('first_purchase')
        ).filter_by(
            client_id=client_id
        ).group_by(
            GSTBilling.customer_phone,
            GSTBilling.customer_name
        ).all()

        non_gst_customers = db.session.query(
            NonGSTBilling.customer_name,
            NonGSTBilling.customer_phone,
            func.count(NonGSTBilling.bill_id).label('total_bills'),
            func.sum(NonGSTBilling.total_amount).label('total_amount'),
            func.max(NonGSTBilling.created_at).label('last_purchase'),
            func.min(NonGSTBilling.created_at).label('first_purchase')
        ).filter_by(
            client_id=client_id
        ).group_by(
            NonGSTBilling.customer_phone,
            NonGSTBilling.customer_name
        ).all()

        # Merge and aggregate customers by phone
        customer_dict = {}

        for customer in gst_customers:
            phone = customer.customer_phone
            if phone not in customer_dict:
                customer_dict[phone] = {
                    'customer_name': customer.customer_name,
                    'customer_phone': phone,
                    'customer_email': '',
                    'customer_address': '',
                    'total_bills': 0,
                    'total_amount': 0.0,
                    'last_purchase': customer.last_purchase,
                    'first_purchase': customer.first_purchase,
                    'gst_bills': 0,
                    'non_gst_bills': 0
                }

            customer_dict[phone]['total_bills'] += customer.total_bills
            customer_dict[phone]['total_amount'] += float(customer.total_amount or 0)
            customer_dict[phone]['gst_bills'] += customer.total_bills

            # Update last purchase if more recent
            if customer.last_purchase and customer_dict[phone]['last_purchase']:
                if customer.last_purchase > customer_dict[phone]['last_purchase']:
                    customer_dict[phone]['last_purchase'] = customer.last_purchase
            elif customer.last_purchase:
                customer_dict[phone]['last_purchase'] = customer.last_purchase

            # Update first purchase if earlier
            if customer.first_purchase and customer_dict[phone]['first_purchase']:
                if customer.first_purchase < customer_dict[phone]['first_purchase']:
                    customer_dict[phone]['first_purchase'] = customer.first_purchase
            elif customer.first_purchase:
                customer_dict[phone]['first_purchase'] = customer.first_purchase

        for customer in non_gst_customers:
            phone = customer.customer_phone
            if phone not in customer_dict:
                customer_dict[phone] = {
                    'customer_name': customer.customer_name,
                    'customer_phone': phone,
                    'customer_email': '',
                    'customer_address': '',
                    'total_bills': 0,
                    'total_amount': 0.0,
                    'last_purchase': customer.last_purchase,
                    'first_purchase': customer.first_purchase,
                    'gst_bills': 0,
                    'non_gst_bills': 0
                }

            customer_dict[phone]['total_bills'] += customer.total_bills
            customer_dict[phone]['total_amount'] += float(customer.total_amount or 0)
            customer_dict[phone]['non_gst_bills'] += customer.total_bills

            # Update last purchase if more recent
            if customer.last_purchase and customer_dict[phone]['last_purchase']:
                if customer.last_purchase > customer_dict[phone]['last_purchase']:
                    customer_dict[phone]['last_purchase'] = customer.last_purchase
            elif customer.last_purchase:
                customer_dict[phone]['last_purchase'] = customer.last_purchase

            # Update first purchase if earlier
            if customer.first_purchase and customer_dict[phone]['first_purchase']:
                if customer.first_purchase < customer_dict[phone]['first_purchase']:
                    customer_dict[phone]['first_purchase'] = customer.first_purchase
            elif customer.first_purchase:
                customer_dict[phone]['first_purchase'] = customer.first_purchase

        # Convert to list and add status
        customers_list = []
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)

        for customer_data in customer_dict.values():
            # Handle None for last_purchase
            if customer_data['last_purchase']:
                customer_data['status'] = 'Active' if customer_data['last_purchase'] >= thirty_days_ago else 'Inactive'
                customer_data['last_purchase'] = customer_data['last_purchase'].isoformat()
            else:
                customer_data['status'] = 'Inactive'
                customer_data['last_purchase'] = None

            customer_data['first_purchase'] = customer_data['first_purchase'].isoformat() if customer_data['first_purchase'] else None
            customers_list.append(customer_data)

        # Sort by total amount (highest first)
        customers_list.sort(key=lambda x: x['total_amount'], reverse=True)

        # Calculate statistics
        total_customers = len(customers_list)
        active_customers = sum(1 for c in customers_list if c['status'] == 'Active')
        total_revenue = sum(c['total_amount'] for c in customers_list)
        top_customer = customers_list[0] if customers_list else None

        return jsonify({
            'success': True,
            'customers': customers_list,
            'statistics': {
                'total_customers': total_customers,
                'active_customers': active_customers,
                'inactive_customers': total_customers - active_customers,
                'total_revenue': round(total_revenue, 2),
                'top_customer': top_customer
            }
        }), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch customers', 'message': str(e)}), 500


@customer_bp.route('/<phone>', methods=['GET'])
@authenticate
def get_customer_details(phone):
    """Get detailed information about a specific customer"""
    try:
        client_id = g.user['client_id']

        # Get GST bills for this customer
        gst_bills = GSTBilling.query.filter_by(
            client_id=client_id,
            customer_phone=phone
        ).order_by(desc(GSTBilling.created_at)).all()

        # Get Non-GST bills for this customer
        non_gst_bills = NonGSTBilling.query.filter_by(
            client_id=client_id,
            customer_phone=phone
        ).order_by(desc(NonGSTBilling.created_at)).all()

        if not gst_bills and not non_gst_bills:
            return jsonify({'error': 'Customer not found'}), 404

        # Get customer info from first bill
        customer_info = None
        if gst_bills:
            bill = gst_bills[0]
            customer_info = {
                'customer_name': bill.customer_name,
                'customer_phone': bill.customer_phone,
                'customer_email': '',
                'customer_address': '',
                'customer_gstin': ''
            }
        elif non_gst_bills:
            bill = non_gst_bills[0]
            customer_info = {
                'customer_name': bill.customer_name,
                'customer_phone': bill.customer_phone,
                'customer_email': '',
                'customer_address': '',
                'customer_gstin': ''
            }

        # Combine and format bills
        all_bills = []

        for bill in gst_bills:
            all_bills.append({
                'bill_id': bill.bill_id,
                'bill_number': bill.bill_number,
                'type': 'GST',
                'amount': float(bill.final_amount),
                'created_at': bill.created_at.isoformat(),
                'payment_type': bill.payment_type
            })

        for bill in non_gst_bills:
            all_bills.append({
                'bill_id': bill.bill_id,
                'bill_number': bill.bill_number,
                'type': 'Non-GST',
                'amount': float(bill.total_amount),
                'created_at': bill.created_at.isoformat(),
                'payment_type': bill.payment_type
            })

        # Sort bills by date (newest first)
        all_bills.sort(key=lambda x: x['created_at'], reverse=True)

        # Calculate statistics
        total_spent = sum(bill['amount'] for bill in all_bills)
        total_bills_count = len(all_bills)
        avg_bill_value = total_spent / total_bills_count if total_bills_count > 0 else 0

        return jsonify({
            'success': True,
            'customer': customer_info,
            'bills': all_bills,
            'statistics': {
                'total_bills': total_bills_count,
                'total_spent': round(total_spent, 2),
                'average_bill_value': round(avg_bill_value, 2),
                'gst_bills_count': len(gst_bills),
                'non_gst_bills_count': len(non_gst_bills)
            }
        }), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch customer details', 'message': str(e)}), 500
