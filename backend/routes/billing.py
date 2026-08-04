import uuid
import re
import math
import json
from datetime import datetime
import pytz
from dateutil import parser as date_parser
from flask import Blueprint, request, jsonify, g, Response
from sqlalchemy import func
from extensions import db
from models.billing_model import GSTBilling, NonGSTBilling, BillPayment
from models.stock_model import StockEntry
from models.customer_model import Customer
from models.client_model import ClientEntry
from utils.auth_middleware import authenticate, readonly_guard
from utils.permission_middleware import require_permission, require_any_permission
from utils.audit_logger import log_action
from utils.helpers import calculate_gst_amount, calculate_final_amount, validate_items, title_case, build_tax_breakdown
from services.membership_service import MembershipError
from utils.cache_helper import get_cache_manager, invalidate_billing_cache as _invalidate_billing, invalidate_stock_cache as _invalidate_stock
from utils.bill_number_helper import get_next_bill_number
from utils.device import get_device_code
from utils.rate_limiter import rate_limit

billing_bp = Blueprint('billing', __name__)


def _round_rupee(value):
    """Round a money amount to the nearest whole rupee.

    Mirrors the frontend's `Math.round(grandTotal)` "Round Off" display so the
    total persisted on the bill equals what the cashier saw at checkout. Bill
    totals are always non-negative, so `floor(x + 0.5)` reproduces JavaScript's
    round-half-up semantics exactly (Python's built-in round() is banker's
    rounding and would diverge from the UI on .5 cases).
    """
    return float(math.floor(float(value) + 0.5))


def _derive_payment_state(data, final_amount):
    """Server-side truth for how much was paid and what status that implies.

    The client's payment_status is NEVER trusted directly — a stale or buggy
    client could mark a half-paid bill 'paid'. Only the amounts decide:
        paid <= 0            -> pending
        0 < paid < total     -> partial
        paid >= total        -> paid
    Backward compatible: old clients don't send paid_amount, so we fall back to
    their binary payment_status (pending -> 0 paid, anything else -> fully paid).
    Returns (paid_amount: float, payment_status: str).
    """
    total = float(final_amount)
    raw = data.get('paid_amount')
    if raw is None:
        paid = 0.0 if data.get('payment_status') == 'pending' else total
    else:
        try:
            paid = float(raw)
        except (TypeError, ValueError):
            paid = 0.0
    paid = min(max(paid, 0.0), total)  # clamp: no negatives, no over-payment at creation
    if paid <= 0:
        status = 'pending'
    elif paid < total - 0.009:  # paise tolerance
        status = 'partial'
    else:
        paid, status = total, 'paid'
    return round(paid, 2), status


def _record_bill_payments(client_id, bill_id, bill_kind, paid_amount, payment_type_json, bill_date, user_id):
    """Write the initial bill_payments ledger rows for a new bill.

    One row per payment split so day-wise collections and method breakdowns
    stay accurate. Splits whose sum differs from paid_amount (or unparseable
    JSON) collapse into a single row for paid_amount — the ledger's invariant
    is SUM(rows) == bill.paid_amount, never trust the splits blindly.
    Caller commits.
    """
    if paid_amount <= 0:
        return
    rows = []
    try:
        splits = json.loads(payment_type_json) if isinstance(payment_type_json, str) else (payment_type_json or [])
        cleaned = []
        for s in splits:
            amt = float(s.get('amount', s.get('AMOUNT', 0)) or 0)
            method = s.get('payment_type') or s.get('PAYMENT_TYPE') or s.get('payment_name')
            if amt > 0:
                cleaned.append((method, round(amt, 2)))
        if cleaned and abs(sum(a for _, a in cleaned) - paid_amount) <= 0.01:
            rows = cleaned
    except (ValueError, TypeError, AttributeError):
        pass
    if not rows:
        rows = [(None, paid_amount)]

    for method, amt in rows:
        db.session.add(BillPayment(
            payment_id=str(uuid.uuid4()),
            client_id=client_id,
            bill_id=bill_id,
            bill_kind=bill_kind,
            amount=amt,
            payment_method=method,
            payment_date=bill_date,
            recorded_by=user_id,
        ))


# Helper function to get current time in Asia/Kolkata timezone
def get_current_time():
    """Returns current datetime in Asia/Kolkata timezone as naive datetime"""
    kolkata_tz = pytz.timezone('Asia/Kolkata')
    # Get timezone-aware datetime in IST, then convert to naive for SQLite compatibility
    aware_dt = datetime.now(kolkata_tz)
    # Return naive datetime (without timezone info) representing IST time
    return aware_dt.replace(tzinfo=None)


def _auto_save_customer(client_id, customer_name, customer_phone, customer_gstin=None):
    """Auto-register customer in Customer table during bill creation.
    Skips walk-in customers. Updates name/GSTIN if customer already exists."""
    if not customer_phone or not customer_name:
        return
    name_lower = customer_name.lower().strip()
    if name_lower in ['walk-in customer', 'walk-in', 'walkin', 'walkin customer', 'walk in customer', 'walk in', '']:
        return
    try:
        existing = Customer.query.filter_by(client_id=client_id, customer_phone=customer_phone).first()
        if existing:
            changed = False
            if existing.customer_name != title_case(customer_name):
                existing.customer_name = title_case(customer_name)
                changed = True
            if customer_gstin and existing.customer_gstin != customer_gstin:
                existing.customer_gstin = customer_gstin
                changed = True
            if changed:
                db.session.commit()
            return
        # Retry loop to handle race conditions on customer_code unique constraint
        for attempt in range(3):
            try:
                max_code = db.session.query(func.max(Customer.customer_code)).scalar()
                next_code = (max_code + 1) if max_code else 100
                new_customer = Customer(
                    customer_id=str(uuid.uuid4()),
                    client_id=client_id,
                    customer_code=next_code,
                    customer_name=title_case(customer_name),
                    customer_phone=customer_phone,
                    customer_gstin=customer_gstin or '',
                    customer_email='',
                    customer_address='',
                    status='active'
                )
                db.session.add(new_customer)
                db.session.commit()
                break
            except Exception:
                db.session.rollback()
                if attempt == 2:
                    raise
    except Exception as e:
        print(f"Warning: Auto-save customer failed: {e}")
        db.session.rollback()


