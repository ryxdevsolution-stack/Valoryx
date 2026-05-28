"""Test for Migration v22 — create permission_templates table."""
import pytest
from sqlalchemy import inspect, text


@pytest.fixture
def fresh_app(app):
    """Use the existing app fixture (in-memory SQLite, schema already created)."""
    return app


def test_m022_creates_table_with_expected_columns(fresh_app):
    from migrations.runner import _m022_create_permission_templates
    from extensions import db

    with fresh_app.app_context():
        # Pre-drop in case a previous test left the table around.
        try:
            db.session.execute(text("DROP TABLE IF EXISTS permission_templates"))
            db.session.commit()
        except Exception:
            db.session.rollback()

        _m022_create_permission_templates(db)

        inspector = inspect(db.engine)
        assert 'permission_templates' in inspector.get_table_names()

        col_names = {c['name'] for c in inspector.get_columns('permission_templates')}
        assert col_names >= {
            'template_id', 'name', 'description', 'permissions',
            'created_by', 'created_at', 'updated_at', 'deleted_at',
        }, f"missing columns; have {col_names}"


def test_m022_is_idempotent(fresh_app):
    """Running twice on the same DB must be a no-op (no exception)."""
    from migrations.runner import _m022_create_permission_templates
    from extensions import db

    with fresh_app.app_context():
        _m022_create_permission_templates(db)
        # Should not raise on second call.
        _m022_create_permission_templates(db)


def test_m022_enforces_case_insensitive_name_uniqueness(fresh_app):
    """Two rows with names differing only in case must NOT both insert (active rows)."""
    from migrations.runner import _m022_create_permission_templates
    from extensions import db
    import uuid

    with fresh_app.app_context():
        _m022_create_permission_templates(db)

        db.session.execute(text(
            "INSERT INTO permission_templates "
            "(template_id, name, description, permissions, created_by) "
            "VALUES (:id, 'Cashier+', '', '[]', :uid)"
        ), {'id': str(uuid.uuid4()), 'uid': str(uuid.uuid4())})
        db.session.commit()

        with pytest.raises(Exception):  # IntegrityError
            db.session.execute(text(
                "INSERT INTO permission_templates "
                "(template_id, name, description, permissions, created_by) "
                "VALUES (:id, 'cashier+', '', '[]', :uid)"
            ), {'id': str(uuid.uuid4()), 'uid': str(uuid.uuid4())})
            db.session.commit()


def test_m022_allows_duplicate_name_when_one_is_soft_deleted(fresh_app):
    """The unique constraint must be partial: WHERE deleted_at IS NULL."""
    from migrations.runner import _m022_create_permission_templates
    from extensions import db
    import uuid
    from datetime import datetime

    with fresh_app.app_context():
        _m022_create_permission_templates(db)

        # First row — soft-deleted.
        db.session.execute(text(
            "INSERT INTO permission_templates "
            "(template_id, name, description, permissions, created_by, deleted_at) "
            "VALUES (:id, 'Manager+', '', '[]', :uid, :del)"
        ), {'id': str(uuid.uuid4()), 'uid': str(uuid.uuid4()), 'del': datetime.utcnow()})
        db.session.commit()

        # Second row — same name, but active. Should succeed.
        db.session.execute(text(
            "INSERT INTO permission_templates "
            "(template_id, name, description, permissions, created_by) "
            "VALUES (:id, 'Manager+', '', '[]', :uid)"
        ), {'id': str(uuid.uuid4()), 'uid': str(uuid.uuid4())})
        db.session.commit()
