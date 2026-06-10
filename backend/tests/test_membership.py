"""
test_membership.py — membership / loyalty card program backend tests.

Covers (per design spec section 10):
  - tier CRUD + owner-only permission denial
  - enroll free & paid
  - finalize transaction: earn / redeem / negotiate / upgrade
  - idempotency on double finalize
  - cancellation reversal
  - redeem > balance rejected
  - negotiate over budget blocked
  - lookup by phone / membership_number / barcode (all three keys)
  - expiry handling

HTTP tests use a dedicated app that registers the membership blueprint with the
in-memory SQLite schema (membership tables created via the v27 migration).
Service-layer tests exercise the atomic finalize/reversal logic directly.
"""
import uuid
import pytest
from datetime import timedelta

from extensions import db as _db
from conftest import make_token, auth_hdr, _bcrypt


# ═══════════════════════════════════════════════════════════════════════════════
# Membership-aware app + fixtures
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.fixture
def membership_app(app):
    """Ensure membership models + tables exist and the blueprint is registered.

    Idempotent: safe to call once per test (create_all + register only if absent).
    """
    with app.app_context():
        import models.customer_model            # noqa: F401
        import models.membership_tier_model     # noqa: F401
        import models.membership_card_model     # noqa: F401
        import models.membership_ledger_model   # noqa: F401
        _db.create_all()

        if 'membership' not in app.blueprints:
            from routes.membership import membership_bp
            app.register_blueprint(membership_bp, url_prefix='/api/membership')
    return app


@pytest.fixture
def http(membership_app):
    return membership_app.test_client()


@pytest.fixture
def owner_user(sample_client):
    from models.user_model import User
    uid = str(uuid.uuid4())
    u = User(
        user_id=uid,
        email=f"owner-{uid[:8]}@valoryx-test.invalid",
        password_hash=_bcrypt("OwnerPass123!"),
        client_id=sample_client.client_id,
        role="owner",
        is_active=True,
        is_super_admin=False,
        full_name="Owner User",
        invite_accepted=True,
        totp_enabled=False,
    )
    _db.session.add(u)
    _db.session.commit()
    return u


@pytest.fixture
def staff_user(sample_client):
    from models.user_model import User
    uid = str(uuid.uuid4())
    u = User(
        user_id=uid,
        email=f"staff-{uid[:8]}@valoryx-test.invalid",
        password_hash=_bcrypt("StaffPass123!"),
        client_id=sample_client.client_id,
        role="staff",
        is_active=True,
        is_super_admin=False,
        full_name="Staff User",
        invite_accepted=True,
        totp_enabled=False,
    )
    _db.session.add(u)
    _db.session.commit()
    return u


def _hdr(user, client):
    return auth_hdr(make_token(user.user_id, client.client_id))


@pytest.fixture
def sample_customer(sample_client):
    from models.customer_model import Customer
    cid = str(uuid.uuid4())
    c = Customer(
        customer_id=cid,
        client_id=sample_client.client_id,
        customer_code=101,
        customer_name="Jane Doe",
        customer_phone="9876500001",
    )
    _db.session.add(c)
    _db.session.commit()
    return c


def _make_tier(client_id, **kw):
    from models.membership_tier_model import MembershipTier
    t = MembershipTier(
        tier_id=str(uuid.uuid4()),
        client_id=client_id,
        name=kw.pop('name', 'Silver'),
        **kw,
    )
    _db.session.add(t)
    _db.session.commit()
    return t


def _make_card(client_id, customer_id, tier_id, **kw):
    from models.membership_card_model import MembershipCard
    card = MembershipCard(
        card_id=str(uuid.uuid4()),
        client_id=client_id,
        customer_id=customer_id,
        membership_number=kw.pop('membership_number', f"VLX-{uuid.uuid4().hex[:6].upper()}"),
        tier_id=tier_id,
        redeemable_points=kw.pop('redeemable_points', 0),
        lifetime_points=kw.pop('lifetime_points', 0),
        **kw,
    )
    _db.session.add(card)
    _db.session.commit()
    return card


# ═══════════════════════════════════════════════════════════════════════════════
# Migration v27 — table creation
# ═══════════════════════════════════════════════════════════════════════════════

