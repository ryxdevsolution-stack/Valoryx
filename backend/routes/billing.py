import uuid
from datetime import datetime
from dateutil import parser as date_parser
from flask import Blueprint, request, jsonify, g
from extensions import db
from models.billing_model import GSTBilling, NonGSTBilling
from models.stock_model import StockEntry
from utils.auth_middleware import authenticate
from utils.permission_middleware import require_permission, require_any_permission
from utils.audit_logger import log_action
from utils.helpers import calculate_gst_amount, calculate_final_amount, validate_items, title_case
from utils.cache import cache, invalidate_cache
from utils.bill_number_helper import get_next_bill_number

billing_bp = Blueprint('billing', __name__)


@billing_bp.route('/gst', methods=['POST'])
@authenticate
@require_permission('gst_billing')
def create_gst_bill():
    """
    Create GST-enabled bill with client_id validation
    MANDATORY: All items must belong to same client_id
    OPTIMIZED: Uses batch query for product validation
    """
    try:
        data = request.get_json()
        client_id = g.user['client_id']

        # Validate required fields
        required_fields = ['customer_name', 'items', 'subtotal', 'gst_percentage', 'payment_type']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400

        # Validate items
        is_valid, error_msg = validate_items(data['items'])
        if not is_valid:
            return jsonify({'error': error_msg}), 400

        # OPTIMIZED: Batch fetch all products in single query (fixes N+1)
        product_ids = [item['product_id'] for item in data['items']]
        products = StockEntry.query.filter(
            StockEntry.product_id.in_(product_ids),
            StockEntry.client_id == client_id
        ).all()
        product_map = {p.product_id: p for p in products}

        # Verify all products and check stock
        for item in data['items']:
            product = product_map.get(item['product_id'])

            if not product:
                return jsonify({'error': f"Product {item['product_name']} not found for your account"}), 404

            # Check stock availability
            if product.quantity < item['quantity']:
                return jsonify({'error': f"Insufficient stock for {item['product_name']}. Available: {product.quantity}"}), 400

        # Calculate GST amount and final amount
        gst_amount = calculate_gst_amount(data['subtotal'], data['gst_percentage'])
        final_amount = calculate_final_amount(data['subtotal'], gst_amount)

        # Phase 0: Get next bill number atomically (prevents race conditions)
        bill_number = get_next_bill_number(client_id, 'gst')

        # Create GST bill (apply title case to customer name)
        new_bill = GSTBilling(
            bill_id=str(uuid.uuid4()),
            client_id=client_id,
            bill_number=bill_number,
            customer_name=title_case(data['customer_name']),
            customer_phone=data.get('customer_phone'),
            items=data['items'],
            subtotal=data['subtotal'],
            gst_percentage=data['gst_percentage'],
            gst_amount=gst_amount,
            final_amount=final_amount,
            payment_type=data['payment_type'],
            status='final',
            created_by=g.user['user_id'],
            created_at=datetime.utcnow()
        )

        db.session.add(new_bill)
        db.session.flush()  # Get bill_id before stock reduction

        # Phase 0: Stock reduction in Python (replaces database trigger)
        # Use row-level locking to prevent overselling
        for item in data['items']:
            product = StockEntry.query.filter_by(
                product_id=item['product_id'],
                client_id=client_id
            ).with_for_update().first()

            if not product:
                raise ValueError(f"Product {item['product_name']} not found")

            if product.quantity < item['quantity']:
                raise ValueError(f"Insufficient stock for {item['product_name']}. Available: {product.quantity}")

            # Reduce stock
            product.quantity -= item['quantity']
            product.updated_at = datetime.utcnow()

        # Commit both bill creation and stock reduction atomically
        db.session.commit()

        # Invalidate cache for this client's billing data
        invalidate_cache(f"billing:{client_id}")

        # Log action
        log_action('CREATE', 'gst_billing', new_bill.bill_id, None, new_bill.to_dict())

        return jsonify({
            'success': True,
            'bill_id': new_bill.bill_id,
            'bill_number': bill_number,
            'final_amount': str(final_amount),
            'message': 'GST bill created successfully'
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to create GST bill', 'message': str(e)}), 500


@billing_bp.route('/non-gst', methods=['POST'])
@authenticate
@require_permission('non_gst_billing')
def create_non_gst_bill():
    """
    Create Non-GST bill with client_id validation
    MANDATORY: All items must belong to same client_id
    OPTIMIZED: Uses batch query for product validation
    """
    try:
        data = request.get_json()
        client_id = g.user['client_id']

        # Validate required fields
        required_fields = ['customer_name', 'items', 'total_amount', 'payment_type']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400

        # Validate items
        is_valid, error_msg = validate_items(data['items'])
        if not is_valid:
            return jsonify({'error': error_msg}), 400

        # OPTIMIZED: Batch fetch all products in single query (fixes N+1)
        product_ids = [item['product_id'] for item in data['items']]
        products = StockEntry.query.filter(
            StockEntry.product_id.in_(product_ids),
            StockEntry.client_id == client_id
        ).all()
        product_map = {p.product_id: p for p in products}

        # Verify all products and check stock
        for item in data['items']:
            product = product_map.get(item['product_id'])

            if not product:
                return jsonify({'error': f"Product {item['product_name']} not found for your account"}), 404

            # Check stock availability
            if product.quantity < item['quantity']:
                return jsonify({'error': f"Insufficient stock for {item['product_name']}. Available: {product.quantity}"}), 400

        # Phase 0: Get next bill number atomically (prevents race conditions)
        bill_number = get_next_bill_number(client_id, 'non_gst')

        # Create Non-GST bill (apply title case to customer name)
        new_bill = NonGSTBilling(
            bill_id=str(uuid.uuid4()),
            client_id=client_id,
            bill_number=bill_number,
            customer_name=title_case(data['customer_name']),
            customer_phone=data.get('customer_phone'),
            items=data['items'],
            total_amount=data['total_amount'],
            payment_type=data['payment_type'],
            status='final',
            created_by=g.user['user_id'],
            created_at=datetime.utcnow()
        )

        db.session.add(new_bill)
        db.session.flush()  # Get bill_id before stock reduction

        # Phase 0: Stock reduction in Python (replaces database trigger)
        # Use row-level locking to prevent overselling
        for item in data['items']:
            product = StockEntry.query.filter_by(
                product_id=item['product_id'],
                client_id=client_id
            ).with_for_update().first()

            if not product:
                raise ValueError(f"Product {item['product_name']} not found")

            if product.quantity < item['quantity']:
                raise ValueError(f"Insufficient stock for {item['product_name']}. Available: {product.quantity}")

            # Reduce stock
            product.quantity -= item['quantity']
            product.updated_at = datetime.utcnow()

        # Commit both bill creation and stock reduction atomically
        db.session.commit()

        # Invalidate cache for this client's billing data
        invalidate_cache(f"billing:{client_id}")

        # Log action
        log_action('CREATE', 'non_gst_billing', new_bill.bill_id, None, new_bill.to_dict())

        return jsonify({
            'success': True,
            'bill_id': new_bill.bill_id,
            'bill_number': bill_number,
            'total_amount': str(data['total_amount']),
            'message': 'Non-GST bill created successfully'
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to create Non-GST bill', 'message': str(e)}), 500


@billing_bp.route('/next-number', methods=['GET'])
@authenticate
def get_next_bill_number():
    """
    Get the next bill number - OPTIMIZED lightweight endpoint
    Replaces fetching full bill list just to get the last bill number
    """
    try:
        client_id = g.user['client_id']

        # Get max bill number from both tables using SQL MAX (very fast)
        from sqlalchemy import func

        gst_max = db.session.query(func.max(GSTBilling.bill_number)).filter(
            GSTBilling.client_id == client_id
        ).scalar() or 0

        non_gst_max = db.session.query(func.max(NonGSTBilling.bill_number)).filter(
            NonGSTBilling.client_id == client_id
        ).scalar() or 0

        next_number = max(gst_max, non_gst_max) + 1

        return jsonify({
            'success': True,
            'next_bill_number': next_number
        }), 200

    except Exception as e:
        return jsonify({'error': 'Failed to get next bill number', 'message': str(e)}), 500


@billing_bp.route('/list', methods=['GET'])
@authenticate
@require_any_permission('view_all_bills', 'view_own_bills')
def get_bills():
    """
    List all bills (GST + Non-GST) filtered by client_id and user permissions
    OPTIMIZED: Uses SQL UNION and LIMIT/OFFSET for pagination + caching
    PERFORMANCE FIX: Uses deferred loading and optimized queries

    Permission-based filtering:
    - view_all_bills: User can see all bills from all staff in their client
    - view_own_bills: User can only see bills they created (filtered by created_by)
    """
    try:
        client_id = g.user['client_id']
        user_id = g.user['user_id']

        # Check user permissions for filtering
        user_permissions = g.user.get('permissions', [])
        is_super_admin = g.user.get('is_super_admin', False)

        # Determine if user can view all bills or only their own
        has_view_all = is_super_admin or 'view_all_bills' in user_permissions

        # Get query parameters
        bill_type = request.args.get('type', 'all')  # gst, non-gst, all
        date_from = request.args.get('date_from')
        date_to = request.args.get('date_to')
        page = int(request.args.get('page', 1))
        limit = min(int(request.args.get('limit', 50)), 100)  # Cap at 100 for performance

        # Generate cache key - include user context to prevent cache leaks
        user_context = 'all' if has_view_all else user_id
        cache_key = f"billing:list:{client_id}:{user_context}:{bill_type}:{date_from}:{date_to}:{page}:{limit}"

        # Try cache first
        cached_result = cache.get(cache_key)
        if cached_result is not None:
            return jsonify(cached_result), 200

        # Calculate offset
        offset = (page - 1) * limit

        # OPTIMIZATION: Use raw SQL COUNT for faster total_records
        from sqlalchemy import func, text

        # For single type queries, use direct SQL pagination
        if bill_type == 'gst':
            query = GSTBilling.query.filter_by(client_id=client_id)

            # Apply user-level filtering for view_own_bills permission
            if not has_view_all:
                query = query.filter(GSTBilling.created_by == user_id)

            if date_from:
                query = query.filter(GSTBilling.created_at >= date_from)
            if date_to:
                query = query.filter(GSTBilling.created_at <= date_to)

            total_records = query.count()
            # OPTIMIZATION: Use joinedload for creator relationship to prevent N+1
            bills = query.order_by(GSTBilling.created_at.desc()).offset(offset).limit(limit).all()
            bills_data = [bill.to_dict() for bill in bills]

        elif bill_type == 'non-gst':
            query = NonGSTBilling.query.filter_by(client_id=client_id)

            # Apply user-level filtering for view_own_bills permission
            if not has_view_all:
                query = query.filter(NonGSTBilling.created_by == user_id)

            if date_from:
                query = query.filter(NonGSTBilling.created_at >= date_from)
            if date_to:
                query = query.filter(NonGSTBilling.created_at <= date_to)

            total_records = query.count()
            bills = query.order_by(NonGSTBilling.created_at.desc()).offset(offset).limit(limit).all()
            bills_data = [bill.to_dict() for bill in bills]

        else:
            # OPTIMIZED: For 'all' type, use efficient SQL COUNT queries
            gst_count_query = db.session.query(func.count(GSTBilling.bill_id)).filter(
                GSTBilling.client_id == client_id
            )
            non_gst_count_query = db.session.query(func.count(NonGSTBilling.bill_id)).filter(
                NonGSTBilling.client_id == client_id
            )

            # Apply user-level filtering for view_own_bills permission
            if not has_view_all:
                gst_count_query = gst_count_query.filter(GSTBilling.created_by == user_id)
                non_gst_count_query = non_gst_count_query.filter(NonGSTBilling.created_by == user_id)

            if date_from:
                gst_count_query = gst_count_query.filter(GSTBilling.created_at >= date_from)
                non_gst_count_query = non_gst_count_query.filter(NonGSTBilling.created_at >= date_from)
            if date_to:
                gst_count_query = gst_count_query.filter(GSTBilling.created_at <= date_to)
                non_gst_count_query = non_gst_count_query.filter(NonGSTBilling.created_at <= date_to)

            total_records = (gst_count_query.scalar() or 0) + (non_gst_count_query.scalar() or 0)

            # OPTIMIZATION: Only fetch what we need for pagination
            # Split the limit between GST and Non-GST based on offset
            gst_query = GSTBilling.query.filter_by(client_id=client_id)
            non_gst_query = NonGSTBilling.query.filter_by(client_id=client_id)

            # Apply user-level filtering for view_own_bills permission
            if not has_view_all:
                gst_query = gst_query.filter(GSTBilling.created_by == user_id)
                non_gst_query = non_gst_query.filter(NonGSTBilling.created_by == user_id)

            if date_from:
                gst_query = gst_query.filter(GSTBilling.created_at >= date_from)
                non_gst_query = non_gst_query.filter(NonGSTBilling.created_at >= date_from)
            if date_to:
                gst_query = gst_query.filter(GSTBilling.created_at <= date_to)
                non_gst_query = non_gst_query.filter(NonGSTBilling.created_at <= date_to)

            # OPTIMIZATION: Fetch only limit + offset records from each table
            # This is much faster than fetching all records
            fetch_limit = limit + offset
            gst_bills = gst_query.order_by(GSTBilling.created_at.desc()).limit(fetch_limit).all()
            non_gst_bills = non_gst_query.order_by(NonGSTBilling.created_at.desc()).limit(fetch_limit).all()

            # Merge and sort using tuple unpacking (faster than list comprehension)
            all_bills = []
            all_bills.extend((bill, bill.created_at) for bill in gst_bills)
            all_bills.extend((bill, bill.created_at) for bill in non_gst_bills)
            all_bills.sort(key=lambda x: x[1], reverse=True)

            # Apply pagination
            paginated = all_bills[offset:offset + limit]
            bills_data = [bill.to_dict() for bill, _ in paginated]

        result = {
            'success': True,
            'bills': bills_data,
            'pagination': {
                'page': page,
                'limit': limit,
                'total_records': total_records,
                'total_pages': (total_records + limit - 1) // limit
            }
        }

        # Cache for 2 minutes
        cache.set(cache_key, result, ttl_seconds=120)

        return jsonify(result), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch bills', 'message': str(e)}), 500


@billing_bp.route('/<bill_id>', methods=['GET'])
@authenticate
def get_bill_details(bill_id):
    """Get bill details by ID with client_id validation"""
    try:
        client_id = g.user['client_id']

        # Try GST billing first
        gst_bill = GSTBilling.query.filter_by(bill_id=bill_id, client_id=client_id).first()
        if gst_bill:
            return jsonify({
                'success': True,
                'bill': gst_bill.to_dict()
            }), 200

        # Try Non-GST billing
        non_gst_bill = NonGSTBilling.query.filter_by(bill_id=bill_id, client_id=client_id).first()
        if non_gst_bill:
            return jsonify({
                'success': True,
                'bill': non_gst_bill.to_dict()
            }), 200

        return jsonify({'error': 'Bill not found'}), 404

    except Exception as e:
        return jsonify({'error': 'Failed to fetch bill details', 'message': str(e)}), 500


@billing_bp.route('/create', methods=['POST'])
@authenticate
@require_any_permission('gst_billing', 'non_gst_billing')
def create_unified_bill():
    """
    Smart unified billing endpoint with permission-based bill type determination

    Permission-based routing:
    - gst_billing only: Always creates GST bill (even if items have 0% GST)
    - non_gst_billing only: Always creates Non-GST bill (forces all GST to 0)
    - Both permissions: Smart detection based on item GST percentages

    Request format:
    {
        "customer_name": "John Doe" (optional - defaults to 'Walk-in Customer'),
        "customer_phone": "9876543210" (optional),
        "customer_gstin": "22AAAAA0000A1Z5" (optional),
        "items": [
            {
                "product_id": "uuid",
                "product_name": "Laptop",
                "quantity": 2,
                "rate": 45000,
                "item_code": "LP-001",
                "hsn_code": "8471",
                "unit": "pcs",
                "gst_percentage": 18,
                "gst_amount": 16200,
                "amount": 106200
            }
        ],
        "payment_type": JSON string of payment splits array,
        "amount_received": 100000 (optional),
        "discount_percentage": 5 (optional)
    }
    """
    try:
        data = request.get_json()
        client_id = g.user['client_id']

        # Parse custom bill date if provided, otherwise use current datetime
        bill_date = datetime.utcnow()
        if data.get('bill_date'):
            try:
                bill_date = date_parser.parse(data['bill_date'])
                # Prevent future dates
                if bill_date.date() > datetime.utcnow().date():
                    return jsonify({'error': 'Bill date cannot be in the future'}), 400
            except (ValueError, TypeError):
                # If parsing fails, return error to user
                return jsonify({'error': 'Invalid bill date format'}), 400

        # Check user permissions for billing
        user_permissions = g.user.get('permissions', [])
        is_super_admin = g.user.get('is_super_admin', False)

        has_gst_permission = is_super_admin or 'gst_billing' in user_permissions
        has_non_gst_permission = is_super_admin or 'non_gst_billing' in user_permissions

        # Determine billing mode based on permissions
        gst_only = has_gst_permission and not has_non_gst_permission
        non_gst_only = not has_gst_permission and has_non_gst_permission
        # has_both_permissions = has_gst_permission and has_non_gst_permission (smart detection)

        # Validate required fields - customer_name is now optional
        required_fields = ['items', 'payment_type']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400

        if not data['items'] or len(data['items']) == 0:
            return jsonify({'error': 'At least one item is required'}), 400

        # OPTIMIZED: Batch fetch all existing products in single query (fixes N+1)
        existing_product_ids = [
            item['product_id'] for item in data['items']
            if not item['product_id'].startswith('temp-') and not item['product_id'].startswith('nosave-')
        ]

        if existing_product_ids:
            existing_products = StockEntry.query.filter(
                StockEntry.product_id.in_(existing_product_ids),
                StockEntry.client_id == client_id
            ).all()
            # FIX: Convert UUID to string for consistent key lookup (frontend sends string, DB returns UUID)
            product_map = {str(p.product_id): p for p in existing_products}
        else:
            product_map = {}

        # Verify all products and calculate totals
        subtotal = 0
        total_gst_amount = 0
        has_gst_items = False
        processed_items = []

        new_products_to_create = []

        for item in data['items']:
            # Check if this is a new product (temp ID from frontend) or quick sale (nosave-)
            product_id = item['product_id']
            is_new_product = product_id.startswith('temp-')
            is_quick_sale = product_id.startswith('nosave-')  # Quick sale - don't save to stock

            if not is_new_product and not is_quick_sale:
                # OPTIMIZED: Use pre-fetched product from batch query
                product = product_map.get(product_id)

                if not product:
                    return jsonify({
                        'error': f"Product '{item.get('product_name', 'Unknown')}' not found. Please refresh the page and try again."
                    }), 404

                # Check stock availability
                if product.quantity < item['quantity']:
                    return jsonify({
                        'error': f"Insufficient stock for {product.product_name}. Available: {product.quantity}, Requested: {item['quantity']}"
                    }), 400

                # Calculate item totals
                item_qty = item['quantity']
                item_rate = float(item.get('rate', product.rate))
                item_gst_pct = float(item.get('gst_percentage', product.gst_percentage or 0))
            elif is_quick_sale:
                # Quick sale - use data from frontend, do NOT create in stock
                item_qty = item['quantity']
                item_rate = float(item.get('rate', 0))
                item_gst_pct = float(item.get('gst_percentage', 0))
                # Keep the nosave- product_id as-is (no stock entry created)
            else:
                # New product - use data from frontend and create in stock
                item_qty = item['quantity']
                item_rate = float(item.get('rate', 0))
                item_gst_pct = float(item.get('gst_percentage', 0))

                # Generate real UUID for new product
                new_product_id = str(uuid.uuid4())

                # Prepare new product data
                new_product_data = {
                    'product_id': new_product_id,
                    'client_id': client_id,
                    'product_name': item.get('product_name', 'Unnamed Product'),
                    'item_code': item.get('item_code', ''),
                    'rate': item_rate,
                    'quantity': item_qty + 10,  # Start with sold quantity + 10 buffer stock
                    'unit': item.get('unit', 'pcs'),
                    'gst_percentage': item_gst_pct,
                    'hsn_code': item.get('hsn_code', ''),
                    'created_at': datetime.utcnow(),
                    'updated_at': datetime.utcnow()
                }
                new_products_to_create.append((new_product_data, new_product_id))

                # Update product_id to use real UUID in processed items
                product_id = new_product_id

            # For non-GST only users, force GST to 0
            if non_gst_only:
                item_gst_pct = 0

            # Calculate amounts
            item_subtotal = item_qty * item_rate
            item_gst_amt = (item_subtotal * item_gst_pct) / 100
            item_total = item_subtotal + item_gst_amt

            if item_gst_pct > 0:
                has_gst_items = True

            # Get MRP from item or product
            item_mrp = float(item.get('mrp', 0)) if item.get('mrp') else None
            if not item_mrp and not is_new_product and not is_quick_sale and hasattr(product, 'mrp') and product.mrp:
                item_mrp = float(product.mrp)

            # Determine if we have a product object (only for existing stock items)
            has_product = not is_new_product and not is_quick_sale

            # Build processed item - Convert all values to JSON-serializable types
            processed_items.append({
                'product_id': str(product_id) if has_product else product_id,
                'product_name': item.get('product_name', product.product_name if has_product else 'Unknown'),
                'item_code': item.get('item_code', product.item_code if has_product else ''),
                'hsn_code': item.get('hsn_code', product.hsn_code if has_product else ''),
                'unit': item.get('unit', product.unit if has_product else 'pcs'),
                'quantity': item_qty,
                'rate': item_rate,
                'mrp': item_mrp if item_mrp else item_rate,  # Use rate as MRP if not available
                'gst_percentage': item_gst_pct,
                'gst_amount': round(item_gst_amt, 2),
                'amount': round(item_total, 2)
            })

            subtotal += item_subtotal
            total_gst_amount += item_gst_amt

        final_amount = subtotal + total_gst_amount

        # Calculate effective GST percentage (weighted average based on subtotal)
        effective_gst_percentage = (total_gst_amount / subtotal * 100) if subtotal > 0 else 0

        # Create new products in stock_entry table BEFORE creating bill
        for new_product_data, new_product_id in new_products_to_create:
            new_stock_entry = StockEntry(
                product_id=new_product_data['product_id'],
                client_id=new_product_data['client_id'],
                product_name=new_product_data['product_name'],
                item_code=new_product_data['item_code'],
                rate=new_product_data['rate'],
                quantity=new_product_data['quantity'],
                unit=new_product_data['unit'],
                gst_percentage=new_product_data['gst_percentage'],
                hsn_code=new_product_data['hsn_code'],
                created_at=new_product_data['created_at'],
                updated_at=new_product_data['updated_at']
            )
            db.session.add(new_stock_entry)

        # Flush to ensure products are created before bill
        if new_products_to_create:
            db.session.flush()

        # Route to appropriate billing table based on permission and GST presence
        # Permission-based routing:
        # - gst_only: Always GST bill (even if no GST items)
        # - non_gst_only: Always Non-GST bill (GST already forced to 0 above)
        # - both permissions: Smart detection based on has_gst_items
        should_create_gst_bill = gst_only or (not non_gst_only and has_gst_items)

        if should_create_gst_bill:
            # Create GST Bill
            last_bill = GSTBilling.query.filter_by(client_id=client_id).order_by(GSTBilling.bill_number.desc()).first()
            bill_number = (last_bill.bill_number + 1) if last_bill else 1

            # Calculate discount amount or negotiable amount BEFORE creating bill object
            discount_amount = 0
            negotiable_amount = data.get('negotiable_amount')

            if negotiable_amount and negotiable_amount > 0:
                # Negotiable amount is the discount to subtract (not the final price)
                total_before_negotiation = round(subtotal + total_gst_amount, 2)
                discount_amount = round(negotiable_amount, 2)
                final_amount = round(total_before_negotiation - discount_amount, 2)
            elif data.get('discount_percentage'):
                # Use discount percentage
                total_before_discount = round(subtotal + total_gst_amount, 2)
                discount_amount = round((total_before_discount * data.get('discount_percentage', 0)) / 100, 2)
                # Subtract discount from final_amount
                final_amount = round(final_amount - discount_amount, 2)

            new_bill = GSTBilling(
                bill_id=str(uuid.uuid4()),
                client_id=client_id,
                bill_number=bill_number,
                customer_name=title_case(data.get('customer_name', 'Walk-in Customer')),
                customer_phone=data.get('customer_phone'),
                customer_gstin=data.get('customer_gstin'),
                items=processed_items,
                subtotal=round(subtotal, 2),
                gst_percentage=round(effective_gst_percentage, 2),  # Effective/average GST rate
                gst_amount=round(total_gst_amount, 2),
                final_amount=round(final_amount, 2),  # Now includes discount/negotiable amount
                payment_type=data['payment_type'],
                amount_received=data.get('amount_received'),
                discount_percentage=data.get('discount_percentage') if not negotiable_amount else None,
                discount_amount=round(discount_amount, 2) if discount_amount > 0 else None,
                negotiable_amount=round(negotiable_amount, 2) if negotiable_amount and negotiable_amount > 0 else None,
                status='final',
                created_by=g.user['user_id'],
                created_at=bill_date
            )

            db.session.add(new_bill)
            # Log action BEFORE commit so it's part of the same transaction (performance optimization)
            log_action('CREATE', 'gst_billing', new_bill.bill_id, None, new_bill.to_dict())
            db.session.commit()

            # Invalidate caches after bill creation - including analytics for real-time dashboard updates
            invalidate_cache(f"billing:{client_id}")
            invalidate_cache(f"stock:{client_id}")
            invalidate_cache(f"analytics:{client_id}")

            # Calculate CGST and SGST (half of total GST each)
            cgst = round(total_gst_amount / 2, 2)
            sgst = round(total_gst_amount / 2, 2)

            # Return complete bill data for direct printing (no need for additional fetch)
            return jsonify({
                'success': True,
                'bill_id': new_bill.bill_id,
                'bill_number': bill_number,
                'bill_type': 'GST',
                'subtotal': round(subtotal, 2),
                'gst_amount': round(total_gst_amount, 2),
                'final_amount': round(final_amount, 2),
                'message': 'GST bill created successfully',
                # Complete bill data for printing
                'bill': {
                    'bill_number': bill_number,
                    'customer_name': data.get('customer_name', 'Walk-in Customer'),
                    'customer_phone': data.get('customer_phone', ''),
                    'customer_gstin': data.get('customer_gstin', ''),
                    'items': processed_items,
                    'subtotal': round(subtotal, 2),
                    'discount_percentage': data.get('discount_percentage', 0) if not negotiable_amount else 0,
                    'discount_amount': discount_amount,
                    'negotiable_amount': round(negotiable_amount, 2) if negotiable_amount and negotiable_amount > 0 else None,
                    'gst_amount': round(total_gst_amount, 2),
                    'final_amount': round(final_amount, 2),
                    'total_amount': round(subtotal, 2),
                    'payment_type': data['payment_type'],
                    'created_at': new_bill.created_at.isoformat() if new_bill.created_at else datetime.utcnow().isoformat(),
                    'type': 'gst',
                    'cgst': cgst,
                    'sgst': sgst,
                    'igst': 0,
                    'user_name': g.user.get('full_name') or g.user.get('email', 'Admin').split('@')[0]  # Use full name if available
                }
            }), 201

        else:
            # Create Non-GST Bill
            last_bill = NonGSTBilling.query.filter_by(client_id=client_id).order_by(NonGSTBilling.bill_number.desc()).first()
            bill_number = (last_bill.bill_number + 1) if last_bill else 1

            # Calculate discount amount or negotiable amount for non-GST bills
            discount_amount = 0
            negotiable_amount = data.get('negotiable_amount')
            total_amount = subtotal

            if negotiable_amount and negotiable_amount > 0:
                # Negotiable amount is the discount to subtract (not the final price)
                discount_amount = round(negotiable_amount, 2)
                total_amount = round(subtotal - discount_amount, 2)
            elif data.get('discount_percentage'):
                # Use discount percentage
                discount_amount = round((subtotal * data.get('discount_percentage', 0)) / 100, 2)
                total_amount = round(subtotal - discount_amount, 2)

            new_bill = NonGSTBilling(
                bill_id=str(uuid.uuid4()),
                client_id=client_id,
                bill_number=bill_number,
                customer_name=title_case(data.get('customer_name', 'Walk-in Customer')),
                customer_phone=data.get('customer_phone'),
                customer_gstin=data.get('customer_gstin'),
                items=processed_items,
                total_amount=total_amount,  # Final amount after discount/negotiation
                payment_type=data['payment_type'],
                amount_received=data.get('amount_received'),
                discount_percentage=data.get('discount_percentage') if not negotiable_amount else None,
                discount_amount=round(discount_amount, 2) if discount_amount > 0 else None,
                negotiable_amount=round(negotiable_amount, 2) if negotiable_amount and negotiable_amount > 0 else None,
                status='final',
                created_by=g.user['user_id'],
                created_at=bill_date
            )

            db.session.add(new_bill)
            # Log action BEFORE commit so it's part of the same transaction (performance optimization)
            log_action('CREATE', 'non_gst_billing', new_bill.bill_id, None, new_bill.to_dict())
            db.session.commit()

            # Invalidate caches after bill creation - including analytics for real-time dashboard updates
            invalidate_cache(f"billing:{client_id}")
            invalidate_cache(f"stock:{client_id}")
            invalidate_cache(f"analytics:{client_id}")

            # Return complete bill data for direct printing (no need for additional fetch)
            return jsonify({
                'success': True,
                'bill_id': new_bill.bill_id,
                'bill_number': bill_number,
                'bill_type': 'Non-GST',
                'total_amount': round(subtotal, 2),
                'message': 'Non-GST bill created successfully',
                # Complete bill data for printing
                'bill': {
                    'bill_number': bill_number,
                    'customer_name': data.get('customer_name', 'Walk-in Customer'),
                    'customer_phone': data.get('customer_phone', ''),
                    'customer_gstin': data.get('customer_gstin', ''),
                    'items': processed_items,
                    'subtotal': round(subtotal, 2),
                    'discount_percentage': data.get('discount_percentage', 0) if not negotiable_amount else 0,
                    'discount_amount': discount_amount,
                    'negotiable_amount': round(negotiable_amount, 2) if negotiable_amount and negotiable_amount > 0 else None,
                    'gst_amount': 0,
                    'final_amount': total_amount,
                    'total_amount': round(subtotal, 2),
                    'payment_type': data['payment_type'],
                    'created_at': new_bill.created_at.isoformat() if new_bill.created_at else datetime.utcnow().isoformat(),
                    'type': 'non-gst',
                    'cgst': 0,
                    'sgst': 0,
                    'igst': 0,
                    'user_name': g.user.get('full_name') or g.user.get('email', 'Admin').split('@')[0]  # Use full name if available
                }
            }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to create bill', 'message': str(e)}), 500


@billing_bp.route('/<bill_id>', methods=['PUT'])
@authenticate
@require_permission('edit_bill_details')
def update_bill(bill_id):
    """
    Update an existing bill (GST or Non-GST)
    Handles stock adjustments when quantities change
    """
    try:
        data = request.get_json()
        client_id = g.user['client_id']
        user_id = g.user['user_id']

        # Find the bill in either GST or Non-GST table
        gst_bill = GSTBilling.query.filter_by(bill_id=bill_id, client_id=client_id).first()
        non_gst_bill = NonGSTBilling.query.filter_by(bill_id=bill_id, client_id=client_id).first()

        if not gst_bill and not non_gst_bill:
            return jsonify({'error': 'Bill not found'}), 404

        # Determine bill type
        is_gst = gst_bill is not None
        existing_bill = gst_bill if is_gst else non_gst_bill

        # Cannot edit cancelled bills
        if existing_bill.status == 'cancelled':
            return jsonify({'error': 'Cannot edit a cancelled bill'}), 400

        old_bill_data = existing_bill.to_dict()

        # Get old items for stock reversal
        old_items = existing_bill.items
        new_items = data.get('items', [])

        # Validate new items
        is_valid, error_msg = validate_items(new_items)
        if not is_valid:
            return jsonify({'error': error_msg}), 400

        # OPTIMIZED: Batch fetch all products in single query (fixes N+1)
        all_product_ids = set()
        for old_item in old_items:
            all_product_ids.add(old_item['product_id'])
        for new_item in new_items:
            all_product_ids.add(new_item['product_id'])

        products = StockEntry.query.filter(
            StockEntry.product_id.in_(list(all_product_ids)),
            StockEntry.client_id == client_id
        ).all()
        product_map = {p.product_id: p for p in products}

        # Step 1: Reverse stock for old items
        for old_item in old_items:
            product = product_map.get(old_item['product_id'])
            if product:
                # Add back the quantity from old bill
                product.quantity += old_item['quantity']

        # Step 2: Deduct stock for new items
        for new_item in new_items:
            product = product_map.get(new_item['product_id'])

            if not product:
                db.session.rollback()
                return jsonify({'error': f"Product {new_item['product_name']} not found"}), 404

            # Check if sufficient stock available
            if product.quantity < new_item['quantity']:
                db.session.rollback()
                return jsonify({'error': f"Insufficient stock for {new_item['product_name']}. Available: {product.quantity}"}), 400

            # Deduct the new quantity
            product.quantity -= new_item['quantity']

        # Step 3: Update bill details (apply title case to customer name if provided)
        existing_bill.customer_name = title_case(data.get('customer_name')) if data.get('customer_name') else existing_bill.customer_name
        existing_bill.customer_phone = data.get('customer_phone', existing_bill.customer_phone)
        existing_bill.customer_gstin = data.get('customer_gstin', existing_bill.customer_gstin)
        existing_bill.items = new_items
        existing_bill.payment_type = data.get('payment_type', existing_bill.payment_type)
        existing_bill.amount_received = data.get('amount_received', existing_bill.amount_received)
        existing_bill.discount_percentage = data.get('discount_percentage', existing_bill.discount_percentage)
        existing_bill.updated_at = datetime.utcnow()

        if is_gst:
            # Update GST-specific fields
            subtotal = data.get('subtotal', float(existing_bill.subtotal))
            gst_percentage = data.get('gst_percentage', float(existing_bill.gst_percentage))
            gst_amount = calculate_gst_amount(subtotal, gst_percentage)
            final_amount = calculate_final_amount(subtotal, gst_amount)

            existing_bill.subtotal = subtotal
            existing_bill.gst_percentage = gst_percentage
            existing_bill.gst_amount = gst_amount
            existing_bill.final_amount = final_amount
        else:
            # Update Non-GST total
            existing_bill.total_amount = data.get('total_amount', existing_bill.total_amount)

        db.session.commit()

        # Invalidate caches after bill update - for real-time data consistency
        invalidate_cache(f"billing:{client_id}")
        invalidate_cache(f"stock:{client_id}")
        invalidate_cache(f"analytics:{client_id}")

        # Log the update action
        log_action('UPDATE',
                  'gst_billing' if is_gst else 'non_gst_billing',
                  bill_id,
                  old_bill_data,
                  existing_bill.to_dict())

        return jsonify({
            'success': True,
            'message': 'Bill updated successfully',
            'bill': existing_bill.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to update bill', 'message': str(e)}), 500


@billing_bp.route('/exchange/<bill_id>', methods=['POST'])
@authenticate
def exchange_bill(bill_id):
    """
    Exchange bill - updates the original bill in place
    - Returns selected items back to stock
    - Deducts new items from stock
    - Updates original bill with new items (keeps same bill number)
    """
    try:
        data = request.get_json()
        client_id = g.user['client_id']

        # Find the bill
        gst_bill = GSTBilling.query.filter_by(bill_id=bill_id, client_id=client_id).first()
        non_gst_bill = NonGSTBilling.query.filter_by(bill_id=bill_id, client_id=client_id).first()

        if not gst_bill and not non_gst_bill:
            return jsonify({'error': 'Bill not found'}), 404

        is_gst = gst_bill is not None
        bill = gst_bill if is_gst else non_gst_bill

        # Cannot exchange cancelled bills
        if bill.status == 'cancelled':
            return jsonify({'error': 'Cannot exchange a cancelled bill'}), 400

        returned_items = data.get('returned_items', [])
        new_items = data.get('new_items', [])

        if not returned_items:
            return jsonify({'error': 'No items selected for return'}), 400

        if not new_items:
            return jsonify({'error': 'No new items provided for exchange'}), 400

        # Validate returned items exist in original bill
        for returned_item in returned_items:
            found = False
            for orig_item in bill.items:
                if orig_item['product_id'] == returned_item['product_id']:
                    if returned_item['quantity'] > orig_item['quantity']:
                        return jsonify({'error': f"Cannot return more than purchased for {orig_item['product_name']}"}), 400
                    found = True
                    break
            if not found:
                return jsonify({'error': f"Product {returned_item['product_name']} not found in original bill"}), 404

        old_bill_data = bill.to_dict()

        # OPTIMIZED: Only fetch products that are in the returned or new items
        # Collect all product IDs and names from both lists
        product_ids_needed = set()
        product_names_needed = set()
        for item in returned_items + new_items:
            pid = item.get('product_id', '')
            if pid and not pid.startswith('nosave-'):
                product_ids_needed.add(pid)
            pname = item.get('product_name', '')
            if pname:
                product_names_needed.add(pname.lower())

        # Batch fetch only needed products (instead of ALL client products)
        products_by_id = {}
        products_by_name = {}
        if product_ids_needed:
            fetched = StockEntry.query.filter(
                StockEntry.client_id == client_id,
                StockEntry.product_id.in_(list(product_ids_needed))
            ).all()
            products_by_id = {str(p.product_id): p for p in fetched}
            products_by_name = {p.product_name.lower(): p for p in fetched}

        # If some products not found by ID, try by name
        missing_names = product_names_needed - set(products_by_name.keys())
        if missing_names:
            name_fetched = StockEntry.query.filter(
                StockEntry.client_id == client_id,
                StockEntry.product_name.in_([n.title() for n in missing_names])
            ).all()
            for p in name_fetched:
                products_by_name[p.product_name.lower()] = p
                products_by_id[str(p.product_id)] = p

        product_map_by_id = products_by_id
        product_map_by_name = products_by_name

        # Helper function to find product by ID or name
        def find_product(item):
            product_id = item.get('product_id', '')
            product_name = item.get('product_name', '')

            # Skip nosave items
            if product_id.startswith('nosave-'):
                return None, True  # None product, but skip (not error)

            # Try by ID first
            if product_id and product_id in product_map_by_id:
                return product_map_by_id[product_id], False

            # Fallback: try by name (case-insensitive)
            if product_name and product_name.lower() in product_map_by_name:
                return product_map_by_name[product_name.lower()], False

            return None, False  # Not found, not skip

        # Step 1: Add returned items back to stock
        for returned_item in returned_items:
            product, should_skip = find_product(returned_item)
            if should_skip:
                continue
            if product:
                product.quantity += returned_item['quantity']

        # Step 2: Deduct new items from stock
        for new_item in new_items:
            product, should_skip = find_product(new_item)
            if should_skip:
                continue
            if not product:
                db.session.rollback()
                return jsonify({'error': f"Product {new_item['product_name']} not found in stock"}), 404
            if product.quantity < new_item['quantity']:
                db.session.rollback()
                return jsonify({'error': f"Insufficient stock for {new_item['product_name']}. Available: {product.quantity}"}), 400
            product.quantity -= new_item['quantity']

        # Step 3: Calculate amounts
        returned_amount = sum(item['amount'] for item in returned_items)
        new_subtotal = sum(item['quantity'] * item['rate'] for item in new_items)
        new_gst_amount = sum(item.get('gst_amount', 0) for item in new_items)
        new_total = new_subtotal + new_gst_amount

        # Step 4: Update the original bill (apply title case to customer name if provided)
        bill.items = new_items
        bill.customer_name = title_case(data.get('customer_name')) if data.get('customer_name') else bill.customer_name
        bill.customer_phone = data.get('customer_phone', bill.customer_phone)
        bill.customer_gstin = data.get('customer_gstin', bill.customer_gstin)
        bill.payment_type = data.get('payment_type', bill.payment_type)
        bill.amount_received = data.get('amount_received', 0)
        bill.discount_percentage = data.get('discount_percentage', 0)
        bill.updated_at = datetime.utcnow()

        if is_gst:
            bill.subtotal = round(new_subtotal, 2)
            bill.gst_amount = round(new_gst_amount, 2)
            bill.gst_percentage = round((new_gst_amount / new_subtotal * 100) if new_subtotal > 0 else 0, 2)
            bill.final_amount = round(new_total, 2)
        else:
            bill.total_amount = round(new_subtotal, 2)

        db.session.commit()

        # Invalidate caches after bill exchange - for real-time data consistency
        invalidate_cache(f"billing:{client_id}")
        invalidate_cache(f"stock:{client_id}")
        invalidate_cache(f"analytics:{client_id}")

        # Log the exchange
        log_action(
            'EXCHANGE',
            'gst_billing' if is_gst else 'non_gst_billing',
            bill_id,
            old_bill_data,
            bill.to_dict()
        )

        return jsonify({
            'success': True,
            'message': 'Bill updated successfully',
            'bill_id': bill_id,
            'bill_number': bill.bill_number,
            'returned_amount': round(returned_amount, 2),
            'new_amount': round(new_total, 2),
            'difference': round(new_total - returned_amount, 2)
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to process exchange', 'message': str(e)}), 500


@billing_bp.route('/<bill_id>/cancel', methods=['POST'])
@authenticate
@require_permission('edit_bill_details')
def cancel_bill(bill_id):
    """
    Cancel a bill and restore stock quantities
    - Sets status to 'cancelled'
    - Restores all item quantities back to stock
    - Logs the cancellation in audit
    """
    try:
        client_id = g.user['client_id']

        # Find the bill in either GST or Non-GST table
        gst_bill = GSTBilling.query.filter_by(bill_id=bill_id, client_id=client_id).first()
        non_gst_bill = NonGSTBilling.query.filter_by(bill_id=bill_id, client_id=client_id).first()

        if not gst_bill and not non_gst_bill:
            return jsonify({'error': 'Bill not found'}), 404

        is_gst = gst_bill is not None
        bill = gst_bill if is_gst else non_gst_bill

        # Check if already cancelled
        if bill.status == 'cancelled':
            return jsonify({'error': 'Bill is already cancelled'}), 400

        old_bill_data = bill.to_dict()

        # OPTIMIZED: Batch fetch all products in single query (fixes N+1)
        product_ids = [
            item.get('product_id', '') for item in bill.items
            if not item.get('product_id', '').startswith('nosave-')
        ]
        if product_ids:
            products = StockEntry.query.filter(
                StockEntry.product_id.in_(product_ids),
                StockEntry.client_id == client_id
            ).all()
            product_map = {p.product_id: p for p in products}
        else:
            product_map = {}

        # Restore stock quantities for all items
        for item in bill.items:
            product_id = item.get('product_id', '')
            # Skip quick sale items (nosave-) as they don't have stock entries
            if product_id.startswith('nosave-'):
                continue

            product = product_map.get(product_id)
            if product:
                product.quantity += item['quantity']

        # Update bill status
        bill.status = 'cancelled'
        bill.updated_at = datetime.utcnow()

        db.session.commit()

        # These operations are non-critical - don't fail the cancellation if they error
        try:
            # Invalidate caches after bill cancellation - for real-time data consistency
            invalidate_cache(f"billing:{client_id}")
            invalidate_cache(f"stock:{client_id}")
            invalidate_cache(f"analytics:{client_id}")

            # Log the cancellation
            log_action(
                'CANCEL',
                'gst_billing' if is_gst else 'non_gst_billing',
                bill_id,
                old_bill_data,
                {'status': 'cancelled', 'cancelled_at': datetime.utcnow().isoformat()}
            )
        except Exception as log_error:
            # Log error but don't fail the request - cancellation already committed
            print(f"Warning: Post-cancellation operations failed: {str(log_error)}")

        return jsonify({
            'success': True,
            'message': 'Bill cancelled successfully',
            'bill_id': bill_id,
            'bill_number': bill.bill_number,
            'stock_restored': True
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to cancel bill', 'message': str(e)}), 500


@billing_bp.route('/print', methods=['POST'])
@authenticate
@require_permission('print_bills')
def print_bill():
    """
    Print bill to thermal printer (silent printing without browser dialog)
    Receives bill data and client info, prints directly to connected thermal printer
    """
    try:
        from utils.thermal_printer import ThermalPrinter

        data = request.get_json()

        # Validate required data
        if 'bill' not in data or 'clientInfo' not in data:
            return jsonify({'error': 'Missing bill or clientInfo data'}), 400

        bill_data = data['bill']
        client_info = data['clientInfo']

        # Get printer name from request or use default
        printer_name = data.get('printerName', None)

        # Initialize thermal printer
        printer = ThermalPrinter(printer_name=printer_name)

        # Check if printer was detected
        if not printer.printer_name:
            # Only list printers when there's an error (not on every print)
            available = printer.list_printers()
            return jsonify({
                'success': False,
                'error': 'No printer detected',
                'message': f'No default printer configured. Available printers: {available or "None found"}',
                'available_printers': available
            }), 500

        # Print the bill
        success = printer.print_bill(bill_data, client_info, show_no_exchange=True)

        if success:
            # Log the print action
            log_action(
                'PRINT_BILL',
                'billing',
                str(bill_data.get('bill_number', 'unknown')),
                None,
                {'bill_number': bill_data.get('bill_number'), 'printed_at': datetime.utcnow().isoformat()}
            )

            return jsonify({
                'success': True,
                'message': 'Bill printed successfully',
                'printer': printer.printer_name
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to print bill',
                'message': f'Print failed for printer: {printer.printer_name}. Check if printer is online and connected.',
                'printer': printer.printer_name
            }), 500

    except Exception as e:
        return jsonify({
            'success': False,
            'error': 'Print failed',
            'message': str(e)
        }), 500


@billing_bp.route('/printers', methods=['GET'])
@authenticate
def list_printers():
    """
    List all available printers on the system
    """
    try:
        from utils.thermal_printer import ThermalPrinter

        printer = ThermalPrinter()
        printers = printer.list_printers()
        default_printer = printer.printer_name

        return jsonify({
            'success': True,
            'printers': printers,
            'default_printer': default_printer
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': 'Failed to list printers',
            'message': str(e)
        }), 500


@billing_bp.route('/print-labels', methods=['POST'])
@authenticate
@require_permission('print_bills')
def print_labels():
    """
    Print barcode labels for items (50mm x 25mm labels)

    Request body:
    {
        "items": [
            {
                "item_code": "LAP-550-001",
                "product_name": "Laptop Dell",
                "rate": 45000,
                "mrp": 50000,
                "quantity": 10  # Print 10 labels (one per item in stock)
            }
        ],
        "printerName": "optional_printer_name"
    }

    Prints labels based on quantity - if quantity=10, prints 10 labels
    """
    try:
        from utils.thermal_printer import ThermalPrinter

        data = request.get_json()

        # Validate required data
        if 'items' not in data or not isinstance(data['items'], list) or len(data['items']) == 0:
            return jsonify({'error': 'Missing or empty items array'}), 400

        items = data['items']

        # Validate each item has required fields
        for i, item in enumerate(items):
            if not item.get('item_code'):
                return jsonify({'error': f'Item {i+1} missing item_code'}), 400
            if not item.get('product_name'):
                return jsonify({'error': f'Item {i+1} missing product_name'}), 400

            # Ensure quantity is at least 1
            if 'quantity' not in item or int(item.get('quantity', 0)) < 1:
                items[i]['quantity'] = 1

        # Get printer name from request or use default
        printer_name = data.get('printerName', None)

        # Calculate total labels
        total_labels = sum(int(item.get('quantity', 1)) for item in items)

        # Initialize thermal printer
        printer = ThermalPrinter(printer_name=printer_name)

        # Print the labels
        success = printer.print_labels(items)

        if success:
            # Log the print action
            log_action(
                'PRINT_LABELS',
                'billing',
                f'labels_{len(items)}_items',
                None,
                {
                    'items_count': len(items),
                    'total_labels': total_labels,
                    'printed_at': datetime.utcnow().isoformat()
                }
            )

            return jsonify({
                'success': True,
                'message': f'{total_labels} barcode labels printed successfully',
                'printer': printer.printer_name,
                'items_count': len(items),
                'total_labels': total_labels
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to print labels',
                'message': 'Printer may be offline or not configured'
            }), 500

    except Exception as e:
        return jsonify({
            'success': False,
            'error': 'Label print failed',
            'message': str(e)
        }), 500
