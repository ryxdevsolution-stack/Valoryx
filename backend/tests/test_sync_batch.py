"""
Unit tests for the sync helpers added for fast/complete sync:
- _push_batch_split: divide-and-conquer upload that isolates bad/orphan rows in
  O(log n) round-trips instead of O(n) row-by-row.
- _fetch_all_pg: paged download that pulls ALL rows, not just the first page.

No real database — fakes stand in for the Postgres connection/engine.
"""
import re
import services.sync_service as ss


class _FakeConn:
    """Fake pg connection. A batch execute() fails if ANY row id is in bad_ids."""
    def __init__(self, bad_ids):
        self.bad_ids = set(bad_ids)
        self.execute_calls = 0

    def execute(self, _sql, payload):
        self.execute_calls += 1
        ids = [r['id'] for r in payload]
        if any(i in self.bad_ids for i in ids):
            raise Exception("FK violation (simulated)")

    def commit(self):
        pass

    def rollback(self):
        pass


def test_push_batch_split_isolates_bad_rows():
    svc = ss.SyncService()
    payload = [{'id': i} for i in range(100)]
    ids = list(range(100))
    bad = {42, 77}
    conn = _FakeConn(bad)

    synced = svc._push_batch_split(conn, 'test', 'INSERT ...', payload, ids, is_top=True)

    # Every good row synced, both bad rows skipped (not blocking the rest).
    assert set(synced) == set(ids) - bad
    # Bounded: divide-and-conquer is far below O(n)=100 round-trips.
    assert conn.execute_calls < 40, f"too many round-trips: {conn.execute_calls}"


def test_push_batch_split_all_good_is_single_roundtrip():
    svc = ss.SyncService()
    payload = [{'id': i} for i in range(500)]
    ids = list(range(500))
    conn = _FakeConn(bad_ids=set())

    synced = svc._push_batch_split(conn, 'test', 'INSERT ...', payload, ids, is_top=True)

    assert set(synced) == set(ids)
    assert conn.execute_calls == 1  # clean batch → one executemany


# ── _fetch_all_pg paging ─────────────────────────────────────────────────────

class _Row:
    def __init__(self, d):
        self._mapping = d


class _PagedConn:
    def __init__(self, total):
        self.total = total

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def execute(self, sql, _params):
        q = str(sql)
        limit = int(re.search(r'LIMIT (\d+)', q).group(1))
        offset = int(re.search(r'OFFSET (\d+)', q).group(1))
        end = min(offset + limit, self.total)
        return [_Row({'id': i}) for i in range(offset, end)]


class _PagedEngine:
    def __init__(self, total):
        self.total = total

    def connect(self):
        return _PagedConn(self.total)


def test_fetch_all_pg_pulls_every_row_across_pages():
    svc = ss.SyncService()
    svc.postgres_engine = _PagedEngine(total=12_345)  # > 2 pages at size 5000

    rows = svc._fetch_all_pg("SELECT * FROM t ORDER BY id", {}, page_size=5000)

    assert len(rows) == 12_345           # nothing truncated
    assert rows[0]['id'] == 0
    assert rows[-1]['id'] == 12_344
    assert [r['id'] for r in rows] == list(range(12_345))  # complete, in order


def test_fetch_all_pg_empty():
    svc = ss.SyncService()
    svc.postgres_engine = _PagedEngine(total=0)
    assert svc._fetch_all_pg("SELECT * FROM t ORDER BY id", {}) == []
