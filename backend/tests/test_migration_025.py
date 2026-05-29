"""Test for Migration v25 — optional percentage discount columns.

Adds two nullable columns (default 0) to three tables:
  - stock_entry
  - supplier_delivery_items
  - bulk_stock_order_item

Columns: purchase_discount_percentage, selling_discount_percentage
"""
import uuid
import pytest
from sqlalchemy import inspect, text

DISCOUNT_COLS = ('purchase_discount_percentage', 'selling_discount_percentage')
TARGET_TABLES = ('stock_entry', 'supplier_delivery_items', 'bulk_stock_order_item')


@pytest.fixture
def fresh_app(app):
    return app


def _drop_cols(db):
    """Best-effort drop so the migration has work to do on a fresh schema."""
    for table in TARGET_TABLES:
        for col in DISCOUNT_COLS:
            try:
                db.session.execute(text(f"ALTER TABLE {table} DROP COLUMN {col}"))
                db.session.commit()
            except Exception:
                db.session.rollback()


def test_m025_adds_discount_columns_to_all_tables(fresh_app):
    from migrations.runner import _m025_discount_columns
    from extensions import db
    with fresh_app.app_context():
        _drop_cols(db)
        _m025_discount_columns(db)
        inspector = inspect(db.engine)
        for table in TARGET_TABLES:
            cols = {c['name'] for c in inspector.get_columns(table)}
            for col in DISCOUNT_COLS:
                assert col in cols, f"{col} missing from {table}"


def test_m025_is_idempotent(fresh_app):
    from migrations.runner import _m025_discount_columns
    from extensions import db
    with fresh_app.app_context():
        _m025_discount_columns(db)
        # Running again must not raise (columns already exist).
        _m025_discount_columns(db)
        cols = {c['name'] for c in inspect(db.engine).get_columns('stock_entry')}
        assert 'selling_discount_percentage' in cols


def test_stock_entry_to_dict_exposes_discounts(fresh_app):
    from extensions import db
    from models.stock_model import StockEntry
    from models.client_model import ClientEntry
    with fresh_app.app_context():
        c = ClientEntry(
            client_id=str(uuid.uuid4()),
            client_name='DiscCo',
            email=f'disc-{uuid.uuid4().hex[:8]}@valoryx-test.invalid',
            phone='+9999',
            is_active=True,
        )
        db.session.add(c)
        db.session.commit()

        p = StockEntry(
            product_id=str(uuid.uuid4()),
            client_id=c.client_id,
            product_name='Widget',
            quantity=5,
            rate=100,
            cost_price=80,
            purchase_discount_percentage=10,
            selling_discount_percentage=5,
        )
        db.session.add(p)
        db.session.commit()

        d = p.to_dict()
        assert d['purchase_discount_percentage'] == 10
        assert d['selling_discount_percentage'] == 5


def test_stock_entry_to_dict_defaults_discounts_to_zero(fresh_app):
    from extensions import db
    from models.stock_model import StockEntry
    from models.client_model import ClientEntry
    with fresh_app.app_context():
        c = ClientEntry(
            client_id=str(uuid.uuid4()),
            client_name='DiscCo2',
            email=f'disc2-{uuid.uuid4().hex[:8]}@valoryx-test.invalid',
            phone='+9999',
            is_active=True,
        )
        db.session.add(c)
        db.session.commit()

        p = StockEntry(
            product_id=str(uuid.uuid4()),
            client_id=c.client_id,
            product_name='NoDiscount',
            quantity=1,
            rate=50,
        )
        db.session.add(p)
        db.session.commit()

        d = p.to_dict()
        # Nullable columns with no value provided serialize to 0, not None.
        assert d['purchase_discount_percentage'] == 0
        assert d['selling_discount_percentage'] == 0