def test_m027_creates_membership_tables(membership_app):
    from sqlalchemy import inspect
    with membership_app.app_context():
        tables = set(inspect(_db.engine).get_table_names())
        assert {'membership_tier', 'membership_card', 'membership_ledger'} <= tables


# ═══════════════════════════════════════════════════════════════════════════════
# Tier CRUD + owner-only permission denial
# ═══════════════════════════════════════════════════════════════════════════════

def test_owner_can_create_tier(http, owner_user, sample_client):
    r = http.post('/api/membership/tiers',
                  json={'name': 'Gold', 'discount_percentage': 10, 'points_per_100': 5},
                  headers=_hdr(owner_user, sample_client))
    assert r.status_code == 201
    body = r.get_json()
    assert body['success'] is True
    assert body['data']['name'] == 'Gold'
    assert body['data']['discount_percentage'] == 10
    # Unset benefits stay NULL (not offered)
    assert body['data']['redemption_rate'] is None


def test_staff_cannot_create_tier(http, staff_user, sample_client):
    r = http.post('/api/membership/tiers', json={'name': 'Gold'},
                  headers=_hdr(staff_user, sample_client))
    assert r.status_code == 403
    assert r.get_json()['success'] is False


def test_staff_cannot_update_or_delete_tier(http, owner_user, staff_user, sample_client):
    tier = _make_tier(sample_client.client_id, name='Bronze')
    r1 = http.put(f'/api/membership/tiers/{tier.tier_id}', json={'name': 'X'},
                  headers=_hdr(staff_user, sample_client))
    r2 = http.delete(f'/api/membership/tiers/{tier.tier_id}',
                     headers=_hdr(staff_user, sample_client))
    assert r1.status_code == 403
    assert r2.status_code == 403


def test_owner_update_and_soft_delete_tier(http, owner_user, sample_client):
    tier = _make_tier(sample_client.client_id, name='Bronze')
    r = http.put(f'/api/membership/tiers/{tier.tier_id}',
                 json={'name': 'Bronze+', 'redemption_rate': 0.1},
                 headers=_hdr(owner_user, sample_client))
    assert r.status_code == 200
    assert r.get_json()['data']['redemption_rate'] == 0.1

    r2 = http.delete(f'/api/membership/tiers/{tier.tier_id}',
                     headers=_hdr(owner_user, sample_client))
    assert r2.status_code == 200
    # Soft delete: still in DB, just inactive
    from models.membership_tier_model import MembershipTier
    refreshed = MembershipTier.query.get(tier.tier_id)
    assert refreshed.is_active is False


def test_list_tiers_excludes_inactive_by_default(http, owner_user, sample_client):
    _make_tier(sample_client.client_id, name='Active', is_active=True)
    _make_tier(sample_client.client_id, name='Dead', is_active=False)
    r = http.get('/api/membership/tiers', headers=_hdr(owner_user, sample_client))
    names = {t['name'] for t in r.get_json()['data']}
    assert 'Active' in names and 'Dead' not in names


def test_create_tier_requires_name(http, owner_user, sample_client):
    r = http.post('/api/membership/tiers', json={'discount_percentage': 5},
                  headers=_hdr(owner_user, sample_client))
    assert r.status_code == 400


# ═══════════════════════════════════════════════════════════════════════════════
# Enroll — free & paid
# ═══════════════════════════════════════════════════════════════════════════════

def test_enroll_free_tier(http, owner_user, sample_client, sample_customer):
    tier = _make_tier(sample_client.client_id, name='Free', points_per_100=2)
    r = http.post('/api/membership/cards',
                  json={'customer_id': sample_customer.customer_id, 'tier_id': tier.tier_id},
                  headers=_hdr(owner_user, sample_client))
    assert r.status_code == 201
    data = r.get_json()['data']
    assert data['membership_number'].startswith('FRE-')   # tier-wise prefix (Free)
    assert data['expires_at'] is None  # no validity_days → never expires

    # Enroll ledger row written with zero fee
    from models.membership_ledger_model import MembershipLedger, EVENT_ENROLL
    row = MembershipLedger.query.filter_by(card_id=data['card_id'], event_type=EVENT_ENROLL).first()
    assert row is not None
    assert float(row.amount_delta) == 0.0


