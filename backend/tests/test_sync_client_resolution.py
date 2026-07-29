"""
The background loop must find its client without a user clicking anything.

The live backend reports client_id: null because set_client_id() is only called
by /api/sync/set-client (the Sync button). A scheduler with no client silently
skips the download half of every cycle.
"""
from sqlalchemy import create_engine, text
import services.sync_scheduler as ss


def _scheduler(tmp_path, client_ids):
    engine = create_engine(f"sqlite:///{tmp_path}/t.db")
    with engine.begin() as c:
        c.execute(text("CREATE TABLE client_entry (client_id TEXT PRIMARY KEY, is_active INTEGER)"))
        for cid in client_ids:
            c.execute(text("INSERT INTO client_entry (client_id, is_active) VALUES (:c, 1)"),
                      {"c": cid})

    class _Svc:
        sqlite_engine = engine

    return ss.SyncScheduler(_Svc())


def test_resolves_the_single_local_client(tmp_path):
    s = _scheduler(tmp_path, ['c-1'])
    assert s.resolve_client_id() == 'c-1'


def test_returns_none_when_no_client_exists_yet(tmp_path):
    """Before first login/setup there is no account — the loop must idle, not guess."""
    s = _scheduler(tmp_path, [])
    assert s.resolve_client_id() is None


def test_does_not_guess_when_several_clients_exist(tmp_path):
    """Not expected on desktop, but picking one arbitrarily would sync the wrong
    tenant's data. Refuse instead."""
    s = _scheduler(tmp_path, ['c-1', 'c-2'])
    assert s.resolve_client_id() is None


def test_an_explicitly_set_client_is_never_overridden(tmp_path):
    s = _scheduler(tmp_path, ['c-1'])
    s.set_client_id('c-explicit')
    assert s.current_client_id == 'c-explicit'
