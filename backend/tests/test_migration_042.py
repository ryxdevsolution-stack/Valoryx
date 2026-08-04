"""Migration v42 — partial bill payments.

Verifies paid_amount lands on both billing tables with the correct backfill
(paid bills = full amount, pending bills = 0 — anything else silently corrupts
revenue reports), that bill_payments is created with the sync-required columns,
and that the whole thing is idempotent (it runs at every app boot).
"""
import uuid
from sqlalchemy import inspect, text


def _fresh_pre42_state(db):
    """Drop what v42 adds, so we exercise the real upgrade path."""
    for tbl in ('gst_billing', 'non_gst_billing'):
        try:
            db.session.execute(text(f"ALTER TABLE {tbl} DROP COLUMN paid_amount"))
        except Exception:
            db.session.rollback()
    try:
        db.session.execute(text("DROP TABLE bill_payments"))
    except Exception:
        db.session.rollback()
    db.session.commit()


def test_m042_adds_columns_backfills_and_creates_table(app):
    from migrations.runner import _m042_partial_bill_payments
    from extensions import db

    with app.app_context():
        _fresh_pre42_state(db)

        # Seed one paid and one pending bill per table, pre-column.
        gid_paid, gid_pend = str(uuid.uuid4()), str(uuid.uuid4())
        cid = str(uuid.uuid4())
        db.session.execute(text(
            "INSERT INTO gst_billing (bill_id, client_id, bill_number, items, subtotal,"
            " gst_percentage, gst_amount, final_amount, payment_type, status, payment_status)"
            " VALUES (:b, :c, 9001, '[]', 100, 18, 18, 118, '[]', 'final', 'paid')"),
            {"b": gid_paid, "c": cid})
        db.session.execute(text(
            "INSERT INTO gst_billing (bill_id, client_id, bill_number, items, subtotal,"
            " gst_percentage, gst_amount, final_amount, payment_type, status, payment_status)"
            " VALUES (:b, :c, 9002, '[]', 200, 18, 36, 236, '[]', 'final', 'pending')"),
            {"b": gid_pend, "c": cid})
        db.session.commit()

        _m042_partial_bill_payments(db)

        cols = {c["name"] for c in inspect(db.engine).get_columns("gst_billing")}
        assert "paid_amount" in cols
        cols = {c["name"] for c in inspect(db.engine).get_columns("non_gst_billing")}
        assert "paid_amount" in cols

        # Backfill: paid bill carries its full amount; pending bill carries 0.
        rows = dict(db.session.execute(text(
            "SELECT bill_id, paid_amount FROM gst_billing"
            " WHERE bill_id IN (:a, :p)"), {"a": gid_paid, "p": gid_pend}).fetchall())
        assert float(rows[gid_paid]) == 118.0
        assert float(rows[gid_pend]) == 0.0

        # bill_payments exists with the columns the generic sync registry needs.
        bp_cols = {c["name"] for c in inspect(db.engine).get_columns("bill_payments")}
        assert {"payment_id", "client_id", "bill_id", "bill_kind", "amount",
                "payment_method", "payment_date", "recorded_by",
                "created_at", "updated_at", "synced_at"} <= bp_cols

        # Cleanup seeds.
        db.session.execute(text("DELETE FROM gst_billing WHERE bill_id IN (:a, :p)"),
                           {"a": gid_paid, "p": gid_pend})
        db.session.commit()


def test_m042_is_idempotent_and_preserves_partial_values(app):
    """Runs at every boot — a second run must neither fail nor reset a
    partially-paid bill's paid_amount back to a backfill value."""
    from migrations.runner import _m042_partial_bill_payments
    from extensions import db

    with app.app_context():
        _m042_partial_bill_payments(db)  # ensure applied

        bid, cid = str(uuid.uuid4()), str(uuid.uuid4())
        db.session.execute(text(
            "INSERT INTO gst_billing (bill_id, client_id, bill_number, items, subtotal,"
            " gst_percentage, gst_amount, final_amount, payment_type, status,"
            " payment_status, paid_amount)"
            " VALUES (:b, :c, 9003, '[]', 5000, 0, 0, 5000, '[]', 'final', 'partial', 3000)"),
            {"b": bid, "c": cid})
        db.session.commit()

        _m042_partial_bill_payments(db)  # second run

        val = db.session.execute(text(
            "SELECT paid_amount FROM gst_billing WHERE bill_id = :b"), {"b": bid}).scalar()
        assert float(val) == 3000.0, "re-running the migration must not clobber partial payments"

        db.session.execute(text("DELETE FROM gst_billing WHERE bill_id = :b"), {"b": bid})
        db.session.commit()
