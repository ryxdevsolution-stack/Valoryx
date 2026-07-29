"""
Entitlement rule for paid auto-sync.

The rule must mirror ClientEntry.is_trial_expired / is_subscription_expired
exactly, so the sync gate and the login gate can never disagree about whether
a customer is paid.
"""
from datetime import datetime, timedelta
import services.sync_scheduler as ss


FUTURE = (datetime.utcnow() + timedelta(days=10)).isoformat()
PAST = (datetime.utcnow() - timedelta(days=1)).isoformat()


def _scheduler(row):
    """A SyncScheduler whose local client_entry read returns `row` (or None)."""
    class _Conn:
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def execute(self, *a, **k):
            class _R:
                def fetchone(self_inner):
                    if row is None:
                        return None
                    class _Row:
                        _mapping = row
                    return _Row()
            return _R()

    class _Engine:
        def connect(self): return _Conn()

    class _Svc:
        sqlite_engine = _Engine()

    return ss.SyncScheduler(_Svc())


def test_active_subscription_in_date_is_entitled():
    s = _scheduler({'subscription_status': 'active',
                    'subscription_end_date': FUTURE, 'trial_end_date': None})
    result = s.is_entitled('c-1')
    assert result['entitled'] is True
    assert result['reason'] == 'active'


def test_active_subscription_past_end_date_is_not_entitled():
    s = _scheduler({'subscription_status': 'active',
                    'subscription_end_date': PAST, 'trial_end_date': None})
    assert s.is_entitled('c-1')['entitled'] is False


def test_trial_in_date_is_entitled():
    s = _scheduler({'subscription_status': 'trial',
                    'subscription_end_date': None, 'trial_end_date': FUTURE})
    result = s.is_entitled('c-1')
    assert result['entitled'] is True
    assert result['reason'] == 'trial'


def test_trial_past_end_date_is_not_entitled():
    s = _scheduler({'subscription_status': 'trial',
                    'subscription_end_date': None, 'trial_end_date': PAST})
    assert s.is_entitled('c-1')['entitled'] is False


def test_expired_status_is_never_entitled_even_with_a_future_date():
    """Defence in depth: a stale future date must not resurrect an account the
    server has explicitly marked expired."""
    s = _scheduler({'subscription_status': 'expired',
                    'subscription_end_date': FUTURE, 'trial_end_date': FUTURE})
    assert s.is_entitled('c-1')['entitled'] is False


def test_cancelled_status_is_not_entitled():
    s = _scheduler({'subscription_status': 'cancelled',
                    'subscription_end_date': FUTURE, 'trial_end_date': None})
    assert s.is_entitled('c-1')['entitled'] is False


def test_missing_end_date_is_not_entitled():
    """No date means we cannot prove entitlement — fail closed, not open."""
    s = _scheduler({'subscription_status': 'active',
                    'subscription_end_date': None, 'trial_end_date': None})
    assert s.is_entitled('c-1')['entitled'] is False


def test_no_client_id_is_not_entitled():
    s = _scheduler(None)
    result = s.is_entitled(None)
    assert result['entitled'] is False
    assert result['reason'] == 'no_client'


def test_unknown_client_is_not_entitled():
    s = _scheduler(None)
    result = s.is_entitled('c-missing')
    assert result['entitled'] is False
    assert result['reason'] == 'not_found'


def test_datetime_objects_are_accepted_as_well_as_iso_strings():
    """SQLite hands back strings; a future migration or Postgres read could hand
    back datetimes. Both must work."""
    s = _scheduler({'subscription_status': 'active',
                    'subscription_end_date': datetime.utcnow() + timedelta(days=5),
                    'trial_end_date': None})
    assert s.is_entitled('c-1')['entitled'] is True
