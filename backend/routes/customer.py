from flask import Blueprint, jsonify, g, request
from extensions import db
from models.billing_model import GSTBilling, NonGSTBilling
from models.customer_model import Customer
from utils.auth_middleware import authenticate
from utils.permission_middleware import require_permission
from utils.helpers import title_case
from sqlalchemy import func, desc, literal, union_all
from datetime import datetime, timedelta
import uuid

customer_bp = Blueprint('customer', __name__)

# Walk-in name patterns (reusable)
WALKIN_PATTERNS = ['walk-in%', 'walkin%', 'walk in%']


def is_walkin_customer(name):
    """Check if customer is a walk-in (default when no details provided)"""
    if not name:
        return False
    name_lower = name.lower().strip()
    return name_lower in ['walk-in customer', 'walk-in', 'walkin', 'walkin customer', 'walk in customer', 'walk in']


def _walkin_filter(model):
    """Build OR filter for walk-in customer name patterns"""
    return db.or_(*(model.customer_name.ilike(p) for p in WALKIN_PATTERNS))


def _not_walkin_filter(model):
    """Build AND filter to exclude walk-in customers"""
    return db.and_(*(~model.customer_name.ilike(p) for p in WALKIN_PATTERNS))


@customer_bp.route('/list', methods=['GET'])
@authenticate
@require_permission('view_customers')
def get_customers():
    """Get all customers with their billing statistics.

    OPTIMIZED: Uses UNION ALL to merge GST + Non-GST in one query,
    partial column loading for walk-ins, and pre-built lookup dicts.
    Response cached 3 minutes — busted on new bill creation.
    """
    try:
        client_id = g.user['client_id']

        # Query customers directly from the Customer table (no walk-ins)
        customers = Customer.query.filter_by(client_id=client_id).order_by(Customer.total_spent.desc()).all()

        customers_list = [c.to_dict() for c in customers]

        total_customers = len(customers_list)
        active_customers = sum(1 for c in customers if c.status == 'active')
        total_revenue = sum(float(c.total_spent or 0) for c in customers)

        response = {
            'success': True,
            'customers': customers_list,
            'statistics': {
                'total_customers': total_customers,
                'active_customers': active_customers,
                'inactive_customers': total_customers - active_customers,
                'total_revenue': round(total_revenue, 2),
                'top_customer': customers_list[0] if customers_list else None
            }
        }
        return jsonify(response), 200

    except Exception as e:
        return jsonify({'success': False, 'error': 'Failed to fetch customers', 'message': str(e)}), 500


