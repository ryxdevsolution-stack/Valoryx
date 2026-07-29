# Paid Auto-Sync Entitlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Background auto-sync runs only while a customer's subscription is paid, for exactly the period they paid for.

**Architecture:** The sync scheduler's background loop (which exists but has never been started) is started for real, and gains an entitlement check at the top of each cycle. Entitlement is a single date comparison against the local `client_entry` row, which each cycle first refreshes from the cloud so a forged local date self-corrects. When entitlement lapses the loop takes exactly one final upload, records that it did, then idles until entitlement returns.

**Tech Stack:** Python 3.12 / Flask / SQLAlchemy Core (`text()` queries) / SQLite locally / pytest. React 18 + TypeScript + vitest on the frontend.

**Spec:** `docs/superpowers/specs/2026-07-29-paid-auto-sync-design.md`

## Global Constraints

- Entitlement rule, used everywhere without variation: `subscription_status in ('trial','active')` AND the relevant end date is in the future. Relevant date is `trial_end_date` when status is `trial`, else `subscription_end_date`.
- Never re-implement the rule inline. Every consumer calls `SyncScheduler.is_entitled()`.
- `running` in any status payload MUST be derived from thread liveness, never assigned. This is the regression that let a dead scheduler report healthy for months.
- Local SQLite stores timestamps as ISO strings; Postgres returns `datetime`. Every date read must tolerate both.
- All SQL uses `sqlalchemy.text()` with bound parameters. No f-string interpolation of values.
- `/api/sync/subscription` must remain reachable while unentitled — it is how a customer proves they paid. Every other `/api/sync/*` write endpoint gets gated.
- Do not add database columns. The one-time backup marker reuses `sync_metadata` with pseudo `table_name = 'expiry_backup'`, matching the existing `'all'` / `'initial_load'` convention.
- Run backend tests from `backend/`: `python3 -m pytest`. Run frontend tests from `frontend-react/`: `npx vitest run`.

---

### Task 1: Entitlement rule

**Files:**
- Modify: `backend/services/sync_scheduler.py`
- Test: `backend/tests/test_sync_entitlement.py` (create)

**Interfaces:**
- Consumes: `self.sync_service.sqlite_engine` (already present on `SyncScheduler`).
- Produces: `SyncScheduler.is_entitled(client_id=None) -> dict` returning
  `{"entitled": bool, "status": str|None, "paid_until": str|None, "reason": str}`.
  `reason` is one of `"trial"`, `"active"`, `"expired"`, `"no_client"`, `"not_found"`, `"error"`.
  Task 3, 4 and 5 all call this.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_sync_entitlement.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python3 -m pytest tests/test_sync_entitlement.py -v`
Expected: FAIL with `AttributeError: 'SyncScheduler' object has no attribute 'is_entitled'`

- [ ] **Step 3: Write minimal implementation**

In `backend/services/sync_scheduler.py`, add near the top after the imports:

```python
from sqlalchemy import text

# Statuses that can carry an entitlement at all. 'expired' and 'cancelled' are
# terminal — a stale future date must never resurrect them.
ENTITLED_STATUSES = ('trial', 'active')


