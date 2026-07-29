"""
One sync cycle's decision logic.

Extracted from the threaded loop so it can be tested without sleeping. The
cycle must: refresh billing state from the cloud first (so a forged local date
self-corrects), then sync only if entitled, and take exactly one backup on the
first unentitled cycle.
"""
import services.sync_scheduler as ss


def _scheduler(entitled, backup_taken=False):
    calls = {'upload': 0, 'download': 0, 'refresh': 0, 'marked': 0, 'cleared': 0}

    class _Svc:
        sqlite_engine = None

        def sync_all(self, cid):
            calls['upload'] += 1
            return {"status": "success"}

        def download_all(self, cid):
            calls['download'] += 1
            return {"status": "success"}

        def download_subscription_status(self, cid):
            calls['refresh'] += 1
            return {"status": "success"}

    s = ss.SyncScheduler(_Svc())
    s.current_client_id = 'c-1'
    s.is_entitled = lambda cid=None: {"entitled": entitled, "status": "active",
                                      "paid_until": None, "reason": "active"}
    s.expiry_backup_taken = lambda cid: backup_taken
    s.mark_expiry_backup = lambda cid: calls.__setitem__('marked', calls['marked'] + 1)
    s.clear_expiry_backup = lambda cid: calls.__setitem__('cleared', calls['cleared'] + 1)
    return s, calls


def test_entitled_cycle_syncs_both_directions():
    s, calls = _scheduler(entitled=True)
    result = s.run_one_cycle()
    assert result['action'] == 'synced'
    assert calls['upload'] == 1
    assert calls['download'] == 1


def test_every_cycle_refreshes_billing_state_from_the_cloud_first():
    """This is what makes the gate self-healing: a forged local date is
    overwritten with cloud truth before it is ever trusted."""
    s, calls = _scheduler(entitled=True)
    s.run_one_cycle()
    assert calls['refresh'] == 1


def test_entitled_cycle_clears_any_stale_expiry_marker():
    """So a renew-then-lapse cycle gets a fresh backup."""
    s, calls = _scheduler(entitled=True, backup_taken=True)
    s.run_one_cycle()
    assert calls['cleared'] == 1


def test_first_unentitled_cycle_takes_exactly_one_backup():
    s, calls = _scheduler(entitled=False, backup_taken=False)
    result = s.run_one_cycle()
    assert result['action'] == 'expiry_backup'
    assert calls['upload'] == 1
    assert calls['download'] == 0     # never pull data for an unpaid customer
    assert calls['marked'] == 1


def test_second_unentitled_cycle_syncs_nothing():
    s, calls = _scheduler(entitled=False, backup_taken=True)
    result = s.run_one_cycle()
    assert result['action'] == 'idle'
    assert calls['upload'] == 0
    assert calls['download'] == 0


def test_unentitled_cycle_still_refreshes_so_a_renewal_is_noticed():
    """Idling must not mean going deaf — otherwise a renewal would need an app
    restart to take effect."""
    s, calls = _scheduler(entitled=False, backup_taken=True)
    s.run_one_cycle()
    assert calls['refresh'] == 1
