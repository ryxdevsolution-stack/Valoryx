"""
Background Sync Scheduler - Runs bidirectional sync every 1 hour
Handles both upload (SQLite → Supabase) and download (Supabase → SQLite)
"""
import os
import logging
import threading
import time
from datetime import datetime, timedelta

from sqlalchemy import text

logger = logging.getLogger(__name__)

# Statuses that can carry an entitlement at all. 'expired' and 'cancelled' are
# terminal — a stale future date must never resurrect them.
ENTITLED_STATUSES = ('trial', 'active')

# Pseudo table_name in sync_metadata marking that the one-time post-expiry
# backup has been taken for a client. Matches the existing 'all' /
# 'initial_load' convention — no new table, no new column.
EXPIRY_BACKUP_KEY = 'expiry_backup'


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


class SyncScheduler:
    """
    Runs background bidirectional sync on a fixed interval (default: 1 hour).

    Sync cycle:
    1. Upload: Push unsynced local data to Supabase
    2. Download: Pull updated data from Supabase (if client_id is set)

    Uses threading to run in background without blocking Flask.
    """

    def __init__(self, sync_service):
        self.sync_service = sync_service
        self.interval_hours = int(os.getenv('SYNC_INTERVAL_HOURS', '1'))  # Default: 1 hour
        self.running = False
        self.thread = None
        self.next_sync_time = None
        self.current_client_id = None  # Set when user logs in
        self.sync_mode = 'bidirectional'  # 'upload_only', 'download_only', 'bidirectional'

    def set_client_id(self, client_id):
        """Set the current client ID for download sync"""
        self.current_client_id = client_id
        logger.info(f"[SyncScheduler] Client ID set to: {client_id}")

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

    def run_one_cycle(self):
        """Perform one sync cycle's decision and work.

        Order matters: refresh billing state from the cloud BEFORE checking
        entitlement, so a locally-forged date is corrected before it is trusted.
        A failed refresh is non-fatal — fall through to the last known local
        state so an entitled customer keeps working through a network blip.
        """
        # The loop must not depend on the user clicking Sync to learn who it is.
        if not self.current_client_id:
            resolved = self.resolve_client_id()
            if resolved:
                self.current_client_id = resolved
                logger.info(f"[SyncScheduler] Resolved client_id: {resolved}")
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

    def start(self):
        """Start the background sync scheduler"""
        if self.running:
            logger.warning("[SyncScheduler] Already running")
            return

        # _get_or_init_scheduler wires the engines directly before calling
        # start(); calling initialize() unconditionally would undo that wiring.
        if getattr(self.sync_service, 'postgres_engine', None) is None:
            if not self.sync_service.initialize():
                logger.warning("[SyncScheduler] Sync service init failed - scheduler disabled")
                return

        self.running = True
        self.thread = threading.Thread(target=self._run_loop, daemon=True)
        self.thread.start()

        logger.info(f"[SyncScheduler] Started - bidirectional sync every {self.interval_hours} hour(s)")

    def stop(self):
        """Stop the background sync scheduler"""
        self.running = False
        if self.thread:
            self.thread.join(timeout=5)
        logger.info("[SyncScheduler] Stopped")

    def trigger_sync_now(self, sync_type='upload'):
        """
        Manually trigger a sync.

        Args:
            sync_type: 'upload', 'download', or 'full' (bidirectional)

        Returns:
            dict: Sync results
        """
        logger.info(f"[SyncScheduler] Manual {sync_type} sync triggered")
        try:
            if sync_type == 'upload':
                return self.sync_service.sync_all(self.current_client_id)
            elif sync_type == 'download' and self.current_client_id:
                return self.sync_service.download_all(self.current_client_id)
            elif sync_type == 'full' and self.current_client_id:
                return self.sync_service.full_sync(self.current_client_id)
            else:
                # Default to upload if no client_id
                return self.sync_service.sync_all(self.current_client_id)
        except Exception as e:
            logger.error(f"[SyncScheduler] Manual sync failed: {e}")
            return {"status": "failed", "error": str(e)}

    def trigger_initial_load(self, client_id):
        """
        Trigger initial data load for a new device.

        Args:
            client_id: The client UUID to load data for

        Returns:
            dict: Load results
        """
        logger.info(f"[SyncScheduler] Initial load triggered for client {client_id}")
        try:
            self.current_client_id = client_id
            return self.sync_service.initial_load(client_id)
        except Exception as e:
            logger.error(f"[SyncScheduler] Initial load failed: {e}")
            return {"status": "failed", "error": str(e)}

    def check_initial_load_needed(self, client_id):
        """Check if initial load is needed for this client"""
        return self.sync_service.is_initial_load_needed(client_id)

    def _run_loop(self):
        """Background loop that runs sync every N hours"""
        # Run first sync after 1 minute (give app time to fully start)
        logger.info("[SyncScheduler] First sync in 1 minute...")
        time.sleep(60)

        while self.running:
            try:
                # Calculate next sync time
                self.next_sync_time = datetime.now() + timedelta(hours=self.interval_hours)

                logger.info(f"[SyncScheduler] Cycle starting (next at {self.next_sync_time.strftime('%H:%M')})")

                # Entitlement is decided per cycle — see run_one_cycle.
                self.run_one_cycle()

                # Sleep for interval (check every minute if we should stop)
                sleep_seconds = self.interval_hours * 3600
                for _ in range(int(sleep_seconds / 60)):
                    if not self.running:
                        break
                    time.sleep(60)

            except Exception as e:
                logger.error(f"[SyncScheduler] Error in sync loop: {e}")
                # Wait 5 minutes before retrying on error
                time.sleep(300)

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


# Global scheduler instance (initialized in app.py)
sync_scheduler = None


def init_sync_scheduler(app):
    """Initialize sync scheduler with Flask app"""
    global sync_scheduler

    # Only run scheduler in offline mode
    if app.config.get('DB_MODE') != 'offline':
        logger.info("[SyncScheduler] Not in offline mode - scheduler disabled")
        return None

    from services.sync_service import sync_service

    sync_scheduler = SyncScheduler(sync_service)
    sync_scheduler.start()

    # Register shutdown handler
    import atexit
    def on_shutdown():
        logger.info("[SyncScheduler] App shutting down - running final sync...")
        if sync_scheduler:
            sync_scheduler.trigger_sync_now('upload')  # Upload local changes before shutdown
            sync_scheduler.stop()

    atexit.register(on_shutdown)

    return sync_scheduler


def get_sync_scheduler():
    """Get the global sync scheduler instance"""
    return sync_scheduler
