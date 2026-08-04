"""
Tests for admin plan visibility — GET /subscription/admin/plans and
PATCH /subscription/admin/plans/<plan_id>.

Context: the customer-facing pricing pages render whatever GET /subscription/plans
returns, which is every plan with is_active=True. Showing a single plan therefore
means hiding the others, and "hiding" must be reversible: the row, its Razorpay
plan IDs and every payment_transaction FK pointing at it have to survive.
"""
import uuid
import bcrypt
import pytest

from conftest import make_token, auth_hdr


# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture
def super_admin_headers(sample_client):
    from extensions import db
    from models.user_model import User

    with db.session.no_autoflush:
        sa = User(
            user_id=str(uuid.uuid4()),
            client_id=sample_client.client_id,
            email=f'sa-{uuid.uuid4().hex[:8]}@valoryx-test.invalid',
            password_hash=bcrypt.hashpw(b'x', bcrypt.gensalt()).decode(),
            full_name='Super Admin',
            role='owner',
            is_super_admin=True,
            is_active=True,
            invite_accepted=True,
            totp_enabled=False,
        )
        db.session.add(sa)
        db.session.commit()

    return auth_hdr(make_token(
        sa.user_id, sample_client.client_id, permissions=[], is_super_admin=True,
    ))


@pytest.fixture
def owner_headers(sample_user, sample_client):
    """A normal (non-super-admin) authenticated owner."""
    return auth_hdr(make_token(
        sample_user.user_id, sample_client.client_id, permissions=[], is_super_admin=False,
    ))


def _make_plan(name, monthly, *, currency='INR', is_active=True, order=1):
    from extensions import db
    from models.subscription_model import SubscriptionPlan

    plan = SubscriptionPlan(
        plan_id=str(uuid.uuid4()),
        name=name,
        description=f'{name} plan',
        currency=currency,
        monthly_price=monthly,
        yearly_price=monthly * 10,
        features=['Billing'],
        limits={'users': 3, 'bills_per_month': 100},
        is_popular=False,
        is_active=is_active,
        display_order=order,
        razorpay_monthly_plan_id=f'plan_{uuid.uuid4().hex[:12]}',
        razorpay_yearly_plan_id=f'plan_{uuid.uuid4().hex[:12]}',
    )
    db.session.add(plan)
    db.session.commit()
    return plan


@pytest.fixture
def three_plans():
    """Starter / Professional / the ₹1500 plan — all visible to begin with."""
    return {
        'starter': _make_plan('Starter', 99900, order=1),
        'professional': _make_plan('Professional', 249900, order=2),
        'fifteen_hundred': _make_plan('Business', 150000, order=3),
    }


# ── GET /admin/plans ─────────────────────────────────────────────────────────

def test_admin_list_includes_hidden_plans(http, super_admin_headers, three_plans):
    """The admin view must keep showing hidden plans — otherwise a hidden plan
    disappears from the only UI that could bring it back."""
    hidden = three_plans['starter']
    http.patch(f'/api/subscription/admin/plans/{hidden.plan_id}',
               json={'is_active': False}, headers=super_admin_headers)

    resp = http.get('/api/subscription/admin/plans', headers=super_admin_headers)
    assert resp.status_code == 200

    returned = {p['name']: p for p in resp.get_json()['plans']}
    assert 'Starter' in returned
    assert returned['Starter']['is_active'] is False
    assert returned['Business']['is_active'] is True


def test_admin_list_rejects_non_super_admin(http, owner_headers, three_plans):
    resp = http.get('/api/subscription/admin/plans', headers=owner_headers)
    assert resp.status_code == 403


def test_admin_list_rejects_anonymous(http, three_plans):
    resp = http.get('/api/subscription/admin/plans')
    assert resp.status_code == 401


# ── PATCH /admin/plans/<id> ──────────────────────────────────────────────────

def test_hiding_plans_leaves_one_on_public_endpoint(http, super_admin_headers, three_plans):
    """The actual goal: customers see only the ₹1500 plan."""
    for key in ('starter', 'professional'):
        resp = http.patch(f'/api/subscription/admin/plans/{three_plans[key].plan_id}',
                          json={'is_active': False}, headers=super_admin_headers)
        assert resp.status_code == 200
        assert resp.get_json()['plan']['is_active'] is False

    public = http.get('/api/subscription/plans?currency=INR')
    assert public.status_code == 200
    plans = public.get_json()['plans']
    assert len(plans) == 1
    assert plans[0]['name'] == 'Business'
    assert plans[0]['monthly_price'] == 150000


