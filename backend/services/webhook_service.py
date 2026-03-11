"""
Webhook dispatch service.

dispatch_event(client_id, event_type, payload_dict)
    Finds all active endpoints for client_id that subscribe to event_type,
    creates WebhookDelivery rows (status='pending'), then fires each in a
    background daemon thread with exponential-backoff retry.

Retry schedule (max 3 attempts):
    Attempt 1 → immediate
    Attempt 2 → 1 min after failure
    Attempt 3 → 5 min after attempt 2
    Attempt 4 (final) → 30 min after attempt 3

A delivery is marked 'failed' permanently after the final attempt.

Payload signing:
    X-Valoryx-Signature: sha256=<HMAC-SHA256(secret, raw_body)>
"""
import hashlib
import hmac
import json
import logging
import threading
import time
from datetime import datetime

import requests

from extensions import db

logger = logging.getLogger(__name__)

_RETRY_DELAYS = [0, 60, 300, 1800]  # seconds before each attempt (0 = immediate)
_MAX_ATTEMPTS = len(_RETRY_DELAYS)
_REQUEST_TIMEOUT = 10  # seconds


def _sign_payload(secret: str, raw_body: bytes) -> str:
    sig = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return f"sha256={sig}"


def _deliver(app, delivery_id: str):
    """Background thread: deliver one WebhookDelivery, retrying on failure."""
    with app.app_context():
        from models.webhook_model import WebhookDelivery, WebhookEndpoint

        delivery = WebhookDelivery.query.get(delivery_id)
        if not delivery:
            return

        endpoint = WebhookEndpoint.query.get(delivery.endpoint_id)
        if not endpoint or not endpoint.is_active:
            delivery.status = 'failed'
            delivery.error = 'Endpoint deactivated before delivery'
            db.session.commit()
            return

        payload_dict = delivery.payload if isinstance(delivery.payload, dict) else json.loads(delivery.payload)
        raw_body = json.dumps(payload_dict, separators=(',', ':')).encode()
        signature = _sign_payload(endpoint.secret, raw_body)

        headers = {
            'Content-Type': 'application/json',
            'X-Valoryx-Event': delivery.event_type,
            'X-Valoryx-Delivery': str(delivery.delivery_id),
            'X-Valoryx-Signature': signature,
        }

        for attempt_num in range(1, _MAX_ATTEMPTS + 1):
            # Wait before this attempt (0 for attempt 1)
            delay = _RETRY_DELAYS[attempt_num - 1]
            if delay > 0:
                time.sleep(delay)

            delivery.attempt = attempt_num
            delivery.status = 'retrying' if attempt_num > 1 else 'pending'

            try:
                resp = requests.post(
                    endpoint.url,
                    data=raw_body,
                    headers=headers,
                    timeout=_REQUEST_TIMEOUT,
                )
                delivery.response_status = resp.status_code
                delivery.response_body = resp.text[:2000]  # cap stored body

                if 200 <= resp.status_code < 300:
                    delivery.status = 'success'
                    delivery.delivered_at = datetime.utcnow()
                    delivery.error = None
                    db.session.commit()
                    logger.info('[Webhook] Delivered %s → %s (HTTP %s)',
                                delivery.event_type, endpoint.url, resp.status_code)
                    return

                delivery.error = f'HTTP {resp.status_code}'

            except requests.exceptions.Timeout:
                delivery.error = 'Timeout'
                delivery.response_status = None
            except requests.exceptions.RequestException as exc:
                delivery.error = str(exc)[:500]
                delivery.response_status = None

            try:
                db.session.commit()
            except Exception:
                db.session.rollback()

            logger.warning('[Webhook] Attempt %d/%d failed for delivery %s: %s',
                           attempt_num, _MAX_ATTEMPTS, delivery_id, delivery.error)

        # All attempts exhausted
        delivery.status = 'failed'
        delivery.next_retry_at = None
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()
        logger.error('[Webhook] Permanently failed delivery %s after %d attempts', delivery_id, _MAX_ATTEMPTS)

        # Disable endpoint if consistently failing (optional policy — 3 consecutive failures)
        _maybe_disable_endpoint(app, endpoint.endpoint_id)


def _maybe_disable_endpoint(app, endpoint_id: str):
    """Disable an endpoint if its last 3 deliveries all failed."""
    with app.app_context():
        from models.webhook_model import WebhookDelivery, WebhookEndpoint
        recent = (
            WebhookDelivery.query
            .filter_by(endpoint_id=endpoint_id)
            .order_by(WebhookDelivery.created_at.desc())
            .limit(3)
            .all()
        )
        if len(recent) == 3 and all(d.status == 'failed' for d in recent):
            ep = WebhookEndpoint.query.get(endpoint_id)
            if ep and ep.is_active:
                ep.is_active = False
                try:
                    db.session.commit()
                    logger.warning('[Webhook] Auto-disabled endpoint %s after 3 consecutive failures', endpoint_id)
                    # Capture primitives before the context closes
                    _notify_disabled(app, ep.client_id, ep.url)
                except Exception:
                    db.session.rollback()


def _notify_disabled(app, client_id: str, webhook_url: str):
    """Send disabled-notification email using primitive values (avoids detached ORM objects)."""
    try:
        with app.app_context():
            from models.client_model import ClientEntry
            from utils.email_service import send_webhook_disabled_email
            client = ClientEntry.query.get(client_id)
            if client:
                send_webhook_disabled_email(client.email, client.client_name, webhook_url)
    except Exception as exc:
        logger.warning('[Webhook] Failed to send disabled-notification email: %s', exc)


def dispatch_event(app, client_id: str, event_type: str, payload: dict):
    """
    Find active endpoints that match event_type for client_id,
    create delivery records, and fire background threads.

    This function must be called from within an app context.
    """
    from models.webhook_model import WebhookEndpoint, WebhookDelivery
    import secrets as _secrets

    endpoints = WebhookEndpoint.query.filter_by(
        client_id=client_id,
        is_active=True,
    ).all()

    for ep in endpoints:
        # Check event filter
        subscribed = ep.events.strip()
        if subscribed != '*':
            subscribed_list = [e.strip() for e in subscribed.split(',')]
            if event_type not in subscribed_list:
                continue

        delivery = WebhookDelivery(
            delivery_id=_secrets.token_hex(16),
            endpoint_id=ep.endpoint_id,
            client_id=client_id,
            event_type=event_type,
            payload=payload,
            attempt=1,
            status='pending',
        )
        db.session.add(delivery)

        try:
            db.session.commit()
        except Exception:
            db.session.rollback()
            continue

        # Fire background delivery thread
        t = threading.Thread(
            target=_deliver,
            args=(app, delivery.delivery_id),
            daemon=True,
            name=f'webhook-{str(delivery.delivery_id)[:8]}',
        )
        t.start()
        logger.info('[Webhook] Dispatched event %s → endpoint %s', event_type, ep.endpoint_id)
