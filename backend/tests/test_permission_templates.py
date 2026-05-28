"""Tests for /admin/permission-templates/custom endpoints (Phase 2)."""
import json
import uuid
import bcrypt
import pytest

from conftest import make_token, auth_hdr
from utils.permissions import SUPER_ADMIN_ONLY_PERMISSIONS


# ── Helper fixtures ──────────────────────────────────────────────────────────

@pytest.fixture
def super_admin_user(sample_client):
    """A super admin in sample_client; returns the User row."""
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
    return sa


@pytest.fixture
def super_admin_headers(super_admin_user, sample_client):
    """Auth headers for the super admin."""
    tok = make_token(
        super_admin_user.user_id,
        sample_client.client_id,
        permissions=[],
        is_super_admin=True,
    )
    return auth_hdr(tok)


# ── POST: create custom template ──────────────────────────────────────────────

def test_post_creates_template(http, super_admin_headers):
    resp = http.post(
        '/api/admin/permission-templates/custom',
        json={
            'name': 'My Cashier Plus',
            'description': 'Cashier with cost-price visibility',
            'permissions': ['gst_billing', 'non_gst_billing', 'apply_discount'],
        },
        headers=super_admin_headers,
    )
    assert resp.status_code == 201, resp.get_json()
    body = resp.get_json()
    assert body['template']['name'] == 'My Cashier Plus'
    assert body['template']['is_custom'] is True
    assert set(body['template']['permissions']) == {'gst_billing', 'non_gst_billing', 'apply_discount'}


def test_post_rejects_short_name(http, super_admin_headers):
    resp = http.post(
        '/api/admin/permission-templates/custom',
        json={'name': 'AB', 'permissions': ['gst_billing']},
        headers=super_admin_headers,
    )
    assert resp.status_code == 400
    assert resp.get_json()['field'] == 'name'


def test_post_rejects_long_name(http, super_admin_headers):
    resp = http.post(
        '/api/admin/permission-templates/custom',
        json={'name': 'X' * 41, 'permissions': ['gst_billing']},
        headers=super_admin_headers,
    )
    assert resp.status_code == 400
    assert resp.get_json()['field'] == 'name'


def test_post_rejects_duplicate_name_case_insensitive(http, super_admin_headers):
    http.post(
        '/api/admin/permission-templates/custom',
        json={'name': 'Cashier+', 'permissions': ['gst_billing']},
        headers=super_admin_headers,
    )
    resp = http.post(
        '/api/admin/permission-templates/custom',
        json={'name': 'cashier+', 'permissions': ['gst_billing']},
        headers=super_admin_headers,
    )
    assert resp.status_code == 400
    assert resp.get_json()['field'] == 'name'


def test_post_rejects_empty_permissions(http, super_admin_headers):
    resp = http.post(
        '/api/admin/permission-templates/custom',
        json={'name': 'Empty', 'permissions': []},
        headers=super_admin_headers,
    )
    assert resp.status_code == 400
    assert resp.get_json()['field'] == 'permissions'


def test_post_rejects_unknown_permission(http, super_admin_headers):
    resp = http.post(
        '/api/admin/permission-templates/custom',
        json={'name': 'Bogus', 'permissions': ['gst_billing', 'this_perm_does_not_exist']},
        headers=super_admin_headers,
    )
    assert resp.status_code == 400
    assert resp.get_json()['field'] == 'permissions'


def test_post_strips_super_admin_perms_silently(http, super_admin_headers):
    """Super-admin-only perms must be stripped silently; if list becomes empty, reject."""
    resp = http.post(
        '/api/admin/permission-templates/custom',
        json={
            'name': 'Mixed',
            'permissions': ['gst_billing', 'manage_clients', 'system_backup'],
        },
        headers=super_admin_headers,
    )
    assert resp.status_code == 201
    body = resp.get_json()
    # manage_clients + system_backup are SUPER_ADMIN_ONLY — must be gone.
    assert 'manage_clients' not in body['template']['permissions']
    assert 'system_backup' not in body['template']['permissions']
    assert 'gst_billing' in body['template']['permissions']