def test_hide_does_not_delete_the_row(http, super_admin_headers, three_plans):
    """Hidden means invisible, not gone — the row and its Razorpay IDs survive."""
    from models.subscription_model import SubscriptionPlan

    plan_id = str(three_plans['starter'].plan_id)
    rz_monthly = three_plans['starter'].razorpay_monthly_plan_id

    http.patch(f'/api/subscription/admin/plans/{plan_id}',
               json={'is_active': False}, headers=super_admin_headers)

    row = SubscriptionPlan.query.filter_by(plan_id=plan_id).first()
    assert row is not None
    assert row.is_active is False
    assert row.razorpay_monthly_plan_id == rz_monthly
    assert row.monthly_price == 99900


def test_hidden_plan_can_be_shown_again(http, super_admin_headers, three_plans):
    plan_id = str(three_plans['starter'].plan_id)

    http.patch(f'/api/subscription/admin/plans/{plan_id}',
               json={'is_active': False}, headers=super_admin_headers)
    resp = http.patch(f'/api/subscription/admin/plans/{plan_id}',
                      json={'is_active': True}, headers=super_admin_headers)

    assert resp.status_code == 200
    assert resp.get_json()['plan']['is_active'] is True

    public = http.get('/api/subscription/plans?currency=INR')
    assert 'Starter' in {p['name'] for p in public.get_json()['plans']}


def test_cannot_hide_the_last_visible_plan(http, super_admin_headers, three_plans):
    """Hiding every plan would leave trial users with nothing to buy."""
    for key in ('starter', 'professional'):
        http.patch(f'/api/subscription/admin/plans/{three_plans[key].plan_id}',
                   json={'is_active': False}, headers=super_admin_headers)

    resp = http.patch(f'/api/subscription/admin/plans/{three_plans["fifteen_hundred"].plan_id}',
                      json={'is_active': False}, headers=super_admin_headers)

    assert resp.status_code == 409
    assert 'only visible' in resp.get_json()['message'].lower()

    # And the plan is genuinely still on sale.
    public = http.get('/api/subscription/plans?currency=INR')
    assert len(public.get_json()['plans']) == 1


def test_last_plan_guard_is_per_currency(http, super_admin_headers, three_plans):
    """An AED plan must not count as cover for hiding the last INR plan."""
    _make_plan('Business AED', 7500, currency='AED', order=1)

    for key in ('starter', 'professional'):
        http.patch(f'/api/subscription/admin/plans/{three_plans[key].plan_id}',
                   json={'is_active': False}, headers=super_admin_headers)

    resp = http.patch(f'/api/subscription/admin/plans/{three_plans["fifteen_hundred"].plan_id}',
                      json={'is_active': False}, headers=super_admin_headers)
    assert resp.status_code == 409


def test_patch_rejects_non_super_admin(http, owner_headers, three_plans):
    resp = http.patch(f'/api/subscription/admin/plans/{three_plans["starter"].plan_id}',
                      json={'is_active': False}, headers=owner_headers)
    assert resp.status_code == 403

    from models.subscription_model import SubscriptionPlan
    assert SubscriptionPlan.query.filter_by(
        plan_id=str(three_plans['starter'].plan_id)).first().is_active is True


def test_patch_rejects_missing_and_non_boolean_is_active(http, super_admin_headers, three_plans):
    plan_id = three_plans['starter'].plan_id

    assert http.patch(f'/api/subscription/admin/plans/{plan_id}',
                      json={}, headers=super_admin_headers).status_code == 400
    # "false" the string is the classic form-encoded footgun — it is truthy.
    assert http.patch(f'/api/subscription/admin/plans/{plan_id}',
                      json={'is_active': 'false'}, headers=super_admin_headers).status_code == 400


def test_patch_unknown_plan_returns_404(http, super_admin_headers, three_plans):
    resp = http.patch(f'/api/subscription/admin/plans/{uuid.uuid4()}',
                      json={'is_active': False}, headers=super_admin_headers)
    assert resp.status_code == 404


def test_patch_is_idempotent(http, super_admin_headers, three_plans):
    plan_id = three_plans['starter'].plan_id
    first = http.patch(f'/api/subscription/admin/plans/{plan_id}',
                       json={'is_active': True}, headers=super_admin_headers)
    assert first.status_code == 200
    assert first.get_json()['plan']['is_active'] is True


# ── Cache invalidation ───────────────────────────────────────────────────────

def test_public_plans_reflect_change_despite_cache(http, super_admin_headers, three_plans):
    """GET /plans caches per currency for 600s; a stale cache would keep selling
    hidden plans for ten minutes."""
    warm = http.get('/api/subscription/plans?currency=INR')
    assert len(warm.get_json()['plans']) == 3

    http.patch(f'/api/subscription/admin/plans/{three_plans["starter"].plan_id}',
               json={'is_active': False}, headers=super_admin_headers)

    after = http.get('/api/subscription/plans?currency=INR')
    assert {p['name'] for p in after.get_json()['plans']} == {'Professional', 'Business'}
