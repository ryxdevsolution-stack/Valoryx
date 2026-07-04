"""
Subscription Reconciler — safety-net for autopay renewals.

Razorpay subscription renewals reach us only via the invoice.paid webhook. If a
webhook is ever missed (endpoint down, secret mismatch, event not subscribed),
the customer is charged but their access is never extended — they get locked out
despite paying. This background job removes that single point of failure.

Once an hour it fetches every client's Razorpay subscription and syncs the local
subscription_status / subscription_end_date to match Razorpay's truth:
    active / authenticated / charged -> active, end_date = current_end (never shortened)
    halted / completed               -> expired
    cancelled                        -> cancelled
    created / pending / paused / …   -> left untouched (not yet a paid state)

It is deliberately QUIET: it updates state and writes an audit log, but sends NO
email — notifications remain the job of verify-payment (first charge) and the
webhook (renewals). This is state-repair, not messaging.
"""
import os
import logging
import threading
import time

logger = logging.getLogger(__name__)

# Razorpay subscription statuses grouped by what they mean for local access.
_RZ_ACTIVE = ('active', 'authenticated', 'charged')
_RZ_EXPIRE = ('halted', 'completed', 'expired')
_RZ_CANCEL = ('cancelled',)


def compute_reconciliation(local_status, local_end, rz_status, rz_current_end_dt):
    """
    Pure decision function (no I/O) — easy to unit test.

    Given the local state and Razorpay's state, return the target local state.
    Never shortens an existing end date. Returns:
        {'status': str, 'end_date': datetime|None, 'changed': bool}
    A Razorpay status we don't act on (created/pending/paused) yields changed=False.
    """
    if rz_status in _RZ_ACTIVE:
        new_status = 'active'
        new_end = local_end
        if rz_current_end_dt and (local_end is None or rz_current_end_dt > local_end):
            new_end = rz_current_end_dt
    elif rz_status in _RZ_EXPIRE:
        new_status = 'expired'
        new_end = local_end
    elif rz_status in _RZ_CANCEL:
        new_status = 'cancelled'
        new_end = local_end
    else:
        return {'status': local_status, 'end_date': local_end, 'changed': False}

    changed = (new_status != local_status) or (new_end != local_end)
    return {'status': new_status, 'end_date': new_end, 'changed': changed}


class SubscriptionReconciler:
    """Hourly background job that syncs local subscription state from Razorpay."""

    def __init__(self, app):
        self.app = app
        self.interval_hours = int(os.getenv('SUBSCRIPTION_RECONCILE_INTERVAL_HOURS', '1'))
        self.running = False
        self.thread = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def start(self):
        if self.running:
            logger.warning('[SubReconciler] Already running')
            return
        self.running = True
        self.thread = threading.Thread(target=self._run_loop, daemon=True, name='subscription-reconciler')
        self.thread.start()
        logger.info(f'[SubReconciler] Started — reconcile every {self.interval_hours}h')

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join(timeout=5)
        logger.info('[SubReconciler] Stopped')

    def reconcile_now(self):
        """Run one reconciliation pass immediately (used by the admin endpoint / tests)."""
        with self.app.app_context():
            return self._reconcile_all()

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _run_loop(self):
        # Give the app a minute to finish booting before the first pass.
        time.sleep(60)
        while self.running:
            try:
                with self.app.app_context():
                    summary = self._reconcile_all()
                logger.info(f'[SubReconciler] Pass complete: {summary}')
            except Exception as e:
                logger.error(f'[SubReconciler] Pass failed: {e}')

            # Sleep the interval, waking each minute so stop() is responsive.
            for _ in range(int(self.interval_hours * 3600 / 60)):
                if not self.running:
                    break
                time.sleep(60)

    def _reconcile_all(self):
        from datetime import datetime
        from extensions import db
        from models.client_model import ClientEntry
        from models.subscription_model import SubscriptionPlan  # noqa: F401 (ensures table registered)
        from utils.audit_logger import log_action
        from utils.cache_helper import get_cache_manager
        from config import Config

        summary = {'checked': 0, 'updated': 0, 'errors': 0}

        if not Config.RAZORPAY_KEY_ID or not Config.RAZORPAY_KEY_SECRET:
            logger.info('[SubReconciler] Razorpay not configured — skipping')
            return summary

        import razorpay
        rz_client = razorpay.Client(auth=(Config.RAZORPAY_KEY_ID, Config.RAZORPAY_KEY_SECRET))

        clients = ClientEntry.query.filter(
            ClientEntry.razorpay_subscription_id.isnot(None)
        ).all()

        cache = get_cache_manager()

        for client_entry in clients:
            summary['checked'] += 1
            sub_id = client_entry.razorpay_subscription_id
            try:
                rz_sub = rz_client.subscription.fetch(sub_id)
                rz_status = rz_sub.get('status')
                current_end_ts = rz_sub.get('current_end')
                rz_end_dt = datetime.utcfromtimestamp(int(current_end_ts)) if current_end_ts else None

                decision = compute_reconciliation(
                    client_entry.subscription_status,
                    client_entry.subscription_end_date,
                    rz_status,
                    rz_end_dt,
                )
                if not decision['changed']:
                    continue

                old_data = client_entry.to_dict()
                client_entry.subscription_status = decision['status']
                client_entry.subscription_end_date = decision['end_date']
                db.session.commit()

                cache.delete(f"user_session:{str(client_entry.client_id)}")
                log_action('UPDATE', 'client_entry', str(client_entry.client_id), old_data, client_entry.to_dict())
                summary['updated'] += 1
                logger.info(
                    f'[SubReconciler] Synced client {client_entry.client_id}: '
                    f'{old_data.get("subscription_status")} -> {decision["status"]} '
                    f'(rz={rz_status}, sub={sub_id})'
                )
            except Exception as e:
                summary['errors'] += 1
                try:
                    db.session.rollback()
                except Exception:
                    pass
                logger.error(f'[SubReconciler] Failed to reconcile {sub_id}: {e}')
                # Be gentle with the Razorpay API after an error.
                time.sleep(0.5)

        return summary


# Global instance (initialised in app.py)
subscription_reconciler = None


def init_subscription_reconciler(app):
    """Start the reconciler if Razorpay is configured. Returns the instance or None."""
    global subscription_reconciler
    from config import Config

    if not Config.RAZORPAY_KEY_ID or not Config.RAZORPAY_KEY_SECRET:
        logger.info('[SubReconciler] Razorpay not configured — reconciler disabled')
        return None

    subscription_reconciler = SubscriptionReconciler(app)
    subscription_reconciler.start()
    return subscription_reconciler


def get_subscription_reconciler():
    return subscription_reconciler
