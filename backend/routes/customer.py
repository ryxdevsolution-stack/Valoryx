from flask import Blueprint, jsonify, g, request
from extensions import db
from models.billing_model import GSTBilling, NonGSTBilling
from models.customer_model import Customer
from utils.auth_middleware import authenticate
from utils.permission_middleware import require_permission
from sqlalchemy import func, desc
from datetime import datetime, timedelta
import uuid

customer_bp = Blueprint('customer', __name__)


@customer_bp.route('/list', methods=['GET'])
@authenticate
@require_permission('view_customers')
def get_customers():
    """Get all customers with their billing statistics"""
    try:
        client_id = g.user['client_id']

        # Helper to check if customer is a walk-in customer (default when no details provided)
        def is_walkin_customer(name):
            if not name:
                return False
            name_lower = name.lower().strip()
            return name_lower in ['walk-in customer', 'walk-in', 'walkin', 'walkin customer', 'walk in customer', 'walk in']

        # Get REGULAR customers (non walk-in) from billing tables - grouped by phone
        gst_customers = db.session.query(
            GSTBilling.customer_name,
            GSTBilling.customer_phone,
            func.count(GSTBilling.bill_id).label('total_bills'),
            func.sum(GSTBilling.final_amount).label('total_amount'),
            func.max(GSTBilling.created_at).label('last_purchase'),
            func.min(GSTBilling.created_at).label('first_purchase')
        ).filter(
            GSTBilling.client_id == client_id,
            ~GSTBilling.customer_name.ilike('walk-in%'),
            ~GSTBilling.customer_name.ilike('walkin%'),
            ~GSTBilling.customer_name.ilike('walk in%')
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
        ).filter(
            NonGSTBilling.client_id == client_id,
            ~NonGSTBilling.customer_name.ilike('walk-in%'),
            ~NonGSTBilling.customer_name.ilike('walkin%'),
            ~NonGSTBilling.customer_name.ilike('walk in%')
        ).group_by(
            NonGSTBilling.customer_phone,
            NonGSTBilling.customer_name
        ).all()

        # Get WALK-IN customers individually (each bill as separate entry)
        # OPTIMIZED: Limit to recent 50 walk-in bills to prevent loading thousands of records
        MAX_WALKIN_DISPLAY = 50

        walkin_gst_bills = GSTBilling.query.filter(
            GSTBilling.client_id == client_id,
            db.or_(
                GSTBilling.customer_name.ilike('walk-in%'),
                GSTBilling.customer_name.ilike('walkin%'),
                GSTBilling.customer_name.ilike('walk in%')
            )
        ).order_by(desc(GSTBilling.created_at)).limit(MAX_WALKIN_DISPLAY).all()

        walkin_non_gst_bills = NonGSTBilling.query.filter(
            NonGSTBilling.client_id == client_id,
            db.or_(
                NonGSTBilling.customer_name.ilike('walk-in%'),
                NonGSTBilling.customer_name.ilike('walkin%'),
                NonGSTBilling.customer_name.ilike('walk in%')
            )
        ).order_by(desc(NonGSTBilling.created_at)).limit(MAX_WALKIN_DISPLAY).all()

        # Merge and aggregate REGULAR customers by phone
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

        # Get all registered customers with customer_code for lookup
        registered_customers = {c.customer_phone: c.customer_code for c in
                               Customer.query.filter_by(client_id=client_id).all()}

        # Convert to list and add status
        customers_list = []
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)

        # Add regular customers
        for customer_data in customer_dict.values():
            # Add customer_code from registered customers table
            customer_data['customer_code'] = registered_customers.get(customer_data['customer_phone'])

            # Handle None for last_purchase
            if customer_data['last_purchase']:
                customer_data['status'] = 'Active' if customer_data['last_purchase'] >= thirty_days_ago else 'Inactive'
                customer_data['last_purchase'] = customer_data['last_purchase'].isoformat()
            else:
                customer_data['status'] = 'Inactive'
                customer_data['last_purchase'] = None

            customer_data['first_purchase'] = customer_data['first_purchase'].isoformat() if customer_data['first_purchase'] else None
            customers_list.append(customer_data)

        # Add walk-in customers individually (each bill as separate entry)
        for bill in walkin_gst_bills:
            customers_list.append({
                'customer_name': bill.customer_name,
                'customer_phone': bill.customer_phone,
                'customer_email': '',
                'customer_address': '',
                'customer_code': None,
                'total_bills': 1,
                'total_amount': float(bill.final_amount or 0),
                'last_purchase': bill.created_at.isoformat() if bill.created_at else None,
                'first_purchase': bill.created_at.isoformat() if bill.created_at else None,
                'gst_bills': 1,
                'non_gst_bills': 0,
                'status': 'Active' if bill.created_at and bill.created_at >= thirty_days_ago else 'Inactive',
                'is_walkin': True,
                'bill_number': bill.bill_number
            })

        for bill in walkin_non_gst_bills:
            customers_list.append({
                'customer_name': bill.customer_name,
                'customer_phone': bill.customer_phone,
                'customer_email': '',
                'customer_address': '',
                'customer_code': None,
                'total_bills': 1,
                'total_amount': float(bill.total_amount or 0),
                'last_purchase': bill.created_at.isoformat() if bill.created_at else None,
                'first_purchase': bill.created_at.isoformat() if bill.created_at else None,
                'gst_bills': 0,
                'non_gst_bills': 1,
                'status': 'Active' if bill.created_at and bill.created_at >= thirty_days_ago else 'Inactive',
                'is_walkin': True,
                'bill_number': bill.bill_number
            })

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


