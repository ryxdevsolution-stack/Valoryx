"""
Telegram Daily Report Scheduler

Sends a daily business summary to every active user that has a
telegram_chat_id configured.

Schedule: once per day at TELEGRAM_REPORT_HOUR:TELEGRAM_REPORT_MINUTE (IST).
Defaults to 21:00 IST (9 PM).

No polling / getUpdates — outbound-only. Zero 409 conflicts.
"""
import os
import logging
import threading
import time
from collections import defaultdict
from datetime import datetime, timedelta

import pytz

logger = logging.getLogger(__name__)

IST = pytz.timezone('Asia/Kolkata')


class TelegramScheduler:
    """Background scheduler that sends daily Telegram reports."""

    def __init__(self, app):
        self.app = app
        self.running = False
        self.thread = None
        self.report_hour = int(os.getenv('TELEGRAM_REPORT_HOUR', '21'))
        self.report_minute = int(os.getenv('TELEGRAM_REPORT_MINUTE', '0'))

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def start(self):
        if self.running:
            logger.warning("[TelegramScheduler] Already running")
            return

        self.running = True
        self.thread = threading.Thread(target=self._run_loop, daemon=True)
        self.thread.start()

        logger.info(
            f"[TelegramScheduler] Started — daily reports at "
            f"{self.report_hour:02d}:{self.report_minute:02d} IST"
        )

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join(timeout=5)
        logger.info("[TelegramScheduler] Stopped")

    def trigger_now(self):
        """Manually fire the report (useful for testing via /api/telegram/trigger-report)."""
        logger.info("[TelegramScheduler] Manual trigger invoked")
        self._send_all_reports()

    # ------------------------------------------------------------------
    # Internal scheduler loop
    # ------------------------------------------------------------------

    def _seconds_until_next_report(self) -> float:
        now = datetime.now(IST)
        target = now.replace(
            hour=self.report_hour,
            minute=self.report_minute,
            second=0,
            microsecond=0,
        )
        if now >= target:
            target += timedelta(days=1)
        return (target - now).total_seconds()

    def _run_loop(self):
        while self.running:
            try:
                wait_seconds = self._seconds_until_next_report()
                next_fire = datetime.now(IST) + timedelta(seconds=wait_seconds)
                logger.info(
                    f"[TelegramScheduler] Next report at "
                    f"{next_fire.strftime('%Y-%m-%d %H:%M IST')}"
                )

                # Sleep in 60-second chunks so stop() is responsive
                elapsed = 0.0
                while elapsed < wait_seconds and self.running:
                    chunk = min(60.0, wait_seconds - elapsed)
                    time.sleep(chunk)
                    elapsed += chunk

                if self.running:
                    self._send_all_reports()

            except Exception as e:
                logger.error(f"[TelegramScheduler] Error in scheduler loop: {e}")
                time.sleep(300)

    # ------------------------------------------------------------------
    # Report delivery
    # ------------------------------------------------------------------

    def _send_all_reports(self):
        """Query all eligible users and send each a daily summary."""
        logger.info("[TelegramScheduler] Sending daily reports...")
        sent = 0
        failed = 0

        try:
            with self.app.app_context():
                from extensions import db
                from models.user_model import User
                from services.telegram_service import send_telegram_message
                from services.daily_summary_service import generate_daily_summary

                users = (
                    db.session.query(User)
                    .filter(
                        User.is_active == True,
                        User.telegram_chat_id.isnot(None),
                        User.telegram_chat_id != '',
                    )
                    .all()
                )

                if not users:
                    logger.info(
                        "[TelegramScheduler] No active users with a Telegram chat ID configured"
                    )
                    return

                # One summary per client — avoids redundant DB queries when
                # multiple users on the same account have chat IDs configured.
                client_users: dict = defaultdict(list)
                for user in users:
                    client_users[str(user.client_id)].append(user)

                for client_id, recipients in client_users.items():
                    try:
                        message = generate_daily_summary(client_id)
                        for user in recipients:
                            ok = send_telegram_message(user.telegram_chat_id, message)
                            if ok:
                                sent += 1
                            else:
                                failed += 1
                    except Exception as e:
                        for user in recipients:
                            logger.error(
                                f"[TelegramScheduler] Failed for user "
                                f"{user.user_id} ({user.email}): {e}"
                            )
                            failed += 1

        except Exception as e:
            logger.error(f"[TelegramScheduler] Critical error in _send_all_reports: {e}")
            return

        logger.info(
            f"[TelegramScheduler] Done — delivered: {sent}, failed: {failed}"
        )


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_telegram_scheduler: TelegramScheduler | None = None


def init_telegram_scheduler(app) -> 'TelegramScheduler | None':
    """
    Initialise and start the Telegram scheduler.

    Returns None silently when TELEGRAM_BOT_TOKEN is not set.
    """
    global _telegram_scheduler

    if not os.getenv('TELEGRAM_BOT_TOKEN', ''):
        logger.info("[TelegramScheduler] TELEGRAM_BOT_TOKEN not set — scheduler disabled")
        return None

    # In Werkzeug debug reloader, two processes run create_app().
    # Skip the parent (file watcher) to avoid sending duplicate reports.
    is_debug = os.getenv('DEBUG', 'False').lower() in ('true', '1', 'yes')
    is_reloader_child = os.getenv('WERKZEUG_RUN_MAIN') == 'true'

    if is_debug and not is_reloader_child:
        return None

    _telegram_scheduler = TelegramScheduler(app)
    _telegram_scheduler.start()

    import atexit
    atexit.register(lambda: _telegram_scheduler.stop() if _telegram_scheduler else None)

    return _telegram_scheduler


def get_telegram_scheduler() -> 'TelegramScheduler | None':
    return _telegram_scheduler
