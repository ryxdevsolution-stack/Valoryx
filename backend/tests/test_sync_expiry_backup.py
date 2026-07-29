"""
The expiry backup must fire exactly ONCE per expiry.

Without this, an expired customer could re-open the expired screen (or wait for
the next loop tick) and keep uploading forever, defeating the paid gate
entirely. Renewing then lapsing again must yield a fresh backup.
"""
from sqlalchemy import create_engine, text
import services.sync_scheduler as ss


def _scheduler_with_real_sqlite(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path}/t.db")
    with engine.begin() as c:
        c.execute(text("""
            CREATE TABLE sync_metadata (
                id TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                table_name TEXT NOT NULL,
                last_upload_time TIMESTAMP NULL,
                last_download_time TIMESTAMP NULL,
                last_full_sync_time TIMESTAMP NULL,
                updated_at TIMESTAMP,
                UNIQUE(client_id, table_name)
            )
        """))

    class _Svc:
        sqlite_engine = engine

    return ss.SyncScheduler(_Svc())


def test_backup_is_not_taken_initially(tmp_path):
    s = _scheduler_with_real_sqlite(tmp_path)
    assert s.expiry_backup_taken('c-1') is False


def test_marking_records_the_backup(tmp_path):
    s = _scheduler_with_real_sqlite(tmp_path)
    s.mark_expiry_backup('c-1')
    assert s.expiry_backup_taken('c-1') is True


def test_marking_twice_is_idempotent(tmp_path):
    """The loop ticks repeatedly while expired; a second mark must not error on
    the UNIQUE(client_id, table_name) constraint."""
    s = _scheduler_with_real_sqlite(tmp_path)
    s.mark_expiry_backup('c-1')
    s.mark_expiry_backup('c-1')
    assert s.expiry_backup_taken('c-1') is True


def test_clearing_allows_a_fresh_backup_after_renewal(tmp_path):
    s = _scheduler_with_real_sqlite(tmp_path)
    s.mark_expiry_backup('c-1')
    s.clear_expiry_backup('c-1')
    assert s.expiry_backup_taken('c-1') is False


def test_backups_are_tracked_per_client(tmp_path):
    s = _scheduler_with_real_sqlite(tmp_path)
    s.mark_expiry_backup('c-1')
    assert s.expiry_backup_taken('c-2') is False
