"""Tests for the role-hierarchy auto-assignment rules on POST /api/team/users."""
import uuid
import bcrypt
import pytest

from conftest import make_token, auth_hdr


@pytest.fixture
def owner_user_in(sample_client):
    """Create an owner user in sample_client; return the User."""
    from extensions import db
    from models.user_model import User
    u = User(
        user_id=str(uuid.uuid4()),
        client_id=sample_client.client_id,
        email=f'owner-{uuid.uuid4().hex[:8]}@valoryx-test.invalid',
        password_hash=bcrypt.hashpw(b'x', bcrypt.gensalt()).decode(),
        full_name='O',
        role='owner',
        is_super_admin=False,
        is_active=True,
        invite_accepted=True,
        totp_enabled=False,
    )
    db.session.add(u)
    db.session.commit()
    return u


@pytest.fixture
def manager_user_in(sample_client, owner_user_in):
    from extensions import db
    from models.user_model import User
    u = User(
        user_id=str(uuid.uuid4()),
        client_id=sample_client.client_id,
        email=f'mgr-{uuid.uuid4().hex[:8]}@valoryx-test.invalid',
        password_hash=bcrypt.hashpw(b'x', bcrypt.gensalt()).decode(),
        full_name='M',
        role='manager',
        reports_to_id=owner_user_in.user_id,
        is_super_admin=False,
        is_active=True,
        invite_accepted=True,
        totp_enabled=False,
    )
    db.session.add(u)
    db.session.commit()
    return u


def _hdr(user, client, perms=()):
    return auth_hdr(make_token(user.user_id, client.client_id, permissions=list(perms)))


def test_manager_creating_staff_auto_sets_reports_to_id_to_self(http, sample_client, manager_user_in):
    """When a manager creates a staff, server forces reports_to_id = manager.user_id."""
    resp = http.post(
        '/api/team',
        json={
            'email': f'newstaff-{uuid.uuid4().hex[:8]}@x.com',
            'password': 'pw12345',
            'role': 'staff',
            'full_name': 'NewStaff',
            'reports_to_id': str(uuid.uuid4()),  # client tries to set a bogus value
        },
        headers=_hdr(manager_user_in, sample_client),
    )
    assert resp.status_code == 201, resp.get_json()
    # Verify the row in DB has reports_to_id == manager.user_id, not the bogus UUID.
    from models.user_model import User
    new_user = User.query.filter_by(email=resp.get_json()['data']['email']).first()
    assert str(new_user.reports_to_id) == str(manager_user_in.user_id)


def test_manager_cannot_create_manager(http, sample_client, manager_user_in):
    resp = http.post(
        '/api/team',
        json={'email': f'm2-{uuid.uuid4().hex[:8]}@x.com', 'password': 'pw12345', 'role': 'manager', 'full_name': 'X'},
        headers=_hdr(manager_user_in, sample_client),
    )
    assert resp.status_code == 403


def test_owner_creating_manager_sets_reports_to_owner(http, sample_client, owner_user_in):
    resp = http.post(
        '/api/team',
        json={'email': f'm-{uuid.uuid4().hex[:8]}@x.com', 'password': 'pw12345', 'role': 'manager', 'full_name': 'NewMgr'},
        headers=_hdr(owner_user_in, sample_client),
    )
    assert resp.status_code == 201
    from models.user_model import User
    new_mgr = User.query.filter_by(email=resp.get_json()['data']['email']).first()
    assert str(new_mgr.reports_to_id) == str(owner_user_in.user_id)


def test_owner_creating_staff_with_explicit_manager_respects_it(http, sample_client, owner_user_in, manager_user_in):
    resp = http.post(
        '/api/team',
        json={
            'email': f's-{uuid.uuid4().hex[:8]}@x.com', 'password': 'pw12345', 'role': 'staff', 'full_name': 'S',
            'reports_to_id': str(manager_user_in.user_id),
        },
        headers=_hdr(owner_user_in, sample_client),
    )
    assert resp.status_code == 201
    from models.user_model import User
    new_s = User.query.filter_by(email=resp.get_json()['data']['email']).first()
    assert str(new_s.reports_to_id) == str(manager_user_in.user_id)


