"""Membership / loyalty card program routes.

Single consolidated module (mirrors the Suppliers module). Owner-only writes
are re-checked SERVER-SIDE (not just in the UI). Responses use the
{ success, data, message } / { success, error } convention. All queries are
ORM/parameterized; all list endpoints are paginated.

Endpoints
  GET    /api/membership/tiers                  auth        list tiers
  POST   /api/membership/tiers                  owner       create tier
  PUT    /api/membership/tiers/<id>             owner       edit tier
  DELETE /api/membership/tiers/<id>             owner       soft-deactivate tier
  POST   /api/membership/cards                  owner/mgr   enroll customer
  GET    /api/membership/cards                  auth        list cards (paginated)
  GET    /api/membership/cards/lookup?q=        auth        resolve phone/number/barcode
  GET    /api/membership/cards/<id>             auth        card detail + stats + ledger
  POST   /api/membership/cards/<id>/adjust      owner       manual point/tier adjustment
"""
import re
import uuid
import logging
from datetime import datetime

from flask import Blueprint, request, jsonify, g
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError

from extensions import db
from utils.auth_middleware import authenticate
from models.membership_tier_model import MembershipTier, get_current_time
from models.membership_card_model import (
    MembershipCard, STATUS_ACTIVE, STATUS_EXPIRED, STATUS_CANCELLED,
)
from models.membership_ledger_model import (
    MembershipLedger, EVENT_ENROLL, EVENT_ADJUST, EVENT_EARN, EVENT_UPGRADE,
)
from models.customer_model import Customer
import services.membership_service as membership_service
from services.membership_service import MembershipError
from sqlalchemy import func

logger = logging.getLogger(__name__)

membership_bp = Blueprint('membership', __name__)

# Membership number formatting
_NUMBER_PREFIX = 'VLX'
_NUMBER_PAD = 3  # 3-letter tier prefix + 3-digit number, e.g. GOL-001 (grows past 999 naturally)

# Tier benefit fields that are nullable (NULL = not offered)
_NUMERIC_BENEFITS = (
    'discount_percentage', 'points_per_100', 'redemption_rate',
    'monthly_negotiable_budget', 'enrollment_fee',
)
_INT_BENEFITS = ('upgrade_threshold_points', 'validity_days')

# Pagination
_DEFAULT_PER_PAGE = 20
_MAX_PER_PAGE = 100


# ── Auth / role helpers ─────────────────────────────────────────────────────────

def _is_owner():
    """Owner OR super-admin may perform owner-only operations (re-checked server-side)."""
    if g.user.get('is_super_admin', False):
        return True
    return g.user.get('role') == 'owner'


def _is_owner_or_manager():
    if g.user.get('is_super_admin', False):
        return True
    return g.user.get('role') in ('owner', 'manager')


def _forbidden(msg='Only the owner can perform this action'):
    return jsonify({'success': False, 'error': msg}), 403


