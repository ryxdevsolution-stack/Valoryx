"""Bill exchange — "final items" mode used by the Create Bill exchange tab.

The cashier edits the bill on screen: lowers a quantity / removes a line to take
items back, adds products to give new ones. The client sends the resulting
`final_items`; this module works out everything else server-side:

  stock    per product, delta = final_qty - original_qty
           (> 0 → deduct, checked against stock; < 0 → add back)
  totals   recomputed with create-bill rules (line discount before GST, the bill's
           own discount % / negotiable amount, whole-rupee round-off). The bill keeps
           its number and GST / non-GST type (non-GST bills force GST to 0).
  money    new_total vs what was already paid:
             more  → `payments` collect the difference (≤ the difference)
             less  → the difference is refunded (`refund_method`, default Cash),
                     written as a negative bill_payments row
           paid_amount / payment_status are re-derived from amounts, and the
           payment_type splits are netted per method so list/print parsers keep
           working.

Membership: points redeemed on the original bill already reduced what the customer
paid; that money-off is carried over unchanged (points are not re-earned or reversed).
Concurrency: the caller locks the bill row and checks `expected_version` (version_of).
Caller commits; every edited row gets synced_at = NULL (sync invariant).
"""
import json
import math
import uuid
from collections import OrderedDict

from extensions import db
from models.billing_model import BillPayment
from models.membership_ledger_model import MembershipLedger
from models.stock_model import StockEntry

# Product ids that never touch stock (quick-sale / unsaved lines).
_NO_STOCK_PREFIXES = ('nosave-', 'temp-')
_PAISE = 0.009


class ExchangeError(ValueError):
    """Validation failure — message is safe to show to the cashier."""


def _round_rupee(value):
    # Same convention as routes.billing._round_rupee (JS Math.round semantics).
    return float(math.floor(value + 0.5))


def _num(value, field, lo=None, hi=None):
    try:
        n = float(value)
    except (TypeError, ValueError):
        raise ExchangeError(f'{field} must be a number')
    if math.isnan(n) or math.isinf(n):
        raise ExchangeError(f'{field} must be a number')
    if lo is not None and n < lo:
        raise ExchangeError(f'{field} must be at least {lo}')
    if hi is not None and n > hi:
        raise ExchangeError(f'{field} must be at most {hi}')
    return n


def _tracks_stock(product_id):
    return bool(product_id) and not str(product_id).startswith(_NO_STOCK_PREFIXES)


def _qty_by_product(items):
    totals = {}
    for it in items or []:
        pid = str(it.get('product_id') or '')
        if _tracks_stock(pid):
            totals[pid] = totals.get(pid, 0) + float(it.get('quantity') or 0)
    return totals


def _build_lines(final_items, is_gst):
    """Validate + price each line exactly like create_unified_bill."""
    if not isinstance(final_items, list) or not final_items:
        raise ExchangeError('The exchanged bill must keep at least one item')
    lines, subtotal, gst_total = [], 0.0, 0.0
    for it in final_items:
        if not isinstance(it, dict):
            raise ExchangeError('Invalid item')
        name = str(it.get('product_name') or '').strip()
        if not name:
            raise ExchangeError('Every item needs a product name')
        qty = _num(it.get('quantity'), f'Quantity for {name}', lo=0)
        if qty <= 0 or qty != int(qty):
            raise ExchangeError(f'Quantity for {name} must be a whole number above 0')
        rate = _num(it.get('rate'), f'Rate for {name}', lo=0)
        disc = _num(it.get('discount_percentage') or 0, f'Discount for {name}', lo=0, hi=100)
        gst_pct = _num(it.get('gst_percentage') or 0, f'GST for {name}', lo=0, hi=100) if is_gst else 0.0

        taxable = qty * rate * (1 - disc / 100)
        gst_amt = taxable * gst_pct / 100
        subtotal += taxable
        gst_total += gst_amt
        lines.append({
            'product_id': str(it.get('product_id') or ''),
            'product_name': name,
            'item_code': it.get('item_code') or '',
            'hsn_code': it.get('hsn_code') or '',
            'unit': it.get('unit') or 'pcs',
            'quantity': int(qty),
            'rate': rate,
            'mrp': float(it.get('mrp') or rate),
            'gst_percentage': gst_pct,
            'discount_percentage': disc,
            'gst_amount': round(gst_amt, 2),
            'amount': round(taxable + gst_amt, 2),
        })
    return lines, subtotal, gst_total


def _apply_stock(client_id, original_items, final_items, now):
    before, after = _qty_by_product(original_items), _qty_by_product(final_items)
    ids = set(before) | set(after)
    if not ids:
        return
    products = {str(p.product_id): p for p in StockEntry.query.filter(
        StockEntry.client_id == client_id, StockEntry.product_id.in_(list(ids))).all()}
    for pid in ids:
        delta = after.get(pid, 0) - before.get(pid, 0)
        if delta == 0:
            continue
        product = products.get(pid)
        if product is None:
            if delta > 0:  # giving out something we can't find in stock
                raise ExchangeError('A product on the bill is no longer in stock')
            continue  # returning a since-deleted product: nothing to add back to
        if delta > 0 and float(product.quantity or 0) < delta:
            raise ExchangeError(
                f'Insufficient stock for {product.product_name}. Available: {product.quantity}')
        product.quantity = (product.quantity or 0) - delta
        product.updated_at = now
        product.synced_at = None


