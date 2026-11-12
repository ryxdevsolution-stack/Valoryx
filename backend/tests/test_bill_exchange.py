"""Exchange from the Create Bill tab — POST /api/billing/exchange/<id> with final_items.

Regression guard for the legacy flow, which replaced the bill's items with ONLY the new
items (kept items vanished) and never touched paid_amount or the payment ledger.
"""
import json
import uuid

import pytest

from conftest import make_token, auth_hdr

PERMS = ['gst_billing', 'non_gst_billing', 'edit_bill_details']


@pytest.fixture
def hdr(sample_user, sample_client):
    return auth_hdr(make_token(sample_user.user_id, sample_client.client_id, permissions=PERMS))


def _product(client_id, name, rate, qty=20):
    from extensions import db
    from models.stock_model import StockEntry
    p = StockEntry(product_id=str(uuid.uuid4()), client_id=client_id, product_name=name,
                   quantity=qty, rate=rate, gst_percentage=0, unit='pcs')
    db.session.add(p)
    db.session.commit()
    return p


def _line(p, qty):
    return {'product_id': str(p.product_id), 'product_name': p.product_name, 'quantity': qty,
            'rate': float(p.rate), 'gst_percentage': 0, 'gst_amount': 0,
            'amount': float(p.rate) * qty, 'item_code': '', 'unit': 'pcs'}


def _create_bill(http, hdr, lines, cash):
    body = {'customer_name': 'X', 'items': lines,
            'payment_type': json.dumps([{'payment_type': 'Cash', 'amount': cash}]),
            'amount_received': cash, 'payment_status': 'paid'}
    r = http.post('/api/billing/create', data=json.dumps(body), content_type='application/json', headers=hdr)
    assert r.status_code == 201, r.get_json()
    return r.get_json()['bill_id']


def _exchange(http, hdr, bill_id, final_items, **extra):
    return http.post(f'/api/billing/exchange/{bill_id}', data=json.dumps({'final_items': final_items, **extra}),
                     content_type='application/json', headers=hdr)


def _qty(p):
    from extensions import db
    from models.stock_model import StockEntry
    db.session.expire_all()
    return StockEntry.query.get(p.product_id).quantity


def _ledger(bill_id):
    from models.billing_model import BillPayment
    return sorted((r.payment_method, float(r.amount)) for r in BillPayment.query.filter_by(bill_id=bill_id).all())


def test_keep_return_and_add_collects_the_difference(http, hdr, sample_client):
    a, b, c = (_product(sample_client.client_id, n, r) for n, r in (('Apple', 10), ('Bread', 20), ('Cake', 50)))
    bill_id = _create_bill(http, hdr, [_line(a, 2), _line(b, 1)], cash=40)   # 20 + 20

    # Keep Apple x2, return Bread, take Cake x1 → 20 + 50 = 70, already paid 40 → collect 30
    r = _exchange(http, hdr, bill_id, [_line(a, 2), _line(c, 1)],
                  payments=[{'payment_type': 'UPI', 'amount': 30}])
    assert r.status_code == 200, r.get_json()
    data = r.get_json()
    assert data['new_total'] == 70 and data['difference'] == 30 and data['collected'] == 30
    assert data['payment_status'] == 'paid' and data['balance_due'] == 0

    names = [i['product_name'] for i in data['bill']['items']]
    assert names == ['Apple', 'Cake']  # kept item stays on the bill
    assert (_qty(a), _qty(b), _qty(c)) == (18, 20, 19)  # Bread back, Cake out, Apple unchanged
    assert _ledger(bill_id) == [('Cash', 40.0), ('UPI', 30.0)]
    assert json.loads(data['bill']['payment_type']) == [
        {'payment_type': 'Cash', 'amount': 40.0}, {'payment_type': 'UPI', 'amount': 30.0}]


def test_cheaper_exchange_refunds(http, hdr, sample_client):
    a, b = _product(sample_client.client_id, 'Apple', 10), _product(sample_client.client_id, 'Bread', 20)
    bill_id = _create_bill(http, hdr, [_line(a, 1), _line(b, 2)], cash=50)   # 10 + 40

    r = _exchange(http, hdr, bill_id, [_line(a, 1), _line(b, 1)])           # → 30, refund 20
    assert r.status_code == 200, r.get_json()
    data = r.get_json()
    assert data['refunded'] == 20 and data['new_total'] == 30
    assert float(data['bill']['paid_amount']) == 30 and data['payment_status'] == 'paid'
    assert _ledger(bill_id) == [('Cash', -20.0), ('Cash', 50.0)]
    assert json.loads(data['bill']['payment_type']) == [{'payment_type': 'Cash', 'amount': 30.0}]
    assert _qty(b) == 19  # one Bread back in stock


def test_unpaid_difference_leaves_bill_partial(http, hdr, sample_client):
    a, c = _product(sample_client.client_id, 'Apple', 10), _product(sample_client.client_id, 'Cake', 50)
    bill_id = _create_bill(http, hdr, [_line(a, 1)], cash=10)
    r = _exchange(http, hdr, bill_id, [_line(a, 1), _line(c, 1)])           # 60, nothing paid now
    data = r.get_json()
    assert data['payment_status'] == 'partial' and data['balance_due'] == 50