def test_post_rejects_when_only_super_admin_perms(http, super_admin_headers):
    """If after stripping SUPER_ADMIN_ONLY the list is empty, return 400."""
    resp = http.post(
        '/api/admin/permission-templates/custom',
        json={'name': 'AllSA', 'permissions': list(SUPER_ADMIN_ONLY_PERMISSIONS)},
        headers=super_admin_headers,
    )
    assert resp.status_code == 400
    assert resp.get_json()['field'] == 'permissions'


def test_post_requires_super_admin(http, gst_headers):
    """gst_headers is a non-super-admin user. Must get 403."""
    resp = http.post(
        '/api/admin/permission-templates/custom',
        json={'name': 'Nope', 'permissions': ['gst_billing']},
        headers=gst_headers,
    )
    assert resp.status_code == 403


# ── PUT: update custom template ───────────────────────────────────────────────

def _create_template(http, headers, name='Initial', perms=None):
    perms = perms or ['gst_billing']
    resp = http.post('/api/admin/permission-templates/custom',
                     json={'name': name, 'permissions': perms},
                     headers=headers)
    assert resp.status_code == 201
    return resp.get_json()['template']


def test_put_updates_name_and_description(http, super_admin_headers):
    template = _create_template(http, super_admin_headers, name='Original')
    resp = http.put(
        f'/api/admin/permission-templates/custom/{template["template_id"]}',
        json={'name': 'Renamed', 'description': 'New desc',
              'permissions': template['permissions']},
        headers=super_admin_headers,
    )
    assert resp.status_code == 200, resp.get_json()
    body = resp.get_json()
    assert body['template']['name'] == 'Renamed'
    assert body['template']['description'] == 'New desc'


def test_put_updates_permissions(http, super_admin_headers):
    template = _create_template(http, super_admin_headers,
                                name='ChangePerms',
                                perms=['gst_billing'])
    resp = http.put(
        f'/api/admin/permission-templates/custom/{template["template_id"]}',
        json={'name': 'ChangePerms', 'permissions': ['gst_billing', 'non_gst_billing']},
        headers=super_admin_headers,
    )
    assert resp.status_code == 200
    assert set(resp.get_json()['template']['permissions']) == {'gst_billing', 'non_gst_billing'}


def test_put_uniqueness_excludes_target_row(http, super_admin_headers):
    """Updating a template's own row with same name should succeed."""
    template = _create_template(http, super_admin_headers, name='Stable')
    resp = http.put(
        f'/api/admin/permission-templates/custom/{template["template_id"]}',
        json={'name': 'Stable', 'permissions': template['permissions']},
        headers=super_admin_headers,
    )
    assert resp.status_code == 200


def test_put_uniqueness_blocks_collision_with_other_row(http, super_admin_headers):
    """Updating to a name owned by ANOTHER template must fail."""
    a = _create_template(http, super_admin_headers, name='AAA')
    b = _create_template(http, super_admin_headers, name='BBB')
    resp = http.put(
        f'/api/admin/permission-templates/custom/{b["template_id"]}',
        json={'name': 'aaa', 'permissions': b['permissions']},
        headers=super_admin_headers,
    )
    assert resp.status_code == 400
    assert resp.get_json()['field'] == 'name'


def test_put_returns_404_for_missing(http, super_admin_headers):
    resp = http.put(
        f'/api/admin/permission-templates/custom/{uuid.uuid4()}',
        json={'name': 'Whatever', 'permissions': ['gst_billing']},
        headers=super_admin_headers,
    )
    assert resp.status_code == 404


def test_put_requires_super_admin(http, super_admin_headers, gst_headers):
    template = _create_template(http, super_admin_headers, name='Guarded')
    resp = http.put(
        f'/api/admin/permission-templates/custom/{template["template_id"]}',
        json={'name': 'Guarded', 'permissions': template['permissions']},
        headers=gst_headers,
    )
    assert resp.status_code == 403