def test_owner_creating_staff_with_invalid_reports_to_fails(http, sample_client, owner_user_in):
    """If reports_to_id points to a user that doesn't exist or isn't a manager, reject."""
    resp = http.post(
        '/api/team',
        json={
            'email': f's-{uuid.uuid4().hex[:8]}@x.com', 'password': 'pw12345', 'role': 'staff', 'full_name': 'S',
            'reports_to_id': str(uuid.uuid4()),  # bogus UUID
        },
        headers=_hdr(owner_user_in, sample_client),
    )
    assert resp.status_code == 400


def test_owner_cannot_create_second_owner(http, sample_client, owner_user_in):
    resp = http.post(
        '/api/team',
        json={'email': f'o2-{uuid.uuid4().hex[:8]}@x.com', 'password': 'pw12345', 'role': 'owner', 'full_name': 'O2'},
        headers=_hdr(owner_user_in, sample_client),
    )
    assert resp.status_code == 400


# ── PUT re-parenting rules ──────────────────────────────────────────────────

def _create_staff_under(http, hdr, manager_id):
    """Helper: create a staff via the API and return the row."""
    from models.user_model import User
    resp = http.post(
        '/api/team',
        json={
            'email': f'staff-{uuid.uuid4().hex[:8]}@x.com',
            'password': 'pw12345',
            'role': 'staff',
            'full_name': 'X',
            'reports_to_id': str(manager_id),
        },
        headers=hdr,
    )
    assert resp.status_code == 201, resp.get_json()
    return User.query.filter_by(email=resp.get_json()['data']['email']).first()


def test_owner_can_reparent_staff_to_different_manager(http, sample_client, owner_user_in, manager_user_in):
    from extensions import db
    from models.user_model import User
    import bcrypt as _b
    # Create a second manager.
    mgr2 = User(
        user_id=str(uuid.uuid4()), client_id=sample_client.client_id,
        email=f'm2-{uuid.uuid4().hex[:8]}@x.com',
        password_hash=_b.hashpw(b'x', _b.gensalt()).decode(),
        full_name='M2', role='manager', reports_to_id=owner_user_in.user_id,
        is_super_admin=False, is_active=True, invite_accepted=True, totp_enabled=False,
    )
    db.session.add(mgr2); db.session.commit()

    # Owner creates a staff under manager 1.
    staff = _create_staff_under(http, _hdr(owner_user_in, sample_client), manager_user_in.user_id)

    # Owner re-parents to manager 2.
    resp = http.put(
        f'/api/team/{staff.user_id}',
        json={'reports_to_id': str(mgr2.user_id)},
        headers=_hdr(owner_user_in, sample_client),
    )
    assert resp.status_code == 200, resp.get_json()
    db.session.refresh(staff)
    assert str(staff.reports_to_id) == str(mgr2.user_id)


def test_manager_cannot_reparent_own_staff(http, sample_client, owner_user_in, manager_user_in):
    from extensions import db
    from models.user_model import User
    import bcrypt as _b
    mgr2 = User(
        user_id=str(uuid.uuid4()), client_id=sample_client.client_id,
        email=f'm2-{uuid.uuid4().hex[:8]}@x.com',
        password_hash=_b.hashpw(b'x', _b.gensalt()).decode(),
        full_name='M2', role='manager', reports_to_id=owner_user_in.user_id,
        is_super_admin=False, is_active=True, invite_accepted=True, totp_enabled=False,
    )
    db.session.add(mgr2); db.session.commit()

    staff = _create_staff_under(http, _hdr(manager_user_in, sample_client), manager_user_in.user_id)

    # Manager tries to re-parent their own staff to manager 2 — reports_to_id field is ignored.
    resp = http.put(
        f'/api/team/{staff.user_id}',
        json={'reports_to_id': str(mgr2.user_id), 'full_name': 'Renamed'},
        headers=_hdr(manager_user_in, sample_client),
    )
    assert resp.status_code == 200
    db.session.refresh(staff)
    assert str(staff.reports_to_id) == str(manager_user_in.user_id), "reports_to_id must not change"
    assert staff.full_name == 'Renamed'  # other fields still updated


