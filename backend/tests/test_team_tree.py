"""Tests for GET /api/team/tree."""
import uuid
import bcrypt
import pytest
from conftest import make_token, auth_hdr


def _u(db, client, role, name, reports_to=None):
    from models.user_model import User
    u = User(
        user_id=str(uuid.uuid4()), client_id=client.client_id,
        email=f'{name.lower()}-{uuid.uuid4().hex[:8]}@x.com',
        password_hash=bcrypt.hashpw(b'x', bcrypt.gensalt()).decode(),
        full_name=name, role=role,
        reports_to_id=reports_to,
        is_super_admin=False, is_active=True, invite_accepted=True, totp_enabled=False,
    )
    db.session.add(u); db.session.commit()
    return u


def _hdr(user, client, perms=()):
    return auth_hdr(make_token(user.user_id, client.client_id, permissions=list(perms)))


def test_owner_sees_full_tree(http, sample_client):
    from extensions import db
    owner = _u(db, sample_client, 'owner', 'Alice')
    mgr1  = _u(db, sample_client, 'manager', 'Bob',   reports_to=owner.user_id)
    mgr2  = _u(db, sample_client, 'manager', 'Frank', reports_to=owner.user_id)
    s1    = _u(db, sample_client, 'staff',   'Charlie', reports_to=mgr1.user_id)
    s2    = _u(db, sample_client, 'staff',   'Dave',    reports_to=mgr1.user_id)
    s3    = _u(db, sample_client, 'staff',   'Grace',   reports_to=mgr2.user_id)
    direct= _u(db, sample_client, 'staff',   'Henry',   reports_to=owner.user_id)

    resp = http.get('/api/team/tree', headers=_hdr(owner, sample_client))
    assert resp.status_code == 200, resp.get_json()
    body = resp.get_json()

    assert body['owner']['user_id'] == str(owner.user_id)
    mgr_ids = {m['user_id'] for m in body['managers']}
    assert mgr_ids == {str(mgr1.user_id), str(mgr2.user_id)}

    bob = next(m for m in body['managers'] if m['user_id'] == str(mgr1.user_id))
    assert {s['user_id'] for s in bob['staff']} == {str(s1.user_id), str(s2.user_id)}

    frank = next(m for m in body['managers'] if m['user_id'] == str(mgr2.user_id))
    assert {s['user_id'] for s in frank['staff']} == {str(s3.user_id)}

    assert {s['user_id'] for s in body['direct_reports']} == {str(direct.user_id)}


def test_manager_sees_only_subtree(http, sample_client):
    from extensions import db
    owner = _u(db, sample_client, 'owner', 'Alice')
    bob   = _u(db, sample_client, 'manager', 'Bob',   reports_to=owner.user_id)
    frank = _u(db, sample_client, 'manager', 'Frank', reports_to=owner.user_id)
    s1    = _u(db, sample_client, 'staff',   'Charlie', reports_to=bob.user_id)
    s2    = _u(db, sample_client, 'staff',   'Dave',    reports_to=bob.user_id)
    s3    = _u(db, sample_client, 'staff',   'Grace',   reports_to=frank.user_id)

    resp = http.get('/api/team/tree', headers=_hdr(bob, sample_client))
    assert resp.status_code == 200
    body = resp.get_json()

    assert body['self']['user_id'] == str(bob.user_id)
    assert {s['user_id'] for s in body['staff']} == {str(s1.user_id), str(s2.user_id)}
    # Frank, frank's staff, and the owner are NOT in the response.
    assert 'managers' not in body
    assert 'owner' not in body


def test_staff_gets_403(http, sample_client):
    from extensions import db
    owner = _u(db, sample_client, 'owner', 'Alice')
    mgr   = _u(db, sample_client, 'manager', 'Bob', reports_to=owner.user_id)
    staff = _u(db, sample_client, 'staff',   'Charlie', reports_to=mgr.user_id)

    resp = http.get('/api/team/tree', headers=_hdr(staff, sample_client))
    assert resp.status_code == 403


def test_cross_tenant_isolation(http, sample_client, second_client):
    from extensions import db
    a_owner = _u(db, sample_client, 'owner', 'AOwner')
    b_owner = _u(db, second_client, 'owner', 'BOwner')
    b_mgr   = _u(db, second_client, 'manager', 'BMgr', reports_to=b_owner.user_id)

    resp = http.get('/api/team/tree', headers=_hdr(a_owner, sample_client))
    assert resp.status_code == 200
    body = resp.get_json()
    mgr_ids = {m['user_id'] for m in body['managers']}
    assert str(b_mgr.user_id) not in mgr_ids