# ── DELETE: soft delete ───────────────────────────────────────────────────────

def test_delete_soft_deletes_template(http, super_admin_headers):
    template = _create_template(http, super_admin_headers, name='ToDelete')
    resp = http.delete(
        f'/api/admin/permission-templates/custom/{template["template_id"]}',
        headers=super_admin_headers,
    )
    assert resp.status_code == 204

    # Soft-deleted: the row still exists in the DB but with deleted_at set.
    from models.permission_template_model import PermissionTemplate
    row = PermissionTemplate.query.filter_by(template_id=template['template_id']).first()
    assert row is not None, "soft delete must keep the row"
    assert row.deleted_at is not None, "deleted_at must be set"


def test_delete_returns_404_for_missing(http, super_admin_headers):
    resp = http.delete(
        f'/api/admin/permission-templates/custom/{uuid.uuid4()}',
        headers=super_admin_headers,
    )
    assert resp.status_code == 404


def test_delete_returns_404_for_already_deleted(http, super_admin_headers):
    template = _create_template(http, super_admin_headers, name='OnceOnly')
    http.delete(
        f'/api/admin/permission-templates/custom/{template["template_id"]}',
        headers=super_admin_headers,
    )
    resp = http.delete(
        f'/api/admin/permission-templates/custom/{template["template_id"]}',
        headers=super_admin_headers,
    )
    assert resp.status_code == 404


def test_delete_frees_name_for_reuse(http, super_admin_headers):
    template = _create_template(http, super_admin_headers, name='Reusable')
    http.delete(
        f'/api/admin/permission-templates/custom/{template["template_id"]}',
        headers=super_admin_headers,
    )
    # Should be able to create a new template with the same name now.
    resp = http.post(
        '/api/admin/permission-templates/custom',
        json={'name': 'Reusable', 'permissions': ['gst_billing']},
        headers=super_admin_headers,
    )
    assert resp.status_code == 201


def test_delete_requires_super_admin(http, super_admin_headers, gst_headers):
    template = _create_template(http, super_admin_headers, name='Protected')
    resp = http.delete(
        f'/api/admin/permission-templates/custom/{template["template_id"]}',
        headers=gst_headers,
    )
    assert resp.status_code == 403


# ── GET: list (merged built-in + custom) ──────────────────────────────────────

def test_get_returns_empty_dict_when_no_custom_exist(http, super_admin_headers):
    """After the 2026-05-27 redesign, built-in templates were removed.
    GET returns an empty templates dict when no custom templates have been saved.
    """
    resp = http.get('/api/admin/permission-templates', headers=super_admin_headers)
    assert resp.status_code == 200
    assert resp.get_json()['templates'] == {}


def test_get_includes_custom_templates(http, super_admin_headers):
    template = _create_template(http, super_admin_headers, name='Mine')
    resp = http.get('/api/admin/permission-templates', headers=super_admin_headers)
    assert resp.status_code == 200
    templates = resp.get_json()['templates']
    # Custom template is keyed by its template_id.
    assert template['template_id'] in templates
    assert templates[template['template_id']]['is_custom'] is True


def test_get_excludes_soft_deleted_custom_templates(http, super_admin_headers):
    template = _create_template(http, super_admin_headers, name='Gone')
    http.delete(f'/api/admin/permission-templates/custom/{template["template_id"]}',
                headers=super_admin_headers)
    resp = http.get('/api/admin/permission-templates', headers=super_admin_headers)
    templates = resp.get_json()['templates']
    assert template['template_id'] not in templates


def test_get_custom_template_includes_creator_email(http, super_admin_headers, super_admin_user):
    template = _create_template(http, super_admin_headers, name='Tagged')
    resp = http.get('/api/admin/permission-templates', headers=super_admin_headers)
    templates = resp.get_json()['templates']
    assert templates[template['template_id']]['created_by_email'] == super_admin_user.email