def _paginate_args():
    try:
        page = max(1, int(request.args.get('page', 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        per_page = int(request.args.get('per_page', _DEFAULT_PER_PAGE))
    except (TypeError, ValueError):
        per_page = _DEFAULT_PER_PAGE
    per_page = max(1, min(per_page, _MAX_PER_PAGE))
    return page, per_page


# ── Input parsing helpers ─────────────────────────────────────────────────────────

def _parse_numeric_benefit(body, field):
    """Return (present, value). NULL/blank means 'not offered'."""
    if field not in body:
        return False, None
    raw = body.get(field)
    if raw is None or (isinstance(raw, str) and raw.strip() == ''):
        return True, None
    try:
        return True, float(raw)
    except (TypeError, ValueError):
        return True, None


def _parse_int_benefit(body, field):
    if field not in body:
        return False, None
    raw = body.get(field)
    if raw is None or (isinstance(raw, str) and raw.strip() == ''):
        return True, None
    try:
        return True, int(float(raw))
    except (TypeError, ValueError):
        return True, None



def _parse_budget_period(body):
    """Return (present, value) for negotiable_budget_period; validated."""
    if 'negotiable_budget_period' not in body:
        return False, None
    raw = (body.get('negotiable_budget_period') or '').strip().lower()
    if raw in ('monthly', 'yearly'):
        return True, raw
    return True, 'monthly'  # unknown values fall back to the default window


def _validate_benefits(tier):
    """Reject nonsensical benefit values. A negative redemption_rate, for
    example, would make point redemption ADD to a bill. Returns an error
    string, or None when valid.
    """
    bounds = [
        ('discount_percentage', 0, 100),
        ('points_per_100', 0, None),
        ('redemption_rate', 0, None),
        ('monthly_negotiable_budget', 0, None),
        ('enrollment_fee', 0, None),
        ('upgrade_threshold_points', 0, None),
        ('validity_days', 0, None),
    ]
    for field, lo, hi in bounds:
        v = getattr(tier, field, None)
        if v is None:
            continue
        if v < lo:
            return f'{field} cannot be negative'
        if hi is not None and v > hi:
            return f'{field} cannot exceed {hi}'
    return None


def _tier_prefix(tier):
    """Tier-wise card prefix: first 3 letters of the tier name (e.g. Gold → GOL,
    Silver → SIL). Falls back to the generic prefix for short/odd names. The
    prefix is cosmetic — uniqueness comes from the number; the card keeps its
    number even if the tier later changes (like a real card)."""
    if tier is None or not getattr(tier, 'name', None):
        return _NUMBER_PREFIX
    letters = re.sub(r'[^A-Za-z]', '', tier.name).upper()
    return letters[:3] if len(letters) >= 2 else _NUMBER_PREFIX


def _generate_membership_number(client_id, tier=None):
    """Server-side, tier-prefixed + 6-digit zero-padded, unique per client.

    Uses the per-client card count as the base sequence and probes forward for
    a free slot to avoid collisions under concurrency.
    """
    prefix = _tier_prefix(tier)
    base = MembershipCard.query.filter_by(client_id=client_id).count() + 1
    for offset in range(0, 10000):
        candidate = f"{prefix}-{base + offset:0{_NUMBER_PAD}d}"
        exists = MembershipCard.query.filter_by(membership_number=candidate).first()
        if not exists:
            return candidate
    # Extremely unlikely fallback
    return f"{prefix}-{uuid.uuid4().hex[:10].upper()}"


def _serialize_card(card, customer=None, tier=None):
    """Card dict enriched with optional customer name/phone and embedded tier.

    The frontend MembershipCard type carries optional customer_name/phone and a
    resolved `tier` object; we enrich here (route layer) to keep the model pure.
    """
    d = card.to_dict()
    if customer is not None:
        d['customer_name'] = customer.customer_name
        d['customer_phone'] = customer.customer_phone
    if tier is not None:
        d['tier'] = tier.to_dict()
    return d


# ── Tiers ─────────────────────────────────────────────────────────────────────

@membership_bp.route('/tiers', methods=['GET'])
@authenticate
def list_tiers():
    client_id = g.user['client_id']
    include_inactive = request.args.get('include_inactive') == 'true'
    q = MembershipTier.query.filter_by(client_id=client_id)
    if not include_inactive:
        q = q.filter_by(is_active=True)
    tiers = q.order_by(MembershipTier.sort_order, MembershipTier.name).all()
    return jsonify({'success': True, 'data': [t.to_dict() for t in tiers]}), 200


@membership_bp.route('/tiers', methods=['POST'])
@authenticate
def create_tier():
    if not _is_owner():
        return _forbidden()
    client_id = g.user['client_id']
    body = request.get_json(silent=True) or {}

    name = (body.get('name') or '').strip()
    if not name:
        return jsonify({'success': False, 'error': 'Tier name is required'}), 400

    tier = MembershipTier(
        tier_id=str(uuid.uuid4()),
        client_id=client_id,
        name=name,
        description=(body.get('description') or '').strip() or None,
        color=(body.get('color') or '').strip() or None,
        sort_order=body.get('sort_order') or 0,
        is_active=True,
    )
    for f in _NUMERIC_BENEFITS:
        present, val = _parse_numeric_benefit(body, f)
        if present:
            setattr(tier, f, val)
    for f in _INT_BENEFITS:
        present, val = _parse_int_benefit(body, f)
        if present:
            setattr(tier, f, val)
    if 'upgrade_to_tier_id' in body:
        tier.upgrade_to_tier_id = (body.get('upgrade_to_tier_id') or None) or None
    _pp, _pv = _parse_budget_period(body)
    if _pp:
        tier.negotiable_budget_period = _pv

    err = _validate_benefits(tier)
    if err:
        return jsonify({'success': False, 'error': err}), 400

    db.session.add(tier)
    db.session.commit()
    return jsonify({'success': True, 'data': tier.to_dict(), 'message': f'Tier "{name}" created'}), 201


@membership_bp.route('/tiers/<tier_id>', methods=['PUT'])
@authenticate
def update_tier(tier_id):
    if not _is_owner():
        return _forbidden()
    client_id = g.user['client_id']
    tier = MembershipTier.query.filter_by(tier_id=tier_id, client_id=client_id).first()
    if not tier:
        return jsonify({'success': False, 'error': 'Tier not found'}), 404

    body = request.get_json(silent=True) or {}
    if 'name' in body:
        name = (body.get('name') or '').strip()
        if not name:
            return jsonify({'success': False, 'error': 'Tier name cannot be empty'}), 400
        tier.name = name
    if 'description' in body:
        tier.description = (body.get('description') or '').strip() or None
    if 'color' in body:
        tier.color = (body.get('color') or '').strip() or None
    if 'sort_order' in body:
        tier.sort_order = body.get('sort_order') or 0
    if 'is_active' in body:
        tier.is_active = bool(body.get('is_active'))

    for f in _NUMERIC_BENEFITS:
        present, val = _parse_numeric_benefit(body, f)
        if present:
            setattr(tier, f, val)
    for f in _INT_BENEFITS:
        present, val = _parse_int_benefit(body, f)
        if present:
            setattr(tier, f, val)
    if 'upgrade_to_tier_id' in body:
        tier.upgrade_to_tier_id = (body.get('upgrade_to_tier_id') or None) or None
    _pp, _pv = _parse_budget_period(body)
    if _pp:
        tier.negotiable_budget_period = _pv

    err = _validate_benefits(tier)
    if err:
        db.session.rollback()
        return jsonify({'success': False, 'error': err}), 400

    db.session.commit()
    return jsonify({'success': True, 'data': tier.to_dict(), 'message': 'Tier updated'}), 200


@membership_bp.route('/tiers/<tier_id>', methods=['DELETE'])
@authenticate
def deactivate_tier(tier_id):
    """Soft-deactivate only — never hard-delete a tier that may have live cards."""
    if not _is_owner():
        return _forbidden()
    client_id = g.user['client_id']
    tier = MembershipTier.query.filter_by(tier_id=tier_id, client_id=client_id).first()
    if not tier:
        return jsonify({'success': False, 'error': 'Tier not found'}), 404

    tier.is_active = False
    db.session.commit()
    return jsonify({'success': True, 'message': f'Tier "{tier.name}" deactivated'}), 200


# ── Cards ─────────────────────────────────────────────────────────────────────

@membership_bp.route('/cards', methods=['POST'])
@authenticate
def enroll_card():
    """Enroll a customer into a tier. Any authenticated staff may enroll —
    counter enrollment by the cashier is the primary flow (tier definitions
    and manual adjustments remain owner-only).

    Accepts either customer_id, OR customer_phone (+ customer_name) for
    counter enrollment: resolves by phone and auto-creates the customer if
    they're new. Charges the enrollment fee if the tier has one (recorded as
    a ledger event) and sets expires_at from validity_days. One card per
    customer (1:1).
    """
    client_id = g.user['client_id']
    body = request.get_json(silent=True) or {}

    customer_id = (body.get('customer_id') or '').strip()
    tier_id = (body.get('tier_id') or '').strip()
    customer_phone = (body.get('customer_phone') or '').strip()
    # Sanity-bound the phone so a garbled value (e.g. a doubled paste) can't
    # create an unreachable customer record.
    if customer_phone and not re.fullmatch(r'\+?\d{7,15}', customer_phone):
        return jsonify({'success': False, 'error': 'customer_phone must be 7-15 digits'}), 400
    customer_name = (body.get('customer_name') or '').strip()

    if not tier_id or (not customer_id and not customer_phone):
        return jsonify({'success': False,
                        'error': 'tier_id and customer_id or customer_phone are required'}), 400

    if customer_id:
        customer = Customer.query.filter_by(customer_id=customer_id, client_id=client_id).first()
        if not customer:
            return jsonify({'success': False, 'error': 'Customer not found'}), 404
    else:
        customer = Customer.query.filter_by(client_id=client_id, customer_phone=customer_phone).first()
        if not customer:
            if not customer_name:
                return jsonify({'success': False,
                                'error': 'customer_name is required to enroll a new customer'}), 400
            # Counter enrollment of a brand-new customer: create the master record
            # (same max-code pattern as billing's _auto_save_customer).
            from utils.helpers import title_case
            from sqlalchemy import func as _func
            max_code = db.session.query(_func.max(Customer.customer_code)).scalar()
            customer = Customer(
                customer_id=str(uuid.uuid4()),
                client_id=client_id,
                customer_code=(max_code + 1) if max_code else 100,
                customer_name=title_case(customer_name),
                customer_phone=customer_phone,
                customer_email='',
                customer_address='',
                status='active',
            )
            db.session.add(customer)
            db.session.flush()
        customer_id = customer.customer_id

    tier = MembershipTier.query.filter_by(tier_id=tier_id, client_id=client_id, is_active=True).first()
    if not tier:
        return jsonify({'success': False, 'error': 'Tier not found or inactive'}), 404

    existing = MembershipCard.query.filter_by(client_id=client_id, customer_id=customer_id).first()
    if existing:
        return jsonify({'success': False, 'error': 'Customer already has a membership card'}), 409

    # Retry once on the (rare) membership-number race — the unique constraint is
    # the backstop; a second concurrent enroll just needs a fresh number.
    card = None
    for attempt in range(2):
        try:
            now = get_current_time()
            card = MembershipCard(
                card_id=str(uuid.uuid4()),
                client_id=client_id,
                customer_id=customer_id,
                membership_number=_generate_membership_number(client_id, tier),
                tier_id=tier_id,
                redeemable_points=0,
                lifetime_points=0,
                enrolled_at=now,
                expires_at=membership_service.compute_expiry(tier, now),
                status=STATUS_ACTIVE,
            )
            db.session.add(card)
            db.session.flush()

            fee = float(tier.enrollment_fee) if tier.enrollment_fee is not None else 0.0
            membership_service._add_ledger(
                client_id, card.card_id, EVENT_ENROLL,
                amount_delta=fee,
                note=f'Enrolled in tier {tier.name}' + (f' (fee ₹{fee:.2f})' if fee > 0 else ' (free)'),
            )
            db.session.commit()
            break
        except IntegrityError:
            db.session.rollback()
            card = None
            if attempt == 1:
                return jsonify({
                    'success': False,
                    'error': 'Could not allocate a membership number, please retry',
                }), 409
        except Exception:
            db.session.rollback()
            raise

    return jsonify({
        'success': True,
        'data': _serialize_card(card, customer, tier),
        'message': f'Enrolled in "{tier.name}"' + (
            f' — fee ₹{float(tier.enrollment_fee):.2f}' if tier.enrollment_fee else ''
        ),
    }), 201


@membership_bp.route('/cards', methods=['GET'])
@authenticate
def list_cards():
    client_id = g.user['client_id']
    page, per_page = _paginate_args()
    tier_id = request.args.get('tier_id')
    status = request.args.get('status')
    search = (request.args.get('search') or '').strip()

    q = MembershipCard.query.filter_by(client_id=client_id)
    if tier_id:
        q = q.filter_by(tier_id=tier_id)
    if status:
        q = q.filter_by(status=status)
    if search:
        like = f"%{search}%"
        # Bound the id list so a broad term can't blow past SQLite's variable limit.
        matching_ids = [
            r.customer_id for r in Customer.query.with_entities(Customer.customer_id).filter(
                Customer.client_id == client_id,
                or_(Customer.customer_name.ilike(like), Customer.customer_phone.ilike(like)),
            ).limit(500).all()
        ]
        q = q.filter(or_(
            MembershipCard.membership_number.ilike(like),
            MembershipCard.customer_id.in_(matching_ids) if matching_ids else False,
        ))

    total = q.count()
    cards = q.order_by(MembershipCard.created_at.desc()) \
             .offset((page - 1) * per_page).limit(per_page).all()

    # Batch-load customers to avoid an N+1 query per card.
    cust_ids = [c.customer_id for c in cards]
    customers = {}
    if cust_ids:
        customers = {
            cu.customer_id: cu for cu in
            Customer.query.filter(Customer.customer_id.in_(cust_ids)).all()
        }

    return jsonify({
        'success': True,
        'data': {
            'cards': [_serialize_card(c, customers.get(c.customer_id)) for c in cards],
            'total': total,
            'page': page,
            'per_page': per_page,
        },
    }), 200


@membership_bp.route('/cards/lookup', methods=['GET'])
@authenticate
def lookup_card():
    """Resolve phone OR membership_number OR barcode payload → one card.

    Single indexed query (membership_number is the barcode payload, so the
    barcode path collapses into the membership_number path).
    """
    client_id = g.user['client_id']
    q = (request.args.get('q') or '').strip()
    if not q:
        return jsonify({'success': False, 'error': 'Query is required'}), 400

    # Resolve the customer_id for a phone match (single query), then OR it with
    # the membership_number match in one indexed card query.
    customer = Customer.query.with_entities(Customer.customer_id).filter_by(
        client_id=client_id, customer_phone=q
    ).first()
    customer_id = customer.customer_id if customer else None

    card = MembershipCard.query.filter(
        MembershipCard.client_id == client_id,
        or_(
            MembershipCard.membership_number == q,
            MembershipCard.customer_id == customer_id,
        ),
    ).first()

    if not card:
        return jsonify({'success': True, 'data': None, 'message': 'No membership card found'}), 200

    membership_service.refresh_status_if_expired(card)
    db.session.commit()

    tier = MembershipTier.query.filter_by(tier_id=card.tier_id, client_id=client_id).first()
    customer = Customer.query.filter_by(customer_id=card.customer_id, client_id=client_id).first()
    remaining_budget = membership_service.get_remaining_monthly_budget(card, tier)
    redeem_value = None
    if tier and tier.redemption_rate is not None:
        redeem_value = round((card.redeemable_points or 0) * float(tier.redemption_rate), 2)

    return jsonify({
        'success': True,
        'data': {
            'card': _serialize_card(card, customer, tier),
            'tier': tier.to_dict() if tier else None,
            'redeemable_value': redeem_value,
            'remaining_monthly_budget': remaining_budget,
        },
    }), 200


@membership_bp.route('/cards/<card_id>', methods=['GET'])
@authenticate
def get_card(card_id):
    """Card detail + computed monthly/yearly stats + paginated ledger history."""
    client_id = g.user['client_id']
    card = MembershipCard.query.filter_by(card_id=card_id, client_id=client_id).first()
    if not card:
        return jsonify({'success': False, 'error': 'Card not found'}), 404

    page, per_page = _paginate_args()
    ledger_q = MembershipLedger.query.filter_by(card_id=card_id)
    ledger_total = ledger_q.count()
    ledger_rows = ledger_q.order_by(MembershipLedger.created_at.desc()) \
        .offset((page - 1) * per_page).limit(per_page).all()

    tier = MembershipTier.query.filter_by(tier_id=card.tier_id, client_id=client_id).first()
    customer = Customer.query.filter_by(customer_id=card.customer_id, client_id=client_id).first()
    # Next tier the card will auto-upgrade into, if the current tier defines one.
    next_tier = None
    if tier and tier.upgrade_to_tier_id:
        next_tier = MembershipTier.query.filter_by(
            tier_id=tier.upgrade_to_tier_id, client_id=client_id
        ).first()
    stats = membership_service.compute_stats(card)
    remaining_budget = membership_service.get_remaining_monthly_budget(card, tier)

    return jsonify({
        'success': True,
        'data': {
            'card': _serialize_card(card, customer, tier),
            'next_tier': next_tier.to_dict() if next_tier else None,
            'this_month': stats['this_month'],
            'this_year': stats['this_year'],
            'ledger': [r.to_dict() for r in ledger_rows],
            'monthly_negotiable_remaining': remaining_budget,
            'ledger_total': ledger_total,
            'page': page,
            'per_page': per_page,
        },
    }), 200


@membership_bp.route('/cards/<card_id>/adjust', methods=['POST'])
@authenticate
def adjust_card(card_id):
    """Owner-only manual point and/or tier adjustment. Writes an `adjust` ledger row."""
    if not _is_owner():
        return _forbidden()
    client_id = g.user['client_id']
    card = MembershipCard.query.filter_by(card_id=card_id, client_id=client_id).first()
    if not card:
        return jsonify({'success': False, 'error': 'Card not found'}), 404

    body = request.get_json(silent=True) or {}
    points_delta = body.get('points_delta')
    new_tier_id = (body.get('tier_id') or '').strip() or None
    new_status = (body.get('status') or '').strip() or None
    note = (body.get('note') or '').strip() or 'Manual adjustment'

    try:
        points = int(points_delta) if points_delta not in (None, '') else 0
    except (TypeError, ValueError):
        return jsonify({'success': False, 'error': 'points_delta must be an integer'}), 400

    if points == 0 and not new_tier_id and not new_status:
        return jsonify({'success': False, 'error': 'Nothing to adjust'}), 400

    try:
        if points != 0:
            new_redeemable = (card.redeemable_points or 0) + points
            if new_redeemable < 0:
                return jsonify({'success': False, 'error': 'Adjustment would drive balance below zero'}), 400
            card.redeemable_points = new_redeemable
            # Positive manual grants also raise lifetime points (drives upgrades).
            if points > 0:
                card.lifetime_points = (card.lifetime_points or 0) + points

        if new_tier_id:
            target = MembershipTier.query.filter_by(
                tier_id=new_tier_id, client_id=client_id, is_active=True
            ).first()
            if not target:
                return jsonify({'success': False, 'error': 'Target tier not found or inactive'}), 404
            card.tier_id = new_tier_id

        if new_status:
            if new_status not in (STATUS_ACTIVE, STATUS_EXPIRED, STATUS_CANCELLED):
                return jsonify({'success': False, 'error': 'Invalid status'}), 400
            card.status = new_status

        membership_service._add_ledger(
            client_id, card.card_id, EVENT_ADJUST,
            points_delta=points, note=note,
        )
        card.updated_at = get_current_time()

        # Manual point grants can cross an upgrade threshold.
        if points > 0 and card.status == STATUS_ACTIVE:
            membership_service._apply_upgrades(card)

        db.session.commit()
    except Exception:
        db.session.rollback()
        raise

    return jsonify({'success': True, 'data': card.to_dict(), 'message': 'Card adjusted'}), 200


# ── Reporting ───────────────────────────────────────────────────────────────────

@membership_bp.route('/report', methods=['GET'])
@authenticate
def membership_report():
    """Owner dashboard figures, all derived from cards + ledger.

    members_per_tier, outstanding points liability (Σ redeemable × redemption_rate),
    top members by lifetime spend, and upgrades in the current calendar month.
    """
    client_id = g.user['client_id']

    tiers = MembershipTier.query.filter_by(client_id=client_id).all()
    tier_map = {t.tier_id: t for t in tiers}
    active_cards = MembershipCard.query.filter_by(
        client_id=client_id, status=STATUS_ACTIVE
    ).all()

    # Members per tier + outstanding points liability (₹).
    counts = {}
    liability = 0.0
    for c in active_cards:
        counts[c.tier_id] = counts.get(c.tier_id, 0) + 1
        t = tier_map.get(c.tier_id)
        if t and t.redemption_rate is not None:
            liability += (c.redeemable_points or 0) * float(t.redemption_rate)

    members_per_tier = [{
        'tier_id': t.tier_id,
        'tier_name': t.name,
        'tier_color': t.color,
        'member_count': counts.get(t.tier_id, 0),
    } for t in tiers]

    # Top 10 members by lifetime spend (sum of `earn` amount in the ledger).
    spend_rows = db.session.query(
        MembershipLedger.card_id,
        func.sum(MembershipLedger.amount_delta).label('spend'),
    ).filter(
        MembershipLedger.client_id == client_id,
        MembershipLedger.event_type == EVENT_EARN,
    ).group_by(MembershipLedger.card_id).order_by(
        func.sum(MembershipLedger.amount_delta).desc()
    ).limit(10).all()

    top_card_ids = [r.card_id for r in spend_rows]
    top_cards = {}
    customers = {}
    if top_card_ids:
        top_cards = {
            c.card_id: c for c in
            MembershipCard.query.filter(MembershipCard.card_id.in_(top_card_ids)).all()
        }
        cust_ids = [c.customer_id for c in top_cards.values()]
        if cust_ids:
            customers = {
                cu.customer_id: cu for cu in
                Customer.query.filter(Customer.customer_id.in_(cust_ids)).all()
            }

    top_members = []
    for r in spend_rows:
        card = top_cards.get(r.card_id)
        if not card:
            continue
        cust = customers.get(card.customer_id)
        tier = tier_map.get(card.tier_id)
        top_members.append({
            'card_id': card.card_id,
            'customer_name': cust.customer_name if cust else 'Unknown',
            'membership_number': card.membership_number,
            'tier_name': tier.name if tier else '',
            'total_spend': round(float(r.spend or 0), 2),
        })

    # Upgrades this calendar month.
    month_start, month_next = membership_service._month_bounds(get_current_time())
    upgrades_this_month = MembershipLedger.query.filter(
        MembershipLedger.client_id == client_id,
        MembershipLedger.event_type == EVENT_UPGRADE,
        MembershipLedger.created_at >= month_start,
        MembershipLedger.created_at < month_next,
    ).count()

    return jsonify({
        'success': True,
        'data': {
            'members_per_tier': members_per_tier,
            'outstanding_points_liability': round(liability, 2),
            'top_members': top_members,
            'upgrades_this_month': upgrades_this_month,
            'total_active_members': len(active_cards),
        },
    }), 200