@customer_bp.route('/next-code', methods=['GET'])
@authenticate
def get_next_customer_code():
    """Get the next available customer code"""
    try:
        client_id = g.user['client_id']

        # Get the maximum customer code for this client
        max_code = db.session.query(func.max(Customer.customer_code)).filter_by(client_id=client_id).scalar()

        # If no customers exist, start from 100
        next_code = (max_code + 1) if max_code else 100

        return jsonify({
            'success': True,
            'next_code': next_code
        }), 200

    except Exception as e:
        return jsonify({'error': 'Failed to get next customer code', 'message': str(e)}), 500


@customer_bp.route('/code/<int:customer_code>', methods=['GET'])
@authenticate
def get_customer_by_code(customer_code):
    """Get customer details by customer code"""
    try:
        client_id = g.user['client_id']

        # Find customer by code
        customer = Customer.query.filter_by(
            client_id=client_id,
            customer_code=customer_code
        ).first()

        if not customer:
            return jsonify({'error': 'Customer not found'}), 404

        return jsonify({
            'success': True,
            'customer': customer.to_dict()
        }), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch customer', 'message': str(e)}), 500


@customer_bp.route('/create', methods=['POST'])
@authenticate
def create_customer():
    """Create a new customer with auto-generated code"""
    try:
        client_id = g.user['client_id']
        data = request.get_json()

        # Validate required fields
        if not data.get('customer_name') or not data.get('customer_phone'):
            return jsonify({'error': 'Customer name and phone are required'}), 400

        # Check if customer already exists by phone
        existing_customer = Customer.query.filter_by(
            client_id=client_id,
            customer_phone=data.get('customer_phone')
        ).first()

        if existing_customer:
            return jsonify({
                'success': True,
                'customer': existing_customer.to_dict(),
                'message': 'Customer already exists'
            }), 200

        # Get next customer code
        max_code = db.session.query(func.max(Customer.customer_code)).filter_by(client_id=client_id).scalar()
        next_code = (max_code + 1) if max_code else 100

        # Create new customer
        new_customer = Customer(
            customer_id=str(uuid.uuid4()),
            client_id=client_id,
            customer_code=next_code,
            customer_name=data.get('customer_name'),
            customer_phone=data.get('customer_phone'),
            customer_email=data.get('customer_email', ''),
            customer_address=data.get('customer_address', ''),
            customer_gstin=data.get('customer_gstin', ''),
            customer_city=data.get('customer_city', ''),
            customer_state=data.get('customer_state', ''),
            customer_pincode=data.get('customer_pincode', ''),
            notes=data.get('notes', ''),
            status='active'
        )

        db.session.add(new_customer)
        db.session.commit()

        return jsonify({
            'success': True,
            'customer': new_customer.to_dict(),
            'message': 'Customer created successfully'
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to create customer', 'message': str(e)}), 500


@customer_bp.route('/phone/<phone>', methods=['GET'])
@authenticate
def get_customer_by_phone(phone):
    """Get customer by phone number"""
    try:
        client_id = g.user['client_id']

        # Find customer by phone
        customer = Customer.query.filter_by(
            client_id=client_id,
            customer_phone=phone
        ).first()

        if not customer:
            return jsonify({'error': 'Customer not found'}), 404

        return jsonify({
            'success': True,
            'customer': customer.to_dict()
        }), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch customer', 'message': str(e)}), 500


@customer_bp.route('/search', methods=['GET'])
@authenticate
def search_customers():
    """Search customers by code, phone, or name"""
    try:
        client_id = g.user['client_id']
        query = request.args.get('q', '').strip()

        if not query:
            return jsonify({'success': True, 'customers': []}), 200

        # Build search conditions
        from sqlalchemy import or_

        customers = Customer.query.filter(
            Customer.client_id == client_id,
            or_(
                Customer.customer_code.cast(db.String).like(f'{query}%'),
                Customer.customer_phone.like(f'%{query}%'),
                Customer.customer_name.ilike(f'%{query}%')
            )
        ).limit(10).all()

        return jsonify({
            'success': True,
            'customers': [c.to_dict() for c in customers]
        }), 200

    except Exception as e:
        return jsonify({'error': 'Failed to search customers', 'message': str(e)}), 500
