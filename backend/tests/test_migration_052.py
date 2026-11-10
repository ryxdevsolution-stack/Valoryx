"""v52 heals a database where early drafts of v50/v51 were recorded as applied."""
from sqlalchemy import create_engine, inspect, text


class _DB:
    """Minimal stand-in for flask_sqlalchemy's db (engine + session)."""
    def __init__(self, engine):
        from sqlalchemy.orm import sessionmaker
        self.engine = engine
        self.session = sessionmaker(bind=engine)()


def test_v52_adds_columns_missing_after_draft_migrations(tmp_path):
    from migrations.runner import _m052_heal_v50_v51_columns
    engine = create_engine(f"sqlite:///{tmp_path / 'draft.db'}")
    with engine.begin() as c:
        # What the drafts left behind: old switch name, only two PIN columns.
        c.execute(text("CREATE TABLE client_entry (client_id TEXT, bill_show_customer_gstin BOOLEAN)"))
        c.execute(text("CREATE TABLE users (user_id TEXT, pin_hash VARCHAR(100), pin_set_at DATETIME)"))
        c.execute(text("INSERT INTO users (user_id) VALUES ('u1')"))

    db = _DB(engine)
    _m052_heal_v50_v51_columns(db)
    _m052_heal_v50_v51_columns(db)  # idempotent

    cols = lambda t: {c['name'] for c in inspect(engine).get_columns(t)}  # noqa: E731
    assert {'bill_show_gst', 'bill_show_membership'} <= cols('client_entry')
    assert {'pin_hash', 'pin_set_at', 'pin_failed_attempts', 'pin_locked_until'} <= cols('users')
    with engine.connect() as c:
        assert c.execute(text("SELECT pin_failed_attempts FROM users")).scalar() == 0
