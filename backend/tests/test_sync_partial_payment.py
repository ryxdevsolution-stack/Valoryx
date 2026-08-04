"""
Sync-shape regression tests for partial payment (v42).

Background: payment_status was NEVER in the billing upload/download column
lists, so pending bills silently looked paid on the cloud and on other tills
for months. These tests lock the v42 columns into every one of the four lists
plus both ON CONFLICT clauses, so the same class of gap cannot reopen.

Pure SQL-shape tests — no database. Same technique as test_sync_users_upsert.py.
"""
import re
import services.sync_service as ss


def _capture_upload_sql(method_name, table):
    svc = ss.SyncService()
    captured = {}

    def fake_upload_pending(tbl, id_column, column_types, insert_sql, **kwargs):
        captured['table'] = tbl
        captured['sql'] = insert_sql
        return 0

    svc._upload_pending = fake_upload_pending
    getattr(svc, method_name)(client_id='test-client')
    assert captured.get('table') == table
    return captured['sql']


def _update_clause(sql):
    return re.search(r'DO\s+UPDATE\s+SET\s+(.*)$', sql, re.IGNORECASE | re.DOTALL).group(1)


# ── Upload: INSERT column lists ──────────────────────────────────────────────

def test_gst_upload_includes_partial_payment_columns():
    sql = _capture_upload_sql('_sync_gst_bills', 'gst_billing')
    for col in ('payment_status', 'paid_amount'):
        assert re.search(rf'\b{col}\b', sql), f"{col} missing from GST upload SQL"


def test_non_gst_upload_includes_partial_payment_columns():
    sql = _capture_upload_sql('_sync_non_gst_bills', 'non_gst_billing')
    for col in ('payment_status', 'paid_amount'):
        assert re.search(rf'\b{col}\b', sql), f"{col} missing from non-GST upload SQL"


# ── Upload: ON CONFLICT refresh (the receive-balance path) ──────────────────

def test_gst_conflict_update_refreshes_payment_state():
    """Receiving a balance payment edits an ALREADY-SYNCED bill — it hits the
    conflict path, so these columns must be refreshed there or a settlement
    never reaches the cloud. payment_type too: the new split is appended to it."""
    update = _update_clause(_capture_upload_sql('_sync_gst_bills', 'gst_billing'))
    for col in ('payment_status', 'paid_amount', 'payment_type'):
        assert re.search(rf'{col}\s*=\s*EXCLUDED\.{col}', update), (
            f"{col} not refreshed on conflict — a settled bill would stay "
            f"'partial' forever on the cloud")


def test_non_gst_conflict_update_refreshes_payment_state():
    update = _update_clause(_capture_upload_sql('_sync_non_gst_bills', 'non_gst_billing'))
    for col in ('payment_status', 'paid_amount', 'payment_type'):
        assert re.search(rf'{col}\s*=\s*EXCLUDED\.{col}', update)


# ── Download: explicit columns lists ────────────────────────────────────────

def _capture_download_columns(method_name, table):
    svc = ss.SyncService()
    captured = {}

    svc._fetch_all_pg = lambda q, p: [{'bill_id': 'b-1'}]

    def fake_upsert(tbl, records, id_column, columns):
        captured['table'] = tbl
        captured['columns'] = columns
        return 0

    svc._upsert_to_sqlite = fake_upsert
    getattr(svc, method_name)('test-client', None)
    assert captured.get('table') == table
    return captured['columns']


def test_gst_download_includes_partial_payment_columns():
    cols = _capture_download_columns('_download_gst_bills', 'gst_billing')
    assert 'payment_status' in cols
    assert 'paid_amount' in cols


def test_non_gst_download_includes_partial_payment_columns():
    cols = _capture_download_columns('_download_non_gst_bills', 'non_gst_billing')
    assert 'payment_status' in cols
    assert 'paid_amount' in cols


# ── The ledger table rides the generic registry ─────────────────────────────

def test_bill_payments_is_registered_for_generic_sync():
    entry = next((e for e in ss._OWNER_SYNC_TABLES if e['table'] == 'bill_payments'), None)
    assert entry is not None, "bill_payments missing from _OWNER_SYNC_TABLES — ledger would never sync"
    assert entry['pk'] == 'payment_id'
    assert entry['scope'] == 'client_id'
