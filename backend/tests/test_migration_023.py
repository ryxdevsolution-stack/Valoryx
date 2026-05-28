"""Test for Migration v23 — role hierarchy redesign.

Atomic migration:
1. Add users.reports_to_id column (FK + index).
2. UPDATE roles: admin → manager, cashier → staff.
3. Backfill reports_to_id: managers/staff → their client's owner.user_id.
4. Normalize client_entry.role_quotas: fold admin into manager, cashier into staff.
5. Invalidate sessions (DELETE FROM user_sessions).
"""
import json
import uuid
import bcrypt
import pytest
from sqlalchemy import inspect, text


@pytest.fixture
def fresh_app(app):
    return app


def _make_client(db, name='C'):
    from models.client_model import ClientEntry
    c = ClientEntry(
        client_id=str(uuid.uuid4()),
        client_name=name,
        email=f'{name.lower()}-{uuid.uuid4().hex[:8]}@valoryx-test.invalid',
        phone='+9999',
        is_active=True,
    )
    db.session.add(c)
    db.session.commit()
    return c


def _make_user(db, client_id, role, name='U'):
    from models.user_model import User
    u = User(
        user_id=str(uuid.uuid4()),
        client_id=client_id,
        email=f'{name.lower()}-{uuid.uuid4().hex[:8]}@valoryx-test.invalid',
        password_hash=bcrypt.hashpw(b'x', bcrypt.gensalt()).decode(),
        full_name=name,
        role=role,
        is_super_admin=False,
        is_active=True,
        invite_accepted=True,
        totp_enabled=False,
    )
    db.session.add(u)
    db.session.commit()
    return u


def test_m023_adds_reports_to_id_column(fresh_app):
    from migrations.runner import _m023_role_hierarchy_redesign
    from extensions import db
    with fresh_app.app_context():
        try:
            db.session.execute(text("ALTER TABLE users DROP COLUMN reports_to_id"))
            db.session.commit()
        except Exception:
            db.session.rollback()
        _m023_role_hierarchy_redesign(db)
        cols = {c['name'] for c in inspect(db.engine).get_columns('users')}
        assert 'reports_to_id' in cols


def test_m023_renames_admin_to_manager_and_cashier_to_staff(fresh_app):
    from migrations.runner import _m023_role_hierarchy_redesign
    from extensions import db
    with fresh_app.app_context():
        c = _make_client(db)
        owner = _make_user(db, c.client_id, 'owner', 'O')
        admin_u = _make_user(db, c.client_id, 'admin', 'A')
        cashier_u = _make_user(db, c.client_id, 'cashier', 'C')

        _m023_role_hierarchy_redesign(db)

        db.session.refresh(admin_u)
        db.session.refresh(cashier_u)
        assert admin_u.role == 'manager'
        assert cashier_u.role == 'staff'


def test_m023_backfills_reports_to_id_for_non_owners(fresh_app):
    from migrations.runner import _m023_role_hierarchy_redesign
    from extensions import db
    with fresh_app.app_context():
        c = _make_client(db)
        owner = _make_user(db, c.client_id, 'owner', 'O')
        manager = _make_user(db, c.client_id, 'manager', 'M')
        staff = _make_user(db, c.client_id, 'staff', 'S')

        _m023_role_hierarchy_redesign(db)

        db.session.refresh(owner)
        db.session.refresh(manager)
        db.session.refresh(staff)
        assert owner.reports_to_id is None
        assert str(manager.reports_to_id) == str(owner.user_id)
        assert str(staff.reports_to_id) == str(owner.user_id)


def test_m023_normalizes_role_quotas_json(fresh_app):
    from migrations.runner import _m023_role_hierarchy_redesign
    from extensions import db
    from models.client_model import ClientEntry
    with fresh_app.app_context():
        c = _make_client(db)
        c.role_quotas = {'admin': 2, 'manager': 1, 'staff': 5, 'cashier': 3}
        db.session.commit()

        _m023_role_hierarchy_redesign(db)

        db.session.refresh(c)
        assert c.role_quotas == {'manager': 3, 'staff': 8}


def test_m023_leaves_role_quotas_alone_when_no_admin_or_cashier(fresh_app):
    from migrations.runner import _m023_role_hierarchy_redesign
    from extensions import db
    with fresh_app.app_context():
        c = _make_client(db)
        c.role_quotas = {'manager': 2, 'staff': 7}
        db.session.commit()

        _m023_role_hierarchy_redesign(db)

        db.session.refresh(c)
        assert c.role_quotas == {'manager': 2, 'staff': 7}


def test_m023_invalidates_all_sessions(fresh_app):
    from migrations.runner import _m023_role_hierarchy_redesign
    from extensions import db
    from models.session_model import UserSession
    with fresh_app.app_context():
        c = _make_client(db)
        owner = _make_user(db, c.client_id, 'owner', 'O')
        # Create a fake session row using actual user_sessions schema columns.
        db.session.execute(text(
            "INSERT INTO user_sessions (id, session_id, user_id, client_id, created_at, expires_at, is_active) "
            "VALUES (:id, :sid, :uid, :cid, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)"
        ), {'id': str(uuid.uuid4()), 'sid': str(uuid.uuid4()), 'uid': str(owner.user_id), 'cid': str(c.client_id)})
        db.session.commit()
        assert UserSession.query.count() == 1

        _m023_role_hierarchy_redesign(db)

        assert UserSession.query.count() == 0


def test_m023_is_idempotent(fresh_app):
    from migrations.runner import _m023_role_hierarchy_redesign
    from extensions import db
    with fresh_app.app_context():
        c = _make_client(db)
        owner = _make_user(db, c.client_id, 'owner', 'O')
        manager = _make_user(db, c.client_id, 'manager', 'M')

        _m023_role_hierarchy_redesign(db)
        # Run a second time — should not raise and should not change anything.
        _m023_role_hierarchy_redesign(db)

        db.session.refresh(manager)
        assert str(manager.reports_to_id) == str(owner.user_id)
        assert manager.role == 'manager'
