"""Test for Migration v21 — revoke super-admin-only perms from regular users."""
import uuid
import pytest
from sqlalchemy import text

SUPER_ADMIN_ONLY = ('manage_clients', 'system_backup', 'system_restore', 'maintenance_mode')


@pytest.fixture
def db_with_leaked_perms(app, sample_client, sample_user):
    """Grant manage_clients to two users: one super_admin, one regular owner.

    The migration must revoke from the regular user only.
    """
    from extensions import db
    from models.user_model import User
    from models.permission_model import Permission, UserPermission
    import bcrypt

    with app.app_context():
        # Ensure the perm exists (it's already in default_perms but be defensive)
        perm = Permission.query.filter_by(permission_name='manage_clients').first()
        if not perm:
            perm = Permission(
                permission_id=str(uuid.uuid4()),
                permission_name='manage_clients',
                description='Manage other tenant organizations',
            )
            db.session.add(perm)
            db.session.commit()

        # Create the two users
        sa_id = str(uuid.uuid4())
        sa_user = User(
            user_id=sa_id,
            client_id=sample_client.client_id,
            email=f'sa-{sa_id[:8]}@valoryx-test.invalid',
            password_hash=bcrypt.hashpw(b'x', bcrypt.gensalt()).decode(),
            full_name='SA',
            role='owner',
            is_super_admin=True,
            is_active=True,
            invite_accepted=True,
            totp_enabled=False,
        )
        reg_id = str(uuid.uuid4())
        reg_user = User(
            user_id=reg_id,
            client_id=sample_client.client_id,
            email=f'reg-{reg_id[:8]}@valoryx-test.invalid',
            password_hash=bcrypt.hashpw(b'x', bcrypt.gensalt()).decode(),
            full_name='Regular',
            role='owner',
            is_super_admin=False,
            is_active=True,
            invite_accepted=True,
            totp_enabled=False,
        )
        db.session.add_all([sa_user, reg_user])
        db.session.commit()

        # Grant manage_clients to BOTH
        for uid in (sa_id, reg_id):
            db.session.add(UserPermission(
                id=str(uuid.uuid4()),
                user_id=uid,
                permission_id=perm.permission_id,
            ))
        db.session.commit()

        return {'db': db, 'sa_id': sa_id, 'reg_id': reg_id, 'perm_id': perm.permission_id}


def test_m021_revokes_from_regular_user(db_with_leaked_perms):
    from migrations.runner import _m021_revoke_super_admin_perms_from_regular_users
    ctx = db_with_leaked_perms
    db = ctx['db']

    _m021_revoke_super_admin_perms_from_regular_users(db)

    # Super admin still has it
    sa_still = db.session.execute(
        text("SELECT 1 FROM user_permissions WHERE user_id = :u AND permission_id = :p"),
        {'u': str(ctx['sa_id']), 'p': str(ctx['perm_id'])},
    ).scalar()
    assert sa_still == 1, "super admin must KEEP manage_clients"

    # Regular user does NOT
    reg_still = db.session.execute(
        text("SELECT 1 FROM user_permissions WHERE user_id = :u AND permission_id = :p"),
        {'u': str(ctx['reg_id']), 'p': str(ctx['perm_id'])},
    ).scalar()
    assert reg_still is None, "regular user must lose manage_clients"


def test_m021_is_idempotent(db_with_leaked_perms):
    from migrations.runner import _m021_revoke_super_admin_perms_from_regular_users
    ctx = db_with_leaked_perms
    db = ctx['db']

    _m021_revoke_super_admin_perms_from_regular_users(db)
    after_first = db.session.execute(
        text("SELECT COUNT(*) FROM user_permissions WHERE permission_id = :p"),
        {'p': str(ctx['perm_id'])},
    ).scalar()
    _m021_revoke_super_admin_perms_from_regular_users(db)
    after_second = db.session.execute(
        text("SELECT COUNT(*) FROM user_permissions WHERE permission_id = :p"),
        {'p': str(ctx['perm_id'])},
    ).scalar()

    assert after_first == after_second == 1, "second run must not change anything"
