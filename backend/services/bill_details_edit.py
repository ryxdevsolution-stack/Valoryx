"""Edit a saved bill's DETAILS — never its items, quantities, prices, totals or stock.

Edit (Bills → Edit) and Exchange (Bills → Exchange) are deliberately separate:
  * Exchange  — items in / out, stock, money difference   (services/bill_exchange_service.py)
  * Edit      — customer name / phone / GSTIN, and the payment TYPE of money already paid
                (e.g. recorded as Cash, actually UPI). Amounts can never change here.
Caller locks the row, commits, and checks the version.
"""
import json

from models.billing_model import BillPayment
from utils.helpers import title_case

_PAISE = 0.009


class BillEditError(ValueError):
    """Validation failure — message is safe to show to the user."""


def _parse_splits(payment_type_json):
    try:
        splits = json.loads(payment_type_json) if payment_type_json else []
    except (ValueError, TypeError):
        return []
    out = []
    for sp in splits if isinstance(splits, list) else []:
        if isinstance(sp, dict):
            out.append({'payment_type': sp.get('payment_type') or sp.get('PAYMENT_TYPE') or 'Cash',
                        'amount': round(float(sp.get('amount', sp.get('AMOUNT', 0)) or 0), 2)})
    return out


def _relabel_paid_splits(bill, new_splits, client_id):
    """Change the METHOD of earlier payments. Same count, same amounts — only the type differs."""
    current = _parse_splits(bill.payment_type)
    if not current:
        raise BillEditError('This bill has no itemised payments to change')
    if not isinstance(new_splits, list) or len(new_splits) != len(current):
        raise BillEditError('Payments changed since the bill was opened. Open it again.')
    relabeled = []
    for old, new in zip(current, new_splits):
        method = str((new or {}).get('payment_type') or '').strip()[:50]
        try:
            amount = round(float((new or {}).get('amount')), 2)
        except (TypeError, ValueError):
            raise BillEditError('Payment amount must be a number')
        if not method:
            raise BillEditError('Every payment needs a payment type')
        if abs(amount - old['amount']) > _PAISE:
            raise BillEditError('Only the payment type of an earlier payment can be changed, not its amount')
        relabeled.append({'payment_type': method, 'amount': old['amount']})
        if method == old['payment_type']:
            continue
        rows = BillPayment.query.filter_by(bill_id=bill.bill_id, client_id=client_id,
                                           payment_method=old['payment_type'])
        if sum(1 for c in current if c['payment_type'] == old['payment_type']) == 1:
            # Splits are netted per method, so this split stands for EVERY ledger row of it.
            targets = rows.all()
        else:
            targets = rows.filter(BillPayment.amount == old['amount']).limit(1).all()
        for row in targets:
            row.payment_method = method
            row.synced_at = None
    bill.payment_type = json.dumps(relabeled)


def edit_bill_details(bill, client_id, data, now):
    """Apply allowed detail changes in place. Returns the list of fields changed."""
    changed = []
    if 'customer_name' in data:
        name = str(data.get('customer_name') or '').strip()[:120]
        bill.customer_name = title_case(name) if name else 'Walk-in Customer'
        changed.append('customer_name')
    if 'customer_phone' in data:
        phone = str(data.get('customer_phone') or '').strip()[:20]
        if phone and not phone.replace('+', '').replace(' ', '').isdigit():
            raise BillEditError('Phone number can only contain digits')
        bill.customer_phone = phone
        changed.append('customer_phone')
    if 'customer_gstin' in data:
        bill.customer_gstin = str(data.get('customer_gstin') or '').strip().upper()[:20]
        changed.append('customer_gstin')
    if 'paid_splits' in data:
        _relabel_paid_splits(bill, data.get('paid_splits'), client_id)
        changed.append('payment_type')
    if not changed:
        raise BillEditError('Nothing to update')
    bill.updated_at = now
    bill.synced_at = None  # INVARIANT: edited synced row must re-upload
    return changed
