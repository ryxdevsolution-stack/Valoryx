"""
Manual sync endpoints must respect the same paid gate as the background loop,
or the Sync button becomes a free bypass.

/api/sync/subscription is deliberately NOT gated — it is how an unpaid customer
proves they paid.
"""
import os
import pytest


@pytest.fixture(scope='module')
def real_app():
    """The REAL create_app — the shared `app` fixture builds a bare Flask()
    without the sync routes, so it cannot exercise this gate at all."""
    os.environ.setdefault('DB_MODE', 'offline')
    from app import create_app
    return create_app()


@pytest.fixture
def gated_app(real_app):
    """App whose scheduler reports 'not entitled'."""
    class _Sched:
        sync_service = None

        def is_entitled(self, cid=None):
            return {"entitled": False, "status": "expired",
                    "paid_until": None, "reason": "expired"}

        def trigger_sync_now(self, t='upload'):
            raise AssertionError("sync ran despite no entitlement")

        def set_client_id(self, cid):
            pass

    real_app.config['SYNC_SCHEDULER'] = _Sched()
    return real_app


def test_trigger_is_refused_when_unentitled(gated_app):
    client = gated_app.test_client()
    r = client.post('/api/sync/trigger?type=upload')
    assert r.status_code == 402
    assert r.get_json()['code'] == 'SYNC_NOT_ENTITLED'


def test_full_sync_is_refused_when_unentitled(gated_app):
    client = gated_app.test_client()
    r = client.post('/api/sync/full', json={'client_id': 'c-1'})
    assert r.status_code == 402


def test_download_is_refused_when_unentitled(gated_app):
    client = gated_app.test_client()
    r = client.post('/api/sync/download', json={'client_id': 'c-1'})
    assert r.status_code == 402


def test_subscription_refresh_is_still_allowed_when_unentitled(gated_app):
    """The one endpoint an unpaid customer MUST be able to call."""
    client = gated_app.test_client()
    r = client.post('/api/sync/subscription', json={'client_id': 'c-1'})
    assert r.status_code != 402