def test_enroll_paid_tier_sets_fee_and_expiry(http, owner_user, sample_client, sample_customer):
    tier = _make_tier(sample_client.client_id, name='Paid', enrollment_fee=500, validity_days=365)
    r = http.post('/api/membership/cards',
                  json={'customer_id': sample_customer.customer_id, 'tier_id': tier.tier_id},
                  headers=_hdr(owner_user, sample_client))
    assert r.status_code == 201
    data = r.get_json()['data']
    assert data['expires_at'] is not None

    from models.membership_ledger_model import MembershipLedger, EVENT_ENROLL
    row = MembershipLedger.query.filter_by(card_id=data['card_id'], event_type=EVENT_ENROLL).first()
    assert float(row.amount_delta) == 500.0


def test_staff_can_enroll_at_counter(http, staff_user, sample_client, sample_customer):
    """Cashier (staff) enrollment at the billing counter is the primary flow."""
    tier = _make_tier(sample_client.client_id, name='Free')
    r = http.post('/api/membership/cards',
                  json={'customer_id': sample_customer.customer_id, 'tier_id': tier.tier_id},
                  headers=_hdr(staff_user, sample_client))
    assert r.status_code == 201


def test_enroll_by_phone_creates_new_customer(http, staff_user, sample_client):
    """Counter enrollment with phone + name auto-creates the customer record."""
    from models.customer_model import Customer
    tier = _make_tier(sample_client.client_id, name='Walkup', discount_percentage=5)
    r = http.post('/api/membership/cards',
                  json={'customer_phone': '9876501234', 'customer_name': 'new walkin member',
                        'tier_id': tier.tier_id},
                  headers=_hdr(staff_user, sample_client))
    assert r.status_code == 201
    data = r.get_json()['data']
    assert data['membership_number'].startswith('WAL-')   # tier-wise prefix (Walkup)
    assert data['tier']['name'] == 'Walkup'          # enriched response for direct attach
    cust = Customer.query.filter_by(client_id=sample_client.client_id,
                                    customer_phone='9876501234').first()
    assert cust is not None and cust.customer_name == 'New Walkin Member'


def test_enroll_by_phone_requires_name_for_new_customer(http, staff_user, sample_client):
    tier = _make_tier(sample_client.client_id, name='T')
    r = http.post('/api/membership/cards',
                  json={'customer_phone': '9876509999', 'tier_id': tier.tier_id},
                  headers=_hdr(staff_user, sample_client))
    assert r.status_code == 400


def test_enroll_duplicate_blocked(http, owner_user, sample_client, sample_customer):
    tier = _make_tier(sample_client.client_id, name='Free')
    payload = {'customer_id': sample_customer.customer_id, 'tier_id': tier.tier_id}
    h = _hdr(owner_user, sample_client)
    assert http.post('/api/membership/cards', json=payload, headers=h).status_code == 201
    r2 = http.post('/api/membership/cards', json=payload, headers=h)
    assert r2.status_code == 409


# ═══════════════════════════════════════════════════════════════════════════════
# Finalize transaction — earn / redeem / negotiate / upgrade (service layer)
# ═══════════════════════════════════════════════════════════════════════════════

def test_finalize_earns_points(membership_app, sample_client, sample_customer):
    import services.membership_service as svc
    with membership_app.app_context():
        tier = _make_tier(sample_client.client_id, name='Earn', points_per_100=5)
        card = _make_card(sample_client.client_id, sample_customer.customer_id, tier.tier_id)
        bid = str(uuid.uuid4())
        # 1050 / 100 = floor 10 * 5 = 50 points
        summary = svc.commit_bill_ledger(sample_client.client_id, card, bid, 1050)
        _db.session.commit()
        assert summary['earned'] == 50
        assert card.redeemable_points == 50
        assert card.lifetime_points == 50


def test_finalize_redeem_points(membership_app, sample_client, sample_customer):
    import services.membership_service as svc
    with membership_app.app_context():
        tier = _make_tier(sample_client.client_id, name='Redeem', points_per_100=0, redemption_rate=0.5)
        card = _make_card(sample_client.client_id, sample_customer.customer_id, tier.tier_id,
                          redeemable_points=100)
        bid = str(uuid.uuid4())
        summary = svc.commit_bill_ledger(sample_client.client_id, card, bid, 500, redeem_points=40)
        _db.session.commit()
        assert summary['redeemed_points'] == 40
        assert summary['redeemed_amount'] == 20.0  # 40 * 0.5
        assert card.redeemable_points == 60


