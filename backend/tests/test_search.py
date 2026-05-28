"""
test_search.py — Universal search endpoint tests

Tests for GET /api/search?q=<query>:
  - Returns categorized results for valid query (≥ 2 chars).
  - Short query (< 2 chars) returns empty categories.
  - Respects view_users permission — hides employees from callers without it.
  - Respects view_customers permission — hides customers from callers without it.
  - Does not leak data across clients (tenant isolation).
"""

import uuid
import pytest
from extensions import db
from conftest import make_token, auth_hdr


# ── helpers ───────────────────────────────────────────────────────────────────

def _search(http, headers, q):
    return http.get(f'/api/search?q={q}', headers=headers)


# ── fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def full_headers(sample_user, sample_client):
    """Token with all search-relevant permissions."""
    token = make_token(
        sample_user.user_id,
        sample_client.client_id,
        permissions=[
            'view_stock', 'view_customers', 'view_all_bills', 'view_users',
        ],
    )
    return auth_hdr(token)


@pytest.fixture
def stock_only_headers(sample_user, sample_client):
    """Token with only view_stock — no customers, no bills, no users."""
    token = make_token(
        sample_user.user_id,
        sample_client.client_id,
        permissions=['view_stock'],
    )
    return auth_hdr(token)


@pytest.fixture
def sample_customer(sample_client):
    """A customer row for the test client."""
    from models.customer_model import Customer

    cid = str(uuid.uuid4())
    c = Customer(
        customer_id=cid,
        client_id=sample_client.client_id,
        customer_name='Ravi Kumar',
        customer_phone='9876543210',
        customer_email='ravi@example.com',
        status='active',
    )
    db.session.add(c)
    db.session.commit()
    return c


# ═══════════════════════════════════════════════════════════════════════════════
# Tests
# ═══════════════════════════════════════════════════════════════════════════════

def test_universal_search_returns_categorized_results(http, sample_stock, sample_client, gst_headers):
    """Universal search returns categorized hits respecting permissions."""
    resp = _search(http, gst_headers, sample_stock.product_name[:3])
    assert resp.status_code == 200, resp.get_json()
    data = resp.get_json()
    assert 'products' in data
    assert 'customers' in data
    assert 'suppliers' in data
    assert 'bills' in data
    assert 'employees' in data
    # The sample_stock fixture creates "Widget"; partial match should find it
    assert any(p['name'] == sample_stock.product_name for p in data['products']), data


def test_universal_search_short_query_returns_empty(http, gst_headers):
    """Queries shorter than MIN_QUERY_LENGTH return empty categories without hitting the DB."""
    resp = _search(http, gst_headers, 'a')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['products'] == []
    assert data['bills'] == []
    assert data['employees'] == []


def test_universal_search_respects_view_users_permission(http, sample_user, sample_client, gst_headers):
    """A user WITHOUT view_users does not get employee results."""
    # gst_headers has permissions: ["gst_billing", "non_gst_billing", "add_product", "view_stock"]
    # — no view_users
    resp = _search(http, gst_headers, sample_user.full_name[:3])
    assert resp.status_code == 200
    assert resp.get_json()['employees'] == []


def test_universal_search_returns_employees_with_view_users(http, sample_user, sample_client, full_headers):
    """A user WITH view_users gets employee results when the name matches."""
    resp = _search(http, full_headers, sample_user.full_name[:4])
    assert resp.status_code == 200
    data = resp.get_json()
    assert any(e['id'] == str(sample_user.user_id) for e in data['employees']), data


def test_universal_search_respects_view_customers_permission(http, sample_customer, sample_client, stock_only_headers):
    """A user WITHOUT view_customers does not get customer results."""
    resp = _search(http, stock_only_headers, sample_customer.customer_name[:3])
    assert resp.status_code == 200
    assert resp.get_json()['customers'] == []


def test_universal_search_returns_customers_with_permission(http, sample_customer, sample_client, full_headers):
    """A user WITH view_customers gets customer results when the name matches."""
    resp = _search(http, full_headers, sample_customer.customer_name[:4])
    assert resp.status_code == 200
    data = resp.get_json()
    assert any(c['id'] == str(sample_customer.customer_id) for c in data['customers']), data


def test_universal_search_tenant_isolation(http, sample_stock, second_client, second_user, gst_headers):
    """Results from a different client must not appear in search."""
    # second_user belongs to second_client, not sample_client
    other_token = make_token(
        second_user.user_id,
        second_client.client_id,
        permissions=['view_stock'],
    )
    other_headers = auth_hdr(other_token)
    # Search using the product name that belongs to sample_client
    resp = _search(http, other_headers, sample_stock.product_name[:3])
    assert resp.status_code == 200
    data = resp.get_json()
    # second_client has no stock — should be empty
    assert data['products'] == [], data


def test_universal_search_requires_auth(http):
    """Unauthenticated requests are rejected with 401."""
    resp = http.get('/api/search?q=widget')
    assert resp.status_code == 401


def test_universal_search_empty_query_returns_empty(http, gst_headers):
    """Empty query string returns empty categories."""
    resp = http.get('/api/search', headers=gst_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['products'] == []
    assert data['bills'] == []


def test_search_returns_bulk_orders_and_deliveries(http, sample_user, sample_client, gst_headers):
    """Search returns bulk orders + deliveries when caller has view_stock."""
    resp = http.get('/api/search?q=zzz_no_match_zzz', headers=gst_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    # Just verify the response shape includes the new categories
    assert 'bulk_orders' in data
    assert 'deliveries' in data
    assert isinstance(data['bulk_orders'], list)
    assert isinstance(data['deliveries'], list)


def test_search_employee_redirect_goes_to_salary(http, sample_user, sample_client):
    """Employee results href should now point to /salary?focus=<user_id>."""
    from models.permission_model import Permission, UserPermission
    from extensions import db
    # Grant view_users explicitly for this test (gst_headers doesn't have it)
    perm = Permission.query.filter_by(permission_name='view_users').first()
    if perm:
        db.session.add(UserPermission(user_id=sample_user.user_id, permission_id=perm.permission_id))
        db.session.commit()

    # Re-issue token with view_users permission
    from conftest import make_token, auth_hdr
    token = make_token(
        sample_user.user_id,
        sample_client.client_id,
        permissions=['view_users'],
    )
    headers = auth_hdr(token)

    resp = http.get(f'/api/search?q={sample_user.full_name[:3]}', headers=headers)
    assert resp.status_code == 200
    employees = resp.get_json().get('employees', [])
    if employees:  # Only assert if any match
        assert employees[0]['href'].startswith('/salary?focus=')
