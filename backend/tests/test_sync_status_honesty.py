"""
The scheduler must never claim to be running when it isn't.

Regression: _get_or_init_scheduler set `scheduler.running = True` by hand
without calling .start(), so /api/sync/status answered running:true while
next_sync, last_upload and last_download were all null and no thread existed.
That masked a completely dead scheduler in production for months.
"""
import services.sync_scheduler as ss


class _Svc:
    sqlite_engine = None
    last_sync_time = None
    last_download_time = None


def test_status_is_not_running_when_no_thread_exists():
    s = ss.SyncScheduler(_Svc())
    s.running = True          # the exact bug: flag set by hand
    assert s.get_status()['running'] is False, (
        "running must be derived from thread liveness, not an assignable flag"
    )


def test_status_is_not_running_after_stop():
    s = ss.SyncScheduler(_Svc())
    s.running = False
    assert s.get_status()['running'] is False


def test_status_exposes_entitlement_for_the_ui():
    s = ss.SyncScheduler(_Svc())
    s.is_entitled = lambda cid=None: {"entitled": True, "status": "active",
                                      "paid_until": "2026-12-31T00:00:00",
                                      "reason": "active"}
    status = s.get_status()
    assert status['entitled'] is True
    assert status['paid_until'] == "2026-12-31T00:00:00"
