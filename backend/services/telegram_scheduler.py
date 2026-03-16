"""
Telegram Daily Report Scheduler

Sends a daily business summary to every active client that has a
telegram_chat_id configured in client_entry.

Schedule: once per day at TELEGRAM_REPORT_HOUR:TELEGRAM_REPORT_MINUTE (IST).
Defaults to 21:00 IST (9 PM).

Design follows services/sync_scheduler.py exactly:
  - Daemon thread with 60-second sleep chunks for clean shutdown
  - Scheduler disabled silently when TELEGRAM_BOT_TOKEN is absent
  - Each client failure is caught individually — one bad chat ID never
    blocks the remaining clients
"""
import os
import logging
import threading
import time
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
        """Start the background scheduler thread and the chat-ID responder."""
        if self.running:
            logger.warning("[TelegramScheduler] Already running")
            return

        self.running = True

        # Daily report thread
        self.thread = threading.Thread(target=self._run_loop, daemon=True)
        self.thread.start()

        # Bot auto-responder thread (replies to every incoming message with chat ID)
        responder = threading.Thread(target=self._poll_and_respond, daemon=True)
        responder.start()

        logger.info(
            f"[TelegramScheduler] Started — daily reports at "
            f"{self.report_hour:02d}:{self.report_minute:02d} IST | chat-ID responder active"
        )

    def stop(self):
        """Signal the scheduler thread to stop."""
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
        """Return seconds from now until the next scheduled report time (IST)."""
        now = datetime.now(IST)
        target = now.replace(
            hour=self.report_hour,
            minute=self.report_minute,
            second=0,
            microsecond=0,
        )
        if now >= target:
            # Today's window already passed — aim for tomorrow
            target += timedelta(days=1)
        return (target - now).total_seconds()

    def _run_loop(self):
        """Background thread: sleep until report time, send reports, repeat."""
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
                # Back off 5 minutes before retrying to avoid tight error loops
                time.sleep(300)

    # ------------------------------------------------------------------
    # Chat-ID auto-responder
    # ------------------------------------------------------------------

    def _poll_and_respond(self):
        """
        Long-poll for incoming bot messages and reply with the sender's chat ID.

        This lets any user find their chat ID by simply sending any message to
        @Valoryxv1bot — the bot instantly replies with their numeric ID so they
        can paste it into the Profile settings.

        Uses getUpdates with a 25-second long-poll timeout and tracks the
        offset so each update is processed exactly once.
        """
        import httpx

        token = os.getenv('TELEGRAM_BOT_TOKEN', '')
        if not token:
            return

        base_url = f"https://api.telegram.org/bot{token}"
        offset = 0

        logger.info("[TelegramBot] Chat-ID responder started")

        while self.running:
            try:
                resp = httpx.get(
                    f"{base_url}/getUpdates",
                    params={"timeout": 25, "offset": offset, "allowed_updates": ["message"]},
                    timeout=30,
                )
                data = resp.json()

                if not data.get("ok"):
                    time.sleep(5)
                    continue

                for update in data.get("result", []):
                    offset = update["update_id"] + 1
                    msg = update.get("message", {})
                    chat = msg.get("chat", {})
                    chat_id = chat.get("id")
                    first_name = chat.get("first_name", "there")

                    if not chat_id:
                        continue

                    reply = (
                        f"Hi {first_name}!\n\n"
                        f"Your Telegram Chat ID is:\n"
                        f"<code>{chat_id}</code>\n\n"
                        f"Copy that number and paste it in <b>Valoryx → Profile → Telegram Daily Reports</b> to start receiving your daily business summary."
                    )

                    try:
                        httpx.post(
                            f"{base_url}/sendMessage",
                            json={"chat_id": chat_id, "text": reply, "parse_mode": "HTML"},
                            timeout=10,
                        )
                        logger.info(f"[TelegramBot] Replied with chat ID to {first_name} ({chat_id})")
                    except Exception as e:
                        logger.error(f"[TelegramBot] Failed to reply to {chat_id}: {e}")

            except Exception as e:
                if self.running:
                    logger.error(f"[TelegramBot] Polling error: {e}")
                    time.sleep(10)

        logger.info("[TelegramBot] Chat-ID responder stopped")

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

                for user in users:
                    try:
                        message = generate_daily_summary(str(user.client_id))
                        ok = send_telegram_message(user.telegram_chat_id, message)
                        if ok:
                            sent += 1
                        else:
                            failed += 1
                    except Exception as e:
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

    Returns None (silently) when TELEGRAM_BOT_TOKEN is not set, so the rest
    of the app continues to function normally without Telegram configured.
    """
    global _telegram_scheduler

    if not os.getenv('TELEGRAM_BOT_TOKEN', ''):
        logger.info("[TelegramScheduler] TELEGRAM_BOT_TOKEN not set — scheduler disabled")
        return None

    _telegram_scheduler = TelegramScheduler(app)
    _telegram_scheduler.start()

    import atexit
    atexit.register(lambda: _telegram_scheduler.stop() if _telegram_scheduler else None)

    return _telegram_scheduler


def get_telegram_scheduler() -> 'TelegramScheduler | None':
    """Return the global scheduler instance (may be None if not configured)."""
    return _telegram_scheduler