def _as_datetime(value):
    """Local SQLite stores timestamps as ISO strings, Postgres returns datetime.
    Accept both; return None for anything unparseable rather than raising, so a
    malformed date fails closed instead of crashing the sync loop."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except (ValueError, TypeError):
        return None
```

Then add this method to `SyncScheduler`:

```python
    def is_entitled(self, client_id=None):
        """Is this client currently entitled to background auto-sync?

        Mirrors ClientEntry.is_trial_expired / is_subscription_expired so the
        sync gate and the login gate can never disagree. Fails CLOSED: any
        missing row, missing date or error means not entitled.
        """
        cid = client_id or self.current_client_id
        if not cid:
            return {"entitled": False, "status": None, "paid_until": None,
                    "reason": "no_client"}

        try:
            with self.sync_service.sqlite_engine.connect() as conn:
                found = conn.execute(text(
                    "SELECT subscription_status, subscription_end_date, trial_end_date "
                    "FROM client_entry WHERE client_id = :cid"
                ), {"cid": str(cid)}).fetchone()
        except Exception as e:
            logger.error(f"[SyncScheduler] Entitlement check failed: {e}")
            return {"entitled": False, "status": None, "paid_until": None,
                    "reason": "error"}

        if found is None:
            return {"entitled": False, "status": None, "paid_until": None,
                    "reason": "not_found"}

        row = dict(found._mapping)
        status = row.get('subscription_status')
        if status not in ENTITLED_STATUSES:
            return {"entitled": False, "status": status, "paid_until": None,
                    "reason": "expired"}

        end = _as_datetime(row.get('trial_end_date') if status == 'trial'
                           else row.get('subscription_end_date'))
        if end is None:
            return {"entitled": False, "status": status, "paid_until": None,
                    "reason": "expired"}

        # Compare naive-to-naive: local rows are written without tzinfo.
        now = datetime.utcnow()
        if end.tzinfo is not None:
            end = end.replace(tzinfo=None)

        entitled = end > now
        return {
            "entitled": entitled,
            "status": status,
            "paid_until": end.isoformat(),
            "reason": status if entitled else "expired",
        }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python3 -m pytest tests/test_sync_entitlement.py -v`
Expected: 10 passed

- [ ] **Step 5: Commit**

```bash
git add backend/services/sync_scheduler.py backend/tests/test_sync_entitlement.py
git commit -m "feat(sync): add entitlement rule for paid auto-sync"
```

---

### Task 2: One-time expiry backup bookkeeping

**Files:**
- Modify: `backend/services/sync_scheduler.py`
- Test: `backend/tests/test_sync_expiry_backup.py` (create)

**Interfaces:**
- Consumes: `self.sync_service.sqlite_engine`.
- Produces: `SyncScheduler.expiry_backup_taken(client_id) -> bool`,
  `SyncScheduler.mark_expiry_backup(client_id) -> None`,
  `SyncScheduler.clear_expiry_backup(client_id) -> None`.
  Task 3 and Task 7 call these.

Uses `sync_metadata` with pseudo `table_name = 'expiry_backup'`, matching the existing `'all'` and `'initial_load'` rows. No new table, no new column.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_sync_expiry_backup.py`:

```python
"""
The expiry backup must fire exactly ONCE per expiry.

