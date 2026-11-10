"""Shop-wide Create Bill visibility switches (migration v50).

- Default: both switches read as shown (True), including NULL / pre-v50 rows.
- PUT /api/shop-settings accepts real booleans only and persists False.
- /api/billing/create rejects a membership card when the shop has membership off.
"""
import json
import uuid

from conftest import make_token, auth_hdr


def _hdr(user, client, perms):
    return auth_hdr(make_token(user.user_id, client.client_id, permissions=perms))


SETTINGS_PERMS = ['view_shop_settings', 'edit_shop_settings']


def test_bill_field_flags_default_to_shown():
    from models.client_model import bill_field_flags

    class Legacy:  # pre-v50 row: attributes missing entirely
        pass

    class Nulls:
        bill_show_gst = None
        bill_show_membership = None

    assert bill_field_flags(Legacy()) == {'bill_show_gst': True, 'bill_show_membership': True}
    assert bill_field_flags(Nulls()) == {'bill_show_gst': True, 'bill_show_membership': True}


def test_get_shop_settings_includes_switches(http, sample_user, sample_client):
    resp = http.get('/api/shop-settings', headers=_hdr(sample_user, sample_client, SETTINGS_PERMS))
    assert resp.status_code == 200, resp.get_json()
    data = resp.get_json()['data']
    assert data['bill_show_gst'] is True
    assert data['bill_show_membership'] is True


def test_put_shop_settings_persists_false(http, sample_user, sample_client):
    hdr = _hdr(sample_user, sample_client, SETTINGS_PERMS)
    resp = http.put('/api/shop-settings', data=json.dumps({
        'bill_show_gst': False, 'bill_show_membership': False,
    }), content_type='application/json', headers=hdr)
    assert resp.status_code == 200, resp.get_json()
    assert resp.get_json()['data']['bill_show_membership'] is False

    data = http.get('/api/shop-settings', headers=hdr).get_json()['data']
    assert data['bill_show_gst'] is False
    assert data['bill_show_membership'] is False


def test_put_shop_settings_rejects_non_boolean(http, sample_user, sample_client):
    resp = http.put('/api/shop-settings', data=json.dumps({'bill_show_membership': 'no'}),
                    content_type='application/json',
                    headers=_hdr(sample_user, sample_client, SETTINGS_PERMS))
    assert resp.status_code == 400


def test_bill_with_card_rejected_when_shop_membership_off(http, sample_stock, sample_user, sample_client):
    from extensions import db
    sample_client.bill_show_membership = False
    db.session.commit()

    body = {
        'customer_name': 'X',
        'items': [{'product_id': str(sample_stock.product_id), 'product_name': 'Widget', 'quantity': 1,
                   'rate': 100.0, 'gst_percentage': 0, 'gst_amount': 0, 'amount': 100.0,
                   'item_code': 'WDG-001', 'unit': 'pcs'}],
        'payment_type': json.dumps([{'payment_type': 'Cash', 'amount': 100.0}]),
        'amount_received': 100.0,
        'payment_status': 'paid',
        'membership_card_id': str(uuid.uuid4()),
    }
    resp = http.post('/api/billing/create', data=json.dumps(body), content_type='application/json',
                     headers=_hdr(sample_user, sample_client, ['gst_billing', 'non_gst_billing', 'use_membership']))
    assert resp.status_code == 400
    assert 'turned off' in resp.get_json()['error']


def test_shop_gst_off_forces_non_gst_bill(http, sample_stock, sample_user, sample_client):
    """GST on Create Bill off: a GST-rated item is billed at 0% as a non-GST bill."""
    from extensions import db
    sample_client.bill_show_gst = False
    db.session.commit()

    body = {
        'customer_name': 'X',
        'items': [{'product_id': str(sample_stock.product_id), 'product_name': 'Widget', 'quantity': 1,
                   'rate': 100.0, 'gst_percentage': 18, 'gst_amount': 18, 'amount': 118.0,
                   'item_code': 'WDG-001', 'unit': 'pcs'}],
        'payment_type': json.dumps([{'payment_type': 'Cash', 'amount': 100.0}]),
        'amount_received': 100.0,
        'payment_status': 'paid',
    }
    resp = http.post('/api/billing/create', data=json.dumps(body), content_type='application/json',
                     headers=_hdr(sample_user, sample_client, ['gst_billing', 'non_gst_billing']))
    assert resp.status_code in (200, 201), resp.get_json()
    data = resp.get_json()
    assert data['bill_type'] == 'Non-GST'
    assert data['bill']['gst_amount'] == 0
    assert data['total_amount'] == 100.0


def test_next_number_preview_matches_the_sequence_used(http, sample_stock, sample_user, sample_client):
    """GST and non-GST bills are numbered separately; the preview must match the saved number."""
    hdr = _hdr(sample_user, sample_client, ['gst_billing', 'non_gst_billing'])
    body = {
        'customer_name': 'X',
        'items': [{'product_id': str(sample_stock.product_id), 'product_name': 'Widget', 'quantity': 1,
                   'rate': 100.0, 'gst_percentage': 0, 'gst_amount': 0, 'amount': 100.0,
                   'item_code': 'WDG-001', 'unit': 'pcs'}],
        'payment_type': json.dumps([{'payment_type': 'Cash', 'amount': 100.0}]),
        'amount_received': 100.0,
        'payment_status': 'paid',
    }
    preview = http.get('/api/billing/next-number', headers=hdr).get_json()
    saved = http.post('/api/billing/create', data=json.dumps(body), content_type='application/json',
                      headers=hdr).get_json()
    assert saved['bill_type'] == 'Non-GST'
    assert saved['bill_number'] == preview['next_non_gst_bill_number']

    # The cached preview must not survive the save.
    after = http.get('/api/billing/next-number', headers=hdr).get_json()
    assert after['next_non_gst_bill_number'] == saved['bill_number'] + 1
    assert 'next_bill_number' in after  # legacy field for older desktop builds