def _update_loyalty_points(client_id, customer_phone, bill_amount, subtract=False):
    """Add or subtract loyalty points for a customer after bill creation/cancellation.
    Points = floor(bill_amount / 100) * points_per_100
    OPTIMIZED: reads points_per_100 from g.client (already loaded by auth middleware) — no extra DB query."""
    if not customer_phone:
        return 0
    try:
        # Use already-loaded client data from g to avoid an extra Supabase round-trip
        from flask import g as _g
        points_per_100 = 0
        if hasattr(_g, 'client') and _g.client:
            points_per_100 = _g.client.get('points_per_100') or 0
        else:
            client = ClientEntry.query.filter_by(client_id=client_id).first()
            points_per_100 = getattr(client, 'points_per_100', 0) or 0
        if points_per_100 <= 0:
            return 0

        customer = Customer.query.filter_by(client_id=client_id, customer_phone=customer_phone).first()
        if not customer:
            return 0

        points = int(bill_amount // 100) * points_per_100
        if points <= 0:
            return 0

        if subtract:
            customer.loyalty_points = max(0, (customer.loyalty_points or 0) - points)
        else:
            customer.loyalty_points = (customer.loyalty_points or 0) + points
        db.session.commit()
        return points
    except Exception as e:
        print(f"Warning: Loyalty points update failed: {e}")
        return 0


# ── Membership card hooks (loyalty card program) ────────────────────────────────

def _commit_membership_on_finalize(client_id, data, bill_id, final_amount, earn_base=None):
    """Commit the membership ledger (earn/redeem/negotiate/upgrade) for a finalized bill.

    Called INSIDE the bill transaction (before db.session.commit) so the whole
    bill + membership mutation is atomic. Raises MembershipError on rule
    violations (redeem>balance, over budget) so the caller rolls back.
    No-op when the bill carries no membership card. Idempotent on bill_id.
    """
    membership_card_id = (str(data.get('membership_card_id') or '').strip()) if data else ''
    if not membership_card_id:
        return None

    from models.membership_card_model import MembershipCard
    import services.membership_service as membership_service

    card = MembershipCard.query.filter_by(card_id=membership_card_id, client_id=client_id).first()
    if not card:
        return None

    summary = membership_service.commit_bill_ledger(
        client_id, card, bill_id, final_amount,
        redeem_points=data.get('membership_redeem_points') or 0,
        negotiate_amount=data.get('membership_negotiate_amount') or 0,
        earn_base=earn_base,
    )
    # Receipt block: what the printed bill shows for the member.
    if summary and summary.get('applied'):
        summary['card_number'] = card.membership_number
        summary['points_balance'] = card.redeemable_points or 0
    return summary


def _membership_receipt_block(summary):
    """Compact membership dict for the printed receipt; None when not applied."""
    if not summary or not summary.get('applied'):
        return None
    return {
        'card_number': summary.get('card_number'),
        'points_earned': summary.get('earned', 0),
        'points_redeemed': summary.get('redeemed_points', 0),
        'redeemed_amount': summary.get('redeemed_amount', 0.0),
        'points_balance': summary.get('points_balance', 0),
    }


def _reverse_membership_on_cancel(client_id, bill_id):
    """Write reversing `adjust` ledger rows for a cancelled bill. Idempotent, atomic.

    Runs inside the cancel transaction. No-op when no card is linked to the bill.
    """
    from models.membership_card_model import MembershipCard
    from models.membership_ledger_model import MembershipLedger
    import services.membership_service as membership_service

    # The card is identified via the ledger rows written at finalize for this bill.
    # Scoped by client_id for defense-in-depth (consistent with the rest of the module).
    row = MembershipLedger.query.filter_by(bill_id=bill_id, client_id=client_id).first()
    if not row:
        return None
    card = MembershipCard.query.filter_by(card_id=row.card_id, client_id=client_id).first()
    if not card:
        return None
    return membership_service.reverse_bill_ledger(client_id, card, bill_id)


def _membership_redeem_value(client_id, data):
    """Server-side ₹ value of the points the customer is redeeming on this bill.

    Computed authoritatively (never trust the client's number). The matching
    points are deducted and logged by _commit_membership_on_finalize, which
    re-validates the balance — so this only needs the value to reduce the
    payable total. Returns 0.0 when no card / no redemption / tier has no
    redemption rate.
    """
    if not data:
        return 0.0
    raw_card_id = data.get('membership_card_id')
    card_id = str(raw_card_id).strip() if raw_card_id else ''
    try:
        pts = int(data.get('membership_redeem_points') or 0)
    except (TypeError, ValueError):
        return 0.0
    if not card_id or pts <= 0:
        return 0.0

    from models.membership_card_model import MembershipCard
    from models.membership_tier_model import MembershipTier

    card = MembershipCard.query.filter_by(card_id=card_id, client_id=client_id).first()
    if not card:
        return 0.0
    tier = MembershipTier.query.filter_by(tier_id=card.tier_id, client_id=client_id).first()
    if not tier or tier.redemption_rate is None:
        return 0.0
    return round(pts * float(tier.redemption_rate), 2)


@billing_bp.route('/gst', methods=['POST'])
@authenticate
@rate_limit(max_requests=30, window_seconds=60, key_func=lambda: g.user['user_id'], error_message='Too many bills created. Please wait a moment.')
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
        product_map = {str(p.product_id): p for p in products}

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
            bill_prefix=get_device_code(),
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
            created_at=get_current_time()
        )

        db.session.add(new_bill)
        db.session.flush()  # Get bill_id before stock reduction

        # Phase 0: Stock reduction — single batch query with row-level lock (fixes N+1)
        # Previously: N individual queries (one per item). Now: 1 IN query locks all rows at once.
        locked_products = StockEntry.query.filter(
            StockEntry.product_id.in_(product_ids),
            StockEntry.client_id == client_id
        ).with_for_update().all()
        locked_map = {str(p.product_id): p for p in locked_products}

        for item in data['items']:
            product = locked_map.get(str(item['product_id']))
            if not product:
                raise ValueError(f"Product {item['product_name']} not found")
            if product.quantity < item['quantity']:
                raise ValueError(f"Insufficient stock for {item['product_name']}. Available: {product.quantity}")
            product.quantity -= item['quantity']
            product.updated_at = get_current_time()

        # Commit both bill creation and stock reduction atomically
        db.session.commit()

        # Invalidate cache for this client's billing data
        _invalidate_billing(client_id)
        _invalidate_stock(client_id)

        # Log action
        log_action('CREATE', 'gst_billing', new_bill.bill_id, None, new_bill.to_dict())

        # Fire webhook event — bill.created
        try:
            from flask import current_app
            from services.webhook_service import dispatch_event
            dispatch_event(current_app._get_current_object(), client_id, 'bill.created', {
                'event': 'bill.created',
                'bill_type': 'gst',
                'bill_id': new_bill.bill_id,
                'bill_number': bill_number,
                'final_amount': str(final_amount),
            })
        except Exception as _wh_err:
            import logging as _l; _l.getLogger(__name__).warning("webhook dispatch failed (bill.created): %s", _wh_err)

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
@rate_limit(max_requests=30, window_seconds=60, key_func=lambda: g.user['user_id'], error_message='Too many bills created. Please wait a moment.')
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
        product_map = {str(p.product_id): p for p in products}

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
            bill_prefix=get_device_code(),
            customer_name=title_case(data['customer_name']),
            customer_phone=data.get('customer_phone'),
            items=data['items'],
            total_amount=data['total_amount'],
            payment_type=data['payment_type'],
            status='final',
            created_by=g.user['user_id'],
            created_at=get_current_time()
        )

        db.session.add(new_bill)
        db.session.flush()  # Get bill_id before stock reduction

        # Phase 0: Stock reduction — single batch query with row-level lock (fixes N+1)
        locked_products_ng = StockEntry.query.filter(
            StockEntry.product_id.in_(product_ids),
            StockEntry.client_id == client_id
        ).with_for_update().all()
        locked_map_ng = {str(p.product_id): p for p in locked_products_ng}

        for item in data['items']:
            product = locked_map_ng.get(str(item['product_id']))
            if not product:
                raise ValueError(f"Product {item['product_name']} not found")
            if product.quantity < item['quantity']:
                raise ValueError(f"Insufficient stock for {item['product_name']}. Available: {product.quantity}")
            product.quantity -= item['quantity']
            product.updated_at = get_current_time()

        # Commit both bill creation and stock reduction atomically
        db.session.commit()

        # Invalidate cache for this client's billing data
        _invalidate_billing(client_id)
        _invalidate_stock(client_id)

        # Log action
        log_action('CREATE', 'non_gst_billing', new_bill.bill_id, None, new_bill.to_dict())

        # Fire webhook event — bill.created
        try:
            from flask import current_app
            from services.webhook_service import dispatch_event
            dispatch_event(current_app._get_current_object(), client_id, 'bill.created', {
                'event': 'bill.created',
                'bill_type': 'non_gst',
                'bill_id': new_bill.bill_id,
                'bill_number': bill_number,
                'total_amount': str(data['total_amount']),
            })
        except Exception as _wh_err:
            import logging as _l; _l.getLogger(__name__).warning("webhook dispatch failed (bill.created): %s", _wh_err)

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
@require_any_permission('gst_billing', 'non_gst_billing')
def get_next_bill_number_route():
    """
    Get the next bill number - OPTIMIZED lightweight endpoint
    Replaces fetching full bill list just to get the last bill number
    """
    try:
        client_id = g.user['client_id']
        _rc       = get_cache_manager()
        _nk       = f"billing:next_number:{client_id}"

        cached_num = _rc.get(_nk)
        if cached_num is not None:
            return jsonify(cached_num), 200

        from sqlalchemy import func

        gst_max = db.session.query(func.max(GSTBilling.bill_number)).filter(
            GSTBilling.client_id == client_id
        ).scalar() or 0

        non_gst_max = db.session.query(func.max(NonGSTBilling.bill_number)).filter(
            NonGSTBilling.client_id == client_id
        ).scalar() or 0

        next_number = max(gst_max, non_gst_max) + 1
        response = {'success': True, 'next_bill_number': next_number}
        _rc.set(_nk, response, 30)  # 30s — a busy shop creates bills quickly

        return jsonify(response), 200

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
        # Default: exclude cancelled. Pass status=all to include them (billing list page only)
        status_param = request.args.get('status', 'final')
        status_filter = None if status_param == 'all' else status_param
        date_from = request.args.get('date_from')
        date_to = request.args.get('date_to')
        # Extend YYYY-MM-DD to end-of-day so the "Daily" filter (and any same-day
        # from/to range) includes bills created during that day, not just midnight.
        if date_to and len(date_to) == 10:
            date_to = f"{date_to} 23:59:59"
        page = int(request.args.get('page', 1))
        limit = min(int(request.args.get('limit', 50)), 100)  # Cap at 100 for performance

        # Calculate offset
        offset = (page - 1) * limit

        # OPTIMIZATION: Use raw SQL COUNT for faster total_records
        from sqlalchemy import func, text

        # For single type queries, use direct SQL pagination
        if bill_type == 'gst':
            query = GSTBilling.query.filter_by(client_id=client_id)

            if status_filter:
                query = query.filter(GSTBilling.status == status_filter)

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

            if status_filter:
                query = query.filter(NonGSTBilling.status == status_filter)

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

            if status_filter:
                gst_count_query = gst_count_query.filter(GSTBilling.status == status_filter)
                non_gst_count_query = non_gst_count_query.filter(NonGSTBilling.status == status_filter)

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

            # TRUE PAGINATION via UNION ALL on IDs + timestamps only.
            # Phase 1: one lightweight query returns exactly `limit` (id, type) pairs at the right offset.
            # Phase 2: two IN queries fetch full objects for those specific IDs.
            # Cost is O(limit) regardless of page number — no more O(limit + offset) growth.
            from sqlalchemy import select, union_all, literal

            def _apply_filters_gst(q):
                if status_filter:
                    q = q.where(GSTBilling.status == status_filter)
                if not has_view_all:
                    q = q.where(GSTBilling.created_by == user_id)
                if date_from:
                    q = q.where(GSTBilling.created_at >= date_from)
                if date_to:
                    q = q.where(GSTBilling.created_at <= date_to)
                return q

            def _apply_filters_non(q):
                if status_filter:
                    q = q.where(NonGSTBilling.status == status_filter)
                if not has_view_all:
                    q = q.where(NonGSTBilling.created_by == user_id)
                if date_from:
                    q = q.where(NonGSTBilling.created_at >= date_from)
                if date_to:
                    q = q.where(NonGSTBilling.created_at <= date_to)
                return q

            gst_ids_q = _apply_filters_gst(select(
                GSTBilling.bill_id.label('bill_id'),
                GSTBilling.created_at.label('created_at'),
                literal('gst').label('bill_type'),
            ).where(GSTBilling.client_id == client_id))

            non_ids_q = _apply_filters_non(select(
                NonGSTBilling.bill_id.label('bill_id'),
                NonGSTBilling.created_at.label('created_at'),
                literal('non_gst').label('bill_type'),
            ).where(NonGSTBilling.client_id == client_id))

            combined = union_all(gst_ids_q, non_ids_q).subquery()
            id_rows = db.session.execute(
                select(combined.c.bill_id, combined.c.bill_type)
                .order_by(combined.c.created_at.desc())
                .limit(limit).offset(offset)
            ).all()

            # Separate by type and preserve ordering
            gst_ids = [r.bill_id for r in id_rows if r.bill_type == 'gst']
            non_ids = [r.bill_id for r in id_rows if r.bill_type == 'non_gst']

            gst_map = {}
            if gst_ids:
                gst_map = {b.bill_id: b for b in GSTBilling.query.filter(GSTBilling.bill_id.in_(gst_ids)).all()}
            non_map = {}
            if non_ids:
                non_map = {b.bill_id: b for b in NonGSTBilling.query.filter(NonGSTBilling.bill_id.in_(non_ids)).all()}

            bills_data = []
            for r in id_rows:
                bill = gst_map.get(r.bill_id) if r.bill_type == 'gst' else non_map.get(r.bill_id)
                if bill:
                    bills_data.append(bill.to_dict())

        # Resolve payment type UUIDs → human-readable names in one batch
        import json as _json
        import re as _re
        _UUID_PAT = _re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', _re.I)
        _PT_NORM = {'upi': 'UPI', 'cash': 'Cash', 'card': 'Card', 'net banking': 'Net Banking',
                    'netbanking': 'Net Banking', 'cheque': 'Cheque', 'neft': 'NEFT', 'rtgs': 'RTGS'}

        def _norm_pt_label(label):
            """Normalize payment label: handle abbreviations like UPI that .title() breaks."""
            return '+'.join(
                _PT_NORM.get(part.lower(), part.title())
                for part in label.split('+')
            )

        def _resolve_pt(raw):
            """Resolve payment_type to a human-readable label.
            Handles: UUID strings, JSON arrays (with lower or UPPER keys), plain names, empty arrays.
            """
            if not raw:
                return 'Pending'
            s = str(raw).strip()
            if s.startswith('[') or s.startswith('{'):
                try:
                    parsed = _json.loads(s)
                    if isinstance(parsed, list):
                        labels = []
                        for p in parsed:
                            if not isinstance(p, dict):
                                continue
                            # Keys may be 'payment_type', 'PAYMENT_TYPE', or 'payment_name'
                            label = (p.get('payment_type') or p.get('PAYMENT_TYPE')
                                     or p.get('payment_name') or '')
                            if label and label.lower() != 'pending':
                                labels.append(str(label).title())
                        return '+'.join(labels) if labels else 'Pending'
                    if isinstance(parsed, dict):
                        label = (parsed.get('payment_type') or parsed.get('PAYMENT_TYPE')
                                 or parsed.get('payment_name') or '')
                        return str(label).title() if label and label.lower() != 'pending' else 'Pending'
                except (ValueError, KeyError):
                    pass
            return s  # UUID or plain name (e.g. "Cash", "UPI")

        for b in bills_data:
            b['payment_type'] = _norm_pt_label(_resolve_pt(b.get('payment_type') or ''))

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

        resp = jsonify(result)
        resp.headers['Cache-Control'] = 'no-store'
        return resp, 200

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

        # Regional snapshot for this client — currency + tax config frozen onto the bill
        # so receipts stay correct even if the client later changes these settings.
        _client_region = ClientEntry.query.with_entities(
            ClientEntry.currency_code, ClientEntry.tax_config
        ).filter_by(client_id=client_id).first()
        bill_currency_code = (_client_region.currency_code if _client_region else None) or 'INR'
        bill_tax_config = (_client_region.tax_config if _client_region else None)

        # Parse custom bill date if provided, otherwise use current datetime
        bill_date = get_current_time()
        if data.get('bill_date'):
            try:
                bill_date = date_parser.parse(data['bill_date'])
                # Prevent future dates
                if bill_date.date() > get_current_time().date():
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
            ).with_for_update().all()
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
                    'created_at': get_current_time(),
                    'updated_at': get_current_time()
                }
                new_products_to_create.append((new_product_data, new_product_id))

                # Update product_id to use real UUID in processed items
                product_id = new_product_id

            # For non-GST only users, force GST to 0
            if non_gst_only:
                item_gst_pct = 0

            # Per-line customer discount (v25): comes off the rate, BEFORE GST.
            # Clamp to [0, 100] — never trust the client's range.
            item_discount_pct = float(item.get('discount_percentage', 0) or 0)
            item_discount_pct = max(0.0, min(item_discount_pct, 100.0))

            # Calculate amounts on the discounted taxable value
            item_subtotal = item_qty * item_rate * (1 - item_discount_pct / 100)
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
                'discount_percentage': item_discount_pct,
                'gst_amount': round(item_gst_amt, 2),
                'amount': round(item_total, 2)
            })

            subtotal += item_subtotal
            total_gst_amount += item_gst_amt

        final_amount = subtotal + total_gst_amount

        # Calculate effective GST percentage (weighted average based on subtotal)
        effective_gst_percentage = (total_gst_amount / subtotal * 100) if subtotal > 0 else 0

        # Create new products in stock_entry table BEFORE creating bill
        _bill_added_by_label = (data.get('added_by_label') or '').strip() or None
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
                updated_at=new_product_data['updated_at'],
                created_by=g.user['user_id'],
                added_by_label=_bill_added_by_label,
            )
            db.session.add(new_stock_entry)

        # Flush to ensure products are created before bill
        if new_products_to_create:
            db.session.flush()

        # Stock reduction — decrement quantities for all existing (non-temp, non-nosave) items.
        # Uses the locked product_map (with_for_update above ensures atomicity).
        # Called once here so BOTH the GST and Non-GST bill paths share this block.
        if existing_product_ids:
            _now = get_current_time()
            for _item in data['items']:
                _pid = _item['product_id']
                if _pid.startswith('temp-') or _pid.startswith('nosave-'):
                    continue
                _product = product_map.get(_pid)
                if _product:
                    _product.quantity -= _item['quantity']
                    _product.updated_at = _now

        # Route to appropriate billing table based on permission and GST presence
        # Permission-based routing:
        # - gst_only: Always GST bill (even if no GST items)
        # - non_gst_only: Always Non-GST bill (GST already forced to 0 above)
        # - both permissions: Smart detection based on has_gst_items
        should_create_gst_bill = gst_only or (not non_gst_only and has_gst_items)

        if should_create_gst_bill:
            # Create GST Bill — atomic counter (no race condition)
            bill_number = get_next_bill_number(client_id, 'gst')

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

            # Membership point redemption reduces what the customer pays now.
            # ₹ value is computed server-side; the matching points are deducted +
            # logged (and the balance re-validated) by the membership hook below.
            membership_redeem_value = _membership_redeem_value(client_id, data)
            if membership_redeem_value > 0:
                if membership_redeem_value > final_amount:
                    db.session.rollback()
                    return jsonify({'error': 'Redeemed points exceed the bill total'}), 400
                final_amount = round(final_amount - membership_redeem_value, 2)

            # Whole-rupee round-off — applied last so the stored payable matches
            # the rounded Grand Total shown on the create screen (and amount_received).
            final_amount = _round_rupee(final_amount)

            # Partial payment: amounts decide the status, never the client's word.
            paid_amount, derived_payment_status = _derive_payment_state(data, final_amount)

            new_bill = GSTBilling(
                bill_id=str(uuid.uuid4()),
                client_id=client_id,
                bill_number=bill_number,
                bill_prefix=get_device_code(),
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
                payment_status=derived_payment_status,
                paid_amount=paid_amount,
                currency_code=bill_currency_code,
                tax_breakdown=build_tax_breakdown(total_gst_amount, bill_tax_config),
                created_by=g.user['user_id'],
                created_at=bill_date
            )

            db.session.add(new_bill)
            db.session.flush()  # ensure bill_id is available for the membership ledger
            # Ledger rows for the initial payment(s) — same transaction, atomic.
            _record_bill_payments(client_id, new_bill.bill_id, 'gst', paid_amount,
                                  data['payment_type'], bill_date, g.user['user_id'])
            # Log action BEFORE commit so it's part of the same transaction (performance optimization)
            log_action('CREATE', 'gst_billing', new_bill.bill_id, None, new_bill.to_dict())

            # Membership ledger (earn/redeem/negotiate/upgrade) — same transaction, atomic.
            try:
                membership_summary = _commit_membership_on_finalize(
                    client_id, data, new_bill.bill_id, final_amount,
                    earn_base=round(final_amount + membership_redeem_value, 2),
                )
            except MembershipError as _me:
                db.session.rollback()
                return jsonify({'error': _me.message}), _me.status_code

            db.session.commit()

            # Auto-save customer to Customer table (no permission needed)
            _auto_save_customer(client_id, data.get('customer_name'), data.get('customer_phone'), data.get('customer_gstin'))

            # Award loyalty points
            points_earned = _update_loyalty_points(client_id, data.get('customer_phone'), final_amount)

            # Invalidate caches after bill creation — use CacheManager (real cache), not legacy SimpleCache
            _invalidate_billing(client_id)
            _invalidate_stock(client_id)

            # Tax breakdown driven by the client's tax_config (frozen on the bill above).
            # Keep cgst/sgst keys for backward compatibility with existing receipt code:
            # for the default India GST split they map to the two components; other
            # tax systems (VAT, sales tax) are exposed via `tax_breakdown`.
            tax_breakdown = new_bill.tax_breakdown or []
            cgst = tax_breakdown[0]['amount'] if len(tax_breakdown) > 0 else 0
            sgst = tax_breakdown[1]['amount'] if len(tax_breakdown) > 1 else 0

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
                    # Mirror final_amount (the rounded payable) for consumers that read
                    # `total_amount` generically; the pre-tax value lives in `subtotal`.
                    'total_amount': round(final_amount, 2),
                    'membership_redeemed': membership_redeem_value if membership_redeem_value > 0 else None,
                    'membership': _membership_receipt_block(membership_summary),
                    'payment_type': data['payment_type'],
                    'created_at': new_bill.created_at.isoformat() if new_bill.created_at else get_current_time().isoformat(),
                    'type': 'gst',
                    'cgst': cgst,
                    'sgst': sgst,
                    'igst': 0,
                    'tax_breakdown': tax_breakdown,
                    'currency_code': bill_currency_code,
                    'user_name': g.user.get('full_name') or g.user.get('email', 'Admin').split('@')[0],
                    'payment_status': derived_payment_status,
                    'paid_amount': paid_amount,
                    'balance_due': round(max(final_amount - paid_amount, 0), 2),
                    'points_earned': points_earned
                }
            }), 201

        else:
            # Create Non-GST Bill — atomic counter (no race condition)
            bill_number = get_next_bill_number(client_id, 'non_gst')

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

            # Membership point redemption reduces what the customer pays now
            # (₹ value computed server-side; points deducted + balance re-validated below).
            membership_redeem_value = _membership_redeem_value(client_id, data)
            if membership_redeem_value > 0:
                if membership_redeem_value > total_amount:
                    db.session.rollback()
                    return jsonify({'error': 'Redeemed points exceed the bill total'}), 400
                total_amount = round(total_amount - membership_redeem_value, 2)

            # Whole-rupee round-off — applied last so the stored total matches the
            # rounded Grand Total shown on the create screen (and amount_received).
            total_amount = _round_rupee(total_amount)

            # Partial payment: amounts decide the status, never the client's word.
            paid_amount, derived_payment_status = _derive_payment_state(data, total_amount)

            new_bill = NonGSTBilling(
                bill_id=str(uuid.uuid4()),
                client_id=client_id,
                bill_number=bill_number,
                bill_prefix=get_device_code(),
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
                payment_status=derived_payment_status,
                paid_amount=paid_amount,
                currency_code=bill_currency_code,
                created_by=g.user['user_id'],
                created_at=bill_date
            )

            db.session.add(new_bill)
            db.session.flush()  # ensure bill_id is available for the membership ledger
            # Ledger rows for the initial payment(s) — same transaction, atomic.
            _record_bill_payments(client_id, new_bill.bill_id, 'non_gst', paid_amount,
                                  data['payment_type'], bill_date, g.user['user_id'])
            # Log action BEFORE commit so it's part of the same transaction (performance optimization)
            log_action('CREATE', 'non_gst_billing', new_bill.bill_id, None, new_bill.to_dict())

            # Membership ledger (earn/redeem/negotiate/upgrade) — same transaction, atomic.
            try:
                membership_summary = _commit_membership_on_finalize(
                    client_id, data, new_bill.bill_id, total_amount,
                    earn_base=round(total_amount + membership_redeem_value, 2),
                )
            except MembershipError as _me:
                db.session.rollback()
                return jsonify({'error': _me.message}), _me.status_code

            db.session.commit()

            # Auto-save customer to Customer table (no permission needed)
            _auto_save_customer(client_id, data.get('customer_name'), data.get('customer_phone'), data.get('customer_gstin'))

            # Award loyalty points
            points_earned = _update_loyalty_points(client_id, data.get('customer_phone'), total_amount)

            # Invalidate caches after bill creation — use CacheManager (real cache), not legacy SimpleCache
            _invalidate_billing(client_id)
            _invalidate_stock(client_id)

            # Return complete bill data for direct printing (no need for additional fetch)
            return jsonify({
                'success': True,
                'bill_id': new_bill.bill_id,
                'bill_number': bill_number,
                'bill_type': 'Non-GST',
                'total_amount': total_amount,
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
                    'total_amount': total_amount,
                    'membership_redeemed': membership_redeem_value if membership_redeem_value > 0 else None,
                    'membership': _membership_receipt_block(membership_summary),
                    'payment_type': data['payment_type'],
                    'created_at': new_bill.created_at.isoformat() if new_bill.created_at else get_current_time().isoformat(),
                    'type': 'non-gst',
                    'cgst': 0,
                    'sgst': 0,
                    'igst': 0,
                    'currency_code': bill_currency_code,
                    'user_name': g.user.get('full_name') or g.user.get('email', 'Admin').split('@')[0],
                    'payment_status': derived_payment_status,
                    'paid_amount': paid_amount,
                    'balance_due': round(max(total_amount - paid_amount, 0), 2),
                    'points_earned': points_earned
                }
            }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to create bill', 'message': str(e)}), 500