def _net_splits(existing_json, changes):
    """Merge payment_type splits per method, apply +collected / -refunded, drop zeros."""
    merged = OrderedDict()
    try:
        splits = json.loads(existing_json) if existing_json else []
        if not isinstance(splits, list):
            splits = []
    except (ValueError, TypeError):
        splits = []
    for s in splits + changes:
        if not isinstance(s, dict):
            continue
        method = s.get('payment_type') or s.get('PAYMENT_TYPE') or s.get('payment_name') or 'Cash'
        amt = float(s.get('amount', s.get('AMOUNT', 0)) or 0)
        merged[method] = round(merged.get(method, 0.0) + amt, 2)
    return json.dumps([{'payment_type': m, 'amount': a} for m, a in merged.items() if abs(a) > _PAISE])


def version_of(bill):
    """Opaque revision token: changes whenever the bill is edited / exchanged."""
    stamp = bill.updated_at or bill.created_at
    return stamp.isoformat() if stamp else ''


def redeemed_value(client_id, bill_id):
    """₹ of membership points redeemed on this bill (ledger 'redeem' rows store a negative amount_delta)."""
    rows = MembershipLedger.query.with_entities(MembershipLedger.amount_delta).filter_by(
        client_id=client_id, bill_id=bill_id, event_type='redeem').all()
    return round(-sum(float(r[0] or 0) for r in rows), 2)


def _bill_discount(bill, data, gross):
    """Bill-level discount: the cashier may change it on the exchange tab; otherwise keep the bill's.
    Same precedence as create: a negotiated amount wins over a percentage."""
    if 'negotiable_amount' in data or 'discount_percentage' in data:
        negotiable = _num(data.get('negotiable_amount') or 0, 'Negotiated discount', lo=0)
        pct = _num(data.get('discount_percentage') or 0, 'Discount %', lo=0, hi=100)
    else:
        negotiable = float(bill.negotiable_amount or 0)
        pct = float(bill.discount_percentage or 0)
    if negotiable > 0:
        return round(min(negotiable, gross), 2), 0.0, negotiable
    return round(gross * pct / 100, 2), pct, 0.0


def exchange_with_final_items(bill, is_gst, client_id, data, user_id, now):
    """Apply an exchange to `bill` in place. Returns a summary dict. Caller commits."""
    lines, subtotal, gst_total = _build_lines(data.get('final_items'), is_gst)

    gross = subtotal + gst_total if is_gst else subtotal
    discount_amount, discount_pct, negotiable = _bill_discount(bill, data, gross)
    # Points already redeemed on this bill stay as money off — the customer spent them.
    redeemed = redeemed_value(client_id, bill.bill_id)
    new_total = _round_rupee(max(gross - discount_amount - redeemed, 0.0))

    old_total = float(bill.final_amount if is_gst else bill.total_amount)
    already_paid = float(bill.paid_amount) if bill.paid_amount is not None else (
        0.0 if (bill.payment_status or 'paid') == 'pending' else old_total)
    difference = round(new_total - already_paid, 2)

    # Money in / out for this exchange.
    collected_rows = []
    for p in data.get('payments') or []:
        amt = round(_num((p or {}).get('amount'), 'Payment amount', lo=0), 2)
        if amt > 0:
            collected_rows.append(((p.get('payment_type') or 'Cash').strip() or 'Cash', amt))
    collected = round(sum(a for _, a in collected_rows), 2)
    if collected > max(difference, 0) + _PAISE:
        raise ExchangeError(f'Payment ({collected:.2f}) is more than the amount due ({max(difference, 0):.2f})')
    refund = round(-difference, 2) if difference < -_PAISE else 0.0
    refund_method = (data.get('refund_method') or 'Cash').strip() or 'Cash'

    _apply_stock(client_id, bill.items, lines, now)

    # Bill fields.
    bill.items = lines
    bill.discount_amount = discount_amount
    bill.discount_percentage = discount_pct
    bill.negotiable_amount = negotiable or None
    if is_gst:
        bill.subtotal = round(subtotal, 2)
        bill.gst_amount = round(gst_total, 2)
        bill.gst_percentage = round(gst_total / subtotal * 100, 2) if subtotal > 0 else 0
        bill.final_amount = new_total
    else:
        bill.total_amount = new_total

    paid = round(already_paid + collected - refund, 2)
    paid = min(max(paid, 0.0), new_total)
    bill.paid_amount = paid
    bill.payment_status = 'paid' if paid >= new_total - _PAISE else ('partial' if paid > 0 else 'pending')

    split_changes = [{'payment_type': m, 'amount': a} for m, a in collected_rows]
    if refund:
        split_changes.append({'payment_type': refund_method, 'amount': -refund})
    bill.payment_type = _net_splits(bill.payment_type, split_changes)
    bill.updated_at = now
    bill.synced_at = None  # INVARIANT: edited synced row must re-upload

    kind = 'gst' if is_gst else 'non_gst'
    ledger = [(m, a, 'Exchange — extra paid') for m, a in collected_rows]
    if refund:
        ledger.append((refund_method, -refund, 'Exchange refund'))
    for method, amt, note in ledger:
        db.session.add(BillPayment(
            payment_id=str(uuid.uuid4()), client_id=client_id, bill_id=bill.bill_id,
            bill_kind=kind, amount=amt, payment_method=method, payment_date=now,
            notes=note, recorded_by=user_id))

    return {
        'previous_total': round(old_total, 2),
        'new_total': new_total,
        'already_paid': round(already_paid, 2),
        'difference': difference,
        'collected': collected,
        'refunded': refund,
        'balance_due': round(max(new_total - paid, 0.0), 2),
        'payment_status': bill.payment_status,
        'membership_redeemed': redeemed,
    }