Without this, an expired customer could re-open the expired screen (or wait for
the next loop tick) and keep uploading forever, defeating the paid gate
entirely. Renewing then lapsing again must yield a fresh backup.
"""
import uuid
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python3 -m pytest tests/test_sync_expiry_backup.py -v`
Expected: FAIL with `AttributeError: 'SyncScheduler' object has no attribute 'expiry_backup_taken'`

- [ ] **Step 3: Write minimal implementation**

Add to `backend/services/sync_scheduler.py`, module level near `ENTITLED_STATUSES`:

```python
# Pseudo table_name in sync_metadata marking that the one-time post-expiry
# backup has been taken for a client. Matches the existing 'all' /
# 'initial_load' convention — no new table, no new column.
EXPIRY_BACKUP_KEY = 'expiry_backup'
```

Add these methods to `SyncScheduler`:

```python
    def expiry_backup_taken(self, client_id):
        """Has the one-time post-expiry backup already run for this client?"""
        if not client_id:
            return False
        try:
            with self.sync_service.sqlite_engine.connect() as conn:
                found = conn.execute(text(
                    "SELECT 1 FROM sync_metadata "
                    "WHERE client_id = :cid AND table_name = :k"
                ), {"cid": str(client_id), "k": EXPIRY_BACKUP_KEY}).fetchone()
            return found is not None
        except Exception as e:
            # Fail CLOSED: if we cannot tell, assume it was taken rather than
            # uploading repeatedly for an unpaid customer.
            logger.warning(f"[SyncScheduler] Could not read expiry backup marker: {e}")
            return True

    def mark_expiry_backup(self, client_id):
        """Record that the one-time post-expiry backup has run. Idempotent."""
        if not client_id:
            return
        try:
            import uuid as uuid_module
            now = datetime.utcnow().isoformat()
            with self.sync_service.sqlite_engine.begin() as conn:
                conn.execute(text("""
                    INSERT INTO sync_metadata (id, client_id, table_name, last_upload_time, updated_at)
                    VALUES (:id, :cid, :k, :t, :t)
                    ON CONFLICT (client_id, table_name) DO UPDATE SET
                        last_upload_time = :t, updated_at = :t
                """), {"id": str(uuid_module.uuid4()), "cid": str(client_id),
                       "k": EXPIRY_BACKUP_KEY, "t": now})
        except Exception as e:
            logger.warning(f"[SyncScheduler] Could not mark expiry backup: {e}")

    def clear_expiry_backup(self, client_id):
        """Reset the marker so a future lapse gets its own backup. Called when
        entitlement returns."""
        if not client_id:
            return
        try:
            with self.sync_service.sqlite_engine.begin() as conn:
                conn.execute(text(
                    "DELETE FROM sync_metadata "
                    "WHERE client_id = :cid AND table_name = :k"
                ), {"cid": str(client_id), "k": EXPIRY_BACKUP_KEY})
        except Exception as e:
            logger.warning(f"[SyncScheduler] Could not clear expiry backup: {e}")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python3 -m pytest tests/test_sync_expiry_backup.py -v`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add backend/services/sync_scheduler.py backend/tests/test_sync_expiry_backup.py
git commit -m "feat(sync): track one-time post-expiry backup in sync_metadata"
```

---

### Task 3: Gate the background loop

**Files:**
- Modify: `backend/services/sync_scheduler.py` (`_run_loop`)
- Test: `backend/tests/test_sync_loop_gating.py` (create)

**Interfaces:**
- Consumes: `is_entitled()` (Task 1), `expiry_backup_taken()` / `mark_expiry_backup()` / `clear_expiry_backup()` (Task 2), `sync_service.download_subscription_status(client_id)` (shipped v1.1.23).
- Produces: `SyncScheduler.run_one_cycle() -> dict` with keys `action` (one of `"synced"`, `"expiry_backup"`, `"idle"`) and `entitled` (bool). Extracted from the loop so it is testable without threads or sleeps.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_sync_loop_gating.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python3 -m pytest tests/test_sync_loop_gating.py -v`
Expected: FAIL with `AttributeError: 'SyncScheduler' object has no attribute 'run_one_cycle'`

- [ ] **Step 3: Write minimal implementation**

Add to `SyncScheduler`:

```python
    def run_one_cycle(self):
        """Perform one sync cycle's decision and work.

        Order matters: refresh billing state from the cloud BEFORE checking
        entitlement, so a locally-forged date is corrected before it is trusted.
        A failed refresh is non-fatal — fall through to the last known local
        state so an entitled customer keeps working through a network blip.
        """
        cid = self.current_client_id

        try:
            self.sync_service.download_subscription_status(cid)
        except Exception as e:
            logger.warning(f"[SyncScheduler] Billing refresh failed, using local state: {e}")

        gate = self.is_entitled(cid)

        if gate['entitled']:
            # Clear any marker from a previous lapse so a future one gets its
            # own backup.
            self.clear_expiry_backup(cid)
            upload = self.sync_service.sync_all(cid)
            logger.info(f"[SyncScheduler] Upload: {upload.get('status', 'unknown')}")
            if cid and self.sync_mode in ('download_only', 'bidirectional'):
                download = self.sync_service.download_all(cid)
                logger.info(f"[SyncScheduler] Download: {download.get('status', 'unknown')}")
            return {"action": "synced", "entitled": True}

        if not self.expiry_backup_taken(cid):
            # One final upload so bills earned while paid are not stranded.
            # Upload only — never pull fresh data down for an unpaid customer.
            logger.info("[SyncScheduler] Entitlement lapsed — taking final backup")
            self.sync_service.sync_all(cid)
            self.mark_expiry_backup(cid)
            return {"action": "expiry_backup", "entitled": False}

        return {"action": "idle", "entitled": False}
```

Then replace the body of the `while self.running:` loop in `_run_loop` so it calls the new method:

```python
        while self.running:
            try:
                self.next_sync_time = datetime.now() + timedelta(hours=self.interval_hours)
                logger.info(
                    f"[SyncScheduler] Cycle starting (next at {self.next_sync_time.strftime('%H:%M')})")

                self.run_one_cycle()

                sleep_seconds = self.interval_hours * 3600
                for _ in range(int(sleep_seconds / 60)):
                    if not self.running:
                        break
                    time.sleep(60)
            except Exception as e:
                logger.error(f"[SyncScheduler] Error in sync loop: {e}")
                time.sleep(300)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python3 -m pytest tests/test_sync_loop_gating.py -v`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add backend/services/sync_scheduler.py backend/tests/test_sync_loop_gating.py
git commit -m "feat(sync): gate each sync cycle on paid entitlement"
```

---

### Task 4: Start the loop and report honest status

**Files:**
- Modify: `backend/services/sync_scheduler.py` (`get_status`)
- Modify: `backend/app.py:995-997` (`_get_or_init_scheduler`)
- Test: `backend/tests/test_sync_status_honesty.py` (create)

**Interfaces:**
- Consumes: `is_entitled()` (Task 1).
- Produces: `get_status()` payload gains `entitled: bool` and `paid_until: str|None`; `running` becomes derived. Task 6 consumes this shape.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_sync_status_honesty.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python3 -m pytest tests/test_sync_status_honesty.py -v`
Expected: FAIL — first test fails because `running` echoes the hand-set flag; third fails with `KeyError: 'entitled'`

- [ ] **Step 3: Write minimal implementation**

Replace `get_status` in `backend/services/sync_scheduler.py`:

```python
    def get_status(self):
        """Status for the API. `running` is DERIVED from thread liveness — never
        an assignable flag, because that is exactly how a dead scheduler
        reported healthy for months."""
        alive = self.thread is not None and self.thread.is_alive()
        gate = self.is_entitled()
        return {
            "running": bool(alive and self.running),
            "entitled": gate["entitled"],
            "paid_until": gate["paid_until"],
            "entitlement_reason": gate["reason"],
            "interval_hours": self.interval_hours,
            "sync_mode": self.sync_mode,
            "client_id": self.current_client_id,
            "next_sync": self.next_sync_time.isoformat() if self.next_sync_time else None,
            "last_upload": self.sync_service.last_sync_time.isoformat()
                if getattr(self.sync_service, 'last_sync_time', None) else None,
            "last_download": self.sync_service.last_download_time.isoformat()
                if getattr(self.sync_service, 'last_download_time', None) else None,
        }
```

In `backend/app.py`, inside `_get_or_init_scheduler`, replace:

```python
            scheduler = SyncScheduler(sync_service)
            scheduler.running = True
            app.config['SYNC_SCHEDULER'] = scheduler
```

with:

```python
            scheduler = SyncScheduler(sync_service)
            # Actually spawn the background thread. Previously this set
            # running = True by hand, which made /api/sync/status report a
            # healthy scheduler that had never executed a single cycle.
            scheduler.start()
            app.config['SYNC_SCHEDULER'] = scheduler
```

Then in `SyncScheduler.start()`, remove the `self.sync_service.initialize()` early-return guard when the engines are already set by the caller, by changing:

```python
        if not self.sync_service.initialize():
            logger.warning("[SyncScheduler] Sync service initialization failed - scheduler disabled")
            return
```

to:

```python
        # _get_or_init_scheduler wires the engines directly; only call
        # initialize() when they are absent, or it would undo that wiring.
        if self.sync_service.postgres_engine is None:
            if not self.sync_service.initialize():
                logger.warning("[SyncScheduler] Sync service init failed - scheduler disabled")
                return
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python3 -m pytest tests/test_sync_status_honesty.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add backend/services/sync_scheduler.py backend/app.py backend/tests/test_sync_status_honesty.py
git commit -m "fix(sync): actually start the scheduler and derive running from thread liveness"
```

---

### Task 5: Gate the manual sync endpoints

**Files:**
- Modify: `backend/app.py` (`/api/sync/trigger`, `/api/sync/download`, `/api/sync/full`)
- Test: `backend/tests/test_sync_endpoint_gating.py` (create)

**Interfaces:**
- Consumes: `scheduler.is_entitled()` (Task 1).
- Produces: HTTP 402 `{"error": "Subscription required", "code": "SYNC_NOT_ENTITLED", "message": ...}` from the three write endpoints when unentitled.

402 (Payment Required) is used deliberately so the frontend can distinguish "you must pay" from 403 "you are not allowed", which the auth middleware already uses for expiry.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_sync_endpoint_gating.py`:

```python
"""
Manual sync endpoints must respect the same paid gate as the background loop,
or the Sync button becomes a free bypass.

