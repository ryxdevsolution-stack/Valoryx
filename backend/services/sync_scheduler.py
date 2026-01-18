"""
Background Sync Scheduler - Runs sync every 2 hours
"""
import os
import logging
import threading
import time
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class SyncScheduler:
    """
    Runs background sync on a fixed interval (default: 2 hours).

    Uses threading to run in background without blocking Flask.
    """

    def __init__(self, sync_service):
        self.sync_service = sync_service
        self.interval_hours = int(os.getenv('SYNC_INTERVAL_HOURS', '2'))
        self.running = False
        self.thread = None
        self.next_sync_time = None

    def start(self):
        """Start the background sync scheduler"""
        if self.running:
            logger.warning("[SyncScheduler] Already running")
            return

        # Initialize sync service
        if not self.sync_service.initialize():
            logger.warning("[SyncScheduler] Sync service initialization failed - scheduler disabled")
            return

        self.running = True
        self.thread = threading.Thread(target=self._run_loop, daemon=True)
        self.thread.start()

        logger.info(f"[SyncScheduler] Started - syncing every {self.interval_hours} hours")

    def stop(self):
        """Stop the background sync scheduler"""
        self.running = False
        if self.thread:
            self.thread.join(timeout=5)
        logger.info("[SyncScheduler] Stopped")

    def trigger_sync_now(self):
        """Manually trigger a sync (useful for testing or on app close)"""
        logger.info("[SyncScheduler] Manual sync triggered")
        try:
            return self.sync_service.sync_all()
        except Exception as e:
            logger.error(f"[SyncScheduler] Manual sync failed: {e}")
            return {"status": "failed", "error": str(e)}

    def _run_loop(self):
        """Background loop that runs sync every N hours"""
        # Run first sync after 1 minute (give app time to fully start)
        logger.info("[SyncScheduler] First sync in 1 minute...")
        time.sleep(60)

        while self.running:
            try:
                # Calculate next sync time
                self.next_sync_time = datetime.now() + timedelta(hours=self.interval_hours)

                # Run sync
                logger.info(f"[SyncScheduler] Running scheduled sync (next sync at {self.next_sync_time})")
                result = self.sync_service.sync_all()

                logger.info(f"[SyncScheduler] Sync result: {result.get('status', 'unknown')}")

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
        """Get scheduler status for API endpoint"""
        return {
            "running": self.running,
            "interval_hours": self.interval_hours,
            "next_sync": self.next_sync_time.isoformat() if self.next_sync_time else None,
            "last_sync": self.sync_service.last_sync_time.isoformat() if self.sync_service.last_sync_time else None
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
            sync_scheduler.trigger_sync_now()
            sync_scheduler.stop()

    atexit.register(on_shutdown)

    return sync_scheduler
