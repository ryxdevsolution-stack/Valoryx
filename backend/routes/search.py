"""
Universal search across products, customers, suppliers, bills, and employees.

GET /api/search?q=<query>  →  categorized results, respecting caller permissions.
"""
from flask import Blueprint, jsonify, g, request
from sqlalchemy import or_
from extensions import db
from utils.auth_middleware import authenticate
from models.stock_model import StockEntry
from models.customer_model import Customer
from models.supplier_model import Supplier
from models.billing_model import GSTBilling, NonGSTBilling
from models.user_model import User

search_bp = Blueprint('search', __name__)

PER_CATEGORY_LIMIT = 5
MIN_QUERY_LENGTH = 2


def _has_perm(*perm_names):
    """True if caller has any of the named permissions (or is super-admin)."""
    if g.user.get('is_super_admin', False):
        return True
    user_perms = set(g.user.get('permissions', []))
    return any(p in user_perms for p in perm_names)


@search_bp.route('', methods=['GET'])
@authenticate
def universal_search():
    q = (request.args.get('q') or '').strip()
    if len(q) < MIN_QUERY_LENGTH:
        return jsonify({
            'products': [], 'customers': [], 'suppliers': [],
            'bulk_orders': [], 'deliveries': [],
            'bills': [], 'employees': [],
        }), 200

    client_id = g.user['client_id']
    like = f'%{q}%'

    response = {
        'products': [],
        'customers': [],
        'suppliers': [],
        'bulk_orders': [],
        'deliveries': [],
        'bills': [],
        'employees': [],
    }

    # ── Products ─────────────────────────────────────────────────────────────
    if _has_perm('view_stock'):
        rows = StockEntry.query.filter(
            StockEntry.client_id == client_id,
            or_(
                StockEntry.product_name.ilike(like),
                StockEntry.item_code.ilike(like),
                StockEntry.barcode.ilike(like),
            ),
        ).order_by(StockEntry.product_name).limit(PER_CATEGORY_LIMIT).all()
        response['products'] = [
            {
                'id': str(r.product_id),
                'name': r.product_name,
                'subtitle': ' · '.join([s for s in (
                    r.item_code,
                    f'₹{float(r.rate):,.2f}' if r.rate else None,
                ) if s]),
                'href': f'/stock?focus={r.product_id}',
            }
            for r in rows
        ]

    # ── Customers ────────────────────────────────────────────────────────────
    if _has_perm('view_customers'):
        rows = Customer.query.filter(
            Customer.client_id == client_id,
            or_(
                Customer.customer_name.ilike(like),
                Customer.customer_phone.ilike(like),
                Customer.customer_email.ilike(like),
            ),
        ).order_by(Customer.customer_name).limit(PER_CATEGORY_LIMIT).all()
        response['customers'] = [
            {
                'id': str(r.customer_id),
                'name': r.customer_name,
                'subtitle': ' · '.join([s for s in (r.customer_phone, r.customer_email) if s]),
                'href': f'/customers?focus={r.customer_id}',
            }
            for r in rows
        ]

    # ── Suppliers ────────────────────────────────────────────────────────────
    if _has_perm('view_stock'):  # supplier list lives under stock-related perms
        rows = Supplier.query.filter(
            Supplier.client_id == client_id,
            Supplier.is_active == True,  # noqa: E712
            or_(
                Supplier.name.ilike(like),
                Supplier.contact_person.ilike(like),
                Supplier.phone.ilike(like),
                Supplier.email.ilike(like),
            ),
        ).order_by(Supplier.name).limit(PER_CATEGORY_LIMIT).all()
        response['suppliers'] = [
            {
                'id': str(r.supplier_id),
                'name': r.name,
                'subtitle': ' · '.join([s for s in (r.contact_person, r.phone) if s]),
                'href': f'/suppliers?focus={r.supplier_id}',
            }
            for r in rows
        ]

    # ── Bills (GST + Non-GST) ────────────────────────────────────────────────
    if _has_perm('view_all_bills', 'view_own_bills'):
        # Try to interpret query as a bill number for exact match boost
        try:
            q_num = int(q)
        except ValueError:
            q_num = None

        bill_results = []
        for Model in (GSTBilling, NonGSTBilling):
            filters = [Model.client_id == client_id]
            or_conds = [Model.customer_name.ilike(like)]
            if q_num is not None:
                or_conds.append(Model.bill_number == q_num)
            filters.append(or_(*or_conds))
            # Per-user filtering if only view_own_bills
            if not _has_perm('view_all_bills') and _has_perm('view_own_bills'):
                filters.append(Model.created_by == g.user['user_id'])
            rows = (
                Model.query.filter(*filters)
                .order_by(Model.created_at.desc())
                .limit(PER_CATEGORY_LIMIT)
                .all()
            )
            for r in rows:
                # NonGSTBilling uses total_amount; GSTBilling uses final_amount
                amount = getattr(r, 'final_amount', None) or getattr(r, 'total_amount', None)
                bill_results.append({
                    'id': str(r.bill_id),
                    'name': f'Bill #{r.bill_number}',
                    'subtitle': ' · '.join([s for s in (
                        r.customer_name,
                        f'₹{float(amount):,.2f}' if amount else None,
                    ) if s]),
                    'href': '/billing',
                    'bill_id': str(r.bill_id),
                })
        # Combine and cap
        response['bills'] = bill_results[:PER_CATEGORY_LIMIT]

    # ── Bulk Stock Orders ────────────────────────────────────────────────────
    if _has_perm('view_stock'):
        from models.bulk_stock_order_model import BulkStockOrder
        rows = BulkStockOrder.query.filter(
            BulkStockOrder.client_id == client_id,
            or_(
                BulkStockOrder.order_number.ilike(like),
                BulkStockOrder.supplier_name.ilike(like),
            ),
        ).order_by(BulkStockOrder.created_at.desc()).limit(PER_CATEGORY_LIMIT).all()
        response['bulk_orders'] = [
            {
                'id': str(r.order_id),
                'name': r.order_number,
                'subtitle': ' · '.join([s for s in (r.supplier_name, getattr(r, 'status', None)) if s]),
                'href': f'/stock?focus={r.order_id}',
            }
            for r in rows
        ]
    else:
        response['bulk_orders'] = []

    # ── Supplier Deliveries ──────────────────────────────────────────────────
    if _has_perm('view_stock'):
        from models.supplier_model import SupplierDelivery
        # JOIN to Supplier so we can match on supplier.name
        rows = SupplierDelivery.query.join(
            Supplier, SupplierDelivery.supplier_id == Supplier.supplier_id
        ).filter(
            SupplierDelivery.client_id == client_id,
            or_(
                SupplierDelivery.invoice_number.ilike(like),
                Supplier.name.ilike(like),
            ),
        ).order_by(SupplierDelivery.created_at.desc()).limit(PER_CATEGORY_LIMIT).all()
        response['deliveries'] = [
            {
                'id': str(r.delivery_id),
                'name': r.invoice_number or f'Delivery {str(r.delivery_id)[:8]}',
                'subtitle': ' · '.join([s for s in (
                    r.supplier.name if r.supplier else None,
                    r.status,
                ) if s]),
                'href': f'/suppliers?tab=deliveries&focus={r.delivery_id}',
            }
            for r in rows
        ]
    else:
        response['deliveries'] = []

    # ── Employees (Users) ────────────────────────────────────────────────────
    if _has_perm('view_users'):
        rows = User.query.filter(
            User.client_id == client_id,
            User.is_active == True,  # noqa: E712
            or_(
                User.full_name.ilike(like),
                User.email.ilike(like),
                User.role.ilike(like),
            ),
        ).order_by(User.full_name).limit(PER_CATEGORY_LIMIT).all()
        response['employees'] = [
            {
                'id': str(r.user_id),
                'name': r.full_name or r.email or '(unnamed)',
                'subtitle': ' · '.join([s for s in (r.role, r.email) if s]),
                'href': f'/salary?focus={r.user_id}',
            }
            for r in rows
        ]

    return jsonify(response), 200