@customer_bp.route('/<phone>', methods=['GET'])
@authenticate
@require_permission('view_purchase_history')
def get_customer_details(phone):
    """Get detailed information about a specific customer.

    OPTIMIZED: Uses partial column loading — only fetches columns needed
    for the response instead of loading full ORM objects with items JSON.
    """
    try:
        client_id = g.user['client_id']

        # Partial column loading — skip heavy 'items' JSON for list view
        # Exclude cancelled bills — they shouldn't appear in customer history
        gst_cols = db.session.query(
            GSTBilling.bill_id, GSTBilling.bill_number, GSTBilling.customer_name,
            GSTBilling.customer_phone, GSTBilling.final_amount, GSTBilling.created_at,
            GSTBilling.payment_type, GSTBilling.status, GSTBilling.items
        ).filter(
            GSTBilling.client_id == client_id,
            GSTBilling.customer_phone == phone,
            GSTBilling.status == 'final'
        ).order_by(desc(GSTBilling.created_at)).all()

        nongst_cols = db.session.query(
            NonGSTBilling.bill_id, NonGSTBilling.bill_number, NonGSTBilling.customer_name,
            NonGSTBilling.customer_phone, NonGSTBilling.total_amount, NonGSTBilling.created_at,
            NonGSTBilling.payment_type, NonGSTBilling.status, NonGSTBilling.items
        ).filter(
            NonGSTBilling.client_id == client_id,
            NonGSTBilling.customer_phone == phone,
            NonGSTBilling.status == 'final'
        ).order_by(desc(NonGSTBilling.created_at)).all()

        if not gst_cols and not nongst_cols:
            return jsonify({'error': 'Customer not found'}), 404

        # Get customer info from first bill found
        first = gst_cols[0] if gst_cols else nongst_cols[0]
        customer_info = {
            'customer_name': first.customer_name,
            'customer_phone': first.customer_phone,
            'customer_email': '',
            'customer_address': '',
            'customer_gstin': ''
        }

        # Build bill list
        all_bills = []
        for b in gst_cols:
            all_bills.append({
                'bill_id': b.bill_id, 'bill_number': b.bill_number, 'type': 'GST',
                'amount': float(b.final_amount), 'created_at': b.created_at.isoformat(),
                'payment_type': b.payment_type, 'status': b.status or 'final',
                'items': b.items or []
            })
        for b in nongst_cols:
            all_bills.append({
                'bill_id': b.bill_id, 'bill_number': b.bill_number, 'type': 'Non-GST',
                'amount': float(b.total_amount), 'created_at': b.created_at.isoformat(),
                'payment_type': b.payment_type, 'status': b.status or 'final',
                'items': b.items or []
            })

        all_bills.sort(key=lambda x: x['created_at'], reverse=True)

        active_bills = [b for b in all_bills if b['status'] == 'final']
        total_spent = sum(b['amount'] for b in active_bills)
        total_bills_count = len(active_bills)

        return jsonify({
            'success': True,
            'customer': customer_info,
            'bills': all_bills,
            'statistics': {
                'total_bills': total_bills_count,
                'total_spent': round(total_spent, 2),
                'average_bill_value': round(total_spent / total_bills_count, 2) if total_bills_count else 0,
                'gst_bills_count': sum(1 for b in all_bills if b['type'] == 'GST' and b['status'] == 'final'),
                'non_gst_bills_count': sum(1 for b in all_bills if b['type'] == 'Non-GST' and b['status'] == 'final')
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
@require_permission('add_customer')
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

        # Get next customer code (scoped to this client)
        max_code = db.session.query(func.max(Customer.customer_code)).filter_by(client_id=client_id).scalar()
        next_code = (max_code + 1) if max_code else 100

        # Create new customer (apply title case to name fields)
        new_customer = Customer(
            customer_id=str(uuid.uuid4()),
            client_id=client_id,
            customer_code=next_code,
            customer_name=title_case(data.get('customer_name')),
            customer_phone=data.get('customer_phone'),
            customer_email=data.get('customer_email', ''),
            customer_address=data.get('customer_address', ''),
            customer_gstin=data.get('customer_gstin', ''),
            customer_city=title_case(data.get('customer_city', '')),
            customer_state=title_case(data.get('customer_state', '')),
            customer_pincode=data.get('customer_pincode', ''),
            notes=data.get('notes', ''),
            status='active'
        )

        db.session.add(new_customer)
        db.session.commit()

        # Bust customer list cache so the UI reflects the new customer immediately
        from utils.cache_helper import get_cache_manager
        get_cache_manager().delete(f"customers:list:{client_id}")

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


@customer_bp.route('/all', methods=['GET'])
@authenticate
def get_all_customers_for_billing():
    """Return all registered customers for billing autocomplete (no extra permission needed)."""
    try:
        client_id = g.user['client_id']
        customers = Customer.query.filter_by(client_id=client_id, status='active').order_by(Customer.customer_name).all()
        return jsonify({
            'success': True,
            'customers': [c.to_dict() for c in customers]
        }), 200
    except Exception as e:
        return jsonify({'error': 'Failed to fetch customers', 'message': str(e)}), 500


@customer_bp.route('/search', methods=['GET'])
@authenticate
@require_permission('view_customers')
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

        results = [c.to_dict() for c in customers]

        # If few results from customer table, also search billing records
        # This finds customers who made purchases but aren't registered
        if len(results) < 5:
            existing_phones = {c.customer_phone for c in customers}
            billing_customers = []

            # Search GST bills
            gst_matches = GSTBilling.query.filter(
                GSTBilling.client_id == client_id,
                or_(
                    GSTBilling.customer_phone.like(f'%{query}%'),
                    GSTBilling.customer_name.ilike(f'%{query}%')
                )
            ).order_by(desc(GSTBilling.created_at)).limit(20).all()

            # Search Non-GST bills
            non_gst_matches = NonGSTBilling.query.filter(
                NonGSTBilling.client_id == client_id,
                or_(
                    NonGSTBilling.customer_phone.like(f'%{query}%'),
                    NonGSTBilling.customer_name.ilike(f'%{query}%')
                )
            ).order_by(desc(NonGSTBilling.created_at)).limit(20).all()

            # Deduplicate by phone, skip walk-ins and already-found customers
            seen_phones = set(existing_phones)
            for bill in gst_matches + non_gst_matches:
                phone = bill.customer_phone
                name = bill.customer_name
                if not phone or is_walkin_customer(name) or phone in seen_phones:
                    continue
                seen_phones.add(phone)
                billing_customers.append({
                    'customer_id': f'billing-{phone}',
                    'customer_code': None,
                    'customer_name': name,
                    'customer_phone': phone,
                    'customer_email': '',
                    'customer_address': '',
                    'customer_gstin': getattr(bill, 'customer_gstin', '') or '',
                    'from_billing': True,
                })
                if len(billing_customers) >= (10 - len(results)):
                    break

            results.extend(billing_customers)

        return jsonify({
            'success': True,
            'customers': results
        }), 200

    except Exception as e:
        return jsonify({'error': 'Failed to search customers', 'message': str(e)}), 500
