"""
Regression tests for who owns client_entry's billing columns.

Background: subscription state is written in the CLOUD — Razorpay autopay
renewals arrive as webhooks to the server, the reconciler runs there, and web
checkouts complete there. A desktop till observes none of those events.

Two bugs followed from treating client_entry as till-owned like every other
table:

  1. The upload's `ON CONFLICT (client_id) DO UPDATE SET` refreshed EVERY
     column. A till whose auth middleware had just stamped `subscription_status
     = 'expired'` locally would push that over the cloud's 'active', erasing a
     payment the customer actually made.

  2. client_entry was never downloaded at all, so a paid customer stayed locked
     out of the desktop forever — the login gate reads the LOCAL row.

These tests lock both shut.
"""
import re
import services.sync_service as ss


CLIENT_ROW = {
    'client_id': 'c-1',
    'client_name': 'Test Shop',
    'address': 'Somewhere',
    'subscription_status': 'expired',
    'subscription_end_date': '2026-07-01',
    'trial_end_date': '2026-06-01',
    'plan_id': 'local-plan-1',
    'razorpay_subscription_id': 'sub_local',
}

PG_TYPES = {k: 'text' for k in CLIENT_ROW}


def _capture_client_entry_sql(monkeypatch):
    """Run _sync_client_entry with its DB touchpoints stubbed, returning the
    insert_sql it would have executed."""
    svc = ss.SyncService()
    captured = {}

    class _FakeConn:
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def execute(self, *a, **k):
            # _sync_client_entry does dict(r._mapping), mirroring SQLAlchemy rows.
            class _Row:
                _mapping = CLIENT_ROW
            return [_Row()]

    class _FakeEngine:
        def connect(self): return _FakeConn()

    svc.sqlite_engine = _FakeEngine()
    monkeypatch.setattr(svc, '_pg_client_entry_types', lambda: PG_TYPES)
    monkeypatch.setattr(svc, '_plan_id_maps', lambda: ({}, {}))

    def fake_push_batch(table, insert_sql, payload, ids):
        captured['table'] = table
        captured['sql'] = insert_sql
        return ids

    monkeypatch.setattr(svc, '_push_batch', fake_push_batch)
    svc._sync_client_entry(client_id='c-1')
    assert captured.get('table') == 'client_entry'
    return captured['sql']


def _update_clause(sql):
    m = re.search(r'DO\s+UPDATE\s+SET\s+(.*)$', sql, re.IGNORECASE | re.DOTALL)
    return m.group(1) if m else ''


def _insert_cols(sql):
    raw = re.search(r'INSERT\s+INTO\s+client_entry\s*\((.*?)\)\s*VALUES',
                    sql, re.IGNORECASE | re.DOTALL).group(1)
    return {c.strip() for c in raw.split(',') if c.strip()}


def test_billing_columns_are_never_overwritten_on_conflict(monkeypatch):
    """The core regression: a till must not be able to push its local billing
    state over the cloud's. If any of these reappear in DO UPDATE SET, an
    expired till silently undoes a customer's payment in Supabase."""
    sql = _capture_client_entry_sql(monkeypatch)
    update_clause = _update_clause(sql)

    for col in ss.CLOUD_OWNED_BILLING_COLUMNS:
        assert not re.search(rf'\b{col}\s*=\s*EXCLUDED\.{col}', update_clause), (
            f"{col} is in ON CONFLICT DO UPDATE SET — a stale local value would "
            f"overwrite the cloud's, erasing a real payment."
        )


def test_billing_columns_are_still_inserted(monkeypatch):
    """They must stay in the INSERT: a brand-new account created offline has to
    carry its trial state up on first upload. Only the UPDATE path is excluded."""
    sql = _capture_client_entry_sql(monkeypatch)
    cols = _insert_cols(sql)

    for col in ss.CLOUD_OWNED_BILLING_COLUMNS:
        assert col in cols, f"{col} missing from INSERT — a new offline account would lose it."


def test_shop_details_are_still_updated_on_conflict(monkeypatch):
    """Guard against over-correcting: non-billing columns are edited ON the
    device and must still sync up."""
    sql = _capture_client_entry_sql(monkeypatch)
    update_clause = _update_clause(sql)

    assert re.search(r'client_name\s*=\s*EXCLUDED\.client_name', update_clause)
    assert re.search(r'address\s*=\s*EXCLUDED\.address', update_clause)


def test_download_subscription_status_requires_a_client_id():
    """Guards the endpoint contract — without a client_id there is nothing to
    scope the cloud read to, and silently updating every local row would be worse."""
    svc = ss.SyncService()
    svc.postgres_engine = object()  # non-None so we get past the offline check
    result = svc.download_subscription_status(None)
    assert result['status'] == 'failed'


def test_download_subscription_status_reports_offline_when_uninitialised():
    """Offline is a normal state for this app and must be distinguishable from a
    failure, so the UI can say 'check your internet' rather than 'no payment found'."""
    svc = ss.SyncService()
    svc.postgres_engine = None
    result = svc.download_subscription_status('c-1')
    assert result['status'] == 'offline'
