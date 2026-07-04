"""Test for Migration v34 — user_sessions.platform column.

Verifies the ALTER TABLE that lets web and desktop-app sessions coexist actually
runs against a table that lacks the column (the real prod situation), and is
idempotent (safe to re-run on every boot).
"""
from sqlalchemy import inspect, text


def test_m034_adds_platform_column(app):
    from migrations.runner import _m034_session_platform
    from extensions import db

    with app.app_context():
        # Simulate the pre-migration prod schema: drop the column create_all added.
        try:
            db.session.execute(text("ALTER TABLE user_sessions DROP COLUMN platform"))
            db.session.commit()
        except Exception:
            db.session.rollback()  # already absent — fine

        cols_before = [c["name"] for c in inspect(db.engine).get_columns("user_sessions")]
        assert "platform" not in cols_before

        # Run the migration.
        _m034_session_platform(db)

        cols_after = [c["name"] for c in inspect(db.engine).get_columns("user_sessions")]
        assert "platform" in cols_after, "migration must add user_sessions.platform"


def test_m034_is_idempotent(app):
    """Running v34 twice must not error (it runs on every boot)."""
    from migrations.runner import _m034_session_platform
    from extensions import db

    with app.app_context():
        _m034_session_platform(db)
        _m034_session_platform(db)  # second run — must be a no-op, not an error

        cols = [c["name"] for c in inspect(db.engine).get_columns("user_sessions")]
        assert "platform" in cols


def test_m034_registered_at_current_version():
    """The registry must include v34 and CURRENT_SCHEMA_VERSION must cover it."""
    from migrations.runner import MIGRATIONS, CURRENT_SCHEMA_VERSION

    versions = [v for v, _ in MIGRATIONS]
    assert 34 in versions, "v34 must be registered so prod actually runs it"
    assert CURRENT_SCHEMA_VERSION >= 34, "CURRENT_SCHEMA_VERSION must trigger v34 on boot"