def test_insufficient_stock_changes_nothing(http, hdr, sample_client):
    a = _product(sample_client.client_id, 'Apple', 10)
    scarce = _product(sample_client.client_id, 'Rare', 10, qty=1)
    bill_id = _create_bill(http, hdr, [_line(a, 1)], cash=10)
    r = _exchange(http, hdr, bill_id, [_line(a, 0 + 1), _line(scarce, 5)])
    assert r.status_code == 400 and 'Insufficient stock' in r.get_json()['error']
    assert (_qty(a), _qty(scarce)) == (19, 1)


def test_overpayment_rejected(http, hdr, sample_client):
    a, c = _product(sample_client.client_id, 'Apple', 10), _product(sample_client.client_id, 'Cake', 50)
    bill_id = _create_bill(http, hdr, [_line(a, 1)], cash=10)
    r = _exchange(http, hdr, bill_id, [_line(a, 1), _line(c, 1)],
                  payments=[{'payment_type': 'Cash', 'amount': 500}])
    assert r.status_code == 400 and 'more than the amount due' in r.get_json()['error']


def test_empty_bill_rejected(http, hdr, sample_client):
    a = _product(sample_client.client_id, 'Apple', 10)
    bill_id = _create_bill(http, hdr, [_line(a, 1)], cash=10)
    assert _exchange(http, hdr, bill_id, []).status_code == 400


def test_non_gst_bill_stays_gst_free(http, hdr, sample_client):
    a = _product(sample_client.client_id, 'Apple', 100)
    bill_id = _create_bill(http, hdr, [_line(a, 1)], cash=100)          # 0% GST → non-GST bill
    taxed = dict(_line(a, 2), gst_percentage=18)
    data = _exchange(http, hdr, bill_id, [taxed], payments=[{'payment_type': 'Cash', 'amount': 100}]).get_json()
    assert data['new_total'] == 200 and data['bill']['items'][0]['gst_percentage'] == 0


def test_points_redeemed_on_the_bill_are_not_charged_again(http, hdr, sample_client):
    """Bill ₹100 with ₹20 of points redeemed → paid ₹80. A no-change exchange must still be ₹80, paid."""
    from extensions import db
    from models.membership_ledger_model import MembershipLedger
    from models.billing_model import NonGSTBilling
    a = _product(sample_client.client_id, 'Apple', 100)
    bill_id = _create_bill(http, hdr, [_line(a, 1)], cash=100)
    bill = NonGSTBilling.query.get(bill_id)
    bill.total_amount, bill.paid_amount = 80, 80
    db.session.add(MembershipLedger(ledger_id=str(uuid.uuid4()), client_id=sample_client.client_id,
                                    card_id=str(uuid.uuid4()), bill_id=bill_id, event_type='redeem',
                                    points_delta=-20, amount_delta=-20))
    db.session.commit()

    data = _exchange(http, hdr, bill_id, [_line(a, 1)]).get_json()
    assert data['membership_redeemed'] == 20
    assert data['new_total'] == 80 and data['difference'] == 0 and data['payment_status'] == 'paid'


def test_stale_version_is_refused(http, hdr, sample_client):
    a = _product(sample_client.client_id, 'Apple', 10)
    bill_id = _create_bill(http, hdr, [_line(a, 2)], cash=20)
    version = http.get(f'/api/billing/{bill_id}?exchange=1', headers=hdr).get_json()['bill']['version']

    first = _exchange(http, hdr, bill_id, [_line(a, 1)], expected_version=version)
    assert first.status_code == 200
    # A second tab still holding the old version must not overwrite the first exchange.
    second = _exchange(http, hdr, bill_id, [_line(a, 1)], expected_version=version)
    assert second.status_code == 409 and second.get_json()['code'] == 'BILL_CHANGED'
    assert _qty(a) == 19  # only one unit came back


def test_discount_changed_on_the_tab_is_applied(http, hdr, sample_client):
    a = _product(sample_client.client_id, 'Apple', 100)
    bill_id = _create_bill(http, hdr, [_line(a, 1)], cash=100)
    data = _exchange(http, hdr, bill_id, [_line(a, 1)], discount_percentage=10).get_json()
    assert data['new_total'] == 90 and data['refunded'] == 10
    neg = _exchange(http, hdr, bill_id, [_line(a, 1)], discount_percentage=10, negotiable_amount=25).get_json()
    assert neg['new_total'] == 75  # negotiated amount wins over %, like create


def test_exchange_ignores_customer_and_payment_type_fields(http, hdr, sample_client):
    """Exchange = items and money only; details belong to Edit (PATCH /details)."""
    a = _product(sample_client.client_id, 'Apple', 10)
    bill_id = _create_bill(http, hdr, [_line(a, 1)], cash=10)
    r = _exchange(http, hdr, bill_id, [_line(a, 1)], customer_name='someone else',
                  paid_splits=[{'payment_type': 'UPI', 'amount': 10}])
    bill = r.get_json()['bill']
    assert bill['customer_name'] == 'X'
    assert json.loads(bill['payment_type']) == [{'payment_type': 'Cash', 'amount': 10.0}]

