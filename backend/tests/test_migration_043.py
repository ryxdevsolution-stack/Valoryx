"""Migration v43 — heal supplier_deliveries columns missing on older installs.

v8 creates supplier_deliveries only when absent. Columns added to that CREATE
block later never reached databases where the table already existed, and no
ALTER migration was written — leaving those installs permanently short a column
and every supplier-delivery query failing with "no such column: confirmed_by"
(surfaced as a misleading 401 by the auth middleware's bare try/except).
"""
from sqlalchemy import inspect, text


def test_m043_adds_a_missing_column_to_an_existing_table(app):
    from migrations.runner import _m043_supplier_delivery_missing_columns
    from extensions import db

    with app.app_context():
        # Reproduce the real-world state: table present, confirmed_by absent.
        try:
            db.session.execute(text("ALTER TABLE supplier_deliveries DROP COLUMN confirmed_by"))
            db.session.commit()
        except Exception:
            db.session.rollback()

        cols = {c["name"] for c in inspect(db.engine).get_columns("supplier_deliveries")}
        assert "confirmed_by" not in cols, "precondition: column must be absent"

        _m043_supplier_delivery_missing_columns(db)

        cols = {c["name"] for c in inspect(db.engine).get_columns("supplier_deliveries")}
        assert "confirmed_by" in cols


def test_m043_leaves_a_complete_table_untouched_and_is_idempotent(app):
    """Runs at every boot — a second pass must not error or duplicate columns."""
    from migrations.runner import _m043_supplier_delivery_missing_columns
    from extensions import db

    with app.app_context():
        _m043_supplier_delivery_missing_columns(db)
        before = [c["name"] for c in inspect(db.engine).get_columns("supplier_deliveries")]

        _m043_supplier_delivery_missing_columns(db)
        after = [c["name"] for c in inspect(db.engine).get_columns("supplier_deliveries")]

        assert before == after


def test_m043_covers_every_column_the_model_declares(app):
    """The guard against this recurring: if someone adds a column to
    SupplierDelivery and forgets a migration, this fails loudly here rather than
    silently in production on one customer's machine."""
    from migrations.runner import _m043_supplier_delivery_missing_columns
    from models.supplier_model import SupplierDelivery
    from extensions import db

    with app.app_context():
        _m043_supplier_delivery_missing_columns(db)
        cols = {c["name"] for c in inspect(db.engine).get_columns("supplier_deliveries")}

        declared = {c.name for c in SupplierDelivery.__table__.columns}
        missing = declared - cols
        assert not missing, f"model declares columns the schema lacks: {sorted(missing)}"