def test_redeem_more_than_balance_rejected(membership_app, sample_client, sample_customer):
    import services.membership_service as svc
    from services.membership_service import MembershipError
    with membership_app.app_context():
        tier = _make_tier(sample_client.client_id, name='R', redemption_rate=0.5)
        card = _make_card(sample_client.client_id, sample_customer.customer_id, tier.tier_id,
                          redeemable_points=10)
        with pytest.raises(MembershipError):
            svc.commit_bill_ledger(sample_client.client_id, card, str(uuid.uuid4()), 500, redeem_points=50)


def test_negotiate_within_budget(membership_app, sample_client, sample_customer):
    import services.membership_service as svc
    with membership_app.app_context():
        tier = _make_tier(sample_client.client_id, name='Neg', monthly_negotiable_budget=1000)
        card = _make_card(sample_client.client_id, sample_customer.customer_id, tier.tier_id)
        summary = svc.commit_bill_ledger(sample_client.client_id, card, str(uuid.uuid4()),
                                         500, negotiate_amount=300)
        _db.session.commit()
        assert summary['negotiated'] == 300
        remaining = svc.get_remaining_monthly_budget(card, tier)
        assert remaining == 700


def test_negotiate_over_budget_blocked(membership_app, sample_client, sample_customer):
    import services.membership_service as svc
    from services.membership_service import MembershipError
    with membership_app.app_context():
        tier = _make_tier(sample_client.client_id, name='Neg', monthly_negotiable_budget=200)
        card = _make_card(sample_client.client_id, sample_customer.customer_id, tier.tier_id)
        with pytest.raises(MembershipError):
            svc.commit_bill_ledger(sample_client.client_id, card, str(uuid.uuid4()),
                                   500, negotiate_amount=300)


def test_auto_upgrade_loop(membership_app, sample_client, sample_customer):
    import services.membership_service as svc
    with membership_app.app_context():
        cid = sample_client.client_id
        gold = _make_tier(cid, name='Gold', points_per_100=10)
        silver = _make_tier(cid, name='Silver', points_per_100=10,
                            upgrade_threshold_points=100, upgrade_to_tier_id=gold.tier_id)
        bronze = _make_tier(cid, name='Bronze', points_per_100=10,
                            upgrade_threshold_points=50, upgrade_to_tier_id=silver.tier_id)
        card = _make_card(cid, sample_customer.customer_id, bronze.tier_id)
        # Spend 1500 → floor(1500/100)*10 = 150 lifetime points.
        # Crosses bronze(50) → silver(100) → gold in a single bill.
        summary = svc.commit_bill_ledger(cid, card, str(uuid.uuid4()), 1500)
        _db.session.commit()
        assert summary['upgraded'] is True
        assert card.tier_id == gold.tier_id
        assert card.lifetime_points == 150


# ═══════════════════════════════════════════════════════════════════════════════
# Idempotency on double finalize
# ═══════════════════════════════════════════════════════════════════════════════

def test_double_finalize_is_idempotent(membership_app, sample_client, sample_customer):
    import services.membership_service as svc
    with membership_app.app_context():
        tier = _make_tier(sample_client.client_id, name='Idem', points_per_100=5)
        card = _make_card(sample_client.client_id, sample_customer.customer_id, tier.tier_id)
        bid = str(uuid.uuid4())
        svc.commit_bill_ledger(sample_client.client_id, card, bid, 1000)
        _db.session.commit()
        first = card.redeemable_points
        # Repeat finalize for SAME bill_id is a no-op
        summary2 = svc.commit_bill_ledger(sample_client.client_id, card, bid, 1000)
        _db.session.commit()
        assert summary2.get('idempotent_skip') is True
        assert card.redeemable_points == first


# ═══════════════════════════════════════════════════════════════════════════════
# Cancellation reversal
# ═══════════════════════════════════════════════════════════════════════════════