def _apply_bill_payment(bill, is_gst, client_id, amount, payment_method, notes, user_id):
    """Shared core of receive-payment and mark-paid.

    Adds a bill_payments ledger row, bumps paid_amount, re-derives
    payment_status from the AMOUNTS (never from the caller's word), appends the
    split to the payment_type JSON so every existing display parser keeps
    working, and re-queues the bill for sync (synced_at = NULL — the project
    invariant mark-paid used to violate, which is why a settled bill never
    reached the cloud). Caller commits.
    """
    total = float(bill.final_amount if is_gst else bill.total_amount)
    already = float(bill.paid_amount) if bill.paid_amount is not None else (
        0.0 if (bill.payment_status or 'paid') == 'pending' else total)

    new_paid = round(already + amount, 2)
    bill.paid_amount = min(new_paid, total)
    bill.payment_status = 'paid' if new_paid >= total - 0.009 else 'partial'

    # Append to the splits JSON so BillingList/print parsers show this payment.
    try:
        splits = json.loads(bill.payment_type) if bill.payment_type else []
        if not isinstance(splits, list):
            splits = []
    except (ValueError, TypeError):
        splits = []
    splits.append({'payment_type': payment_method or 'Cash', 'amount': round(amount, 2)})
    bill.payment_type = json.dumps(splits)

    bill.synced_at = None  # INVARIANT: edited synced row must re-upload

    payment = BillPayment(
        payment_id=str(uuid.uuid4()),
        client_id=client_id,
        bill_id=bill.bill_id,
        bill_kind='gst' if is_gst else 'non_gst',
        amount=round(amount, 2),
        payment_method=payment_method or 'Cash',
        payment_date=get_current_time(),
        notes=notes,
        recorded_by=user_id,
    )
    db.session.add(payment)
    return payment


