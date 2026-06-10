"""Membership ledger service.

Pure-logic layer for the loyalty card program. The functions here run INSIDE
the caller's DB transaction (they call db.session.flush / db.session.add but
never commit) so the bill finalize path can wrap earn/redeem/negotiate/upgrade
in one atomic transaction with rollback.

Idempotency: every bill-driven mutation is keyed on (bill_id, event_type). A
repeat finalize for the same bill_id is a no-op.

No PII, balances, or customer identifiers are logged.
"""
import math
import uuid
import logging
from datetime import datetime, timedelta

from extensions import db
from models.membership_card_model import (
    MembershipCard, get_current_time,
    STATUS_ACTIVE, STATUS_EXPIRED, STATUS_CANCELLED,
)
from models.membership_tier_model import MembershipTier
from models.membership_ledger_model import (
    MembershipLedger,
    EVENT_EARN, EVENT_REDEEM, EVENT_NEGOTIATE, EVENT_UPGRADE,
    EVENT_ENROLL, EVENT_ADJUST,
)

logger = logging.getLogger(__name__)


class MembershipError(Exception):
    """Raised for business-rule violations (redeem>balance, over budget, etc.).

    Carries an HTTP-friendly status code so route handlers can map it directly.
    """
    def __init__(self, message, status_code=400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


# ── Helpers ──────────────────────────────────────────────────────────────────

def _new_id():
    return str(uuid.uuid4())


def _month_bounds(ref=None):
    """First instant of the current calendar month and the next month (Asia/Kolkata)."""
    now = ref or get_current_time()
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start.month == 12:
        nxt = start.replace(year=start.year + 1, month=1)
    else:
        nxt = start.replace(month=start.month + 1)
    return start, nxt


def _year_bounds(ref=None):
    """First instant of the current calendar year and the next year (Asia/Kolkata)."""
    now = ref or get_current_time()
    start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    return start, start.replace(year=start.year + 1)


def _add_ledger(client_id, card_id, event_type, points_delta=0, amount_delta=0, bill_id=None, note=None):
    """Append a ledger row to the current session (no commit)."""
    row = MembershipLedger(
        ledger_id=_new_id(),
        client_id=client_id,
        card_id=card_id,
        bill_id=bill_id,
        event_type=event_type,
        points_delta=int(points_delta or 0),
        amount_delta=float(amount_delta or 0),
        note=note,
    )
    db.session.add(row)
    return row


def _bill_event_exists(card_id, bill_id, event_type):
    """Idempotency guard: has this (bill_id, event_type) already been recorded for this card?"""
    if not bill_id:
        return False
    return db.session.query(MembershipLedger.ledger_id).filter(
        MembershipLedger.card_id == card_id,
        MembershipLedger.bill_id == bill_id,
        MembershipLedger.event_type == event_type,
    ).first() is not None


def get_card_for_customer(client_id, customer_id):
    return MembershipCard.query.filter_by(client_id=client_id, customer_id=customer_id).first()


def get_remaining_monthly_budget(card, tier, ref=None):
    """tier.monthly_negotiable_budget − negotiate amount used in the current
    period. The period is the calendar month by default, or the calendar year
    when the tier sets negotiable_budget_period='yearly'.

    Returns None when the tier offers no budget (NULL).
    """
    if tier is None or tier.monthly_negotiable_budget is None:
        return None
    period = getattr(tier, 'negotiable_budget_period', None) or 'monthly'
    start, nxt = _year_bounds(ref) if period == 'yearly' else _month_bounds(ref)
    used = db.session.query(db.func.coalesce(db.func.sum(MembershipLedger.amount_delta), 0)).filter(
        MembershipLedger.card_id == card.card_id,
        MembershipLedger.event_type == EVENT_NEGOTIATE,
        MembershipLedger.created_at >= start,
        MembershipLedger.created_at < nxt,
    ).scalar() or 0
    # negotiate rows are stored as negative amount_delta; spent = abs(sum)
    spent = abs(float(used))
    return round(float(tier.monthly_negotiable_budget) - spent, 2)


# ── Auto-upgrade loop ──────────────────────────────────────────────────────────

def _apply_upgrades(card, bill_id=None):
    """While lifetime_points >= current tier's upgrade_threshold_points, promote.

    Loops to handle crossing multiple thresholds in a single bill. Guards against
    cycles by tracking visited tier ids.
    """
    visited = set()
    while True:
        tier = MembershipTier.query.filter_by(tier_id=card.tier_id, client_id=card.client_id).first()
        if not tier:
            break
        if tier.tier_id in visited:
            break
        visited.add(tier.tier_id)
        threshold = tier.upgrade_threshold_points
        target_id = tier.upgrade_to_tier_id
        if threshold is None or target_id is None:
            break
        if (card.lifetime_points or 0) < int(threshold):
            break
        target = MembershipTier.query.filter_by(
            tier_id=target_id, client_id=card.client_id, is_active=True
        ).first()
        if not target:
            break
        card.tier_id = target.tier_id
        _add_ledger(
            card.client_id, card.card_id, EVENT_UPGRADE,
            bill_id=bill_id, note=f"Auto-upgraded to tier {target.name}",
        )


# ── Bill finalize commit (called inside the bill transaction) ───────────────────

def commit_bill_ledger(client_id, card, bill_id, final_amount,
                       redeem_points=0, negotiate_amount=0, earn_base=None):
    """Apply earn / redeem / negotiate / upgrade for a finalized bill.

    Runs inside the caller's transaction. Does NOT commit — the caller commits
    the whole bill atomically. Idempotent on bill_id (per event_type).

    Returns a dict summary. Raises MembershipError on rule violations so the
    caller can roll back the entire bill.
    """
    if card is None:
        return {'applied': False, 'reason': 'no_card'}
    if not bill_id:
        raise MembershipError('bill_id is required to commit membership ledger', 500)

    tier = MembershipTier.query.filter_by(tier_id=card.tier_id, client_id=client_id).first()
    if tier is None:
        return {'applied': False, 'reason': 'no_tier'}

    # Suspend benefits for expired/cancelled cards (earn nothing, reject redeem/negotiate).
    card_active = card.status == STATUS_ACTIVE and not card.is_expired()

    summary = {'applied': True, 'earned': 0, 'redeemed_points': 0,
               'redeemed_amount': 0.0, 'negotiated': 0.0, 'upgraded': False,
               'idempotent_skip': False}

    # Full idempotency short-circuit: if an earn row already exists for this bill,
    # the finalize already ran — return without mutating anything.
    if _bill_event_exists(card.card_id, bill_id, EVENT_EARN):
        summary['applied'] = False
        summary['idempotent_skip'] = True
        return summary

    redeem_points = int(redeem_points or 0)
    negotiate_amount = round(float(negotiate_amount or 0), 2)

    # ── Redeem ─────────────────────────────────────────────────────────────────
    if redeem_points > 0:
        if not card_active:
            raise MembershipError('Card is not active; cannot redeem points', 400)
        if tier.redemption_rate is None:
            raise MembershipError('This tier does not allow point redemption', 400)
        if redeem_points > (card.redeemable_points or 0):
            raise MembershipError('Redeem amount exceeds available point balance', 400)
        if not _bill_event_exists(card.card_id, bill_id, EVENT_REDEEM):
            redeem_value = round(redeem_points * float(tier.redemption_rate), 2)
            card.redeemable_points = (card.redeemable_points or 0) - redeem_points
            _add_ledger(
                client_id, card.card_id, EVENT_REDEEM,
                points_delta=-redeem_points, amount_delta=-redeem_value,
                bill_id=bill_id, note='Points redeemed at billing',
            )
            summary['redeemed_points'] = redeem_points
            summary['redeemed_amount'] = redeem_value

    # ── Negotiate (against monthly budget) ──────────────────────────────────────
    # Only enforced/tracked when the tier actually offers a negotiable budget.
    # A plain manual negotiation on a member's bill must NOT fail the sale just
    # because the tier has no loyalty budget — it stays an ordinary discount.
    if negotiate_amount > 0:
        remaining = get_remaining_monthly_budget(card, tier)
        if remaining is not None:
            if not card_active:
                raise MembershipError('Card is not active; cannot negotiate', 400)
            if negotiate_amount > remaining + 1e-6:
                raise MembershipError(
                    f'Negotiation exceeds remaining monthly budget (₹{remaining:.2f})', 400
                )
            if not _bill_event_exists(card.card_id, bill_id, EVENT_NEGOTIATE):
                _add_ledger(
                    client_id, card.card_id, EVENT_NEGOTIATE,
                    amount_delta=-negotiate_amount,
                    bill_id=bill_id, note='Negotiation applied at billing',
                )
                summary['negotiated'] = negotiate_amount

    # ── Earn ────────────────────────────────────────────────────────────────────
    # Earn on the gross spend (before point redemption), so paying with past
    # rewards doesn't shrink the points earned. amount_delta records that gross
    # spend — it is the figure /report sums as "lifetime spend".
    base = float(final_amount if earn_base is None else earn_base)
    earned = 0
    if card_active and tier.points_per_100 is not None and float(tier.points_per_100) > 0:
        earned = int(math.floor(base / 100.0) * float(tier.points_per_100))
    if earned > 0:
        card.redeemable_points = (card.redeemable_points or 0) + earned
        card.lifetime_points = (card.lifetime_points or 0) + earned
        summary['earned'] = earned
    # Always write the earn marker row (even when earned == 0) so the idempotency
    # short-circuit above reliably detects a prior finalize for this bill.
    _add_ledger(
        client_id, card.card_id, EVENT_EARN,
        points_delta=earned, amount_delta=base,
        bill_id=bill_id, note='Points earned on bill',
    )

    # ── Auto-upgrade loop ────────────────────────────────────────────────────────
    before_tier = card.tier_id
    if card_active:
        _apply_upgrades(card, bill_id=bill_id)
    if card.tier_id != before_tier:
        summary['upgraded'] = True

    card.updated_at = get_current_time()
    db.session.flush()
    return summary


# ── Bill cancellation reversal ─────────────────────────────────────────────────

def reverse_bill_ledger(client_id, card, bill_id):
    """Claw back points earned + restore points/budget redeemed for a cancelled bill.

    Writes reversing `adjust` ledger rows (append-only — never deletes history).
    Runs inside the caller's transaction (no commit). Idempotent: a second
    cancellation produces no further reversal rows.
    """
    if card is None or not bill_id:
        return {'reversed': False}

    # Idempotency: if a reversal adjust already exists for this bill, stop.
    already = db.session.query(MembershipLedger.ledger_id).filter(
        MembershipLedger.card_id == card.card_id,
        MembershipLedger.bill_id == bill_id,
        MembershipLedger.event_type == EVENT_ADJUST,
    ).first()
    if already:
        return {'reversed': False, 'idempotent_skip': True}

    rows = MembershipLedger.query.filter(
        MembershipLedger.card_id == card.card_id,
        MembershipLedger.bill_id == bill_id,
        MembershipLedger.event_type.in_([EVENT_EARN, EVENT_REDEEM, EVENT_NEGOTIATE]),
    ).all()
    if not rows:
        return {'reversed': False}

    total_points = 0
    total_amount = 0.0
    for r in rows:
        if r.event_type == EVENT_EARN:
            # Reverse earned points: subtract from redeemable + lifetime.
            pts = int(r.points_delta or 0)
            card.redeemable_points = max(0, (card.redeemable_points or 0) - pts)
            card.lifetime_points = max(0, (card.lifetime_points or 0) - pts)
            total_points -= pts
        elif r.event_type == EVENT_REDEEM:
            # Restore the redeemed points (delta was negative).
            pts = int(r.points_delta or 0)  # negative
            card.redeemable_points = (card.redeemable_points or 0) - pts  # subtract negative = add
            total_points -= pts
        # negotiate has no card-counter effect; its reversal is the offsetting
        # adjust row below, which removes it from the monthly-budget sum.
        total_amount -= float(r.amount_delta or 0)

    _add_ledger(
        client_id, card.card_id, EVENT_ADJUST,
        points_delta=total_points, amount_delta=total_amount,
        bill_id=bill_id, note='Reversal of cancelled bill',
    )
    card.updated_at = get_current_time()
    db.session.flush()
    return {'reversed': True, 'points_delta': total_points, 'amount_delta': round(total_amount, 2)}


# ── Period stats (ledger-derived) ───────────────────────────────────────────────

def _sum_between(card_id, event_types, start, end, field):
    col = MembershipLedger.points_delta if field == 'points' else MembershipLedger.amount_delta
    q = db.session.query(db.func.coalesce(db.func.sum(col), 0)).filter(
        MembershipLedger.card_id == card_id,
        MembershipLedger.event_type.in_(event_types),
    )
    if start is not None:
        q = q.filter(MembershipLedger.created_at >= start)
    if end is not None:
        q = q.filter(MembershipLedger.created_at < end)
    return q.scalar() or 0


def compute_stats(card, ref=None):
    """Return this-month and this-year spend / points / negotiable, ledger-computed."""
    now = ref or get_current_time()
    month_start, month_next = _month_bounds(now)
    year_start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    next_year = year_start.replace(year=year_start.year + 1)

    def block(start, end):
        spend = float(_sum_between(card.card_id, [EVENT_EARN], start, end, 'amount'))
        earned = int(_sum_between(card.card_id, [EVENT_EARN], start, end, 'points'))
        redeemed = abs(int(_sum_between(card.card_id, [EVENT_REDEEM], start, end, 'points')))
        negotiated = abs(float(_sum_between(card.card_id, [EVENT_NEGOTIATE], start, end, 'amount')))
        return {
            'spend': round(spend, 2),
            'points_earned': earned,
            'points_redeemed': redeemed,
            'negotiable_used': round(negotiated, 2),
        }

    return {
        'this_month': block(month_start, month_next),
        'this_year': block(year_start, next_year),
    }


# ── Enroll / expiry helpers ─────────────────────────────────────────────────────

def compute_expiry(tier, ref=None):
    if tier.validity_days is None:
        return None
    now = ref or get_current_time()
    return now + timedelta(days=int(tier.validity_days))


def refresh_status_if_expired(card):
    """Flip an active-but-past-expiry card to 'expired'. Returns True if changed."""
    if card.status == STATUS_ACTIVE and card.is_expired():
        card.status = STATUS_EXPIRED
        card.updated_at = get_current_time()
        return True
    return False