def test_cancellation_reversal(membership_app, sample_client, sample_customer):
    import services.membership_service as svc
    with membership_app.app_context():
        tier = _make_tier(sample_client.client_id, name='Rev', points_per_100=5, redemption_rate=0.5)
        card = _make_card(sample_client.client_id, sample_customer.customer_id, tier.tier_id,
                          redeemable_points=100)
        bid = str(uuid.uuid4())
        # Earn 50 (1000/100*5), redeem 20 points.
        svc.commit_bill_ledger(sample_client.client_id, card, bid, 1000, redeem_points=20)
        _db.session.commit()
        # 100 - 20 redeemed + 50 earned = 130
        assert card.redeemable_points == 130
        assert card.lifetime_points == 50

        svc.reverse_bill_ledger(sample_client.client_id, card, bid)
        _db.session.commit()
        # Earned 50 clawed back, 20 redeemed restored → 130 - 50 + 20 = 100
        assert card.redeemable_points == 100
        assert card.lifetime_points == 0


def test_cancellation_reversal_idempotent(membership_app, sample_client, sample_customer):
    import services.membership_service as svc
    with membership_app.app_context():
        tier = _make_tier(sample_client.client_id, name='Rev2', points_per_100=5)
        card = _make_card(sample_client.client_id, sample_customer.customer_id, tier.tier_id)
        bid = str(uuid.uuid4())
        svc.commit_bill_ledger(sample_client.client_id, card, bid, 1000)
        _db.session.commit()
        svc.reverse_bill_ledger(sample_client.client_id, card, bid)
        _db.session.commit()
        pts = card.redeemable_points
        r2 = svc.reverse_bill_ledger(sample_client.client_id, card, bid)
        _db.session.commit()
        assert r2.get('idempotent_skip') is True
        assert card.redeemable_points == pts


# ═══════════════════════════════════════════════════════════════════════════════
# Lookup by all three keys
# ═══════════════════════════════════════════════════════════════════════════════

def test_lookup_by_phone(http, owner_user, sample_client, sample_customer):
    tier = _make_tier(sample_client.client_id, name='L', redemption_rate=0.1)
    card = _make_card(sample_client.client_id, sample_customer.customer_id, tier.tier_id,
                      redeemable_points=100)
    r = http.get(f'/api/membership/cards/lookup?q={sample_customer.customer_phone}',
                 headers=_hdr(owner_user, sample_client))
    assert r.status_code == 200
    data = r.get_json()['data']
    assert data is not None
    assert data['card']['card_id'] == str(card.card_id)
    assert data['redeemable_value'] == 10.0  # 100 * 0.1


def test_lookup_by_membership_number(http, owner_user, sample_client, sample_customer):
    tier = _make_tier(sample_client.client_id, name='L')
    card = _make_card(sample_client.client_id, sample_customer.customer_id, tier.tier_id,
                      membership_number='VLX-000777')
    r = http.get('/api/membership/cards/lookup?q=VLX-000777',
                 headers=_hdr(owner_user, sample_client))
    assert r.get_json()['data']['card']['card_id'] == str(card.card_id)


def test_lookup_by_barcode_payload(http, owner_user, sample_client, sample_customer):
    # Barcode payload == membership_number (one identifier, three entry paths).
    tier = _make_tier(sample_client.client_id, name='L')
    card = _make_card(sample_client.client_id, sample_customer.customer_id, tier.tier_id,
                      membership_number='VLX-000888')
    r = http.get('/api/membership/cards/lookup?q=VLX-000888',
                 headers=_hdr(owner_user, sample_client))
    assert r.get_json()['data']['card']['card_id'] == str(card.card_id)


def test_lookup_no_match_returns_null(http, owner_user, sample_client):
    r = http.get('/api/membership/cards/lookup?q=9999999999',
                 headers=_hdr(owner_user, sample_client))
    assert r.status_code == 200
    assert r.get_json()['data'] is None


# ═══════════════════════════════════════════════════════════════════════════════
# Expiry handling
# ═══════════════════════════════════════════════════════════════════════════════

def test_expired_card_suspends_benefits(membership_app, sample_client, sample_customer):
    import services.membership_service as svc
    from models.membership_card_model import get_current_time
    with membership_app.app_context():
        tier = _make_tier(sample_client.client_id, name='Exp', points_per_100=5, validity_days=30)
        card = _make_card(sample_client.client_id, sample_customer.customer_id, tier.tier_id,
                          expires_at=get_current_time() - timedelta(days=1))
        # Card past expiry → earns nothing
        summary = svc.commit_bill_ledger(sample_client.client_id, card, str(uuid.uuid4()), 1000)
        _db.session.commit()
        assert summary['earned'] == 0
        assert card.redeemable_points == 0


