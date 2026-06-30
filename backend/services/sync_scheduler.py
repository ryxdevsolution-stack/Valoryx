"""
Background Sync Scheduler - Runs bidirectional sync every 1 hour
Handles both upload (SQLite → Supabase) and download (Supabase → SQLite)
"""
import os
import logging
import threading
import time
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


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

                logger.info(f"[SyncScheduler] Running scheduled sync (next at {self.next_sync_time.strftime('%H:%M')})")

                # Run upload sync (always)
                upload_result = self.sync_service.sync_all(self.current_client_id)
                logger.info(f"[SyncScheduler] Upload: {upload_result.get('status', 'unknown')}")

                # Run download sync if client_id is set
                if self.current_client_id and self.sync_mode in ['download_only', 'bidirectional']:
                    download_result = self.sync_service.download_all(self.current_client_id)
                    logger.info(f"[SyncScheduler] Download: {download_result.get('status', 'unknown')}")

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
            "sync_mode": self.sync_mode,
            "client_id": self.current_client_id,
            "next_sync": self.next_sync_time.isoformat() if self.next_sync_time else None,
            "last_upload": self.sync_service.last_sync_time.isoformat() if self.sync_service.last_sync_time else None,
            "last_download": self.sync_service.last_download_time.isoformat() if self.sync_service.last_download_time else None
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