def test_manager_cannot_edit_another_managers_staff(http, sample_client, owner_user_in, manager_user_in):
    from extensions import db
    from models.user_model import User
    import bcrypt as _b
    mgr2 = User(
        user_id=str(uuid.uuid4()), client_id=sample_client.client_id,
        email=f'm2-{uuid.uuid4().hex[:8]}@x.com',
        password_hash=_b.hashpw(b'x', _b.gensalt()).decode(),
        full_name='M2', role='manager', reports_to_id=owner_user_in.user_id,
        is_super_admin=False, is_active=True, invite_accepted=True, totp_enabled=False,
    )
    db.session.add(mgr2); db.session.commit()

    # Owner creates staff under manager 2.
    staff_of_mgr2 = _create_staff_under(http, _hdr(owner_user_in, sample_client), mgr2.user_id)

    # Manager 1 tries to edit staff that belongs to manager 2.
    resp = http.put(
        f'/api/team/{staff_of_mgr2.user_id}',
        json={'full_name': 'HostileEdit'},
        headers=_hdr(manager_user_in, sample_client),
    )
    assert resp.status_code == 403


# ── DELETE pre-delete bubble-up ─────────────────────────────────────────────

def _create_named_staff_under(http, hdr, manager_id, name):
    """Helper: create a staff with a specific name via the API and return the row."""
    from models.user_model import User
    resp = http.post(
        '/api/team',
        json={
            'email': f'staff-{uuid.uuid4().hex[:8]}@x.com',
            'password': 'pw12345',
            'role': 'staff',
            'full_name': name,
            'reports_to_id': str(manager_id),
        },
        headers=hdr,
    )
    assert resp.status_code == 201, resp.get_json()
    return User.query.filter_by(email=resp.get_json()['data']['email']).first()


def test_deleting_manager_reparents_staff_to_owner(http, sample_client, owner_user_in, manager_user_in):
    from extensions import db
    hdr = _hdr(owner_user_in, sample_client)
    s1 = _create_named_staff_under(http, hdr, manager_user_in.user_id, f'StaffA-{uuid.uuid4().hex[:6]}')
    s2 = _create_named_staff_under(http, hdr, manager_user_in.user_id, f'StaffB-{uuid.uuid4().hex[:6]}')
    db.session.refresh(s1); db.session.refresh(s2)
    assert str(s1.reports_to_id) == str(manager_user_in.user_id)
    assert str(s2.reports_to_id) == str(manager_user_in.user_id)

    # Owner deletes the manager.
    resp = http.delete(
        f'/api/team/{manager_user_in.user_id}',
        headers=_hdr(owner_user_in, sample_client),
    )
    assert resp.status_code in (200, 204)

    # Both staff should now report to the owner.
    db.session.refresh(s1); db.session.refresh(s2)
    assert str(s1.reports_to_id) == str(owner_user_in.user_id)
    assert str(s2.reports_to_id) == str(owner_user_in.user_id)


def test_deleting_staff_with_no_reports_is_simple(http, sample_client, owner_user_in, manager_user_in):
    hdr = _hdr(owner_user_in, sample_client)
    staff = _create_named_staff_under(http, hdr, manager_user_in.user_id, f'LoneStaff-{uuid.uuid4().hex[:6]}')
    resp = http.delete(
        f'/api/team/{staff.user_id}',
        headers=_hdr(owner_user_in, sample_client),
    )
    assert resp.status_code in (200, 204)
