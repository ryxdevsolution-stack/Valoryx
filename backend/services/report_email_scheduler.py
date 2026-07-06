"""
Report Email Scheduler

Sends a daily or weekly business summary email to users who have opted in
via report_email_frequency ('daily' | 'weekly'). Default is 'off' — nobody
gets this email unless they asked for it.

Rules that keep this from becoming spam:
  - Opt-in only (report_email_frequency defaults to 'off').
  - Skipped entirely for a client with zero invoices that day/period —
    no "nothing happened today" email.
  - 'weekly' only fires once, on Monday (covers the preceding week).
  - Every email carries a one-click unsubscribe link.

Schedule: once per day at REPORT_EMAIL_HOUR:REPORT_EMAIL_MINUTE (IST).
Defaults to 21:00 IST (9 PM) — same slot the Telegram reports used.
"""
import os
import logging
import secrets
import threading
import time
from collections import defaultdict
from datetime import datetime, timedelta

import pytz

logger = logging.getLogger(__name__)

IST = pytz.timezone('Asia/Kolkata')


class ReportEmailScheduler:
    """Background scheduler that sends daily/weekly business summary emails."""

    def __init__(self, app):
        self.app = app
        self.running = False
        self.thread = None
        self.report_hour = int(os.getenv('REPORT_EMAIL_HOUR', '21'))
        self.report_minute = int(os.getenv('REPORT_EMAIL_MINUTE', '0'))

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def start(self):
        if self.running:
            logger.warning("[ReportEmailScheduler] Already running")
            return

        self.running = True
        self.thread = threading.Thread(target=self._run_loop, daemon=True)
        self.thread.start()

        logger.info(
            f"[ReportEmailScheduler] Started — reports at "
            f"{self.report_hour:02d}:{self.report_minute:02d} IST"
        )

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join(timeout=5)
        logger.info("[ReportEmailScheduler] Stopped")

    def trigger_now(self):
        """Manually fire the report (useful for testing via /api/reports/trigger)."""
        logger.info("[ReportEmailScheduler] Manual trigger invoked")
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
                    f"[ReportEmailScheduler] Next report at "
                    f"{next_fire.strftime('%Y-%m-%d %H:%M IST')}"
                )

                elapsed = 0.0
                while elapsed < wait_seconds and self.running:
                    chunk = min(60.0, wait_seconds - elapsed)
                    time.sleep(chunk)
                    elapsed += chunk

                if self.running:
                    self._send_all_reports()

            except Exception as e:
                logger.error(f"[ReportEmailScheduler] Error in scheduler loop: {e}")
                time.sleep(300)

    # ------------------------------------------------------------------
    # Report delivery
    # ------------------------------------------------------------------

    def _send_all_reports(self):
        """Query opted-in users and send each a summary, skipping quiet days."""
        is_monday = datetime.now(IST).weekday() == 0
        logger.info("[ReportEmailScheduler] Sending report emails...")
        sent = 0
        skipped_no_activity = 0
        failed = 0

        try:
            with self.app.app_context():
                from extensions import db
                from models.user_model import User
                from utils.email_service import send_daily_summary_email
                from services.daily_summary_service import compute_daily_summary, compute_weekly_summary
                from config import Config

                frequencies = ['daily'] + (['weekly'] if is_monday else [])

                users = (
                    db.session.query(User)
                    .filter(
                        User.is_active == True,
                        User.report_email_frequency.in_(frequencies),
                    )
                    .all()
                )

                if not users:
                    logger.info("[ReportEmailScheduler] No opted-in users for this run")
                    return

                # Group by (client_id, frequency) — one summary computation per group,
                # since daily and weekly recipients on the same account need different
                # date ranges (and avoids redundant DB queries within the same range).
                client_groups: dict = defaultdict(list)
                for user in users:
                    client_groups[(str(user.client_id), user.report_email_frequency)].append(user)

                for (client_id, frequency), recipients in client_groups.items():
                    try:
                        summary = (
                            compute_weekly_summary(client_id) if frequency == 'weekly'
                            else compute_daily_summary(client_id)
                        )
                        if not summary['has_activity']:
                            skipped_no_activity += len(recipients)
                            continue

                        for user in recipients:
                            if not user.report_unsubscribe_token:
                                user.report_unsubscribe_token = secrets.token_urlsafe(32)
                                db.session.commit()

                            unsubscribe_link = (
                                f"{Config.get_frontend_url()}/api/reports/unsubscribe"
                                f"?token={user.report_unsubscribe_token}"
                            )
                            ok = send_daily_summary_email(
                                user.email, summary, unsubscribe_link,
                                frequency=user.report_email_frequency,
                            )
                            if ok:
                                sent += 1
                            else:
                                failed += 1
                    except Exception as e:
                        for user in recipients:
                            logger.error(
                                f"[ReportEmailScheduler] Failed for user "
                                f"{user.user_id} ({user.email}): {e}"
                            )
                            failed += 1

        except Exception as e:
            logger.error(f"[ReportEmailScheduler] Critical error in _send_all_reports: {e}")
            return

        logger.info(
            f"[ReportEmailScheduler] Done — sent: {sent}, "
            f"skipped (no activity): {skipped_no_activity}, failed: {failed}"
        )


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_report_email_scheduler: 'ReportEmailScheduler | None' = None


def init_report_email_scheduler(app) -> 'ReportEmailScheduler | None':
    """
    Initialise and start the report email scheduler.

    Unlike the Telegram scheduler, this one always starts (email delivery
    itself already no-ops safely when SMTP isn't configured) — the actual
    gate that prevents sending is opt-in per-user, not an env var.
    """
    global _report_email_scheduler

    is_debug = os.getenv('DEBUG', 'False').lower() in ('true', '1', 'yes')
    is_reloader_child = os.getenv('WERKZEUG_RUN_MAIN') == 'true'

    if is_debug and not is_reloader_child:
        return None

    _report_email_scheduler = ReportEmailScheduler(app)
    _report_email_scheduler.start()

    import atexit
    atexit.register(lambda: _report_email_scheduler.stop() if _report_email_scheduler else None)

    return _report_email_scheduler


def get_report_email_scheduler() -> 'ReportEmailScheduler | None':
    return _report_email_scheduler