def test_lookup_flips_expired_status(http, owner_user, sample_client, sample_customer):
    from models.membership_card_model import get_current_time, STATUS_EXPIRED
    tier = _make_tier(sample_client.client_id, name='Exp')
    card = _make_card(sample_client.client_id, sample_customer.customer_id, tier.tier_id,
                      membership_number='VLX-000999',
                      expires_at=get_current_time() - timedelta(days=1))
    r = http.get('/api/membership/cards/lookup?q=VLX-000999',
                 headers=_hdr(owner_user, sample_client))
    assert r.status_code == 200
    assert r.get_json()['data']['card']['status'] == STATUS_EXPIRED


# ═══════════════════════════════════════════════════════════════════════════════
# Adjust (owner-only)
# ═══════════════════════════════════════════════════════════════════════════════

def test_owner_adjust_points(http, owner_user, sample_client, sample_customer):
    tier = _make_tier(sample_client.client_id, name='Adj')
    card = _make_card(sample_client.client_id, sample_customer.customer_id, tier.tier_id,
                      redeemable_points=10)
    r = http.post(f'/api/membership/cards/{card.card_id}/adjust',
                  json={'points_delta': 25, 'note': 'goodwill'},
                  headers=_hdr(owner_user, sample_client))
    assert r.status_code == 200
    assert r.get_json()['data']['redeemable_points'] == 35


def test_staff_cannot_adjust(http, staff_user, sample_client, sample_customer):
    tier = _make_tier(sample_client.client_id, name='Adj')
    card = _make_card(sample_client.client_id, sample_customer.customer_id, tier.tier_id)
    r = http.post(f'/api/membership/cards/{card.card_id}/adjust',
                  json={'points_delta': 25},
                  headers=_hdr(staff_user, sample_client))
    assert r.status_code == 403


def test_adjust_below_zero_rejected(http, owner_user, sample_client, sample_customer):
    tier = _make_tier(sample_client.client_id, name='Adj')
    card = _make_card(sample_client.client_id, sample_customer.customer_id, tier.tier_id,
                      redeemable_points=10)
    r = http.post(f'/api/membership/cards/{card.card_id}/adjust',
                  json={'points_delta': -50},
                  headers=_hdr(owner_user, sample_client))
    assert r.status_code == 400


# ═══════════════════════════════════════════════════════════════════════════════
# Response-shape contract (frontend ↔ backend) + reporting
# ═══════════════════════════════════════════════════════════════════════════════

def test_list_cards_returns_paginated_shape(http, owner_user, sample_client, sample_customer):
    """Frontend MembersList reads res.data.data.cards — list must wrap, not return a bare array."""
    tier = _make_tier(sample_client.client_id, name='Silver')
    _make_card(sample_client.client_id, sample_customer.customer_id, tier.tier_id)
    r = http.get('/api/membership/cards', headers=_hdr(owner_user, sample_client))
    assert r.status_code == 200
    data = r.get_json()['data']
    assert isinstance(data['cards'], list)
    assert data['total'] == 1
    assert data['page'] == 1 and 'per_page' in data
    # Cards are enriched with the customer name for display.
    assert data['cards'][0]['customer_name'] == sample_customer.customer_name


def test_list_cards_search_by_membership_number(http, owner_user, sample_client, sample_customer):
    tier = _make_tier(sample_client.client_id, name='Silver')
    _make_card(sample_client.client_id, sample_customer.customer_id, tier.tier_id,
               membership_number='VLX-SEARCH1')
    r = http.get('/api/membership/cards?search=VLX-SEARCH1',
                 headers=_hdr(owner_user, sample_client))
    assert r.status_code == 200
    cards = r.get_json()['data']['cards']
    assert len(cards) == 1 and cards[0]['membership_number'] == 'VLX-SEARCH1'