@billing_bp.route('/<bill_id>/payments', methods=['POST'])
@authenticate
@require_permission('edit_bill_details')
def receive_bill_payment(bill_id):
    """Record a payment toward a bill's outstanding balance.

    The counter half of partial billing: the customer who paid ₹3000 of ₹5000
    at the till comes back with the ₹2000. Body: {amount, payment_method,
    notes?}. Fully paying flips the bill to 'paid'; a smaller amount leaves it
    'partial' with a reduced balance. Returns the updated bill for reprint.
    """
    try:
        client_id = g.user['client_id']
        data = request.get_json() or {}

        try:
            amount = round(float(data.get('amount', 0)), 2)
        except (TypeError, ValueError):
            return jsonify({'error': 'amount must be a number'}), 400
        if amount <= 0:
            return jsonify({'error': 'amount must be greater than zero'}), 400

        gst_bill = GSTBilling.query.filter_by(bill_id=bill_id, client_id=client_id).first()
        non_gst_bill = None if gst_bill else NonGSTBilling.query.filter_by(
            bill_id=bill_id, client_id=client_id).first()
        bill = gst_bill or non_gst_bill
        if not bill:
            return jsonify({'error': 'Bill not found'}), 404
        if bill.status == 'cancelled':
            return jsonify({'error': 'Cannot record a payment on a cancelled bill'}), 400

        balance = bill.balance_due
        if balance <= 0:
            return jsonify({'error': 'This bill is already fully paid'}), 400
        if amount > balance + 0.009:
            return jsonify({'error': f'Amount exceeds the balance due ({balance:.2f})',
                            'balance_due': balance}), 400

        old_data = bill.to_dict()
        payment = _apply_bill_payment(
            bill, gst_bill is not None, client_id, amount,
            (data.get('payment_method') or '').strip() or None,
            (data.get('notes') or '').strip() or None,
            g.user['user_id'])
        log_action('UPDATE', 'gst_billing' if gst_bill else 'non_gst_billing',
                   bill_id, old_data, bill.to_dict())
        db.session.commit()

        _invalidate_billing(client_id)
        return jsonify({'success': True,
                        'message': 'Payment recorded',
                        'payment': payment.to_dict(),
                        'bill': bill.to_dict()}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to record payment', 'message': str(e)}), 500


@billing_bp.route('/<bill_id>/payments', methods=['GET'])
@authenticate
def list_bill_payments(bill_id):
    """Payment history for one bill, oldest first — feeds the detail modal."""
    try:
        client_id = g.user['client_id']
        payments = BillPayment.query.filter_by(
            bill_id=bill_id, client_id=client_id
        ).order_by(BillPayment.payment_date.asc(), BillPayment.created_at.asc()).all()
        return jsonify({'success': True,
                        'payments': [p.to_dict() for p in payments]}), 200
    except Exception as e:
        return jsonify({'error': 'Failed to load payments', 'message': str(e)}), 500


@billing_bp.route('/<bill_id>/mark-paid', methods=['PUT'])
@authenticate
@require_permission('edit_bill_details')
def mark_bill_paid(bill_id):
    """Mark a bill fully paid — sugar for receiving the entire balance in cash.

    Kept for backward compatibility with older clients; now routes through the
    same ledger as /payments so the settlement is recorded and synced instead
    of being a silent status flip.
    """
    try:
        client_id = g.user['client_id']

        gst_bill = GSTBilling.query.filter_by(bill_id=bill_id, client_id=client_id).first()
        non_gst_bill = None if gst_bill else NonGSTBilling.query.filter_by(
            bill_id=bill_id, client_id=client_id).first()

        bill = gst_bill or non_gst_bill
        if not bill:
            return jsonify({'error': 'Bill not found'}), 404

        if bill.status == 'cancelled':
            return jsonify({'error': 'Cannot update a cancelled bill'}), 400

        old_data = bill.to_dict()
        balance = bill.balance_due
        if balance > 0:
            _apply_bill_payment(bill, gst_bill is not None, client_id, balance,
                                'Cash', None, g.user['user_id'])
        else:
            # Nothing owed — just normalise the flag (legacy pending rows).
            bill.payment_status = 'paid'
            bill.synced_at = None  # INVARIANT: edited synced row must re-upload
        log_action('UPDATE', 'gst_billing' if gst_bill else 'non_gst_billing', bill_id, old_data, bill.to_dict())
        db.session.commit()

        _invalidate_billing(client_id)
        return jsonify({'success': True, 'message': 'Bill marked as paid'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to update payment status', 'message': str(e)}), 500


@billing_bp.route('/<bill_id>', methods=['PUT'])
@authenticate
@readonly_guard
def update_bill(bill_id):
    """
    Record an audit correction (audit note) on an existing bill.

    Owner/Manager only. This NEVER mutates the original bill items, totals, or
    stock — the corrected line items are stored in `audit_overrides` as an
    overlay. The original record stays intact for the audit trail; reports and
    prints keep reading the original. "Correct forward, never edit backward":
    corrections are recorded, history is never rewritten.
    """
    try:
        # Audit corrections are a privileged, fully-logged act — owners, managers,
        # or the platform super-admin only. The frontend hides the control, but
        # the server is the real authorization boundary.
        if not (g.user.get('is_super_admin') or g.user.get('role') in ('owner', 'manager')):
            return jsonify({
                'success': False,
                'error': 'Only owners and managers can record audit corrections',
            }), 403

        data = request.get_json() or {}
        client_id = g.user['client_id']

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

        new_items = data.get('items', [])

        # Validate new items
        is_valid, error_msg = validate_items(new_items)
        if not is_valid:
            return jsonify({'success': False, 'error': error_msg}), 400

        # Record the correction as an overlay only. The original bill items,
        # totals, and stock are deliberately left untouched — corrections never
        # rewrite the source record. Reports/prints keep reading the original;
        # only the audit view surfaces the corrected figures.
        existing_bill.audit_overrides = new_items
        existing_bill.updated_at = get_current_time()
        db.session.commit()

        _invalidate_billing(client_id)

        log_action('UPDATE',
                   'gst_billing' if is_gst else 'non_gst_billing',
                   bill_id,
                   old_bill_data,
                   existing_bill.to_dict())

        return jsonify({
            'success': True,
            'message': 'Audit annotation saved',
            'bill': existing_bill.to_dict(),
            'scope': 'audit_only',
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': 'Failed to save audit correction', 'message': str(e)}), 500


@billing_bp.route('/exchange/<bill_id>', methods=['POST'])
@authenticate
@require_permission('edit_bill_details')
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
        # Whole-rupee round-off — same convention as create_unified_bill so an
        # exchanged bill keeps the rounded total and doesn't drift back to paise.
        # (non-GST has no GST, so new_total == new_subtotal there.)
        new_total_rounded = _round_rupee(new_total)

        # Step 4: Update the original bill (apply title case to customer name if provided)
        bill.items = new_items
        bill.customer_name = title_case(data.get('customer_name')) if data.get('customer_name') else bill.customer_name
        bill.customer_phone = data.get('customer_phone', bill.customer_phone)
        bill.customer_gstin = data.get('customer_gstin', bill.customer_gstin)
        bill.payment_type = data.get('payment_type', bill.payment_type)
        bill.amount_received = data.get('amount_received', 0)
        bill.discount_percentage = data.get('discount_percentage', 0)
        bill.updated_at = get_current_time()

        if is_gst:
            bill.subtotal = round(new_subtotal, 2)
            bill.gst_amount = round(new_gst_amount, 2)
            bill.gst_percentage = round((new_gst_amount / new_subtotal * 100) if new_subtotal > 0 else 0, 2)
            bill.final_amount = new_total_rounded
        else:
            bill.total_amount = new_total_rounded

        db.session.commit()

        # Invalidate caches after bill exchange - for real-time data consistency
        _invalidate_billing(client_id)
        _invalidate_stock(client_id)

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
            'new_amount': new_total_rounded,
            'difference': round(new_total_rounded - returned_amount, 2)
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to process exchange', 'message': str(e)}), 500


@billing_bp.route('/<bill_id>/cancel', methods=['POST'])
@authenticate
@require_permission('mark_cancelled')
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
            product_map = {str(p.product_id): p for p in products}
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
        bill.updated_at = get_current_time()

        # Membership reversal — claw back earned points / restore redeemed points,
        # in the same transaction as the cancel + stock restore. Idempotent.
        _reverse_membership_on_cancel(client_id, bill_id)

        db.session.commit()

        # Reverse loyalty points (non-critical)
        bill_amount = float(bill.final_amount if is_gst else bill.total_amount)
        _update_loyalty_points(client_id, bill.customer_phone, bill_amount, subtract=True)

        # These operations are non-critical - don't fail the cancellation if they error
        try:
            # Invalidate caches after bill cancellation - for real-time data consistency
            # Use Redis-backed cache helpers (not legacy SimpleCache)
            _invalidate_billing(client_id)
            _invalidate_stock(client_id)

            # Log the cancellation
            log_action(
                'CANCEL',
                'gst_billing' if is_gst else 'non_gst_billing',
                bill_id,
                old_bill_data,
                {'status': 'cancelled', 'cancelled_at': get_current_time().isoformat()}
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

        # Validate printer name to prevent lp argument injection
        if printer_name is not None:
            if not re.match(r'^[a-zA-Z0-9_\-\.]{1,64}$', printer_name):
                return jsonify({'success': False, 'error': 'Invalid printer name'}), 400

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
                {'bill_number': bill_data.get('bill_number'), 'printed_at': get_current_time().isoformat()}
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
@require_permission('print_bills')
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


_LABEL_TEMPLATES = ('default', 'apparel_50x100')
_QR_URL_TEMPLATE_DEFAULT = 'https://valoryx.in/p/{sku}'


def _client_label_defaults(client_id):
    """Load a client's label default fields (importer / origin / care) for fallback."""
    client = ClientEntry.query.filter_by(client_id=client_id).first()
    if not client:
        return {}
    return {
        'label_importer_name': client.label_importer_name,
        'label_importer_address': client.label_importer_address,
        'label_origin_country': client.label_origin_country or 'India',
        'label_care_phone': client.label_care_phone or client.phone,
        'label_care_email': client.label_care_email or client.email,
    }


def _hydrate_label_items(client_id, items):
    """
    For each item, load matching StockEntry (by item_code within client) and
    merge its label fields (brand_name, size_variant, colour, mrp, manufacture_date,
    origin, importer, care) into the item dict when the caller didn't provide them.
    Returns a new list of item dicts — original order preserved.
    """
    codes = [it.get('item_code') for it in items if it.get('item_code')]
    by_code = {}
    if codes:
        rows = StockEntry.query.filter(
            StockEntry.client_id == client_id,
            StockEntry.item_code.in_(codes),
        ).all()
        for row in rows:
            by_code[row.item_code] = row

    # mrp intentionally NOT in this list — it's a price, not label metadata,
    # and caller may legitimately send mrp=0 (free sample); we must not silently
    # overwrite it from the DB. The caller's label items already carry mrp/rate.
    label_field_names = (
        'brand_name', 'size_variant', 'colour',
        'country_of_origin', 'manufacture_date',
        'importer_name', 'importer_address',
        'consumer_care_phone', 'consumer_care_email',
    )
    hydrated = []
    for it in items:
        row = by_code.get(it.get('item_code'))
        merged = dict(it)
        if row is not None:
            for name in label_field_names:
                # Only hydrate when the caller truly omitted or left blank —
                # treat empty string as absent, but keep 0 / False if provided.
                val = merged.get(name)
                if val is None or (isinstance(val, str) and not val.strip()):
                    db_val = getattr(row, name, None)
                    if db_val is not None:
                        merged[name] = db_val
        hydrated.append(merged)
    return hydrated


@billing_bp.route('/print-labels', methods=['POST'])
@authenticate
@require_permission('print_bills')
def print_labels():
    """
    Print barcode labels for items.

    Request body:
    {
        "items": [
            { "item_code": "TSH-0421", "product_name": "...", "rate": 899, "mrp": 999,
              "quantity": 10,
              # Optional overrides (otherwise hydrated from StockEntry):
              "brand_name": "...", "size_variant": "M", "colour": "Red",
              "manufacture_date": "2026-03", "country_of_origin": "India",
              "importer_name": "...", "importer_address": "...",
              "consumer_care_phone": "...", "consumer_care_email": "..." }
        ],
        "template": "default" | "apparel_50x100",     # default = legacy 50x25
        "printerName": "optional_printer_name"
    }
    """
    try:
        from utils.thermal_printer import ThermalPrinter

        data = request.get_json()

        if 'items' not in data or not isinstance(data['items'], list) or len(data['items']) == 0:
            return jsonify({'success': False, 'error': 'Missing or empty items array'}), 400

        template = (data.get('template') or 'default').strip()
        if template not in _LABEL_TEMPLATES:
            return jsonify({'success': False, 'error': f'Unknown template. Allowed: {", ".join(_LABEL_TEMPLATES)}'}), 400

        items = data['items']

        for i, item in enumerate(items):
            if not item.get('item_code'):
                return jsonify({'success': False, 'error': f'Item {i+1} missing item_code'}), 400
            if not item.get('product_name'):
                return jsonify({'success': False, 'error': f'Item {i+1} missing product_name'}), 400
            if 'quantity' not in item or int(item.get('quantity', 0)) < 1:
                items[i]['quantity'] = 1

        printer_name = data.get('printerName', None)
        if printer_name is not None:
            # Allow spaces + parens — real printer names like "HP LaserJet 1020" or
            # "Canon MF4600 (Copy 1)". subprocess.run([...]) uses argv, no shell
            # interpolation, so this check is defence-in-depth not critical.
            if not re.match(r'^[\w\s\-\.\(\)]{1,64}$', printer_name):
                return jsonify({'success': False, 'error': 'Invalid printer name'}), 400

        # For apparel template: hydrate label fields from StockEntry + resolve client defaults
        if template == 'apparel_50x100':
            items = _hydrate_label_items(g.user['client_id'], items)

        total_labels = sum(int(item.get('quantity', 1)) for item in items)

        printer = ThermalPrinter(printer_name=printer_name)
        success = printer.print_labels(
            items,
            template=template,
            client_defaults=_client_label_defaults(g.user['client_id']) if template == 'apparel_50x100' else None,
        )

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
                    'printed_at': get_current_time().isoformat()
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


@billing_bp.route('/preview-labels', methods=['POST'])
@authenticate
@require_permission('print_bills')
def preview_labels():
    """
    Return barcode label HTML for browser preview (no printer needed).
    Same payload as /print-labels. Supports template = 'default' | 'apparel_50x100'.
    """
    try:
        from utils.barcode_label import generate_labels_html, generate_apparel_labels_html

        data = request.get_json()

        if 'items' not in data or not isinstance(data['items'], list) or len(data['items']) == 0:
            return jsonify({'success': False, 'error': 'Missing or empty items array'}), 400

        template = (data.get('template') or 'default').strip()
        if template not in _LABEL_TEMPLATES:
            return jsonify({'success': False, 'error': f'Unknown template. Allowed: {", ".join(_LABEL_TEMPLATES)}'}), 400

        items = data['items']
        for i, item in enumerate(items):
            if not item.get('item_code'):
                return jsonify({'success': False, 'error': f'Item {i+1} missing item_code'}), 400
            if not item.get('product_name'):
                return jsonify({'success': False, 'error': f'Item {i+1} missing product_name'}), 400
            if 'quantity' not in item or int(item.get('quantity', 0)) < 1:
                items[i]['quantity'] = 1

        if template == 'apparel_50x100':
            items = _hydrate_label_items(g.user['client_id'], items)
            html = generate_apparel_labels_html(
                items,
                client_defaults=_client_label_defaults(g.user['client_id']),
                qr_url_template=_QR_URL_TEMPLATE_DEFAULT,
            )
        else:
            html = generate_labels_html(items)

        return Response(html, mimetype='text/html')

    except Exception as e:
        return jsonify({
            'success': False,
            'error': 'Label preview failed',
            'message': str(e)
        }), 500
