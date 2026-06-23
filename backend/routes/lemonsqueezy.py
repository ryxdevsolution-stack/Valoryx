import hmac
import hashlib
import uuid
import logging
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify
from extensions import db
from models.subscription_model import SubscriptionPlan, PaymentTransaction
from models.client_model import ClientEntry
from utils.audit_logger import log_action
from utils.cache_helper import get_cache_manager
from routes.admin import _email_enabled
from utils.email_service import (
    send_subscription_activated,
    send_subscription_cancelled,
    send_subscription_reactivated,
    send_plan_switched,
)
from config import Config

logger = logging.getLogger(__name__)

lemonsqueezy_bp = Blueprint('lemonsqueezy', __name__)


def _verify_ls_signature(body: str, signature: str) -> bool:
    """Verify Lemon Squeezy webhook HMAC-SHA256 signature."""
    secret = Config.LEMONSQUEEZY_WEBHOOK_SECRET
    if not secret:
        logger.error('[LS Webhook] LEMONSQUEEZY_WEBHOOK_SECRET not configured')
        return False
    expected = hmac.new(
        secret.encode('utf-8'),
        body.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


def _activate_ls_subscription(client_id, plan_id, billing_cycle, ls_sub_id, ls_order_id, amount_cents, end_date):
    """
    Activate or renew a Lemon Squeezy subscription.
    Mirrors the Razorpay invoice.paid activation flow — same outcome,
    different gateway fields on PaymentTransaction.
    """
    client_entry = ClientEntry.query.filter_by(client_id=str(client_id)).first()
    if not client_entry:
        logger.warning(f'[LS Webhook] ClientEntry not found for client_id {client_id}')
        return False, 'client not found'

    old_data = client_entry.to_dict()

    # Create transaction record
    transaction = PaymentTransaction(
        transaction_id=str(uuid.uuid4()),
        client_id=client_id,
        plan_id=plan_id,
        gateway='lemonsqueezy',
        ls_subscription_id=ls_sub_id,
        ls_order_id=ls_order_id,
        amount=amount_cents,
        currency='USD',
        billing_cycle=billing_cycle,
        status='paid',
        paid_at=datetime.utcnow(),
        created_at=datetime.utcnow(),
    )
    db.session.add(transaction)

    # Activate client
    client_entry.subscription_status = 'active'
    client_entry.plan_id = plan_id
    client_entry.subscription_end_date = end_date
    client_entry.lemon_squeezy_subscription_id = ls_sub_id
    db.session.commit()

    # Clear session cache
    cache = get_cache_manager()
    cache.delete(f'user_session:{str(client_id)}')

    log_action('UPDATE', 'client_entry', str(client_id), old_data, client_entry.to_dict())

    # Send email
    plan_obj = SubscriptionPlan.query.filter_by(plan_id=plan_id).first()
    plan_name = plan_obj.name if plan_obj else 'Unknown'
    end_date_str = end_date.strftime('%d %b %Y')
    old_status = old_data.get('subscription_status')
    old_plan_id = old_data.get('plan_id')

    if old_status in ('cancelled', 'expired') and _email_enabled('email_on_subscription_activated'):
        send_subscription_reactivated(
            client_entry.email, client_entry.client_name, plan_name,
            billing_cycle, amount_cents, end_date_str,
        )
    elif old_plan_id and str(old_plan_id) != str(plan_id) and _email_enabled('email_on_plan_switched'):
        old_plan = SubscriptionPlan.query.filter_by(plan_id=old_plan_id).first()
        old_plan_name = old_plan.name if old_plan else 'Unknown'
        send_plan_switched(
            client_entry.email, client_entry.client_name, old_plan_name, plan_name,
            billing_cycle, amount_cents, end_date_str,
        )
    elif _email_enabled('email_on_subscription_activated'):
        send_subscription_activated(
            client_entry.email, client_entry.client_name, plan_name,
            billing_cycle, amount_cents, end_date_str,
        )

    logger.info(f'[LS Webhook] Subscription activated for client {client_id}, end_date {end_date}')
    return True, 'activated'


@lemonsqueezy_bp.route('/webhook/lemonsqueezy', methods=['POST'])
def lemonsqueezy_webhook():
    """
    Lemon Squeezy webhook — handles foreign subscription lifecycle.

    Handles:
      subscription_created         — first payment, activate subscription
      subscription_payment_success — renewal, extend subscription
      subscription_cancelled       — mark cancelled, keep access until end_date
      subscription_expired         — mark expired (all retries exhausted)

    Configure in Lemon Squeezy Dashboard → Settings → Webhooks:
      URL: https://your-domain.com/api/subscription/webhook/lemonsqueezy
      Events: subscription_created, subscription_payment_success,
              subscription_cancelled, subscription_expired
    """
    try:
        signature = request.headers.get('X-Signature', '')
        body = request.get_data(as_text=True)

        if not _verify_ls_signature(body, signature):
            logger.warning('[LS Webhook] Invalid signature — rejecting')
            return jsonify({'error': 'Invalid webhook signature'}), 400

        payload = request.get_json()
        event = payload.get('meta', {}).get('event_name', '')
        logger.info(f'[LS Webhook] Received event: {event}')

        data = payload.get('data', {})
        attributes = data.get('attributes', {})
        meta_custom = payload.get('meta', {}).get('custom_data', {})

        # client_id and plan_id are passed as custom_data when creating the checkout
        client_id = meta_custom.get('client_id')
        plan_id = meta_custom.get('plan_id')
        billing_cycle = meta_custom.get('billing_cycle', 'monthly')

        if not client_id or not plan_id:
            logger.warning(f'[LS Webhook] Missing client_id or plan_id in custom_data for event {event}')
            return jsonify({'status': 'ignored', 'reason': 'missing custom_data'}), 200

        # ----------------------------------------------------------------
        # subscription_created / subscription_payment_success — activate
        # ----------------------------------------------------------------
        if event in ('subscription_created', 'subscription_payment_success'):
            ls_sub_id = str(data.get('id', ''))
            ls_order_id = str(attributes.get('order_id', ''))

            # Idempotency — skip if this subscription+event combo was already processed
            if ls_sub_id:
                existing = PaymentTransaction.query.filter_by(
                    ls_subscription_id=ls_sub_id,
                    status='paid',
                ).first()
                if existing and event == 'subscription_created':
                    logger.info(f'[LS Webhook] Subscription {ls_sub_id} already activated — skipping')
                    return jsonify({'status': 'already_processed'}), 200

            # Determine end date from LS renews_at field
            renews_at = attributes.get('renews_at')
            if renews_at:
                try:
                    end_date = datetime.strptime(renews_at[:10], '%Y-%m-%d')
                except ValueError:
                    end_date = datetime.utcnow() + (timedelta(days=365) if billing_cycle == 'yearly' else timedelta(days=30))
            else:
                end_date = datetime.utcnow() + (timedelta(days=365) if billing_cycle == 'yearly' else timedelta(days=30))

            # Amount in cents from LS
            amount_cents = attributes.get('first_subscription_item', {}).get('price', 0)

            success, message = _activate_ls_subscription(
                client_id, plan_id, billing_cycle,
                ls_sub_id, ls_order_id, amount_cents, end_date
            )

            status_code = 200 if success else 500
            return jsonify({'status': message}), status_code

        # ----------------------------------------------------------------
        # subscription_cancelled — mark cancelled, keep access until end_date
        # ----------------------------------------------------------------
        if event == 'subscription_cancelled':
            ls_sub_id = str(data.get('id', ''))
            client_entry = ClientEntry.query.filter_by(
                lemon_squeezy_subscription_id=ls_sub_id
            ).first()

            if not client_entry:
                logger.warning(f'[LS Webhook] No client found for ls_sub_id {ls_sub_id}')
                return jsonify({'status': 'ignored', 'reason': 'client not found'}), 200

            old_data = client_entry.to_dict()
            client_entry.subscription_status = 'cancelled'
            db.session.commit()

            log_action('UPDATE', 'client_entry', str(client_entry.client_id), old_data, client_entry.to_dict())

            if _email_enabled('email_on_subscription_cancelled'):
                send_subscription_cancelled(
                    client_entry.email,
                    client_entry.client_name,
                    client_entry.subscription_end_date.strftime('%d %b %Y') if client_entry.subscription_end_date else 'N/A',
                )

            logger.info(f'[LS Webhook] Subscription cancelled for client {client_entry.client_id}')
            return jsonify({'status': 'cancelled'}), 200

        # ----------------------------------------------------------------
        # subscription_expired — mark expired (all retries exhausted)
        # ----------------------------------------------------------------
        if event == 'subscription_expired':
            ls_sub_id = str(data.get('id', ''))
            client_entry = ClientEntry.query.filter_by(
                lemon_squeezy_subscription_id=ls_sub_id
            ).first()

            if not client_entry:
                logger.warning(f'[LS Webhook] No client found for ls_sub_id {ls_sub_id}')
                return jsonify({'status': 'ignored', 'reason': 'client not found'}), 200

            old_data = client_entry.to_dict()
            client_entry.subscription_status = 'expired'
            db.session.commit()

            log_action('UPDATE', 'client_entry', str(client_entry.client_id), old_data, client_entry.to_dict())
            logger.info(f'[LS Webhook] Subscription expired for client {client_entry.client_id}')
            return jsonify({'status': 'expired'}), 200

        # Unknown event — acknowledge so LS doesn't retry
        logger.info(f'[LS Webhook] Unhandled event {event} — ignoring')
        return jsonify({'status': 'ignored'}), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f'[LS Webhook] Unhandled error: {e}')
        return jsonify({'error': 'Internal server error'}), 500