def test_get_card_returns_card_detail_shape(http, owner_user, sample_client, sample_customer):
    """getCard must match the frontend CardDetail: embedded tier + next_tier + period stats."""
    gold = _make_tier(sample_client.client_id, name='Gold', redemption_rate=0.1)
    silver = _make_tier(sample_client.client_id, name='Silver',
                        upgrade_threshold_points=1000, upgrade_to_tier_id=gold.tier_id)
    card = _make_card(sample_client.client_id, sample_customer.customer_id, silver.tier_id,
                      redeemable_points=100, lifetime_points=200)
    r = http.get(f'/api/membership/cards/{card.card_id}',
                 headers=_hdr(owner_user, sample_client))
    assert r.status_code == 200
    data = r.get_json()['data']
    assert data['card']['tier']['name'] == 'Silver'          # embedded current tier
    assert data['card']['customer_name'] == sample_customer.customer_name
    assert data['next_tier']['name'] == 'Gold'               # resolved upgrade target
    assert set(data['this_month']) >= {'spend', 'points_earned', 'points_redeemed', 'negotiable_used'}
    assert 'this_year' in data and 'ledger' in data
    assert 'monthly_negotiable_remaining' in data


def test_report_shape_and_aggregates(http, owner_user, sample_client, sample_customer):
    tier = _make_tier(sample_client.client_id, name='Gold', redemption_rate=0.1)
    _make_card(sample_client.client_id, sample_customer.customer_id, tier.tier_id,
               redeemable_points=500)
    r = http.get('/api/membership/report', headers=_hdr(owner_user, sample_client))
    assert r.status_code == 200
    data = r.get_json()['data']
    assert data['total_active_members'] == 1
    assert data['outstanding_points_liability'] == 50.0       # 500 × 0.1
    assert any(t['tier_name'] == 'Gold' and t['member_count'] == 1
               for t in data['members_per_tier'])
    assert data['upgrades_this_month'] == 0
    assert isinstance(data['top_members'], list)


# ═══════════════════════════════════════════════════════════════════════════════
# Redemption reduces the current bill (server-authoritative ₹ value)
# ═══════════════════════════════════════════════════════════════════════════════

def test_membership_redeem_value_helper(membership_app, sample_client, sample_customer):
    """routes.billing._membership_redeem_value computes points × tier rate, server-side."""
    from routes.billing import _membership_redeem_value
    with membership_app.app_context():
        tier = _make_tier(sample_client.client_id, name='Gold', redemption_rate=0.1)
        card = _make_card(sample_client.client_id, sample_customer.customer_id, tier.tier_id,
                          redeemable_points=500)
        cid = sample_client.client_id
        # 300 points × 0.1 = ₹30
        assert _membership_redeem_value(cid, {
            'membership_card_id': card.card_id, 'membership_redeem_points': 300,
        }) == 30.0
        # No card → 0
        assert _membership_redeem_value(cid, {'membership_redeem_points': 100}) == 0.0
        # No redemption points → 0
        assert _membership_redeem_value(cid, {'membership_card_id': card.card_id}) == 0.0


def test_membership_redeem_value_zero_when_tier_has_no_rate(membership_app, sample_client, sample_customer):
    from routes.billing import _membership_redeem_value
    with membership_app.app_context():
        tier = _make_tier(sample_client.client_id, name='Basic')  # no redemption_rate
        card = _make_card(sample_client.client_id, sample_customer.customer_id, tier.tier_id,
                          redeemable_points=500)
        assert _membership_redeem_value(sample_client.client_id, {
            'membership_card_id': card.card_id, 'membership_redeem_points': 100,
        }) == 0.0


# ═══════════════════════════════════════════════════════════════════════════════
# Code-review follow-ups: negotiate-no-budget, earn-on-gross, value validation
# ═══════════════════════════════════════════════════════════════════════════════

def test_negotiate_no_budget_does_not_fail_the_sale(membership_app, sample_client, sample_customer):
    """A manual negotiation on a member whose tier has NO budget must not raise."""
    import services.membership_service as svc
    from models.membership_ledger_model import MembershipLedger, EVENT_NEGOTIATE
    with membership_app.app_context():
        tier = _make_tier(sample_client.client_id, name='NoBudget', points_per_100=1)
        card = _make_card(sample_client.client_id, sample_customer.customer_id, tier.tier_id)
        bid = str(uuid.uuid4())
        # Should NOT raise, and should NOT write a negotiate ledger row.
        svc.commit_bill_ledger(sample_client.client_id, card, bid, 500, negotiate_amount=100)
        _db.session.commit()
        assert MembershipLedger.query.filter_by(card_id=card.card_id, event_type=EVENT_NEGOTIATE).count() == 0


