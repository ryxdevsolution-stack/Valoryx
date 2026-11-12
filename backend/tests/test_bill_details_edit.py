"""Bills → Edit (PATCH /api/billing/<id>/details): customer details + payment TYPE only.

Edit must never do what Exchange does — items, quantities, prices, totals, stock and
payment amounts stay exactly as they were.
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


def _create(http, hdr, lines, splits):
    body = {'customer_name': 'X', 'items': lines, 'payment_type': json.dumps(splits),
            'amount_received': sum(s['amount'] for s in splits), 'payment_status': 'paid'}
    r = http.post('/api/billing/create', data=json.dumps(body), content_type='application/json', headers=hdr)
    assert r.status_code == 201, r.get_json()
    return r.get_json()['bill_id']


def _edit(http, hdr, bill_id, **body):
    return http.patch(f'/api/billing/{bill_id}/details', data=json.dumps(body),
                      content_type='application/json', headers=hdr)


def _ledger(bill_id):
    from models.billing_model import BillPayment
    return sorted((r.payment_method, float(r.amount)) for r in BillPayment.query.filter_by(bill_id=bill_id).all())


def _qty(p):
    from extensions import db
    from models.stock_model import StockEntry
    db.session.expire_all()
    return StockEntry.query.get(p.product_id).quantity


def test_edit_customer_details(http, hdr, sample_client):
    a = _product(sample_client.client_id, 'Apple', 10)
    bill_id = _create(http, hdr, [_line(a, 1)], [{'payment_type': 'Cash', 'amount': 10}])
    r = _edit(http, hdr, bill_id, customer_name='ravi kumar', customer_phone=' 9876543210 ',
              customer_gstin='33abcde1234f1z5')
    assert r.status_code == 200, r.get_json()
    b = r.get_json()['bill']
    assert (b['customer_name'], b['customer_phone'], b['customer_gstin']) == ('Ravi Kumar', '9876543210', '33ABCDE1234F1Z5')


def test_edit_changes_payment_type_in_bill_and_ledger(http, hdr, sample_client):
    a = _product(sample_client.client_id, 'Apple', 10)
    bill_id = _create(http, hdr, [_line(a, 2)], [{'payment_type': 'Cash', 'amount': 20}])
    r = _edit(http, hdr, bill_id, paid_splits=[{'payment_type': 'UPI', 'amount': 20}])
    assert r.status_code == 200, r.get_json()
    assert json.loads(r.get_json()['bill']['payment_type']) == [{'payment_type': 'UPI', 'amount': 20.0}]
    assert _ledger(bill_id) == [('UPI', 20.0)]


def test_edit_split_payment_changes_only_the_chosen_method(http, hdr, sample_client):
    a = _product(sample_client.client_id, 'Apple', 10)
    bill_id = _create(http, hdr, [_line(a, 8)], [{'payment_type': 'Cash', 'amount': 50},
                                                  {'payment_type': 'UPI', 'amount': 30}])
    r = _edit(http, hdr, bill_id, paid_splits=[{'payment_type': 'Card', 'amount': 50},
                                               {'payment_type': 'UPI', 'amount': 30}])
    assert r.status_code == 200, r.get_json()
    assert _ledger(bill_id) == [('Card', 50.0), ('UPI', 30.0)]


def test_edit_cannot_change_payment_amounts(http, hdr, sample_client):
    a = _product(sample_client.client_id, 'Apple', 10)
    bill_id = _create(http, hdr, [_line(a, 2)], [{'payment_type': 'Cash', 'amount': 20}])
    r = _edit(http, hdr, bill_id, paid_splits=[{'payment_type': 'UPI', 'amount': 5}])
    assert r.status_code == 400 and 'amount' in r.get_json()['error']
    assert _ledger(bill_id) == [('Cash', 20.0)]


def test_edit_never_touches_items_totals_or_stock(http, hdr, sample_client):
    """Even if a client sends items/total fields, Edit ignores them — that's Exchange's job."""
    a, c = _product(sample_client.client_id, 'Apple', 10), _product(sample_client.client_id, 'Cake', 50)
    bill_id = _create(http, hdr, [_line(a, 2)], [{'payment_type': 'Cash', 'amount': 20}])
    before = http.get(f'/api/billing/{bill_id}', headers=hdr).get_json()['bill']
    stock_before = (_qty(a), _qty(c))
    r = _edit(http, hdr, bill_id, customer_name='y', items=[_line(c, 5)], final_items=[_line(c, 5)],
              total_amount=1, discount_percentage=50)
    assert r.status_code == 200, r.get_json()
    after = r.get_json()['bill']
    assert after['items'] == before['items']
    assert after['total_amount'] == before['total_amount']
    assert after['paid_amount'] == before['paid_amount']
    assert (_qty(a), _qty(c)) == stock_before


def test_edit_refused_for_stale_version(http, hdr, sample_client):
    a = _product(sample_client.client_id, 'Apple', 10)
    bill_id = _create(http, hdr, [_line(a, 1)], [{'payment_type': 'Cash', 'amount': 10}])
    version = http.get(f'/api/billing/{bill_id}?exchange=1', headers=hdr).get_json()['bill']['version']
    assert _edit(http, hdr, bill_id, customer_name='a', expected_version=version).status_code == 200
    stale = _edit(http, hdr, bill_id, customer_name='b', expected_version=version)
    assert stale.status_code == 409


def test_edit_needs_permission(http, sample_user, sample_client):
    a = _product(sample_client.client_id, 'Apple', 10)
    full = auth_hdr(make_token(sample_user.user_id, sample_client.client_id, permissions=PERMS))
    bill_id = _create(http, full, [_line(a, 1)], [{'payment_type': 'Cash', 'amount': 10}])
    no_perm = auth_hdr(make_token(sample_user.user_id, sample_client.client_id, permissions=['gst_billing']))
    from extensions import db
    from models.permission_model import UserPermission
    UserPermission.query.filter_by(user_id=sample_user.user_id).delete()
    db.session.commit()
    assert _edit(http, no_perm, bill_id, customer_name='z').status_code == 403