/api/sync/subscription is deliberately NOT gated — it is how an unpaid customer
proves they paid.
"""
import pytest


@pytest.fixture
def gated_app(app, monkeypatch):
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
    app.config['SYNC_SCHEDULER'] = _Sched()
    return app


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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python3 -m pytest tests/test_sync_endpoint_gating.py -v`
Expected: FAIL — endpoints return 200/400, not 402

- [ ] **Step 3: Write minimal implementation**

In `backend/app.py`, immediately after `_get_or_init_scheduler` is defined, add:

```python
    def _require_entitlement(scheduler, client_id=None):
        """Returns an error response tuple when the client may not sync, else None.

        402 Payment Required (not 403) so the frontend can tell "renew to enable"
        apart from the auth middleware's 403 expiry lockout.
        """
        gate = scheduler.is_entitled(client_id)
        if gate['entitled']:
            return None
        return {
            'error': 'Subscription required',
            'code': 'SYNC_NOT_ENTITLED',
            'message': 'Sync is included with an active subscription. Renew to turn it back on.',
            'entitlement': gate,
        }, 402
```

Then in each of `trigger_sync`, `trigger_download` and the full-sync route, after the `if not scheduler:` check and after `client_id` is resolved, add:

```python
        denied = _require_entitlement(scheduler, client_id)
        if denied:
            return denied
```

For `trigger_sync`, which has no `client_id` in the body, pass `None` so it falls back to `scheduler.current_client_id`:

```python
        denied = _require_entitlement(scheduler, None)
        if denied:
            return denied
```

Leave `/api/sync/subscription` and `/api/sync/status` untouched.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python3 -m pytest tests/test_sync_endpoint_gating.py -v`
Expected: 4 passed

- [ ] **Step 5: Run the whole backend suite and commit**

```bash
cd backend && python3 -m pytest -q
git add backend/app.py backend/tests/test_sync_endpoint_gating.py
git commit -m "feat(sync): refuse manual sync endpoints without an active subscription"
```

Expected: all tests pass (281 existing + 28 new).

---

### Task 6: Surface entitlement in the Sync button

**Files:**
- Modify: `frontend-react/src/components/SyncButton.tsx`
- Test: `frontend-react/src/test/SyncButton.test.tsx` (create)

**Interfaces:**
- Consumes: `/sync/status` payload from Task 4 (`entitled`, `paid_until`, `entitlement_reason`) and the 402 `SYNC_NOT_ENTITLED` response from Task 5.

- [ ] **Step 1: Write the failing test**

Create `frontend-react/src/test/SyncButton.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import SyncButton from '@/components/SyncButton'
import api from '@/lib/api'

vi.mock('@/lib/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
vi.mock('@/contexts/ClientContext', () => ({
  useClient: () => ({ client: { client_id: 'c-1' } }),
}))

const mockedGet = vi.mocked(api.get)

describe('SyncButton entitlement states', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the paid-until date while entitled', async () => {
    mockedGet.mockResolvedValue({
      data: { running: true, entitled: true, paid_until: '2026-12-31T00:00:00',
              entitlement_reason: 'active' },
    } as any)

    render(<SyncButton />)
    expect(await screen.findByText(/active until/i)).toBeInTheDocument()
  })

  it('tells a trial user when the trial ends', async () => {
    mockedGet.mockResolvedValue({
      data: { running: true, entitled: true, paid_until: '2026-08-12T00:00:00',
              entitlement_reason: 'trial' },
    } as any)

    render(<SyncButton />)
    expect(await screen.findByText(/trial ends/i)).toBeInTheDocument()
  })

  it('says sync is paused and disables the button when not entitled', async () => {
    mockedGet.mockResolvedValue({
      data: { running: false, entitled: false, paid_until: null,
              entitlement_reason: 'expired' },
    } as any)

    render(<SyncButton />)
    expect(await screen.findByText(/renew to turn it back on/i)).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /sync/i })).toBeDisabled())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend-react && npx vitest run src/test/SyncButton.test.tsx`
Expected: FAIL — no such text rendered, button not disabled

- [ ] **Step 3: Write minimal implementation**

In `SyncButton.tsx`, extend the `SyncStatus` interface:

```tsx
interface SyncStatus {
  running: boolean;
  entitled?: boolean;
  paid_until?: string | null;
  entitlement_reason?: string;
  last_upload?: string;
  last_download?: string;
  next_sync?: string;
  interval_hours?: number;
  client_id?: string;
  sync_mode?: string;
  reason?: string;
}
```

Add above the return, after `status` is available:

```tsx
  const entitled = status?.entitled !== false   // undefined = older backend, don't lock out
  const paidUntil = status?.paid_until
    ? new Date(status.paid_until).toLocaleDateString('en-IN',
        { day: 'numeric', month: 'short', year: 'numeric' })
    : null

  const entitlementLabel = !entitled
    ? 'Sync paused — renew to turn it back on'
    : status?.entitlement_reason === 'trial'
      ? `Auto-sync on — trial ends ${paidUntil ?? 'soon'}`
      : `Auto-sync on — active until ${paidUntil ?? 'renewal'}`
```

Render it near the existing status text, and add `disabled={syncing || !entitled}` to the sync button, plus a `title={entitlementLabel}` so the reason is discoverable on hover.

In `triggerSync`'s catch block, handle the new refusal explicitly:

```tsx
      if (err?.response?.status === 402) {
        setSyncResult('error')
        setError(err.response.data?.message
          ?? 'Sync is included with an active subscription. Renew to turn it back on.')
        return
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend-react && npx vitest run src/test/SyncButton.test.tsx`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add frontend-react/src/components/SyncButton.tsx frontend-react/src/test/SyncButton.test.tsx
git commit -m "feat(sync): show entitlement state on the sync button"
```

---

### Task 7: Make the expired-page backup one-time

**Files:**
- Modify: `frontend-react/src/pages/TrialExpired.tsx`
- Modify: `backend/app.py` (add `/api/sync/expiry-backup`)
- Modify: `frontend-react/src/test/TrialExpired.test.tsx`

**Interfaces:**
- Consumes: `expiry_backup_taken()` / `mark_expiry_backup()` (Task 2).
- Produces: `POST /api/sync/expiry-backup {client_id}` returning `{"status": "success"|"already_taken"|"failed"}`.

**Why this task exists:** `TrialExpired.tsx` currently uploads on *every* mount. Left alone, an expired customer re-opens that screen and syncs for free indefinitely, defeating the entire gate.

- [ ] **Step 1: Write the failing test**

Add to `frontend-react/src/test/TrialExpired.test.tsx`:

```tsx
  it('requests the one-time expiry backup rather than a raw upload', async () => {
    mockedGet.mockResolvedValue({ data: { plans: [] } } as any)
    mockedPost.mockResolvedValue({ data: { status: 'success' } } as any)

    renderPage()

    await waitFor(() =>
      expect(mockedPost).toHaveBeenCalledWith(
        '/sync/expiry-backup',
        { client_id: 'c-1' },
        expect.objectContaining({ timeout: expect.any(Number) }),
      ),
    )
    // The ungated upload endpoint must NOT be used here — it is now gated and
    // would refuse anyway, but more importantly it is not one-time.
    expect(mockedPost).not.toHaveBeenCalledWith(
      '/sync/trigger?type=upload', expect.anything(), expect.anything())
  })

  it('reports an already-taken backup as done, not failed', async () => {
    mockedGet.mockResolvedValue({ data: { plans: [] } } as any)
    mockedPost.mockResolvedValue({ data: { status: 'already_taken' } } as any)

    renderPage()

    expect(await screen.findByText(/your data is backed up to the cloud/i))
      .toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend-react && npx vitest run src/test/TrialExpired.test.tsx`
Expected: FAIL — still calls `/sync/trigger?type=upload`

- [ ] **Step 3: Write minimal implementation**

Add to `backend/app.py` beside `/api/sync/subscription`:

```python
    @app.route('/api/sync/expiry-backup', methods=['POST'])
    def trigger_expiry_backup():
        """One-time post-expiry upload so bills earned while paid are not
        stranded on the device. Deliberately NOT entitlement-gated — but it runs
        at most once per expiry, so it cannot be used as a free sync channel."""
        from flask import request
        scheduler = _get_or_init_scheduler()
        if not scheduler:
            return {'error': 'Sync not available',
                    'message': _sync_init_error[0] or 'Unknown error'}, 400

        data = request.get_json() or {}
        client_id = data.get('client_id')
        if not client_id:
            return {'error': 'client_id is required'}, 400

        if scheduler.expiry_backup_taken(client_id):
            return {'status': 'already_taken'}, 200

        result = scheduler.sync_service.sync_all(client_id)
        if result.get('status') in ('success', 'completed'):
            scheduler.mark_expiry_backup(client_id)
            return {'status': 'success', 'result': result}, 200
        return {'status': 'failed', 'result': result}, 200
```

In `TrialExpired.tsx`, change the mount effect's call from

```tsx
    api.post('/sync/trigger?type=upload', null, { timeout: EXPIRY_SYNC_TIMEOUT_MS })
```

to

```tsx
    api.post('/sync/expiry-backup', { client_id: client?.client_id },
      { timeout: EXPIRY_SYNC_TIMEOUT_MS })
```

and treat `already_taken` as success:

```tsx
        const status = res.data?.status
        setBackup(status === 'success' || status === 'completed' || status === 'already_taken'
          ? 'done' : 'failed')
```

Guard the effect on `client?.client_id` being present, and add it to the dependency array.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend-react && npx vitest run src/test/TrialExpired.test.tsx`
Expected: 10 passed

- [ ] **Step 5: Full verification and commit**

```bash
cd backend && python3 -m pytest -q
cd ../frontend-react && npx tsc --noEmit -p tsconfig.json && npx vitest run
git add backend/app.py frontend-react/src/pages/TrialExpired.tsx frontend-react/src/test/TrialExpired.test.tsx
git commit -m "feat(sync): make the post-expiry backup fire exactly once"
```

Expected: backend all pass, `tsc` exit 0, frontend all pass.

---

### Task 8: Resolve client_id without waiting for a user action

**Files:**
- Modify: `backend/services/sync_scheduler.py`
- Test: `backend/tests/test_sync_client_resolution.py` (create)

**Interfaces:**
- Produces: `SyncScheduler.resolve_client_id() -> str|None`, called at the top of `run_one_cycle()` when `current_client_id` is unset.

**Why this task exists:** the live backend reports `client_id: null`. `set_client_id()` is only ever called by `/api/sync/set-client`, which the SyncButton hits — so until a user manually clicks Sync, the background loop has no client and the download half of every cycle is skipped. The desktop backend is single-tenant (exactly one `client_entry` row), so the scheduler can resolve it itself rather than depending on a UI action.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_sync_client_resolution.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python3 -m pytest tests/test_sync_client_resolution.py -v`
Expected: FAIL with `AttributeError: 'SyncScheduler' object has no attribute 'resolve_client_id'`

- [ ] **Step 3: Write minimal implementation**

Add to `SyncScheduler`:

```python
    def resolve_client_id(self):
        """Find this device's client without needing a UI action.

        The desktop backend is single-tenant — exactly one client_entry row — so
        the loop can identify itself. Returns None when there is no account yet,
        or (defensively) when there is more than one, since syncing the wrong
        tenant's data is far worse than not syncing.
        """
        try:
            with self.sync_service.sqlite_engine.connect() as conn:
                rows = conn.execute(text(
                    "SELECT client_id FROM client_entry LIMIT 2")).fetchall()
        except Exception as e:
            logger.warning(f"[SyncScheduler] Could not resolve client_id: {e}")
            return None

        if len(rows) != 1:
            return None
        return str(rows[0][0])
```

Then at the very top of `run_one_cycle()`, before the billing refresh:

```python
        if not self.current_client_id:
            resolved = self.resolve_client_id()
            if resolved:
                self.current_client_id = resolved
                logger.info(f"[SyncScheduler] Resolved client_id: {resolved}")
        cid = self.current_client_id
```

(replacing the existing `cid = self.current_client_id` line).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python3 -m pytest tests/test_sync_client_resolution.py -v`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
cd backend && python3 -m pytest -q
git add backend/services/sync_scheduler.py backend/tests/test_sync_client_resolution.py
git commit -m "feat(sync): resolve client_id automatically so the loop runs without a UI action"
```

---

## Manual verification

Automated tests cannot cover the threaded loop end to end. After Task 7:

1. Set `SYNC_INTERVAL_HOURS=1` and a `DB_URL` in `backend/env.local` (note: `electron/main.js` passes `DB_URL: ''` when `env.local` is absent, which shadows `backend/.env` — create `env.local` or dev sync stays dead).
2. Start the app, log in, confirm `GET /api/sync/status` now reports `running: true` **with** a non-null `next_sync`. Both together is the proof the thread is alive; `running` alone was the old lie.
3. In Supabase, set the client's `subscription_end_date` to the past. Within one interval the loop should log "Entitlement lapsed — taking final backup", upload once, then idle.
4. Confirm a second interval passes with no further upload.
5. Set `subscription_end_date` a month ahead. Within one interval the loop should resume, and the marker row (`sync_metadata` where `table_name='expiry_backup'`) should be gone.
6. While expired, confirm the Sync button is disabled and clicking the API directly returns 402.

## Out of scope

- Adding a 6-month `billing_cycle` or new Razorpay plans — admin-set end dates cover it.
- Seeding `razorpay_monthly_plan_id` on Starter / Professional / Enterprise (real checkout still 503s until this is done).
- Removing `DB_URL` from the desktop or moving sync behind an authenticated API. This gate is a commercial control, not a security boundary.