def test_earn_on_gross_when_redeeming(membership_app, sample_client, sample_customer):
    """Earn base is the gross spend (earn_base), not the post-redemption amount."""
    import services.membership_service as svc
    with membership_app.app_context():
        tier = _make_tier(sample_client.client_id, name='EarnGross', points_per_100=10, redemption_rate=1.0)
        card = _make_card(sample_client.client_id, sample_customer.customer_id, tier.tier_id,
                          redeemable_points=100)
        bid = str(uuid.uuid4())
        # Gross 1000 → 10 * 10 = 100 pts earned, even though they redeem 50 (paying 950).
        summary = svc.commit_bill_ledger(
            sample_client.client_id, card, bid, 950, redeem_points=50, earn_base=1000,
        )
        _db.session.commit()
        assert summary['earned'] == 100  # earned on 1000, not 950


def test_create_tier_rejects_negative_redemption_rate(http, owner_user, sample_client):
    r = http.post('/api/membership/tiers',
                  json={'name': 'Bad', 'redemption_rate': -1},
                  headers=_hdr(owner_user, sample_client))
    assert r.status_code == 400
    assert 'redemption_rate' in r.get_json()['error']


def test_create_tier_rejects_discount_over_100(http, owner_user, sample_client):
    r = http.post('/api/membership/tiers',
                  json={'name': 'Bad2', 'discount_percentage': 150},
                  headers=_hdr(owner_user, sample_client))
    assert r.status_code == 400


def test_membership_number_is_tier_prefixed_3_digits(http, owner_user, sample_client, sample_customer):
    """Card numbers are tier-prefixed + 3-digit zero-padded, e.g. Gold → GOL-001."""
    import re as _re
    tier = _make_tier(sample_client.client_id, name='Gold')
    r = http.post('/api/membership/cards',
                  json={'customer_id': sample_customer.customer_id, 'tier_id': tier.tier_id},
                  headers=_hdr(owner_user, sample_client))
    assert r.status_code == 201
    number = r.get_json()['data']['membership_number']
    assert _re.fullmatch(r'GOL-\d{3}', number), number


def test_enroll_rejects_garbled_phone(http, staff_user, sample_client):
    tier = _make_tier(sample_client.client_id, name='P')
    r = http.post('/api/membership/cards',
                  json={'customer_phone': '99999001119999900111', 'customer_name': 'X',
                        'tier_id': tier.tier_id},
                  headers=_hdr(staff_user, sample_client))
    assert r.status_code == 400


def test_yearly_budget_counts_usage_across_months(membership_app, sample_client, sample_customer):
    """negotiable_budget_period='yearly' sums negotiate usage over the calendar
    year — a spend from an earlier month still reduces the remaining budget."""
    import services.membership_service as svc
    from models.membership_ledger_model import MembershipLedger, EVENT_NEGOTIATE
    with membership_app.app_context():
        tier = _make_tier(sample_client.client_id, name='Annual',
                          monthly_negotiable_budget=1000, negotiable_budget_period='yearly')
        card = _make_card(sample_client.client_id, sample_customer.customer_id, tier.tier_id)

        # Simulate a negotiation that happened in an earlier month of this year.
        from services.membership_service import get_current_time
        now = get_current_time()
        earlier = now.replace(month=1, day=15)  # January this year
        row = MembershipLedger(
            ledger_id=str(uuid.uuid4()), client_id=sample_client.client_id,
            card_id=card.card_id, event_type=EVENT_NEGOTIATE,
            points_delta=0, amount_delta=-300, created_at=earlier,
        )
        _db.session.add(row)
        _db.session.commit()

        remaining = svc.get_remaining_monthly_budget(card, tier)
        assert remaining == 700  # yearly window includes January's ₹300

        # A monthly tier would NOT count January's usage (unless we're in January).
        tier.negotiable_budget_period = 'monthly'
        _db.session.commit()
        remaining_monthly = svc.get_remaining_monthly_budget(card, tier)
        expected = 700 if now.month == 1 else 1000
        assert remaining_monthly == expected
