import hmac
import hashlib
import uuid
import logging
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, g
from extensions import db
from models.subscription_model import SubscriptionPlan, PaymentTransaction
from models.client_model import ClientEntry
from utils.auth_middleware import authenticate
from utils.audit_logger import log_action
from utils.cache_helper import get_cache_manager
from utils.email_service import (
    send_subscription_activated,
    send_subscription_cancelled,
    send_plan_switched,
    send_subscription_reactivated,
)
from config import Config

logger = logging.getLogger(__name__)

subscription_bp = Blueprint('subscription', __name__)


def _activate_subscription(transaction, payment_id=None, signature=None):
    """
    Shared logic to activate a subscription after payment verification.
    Used for admin manual activation and the legacy order-based flow.
    For auto-renewal, webhook invoice.paid is the single source of truth.

    Returns (success: bool, message: str)
    """
    now = datetime.utcnow()
    transaction.status = 'paid'
    if payment_id:
        transaction.razorpay_payment_id = payment_id
    if signature:
        transaction.razorpay_signature = signature
    transaction.paid_at = now

    client_entry = ClientEntry.query.filter_by(client_id=str(transaction.client_id)).first()
    if not client_entry:
        db.session.commit()
        return True, 'Payment recorded but client not found'

    old_data = client_entry.to_dict()

    if transaction.billing_cycle == 'yearly':
        end_date = now + timedelta(days=365)
    else:
        end_date = now + timedelta(days=30)

    client_entry.subscription_status = 'active'
    client_entry.plan_id = transaction.plan_id
    client_entry.subscription_end_date = end_date

    db.session.commit()

    # Clear session cache so middleware picks up new status
    cache = get_cache_manager()
    cache.delete(f"user_session:{str(transaction.client_id)}")

    log_action('UPDATE', 'client_entry', str(transaction.client_id), old_data, client_entry.to_dict())

    # Send appropriate email
    plan = SubscriptionPlan.query.filter_by(plan_id=transaction.plan_id).first()
    plan_name = plan.name if plan else 'Unknown'
    end_date_str = end_date.strftime('%d %b %Y')
    user_email = client_entry.email

    old_status = old_data.get('subscription_status')
    old_plan_id = old_data.get('plan_id')

    if old_status in ('cancelled', 'expired'):
        send_subscription_reactivated(
            user_email, client_entry.client_name, plan_name,
            transaction.billing_cycle, transaction.amount, end_date_str,
        )
    elif old_plan_id and str(old_plan_id) != str(transaction.plan_id):
        old_plan = SubscriptionPlan.query.filter_by(plan_id=old_plan_id).first()
        old_plan_name = old_plan.name if old_plan else 'Unknown'
        send_plan_switched(
            user_email, client_entry.client_name, old_plan_name, plan_name,
            transaction.billing_cycle, transaction.amount, end_date_str,
        )
    else:
        send_subscription_activated(
            user_email, client_entry.client_name, plan_name,
            transaction.billing_cycle, transaction.amount, end_date_str,
        )

    return True, end_date.isoformat()


@subscription_bp.route('/plans', methods=['GET'])
def get_plans():
    """Public endpoint — list active subscription plans"""
    try:
        plans = SubscriptionPlan.query.filter_by(is_active=True).order_by(
            SubscriptionPlan.display_order
        ).all()
        return jsonify({
            'success': True,
            'plans': [p.to_dict() for p in plans]
        }), 200
    except Exception as e:
        return jsonify({'error': 'Failed to fetch plans', 'message': str(e)}), 500


@subscription_bp.route('/create-order', methods=['POST'])
@authenticate(allow_expired=True)
def create_order():
    """[DEPRECATED] One-time Razorpay order. Use /create-subscription for auto-renewal."""
    try:
        if not Config.RAZORPAY_KEY_ID or not Config.RAZORPAY_KEY_SECRET:
            return jsonify({
                'error': 'Payment gateway not configured',
                'message': 'Razorpay keys are not set. Please contact support or try the "Contact Us" option.'
            }), 503

        data = request.get_json()
        plan_id = data.get('plan_id')
        billing_cycle = data.get('billing_cycle', 'monthly')

        if not plan_id:
            return jsonify({'error': 'plan_id is required'}), 400
        if billing_cycle not in ('monthly', 'yearly'):
            return jsonify({'error': 'billing_cycle must be monthly or yearly'}), 400

        client_entry = ClientEntry.query.filter_by(client_id=g.user['client_id']).first()
        if client_entry and client_entry.subscription_status == 'active':
            if str(client_entry.plan_id) == str(plan_id):
                return jsonify({
                    'error': 'Already subscribed',
                    'message': 'You already have an active subscription on this plan.'
                }), 409

        recent_pending = PaymentTransaction.query.filter_by(
            client_id=g.user['client_id'],
            status='created'
        ).filter(
            PaymentTransaction.created_at >= datetime.utcnow() - timedelta(minutes=2)
        ).first()

        if recent_pending:
            plan_obj = SubscriptionPlan.query.filter_by(plan_id=recent_pending.plan_id).first()
            return jsonify({
                'success': True,
                'order_id': recent_pending.razorpay_order_id,
                'amount': recent_pending.amount,
                'currency': recent_pending.currency,
                'razorpay_key_id': Config.RAZORPAY_KEY_ID,
                'plan_name': plan_obj.name if plan_obj else '',
                'billing_cycle': recent_pending.billing_cycle,
                'reused_order': True,
            }), 200

        plan = SubscriptionPlan.query.filter_by(plan_id=plan_id, is_active=True).first()
        if not plan:
            return jsonify({'error': 'Plan not found'}), 404

        amount = plan.yearly_price if billing_cycle == 'yearly' else plan.monthly_price

        import razorpay
        rz_client = razorpay.Client(auth=(Config.RAZORPAY_KEY_ID, Config.RAZORPAY_KEY_SECRET))

        order_data = {
            'amount': amount,
            'currency': 'INR',
            'receipt': f"rcpt_{g.user['client_id'][:8]}_{str(uuid.uuid4())[:8]}",
            'notes': {
                'client_id': g.user['client_id'],
                'plan_id': str(plan_id),
                'billing_cycle': billing_cycle,
            }
        }

        razorpay_order = rz_client.order.create(data=order_data)

        transaction = PaymentTransaction(
            transaction_id=str(uuid.uuid4()),
            client_id=g.user['client_id'],
            plan_id=plan_id,
            razorpay_order_id=razorpay_order['id'],
            amount=amount,
            currency='INR',
            billing_cycle=billing_cycle,
            status='created',
            created_at=datetime.utcnow(),
        )
        db.session.add(transaction)
        db.session.commit()

        return jsonify({
            'success': True,
            'order_id': razorpay_order['id'],
            'amount': amount,
            'currency': 'INR',
            'razorpay_key_id': Config.RAZORPAY_KEY_ID,
            'plan_name': plan.name,
            'billing_cycle': billing_cycle,
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to create order', 'message': str(e)}), 500


@subscription_bp.route('/create-subscription', methods=['POST'])
@authenticate(allow_expired=True)
def create_subscription():
    """Create a Razorpay Subscription for auto-renewal billing."""
    try:
        if not Config.RAZORPAY_KEY_ID or not Config.RAZORPAY_KEY_SECRET:
            return jsonify({
                'error': 'Payment gateway not configured',
                'message': 'Razorpay keys are not set. Please contact support.'
            }), 503

        data = request.get_json()
        plan_id = data.get('plan_id')
        billing_cycle = data.get('billing_cycle', 'monthly')

        if not plan_id:
            return jsonify({'error': 'plan_id is required'}), 400
        if billing_cycle not in ('monthly', 'yearly'):
            return jsonify({'error': 'billing_cycle must be monthly or yearly'}), 400

        # Block duplicate subscription — allow only if switching plans or reactivating
        client_entry = ClientEntry.query.filter_by(client_id=g.user['client_id']).first()
        if client_entry and client_entry.subscription_status == 'active':
            if str(client_entry.plan_id) == str(plan_id):
                return jsonify({
                    'error': 'Already subscribed',
                    'message': 'You already have an active subscription on this plan.'
                }), 409

        # Block rapid duplicate clicks — reuse pending subscription within 2 minutes
        recent_pending = PaymentTransaction.query.filter_by(
            client_id=g.user['client_id'],
            status='created'
        ).filter(
            PaymentTransaction.razorpay_subscription_id.isnot(None),
            PaymentTransaction.created_at >= datetime.utcnow() - timedelta(minutes=2)
        ).first()

        if recent_pending:
            plan_obj = SubscriptionPlan.query.filter_by(plan_id=recent_pending.plan_id).first()
            return jsonify({
                'success': True,
                'subscription_id': recent_pending.razorpay_subscription_id,
                'razorpay_key_id': Config.RAZORPAY_KEY_ID,
                'plan_name': plan_obj.name if plan_obj else '',
                'billing_cycle': recent_pending.billing_cycle,
                'reused_subscription': True,
            }), 200

        # Get plan
        plan = SubscriptionPlan.query.filter_by(plan_id=plan_id, is_active=True).first()
        if not plan:
            return jsonify({'error': 'Plan not found'}), 404

        # Pick the correct Razorpay plan ID based on billing cycle
        rz_plan_id = plan.razorpay_yearly_plan_id if billing_cycle == 'yearly' else plan.razorpay_monthly_plan_id
        if not rz_plan_id:
            return jsonify({
                'error': 'Plan not configured for auto-renewal',
                'message': 'This plan has not been seeded in Razorpay yet. Please contact support.'
            }), 503

        import razorpay
        rz_client = razorpay.Client(auth=(Config.RAZORPAY_KEY_ID, Config.RAZORPAY_KEY_SECRET))

        sub_data = {
            'plan_id': rz_plan_id,
            'total_count': 120,  # max billing cycles (~10 years)
            'customer_notify': 1,
            'notes': {
                'client_id': g.user['client_id'],
                'plan_id': str(plan_id),
                'billing_cycle': billing_cycle,
            }
        }

        rz_subscription = rz_client.subscription.create(data=sub_data)
        rz_sub_id = rz_subscription['id']

        amount = plan.yearly_price if billing_cycle == 'yearly' else plan.monthly_price

        # Store transaction — DO NOT update ClientEntry here (user hasn't paid yet)
        transaction = PaymentTransaction(
            transaction_id=str(uuid.uuid4()),
            client_id=g.user['client_id'],
            plan_id=plan_id,
            razorpay_subscription_id=rz_sub_id,
            amount=amount,
            currency='INR',
            billing_cycle=billing_cycle,
            status='created',
            created_at=datetime.utcnow(),
        )
        db.session.add(transaction)
        db.session.commit()

        logger.info(f'[create-subscription] Created sub {rz_sub_id} for client {g.user["client_id"]}')

        return jsonify({
            'success': True,
            'subscription_id': rz_sub_id,
            'razorpay_key_id': Config.RAZORPAY_KEY_ID,
            'plan_name': plan.name,
            'billing_cycle': billing_cycle,
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to create subscription', 'message': str(e)}), 500


@subscription_bp.route('/verify-payment', methods=['POST'])
@authenticate(allow_expired=True)
def verify_payment():
    """
    Verify Razorpay payment signature.

    Subscription flow: sets transaction to 'authorized' only.
    Actual activation happens via webhook invoice.paid.

    Order flow (legacy): activates subscription immediately.
    """
    try:
        if not Config.RAZORPAY_KEY_ID or not Config.RAZORPAY_KEY_SECRET:
            return jsonify({'error': 'Payment gateway not configured'}), 503

        data = request.get_json()
        razorpay_payment_id = data.get('razorpay_payment_id')
        razorpay_signature = data.get('razorpay_signature')
        razorpay_subscription_id = data.get('razorpay_subscription_id')
        razorpay_order_id = data.get('razorpay_order_id')

        if not all([razorpay_payment_id, razorpay_signature]):
            return jsonify({'error': 'Missing payment verification fields'}), 400
        if not razorpay_subscription_id and not razorpay_order_id:
            return jsonify({'error': 'razorpay_subscription_id or razorpay_order_id is required'}), 400

        import razorpay
        rz_client = razorpay.Client(auth=(Config.RAZORPAY_KEY_ID, Config.RAZORPAY_KEY_SECRET))

        # Find the transaction
        if razorpay_subscription_id:
            transaction = PaymentTransaction.query.filter_by(
                razorpay_subscription_id=razorpay_subscription_id,
                client_id=g.user['client_id']
            ).first()
        else:
            transaction = PaymentTransaction.query.filter_by(
                razorpay_order_id=razorpay_order_id,
                client_id=g.user['client_id']
            ).first()

        if not transaction:
            return jsonify({'error': 'Transaction not found'}), 404

        if transaction.status == 'paid':
            # Webhook already activated — return current client status
            client_entry = ClientEntry.query.filter_by(client_id=g.user['client_id']).first()
            return jsonify({
                'success': True,
                'message': 'Payment already verified',
                'subscription_status': client_entry.subscription_status if client_entry else 'active',
                'subscription_end_date': client_entry.subscription_end_date.isoformat() if client_entry and client_entry.subscription_end_date else None,
                'plan_id': str(client_entry.plan_id) if client_entry and client_entry.plan_id else None,
            }), 200

        # Verify signature
        try:
            if razorpay_subscription_id:
                # Subscription signature: HMAC-SHA256(payment_id|subscription_id)
                expected = hmac.new(
                    Config.RAZORPAY_KEY_SECRET.encode(),
                    f"{razorpay_payment_id}|{razorpay_subscription_id}".encode(),
                    hashlib.sha256
                ).hexdigest()
                if not hmac.compare_digest(expected, razorpay_signature):
                    raise Exception('signature mismatch')
            else:
                rz_client.utility.verify_payment_signature({
                    'razorpay_order_id': razorpay_order_id,
                    'razorpay_payment_id': razorpay_payment_id,
                    'razorpay_signature': razorpay_signature,
                })
        except Exception:
            transaction.status = 'failed'
            db.session.commit()
            return jsonify({'error': 'Payment verification failed — invalid signature'}), 400

        cache = get_cache_manager()

        if razorpay_subscription_id:
            # Subscription flow: mark authorized only, let webhook do activation
            transaction.status = 'authorized'
            transaction.razorpay_payment_id = razorpay_payment_id
            transaction.razorpay_signature = razorpay_signature
            db.session.commit()

            cache.delete(f"user_session:{g.user['user_id']}")
            cache.delete(f"user_session:{g.user['client_id']}")

            # Return current DB status (webhook may have already fired and activated)
            client_entry = ClientEntry.query.filter_by(client_id=g.user['client_id']).first()
            return jsonify({
                'success': True,
                'message': 'Payment verified. Subscription activation in progress.',
                'subscription_status': client_entry.subscription_status if client_entry else 'trial',
                'subscription_end_date': client_entry.subscription_end_date.isoformat() if client_entry and client_entry.subscription_end_date else None,
                'plan_id': str(client_entry.plan_id) if client_entry and client_entry.plan_id else None,
            }), 200

        else:
            # Order flow (legacy): activate immediately
            _, end_date_iso = _activate_subscription(
                transaction, payment_id=razorpay_payment_id, signature=razorpay_signature
            )
            cache.delete(f"user_session:{g.user['user_id']}")
            return jsonify({
                'success': True,
                'message': 'Payment verified and subscription activated',
                'subscription_status': 'active',
                'subscription_end_date': end_date_iso,
                'plan_id': str(transaction.plan_id) if transaction else None,
            }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Payment verification failed', 'message': str(e)}), 500


@subscription_bp.route('/webhook', methods=['POST'])
def razorpay_webhook():
    """
    Razorpay webhook — single source of truth for subscription lifecycle.

    Handles:
      invoice.paid           — activate/renew subscription (idempotent via invoice_id)
      invoice.payment_failed — track retry count, do NOT restrict access yet
      subscription.cancelled — mark cancelled (user keeps access until end_date)
      subscription.halted    — mark expired (all retries exhausted)

    Configure in Razorpay Dashboard → Settings → Webhooks:
      URL: https://your-domain.com/api/subscription/webhook
      Events: invoice.paid, invoice.payment_failed, subscription.cancelled, subscription.halted
    """
    try:
        webhook_secret = Config.RAZORPAY_WEBHOOK_SECRET
        if not webhook_secret:
            logger.warning('[Webhook] RAZORPAY_WEBHOOK_SECRET not configured — skipping')
            return jsonify({'status': 'ignored', 'reason': 'webhook secret not configured'}), 200

        # Verify webhook signature
        webhook_signature = request.headers.get('X-Razorpay-Signature', '')
        webhook_body = request.get_data(as_text=True)

        expected_signature = hmac.new(
            webhook_secret.encode('utf-8'),
            webhook_body.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(expected_signature, webhook_signature):
            logger.warning('[Webhook] Invalid signature — rejecting')
            return jsonify({'error': 'Invalid webhook signature'}), 400

        payload = request.get_json()
        event = payload.get('event', '')
        logger.info(f'[Webhook] Received event: {event}')

        # ----------------------------------------------------------------
        # invoice.paid — activate or renew subscription
        # ----------------------------------------------------------------
        if event == 'invoice.paid':
            invoice_entity = payload.get('payload', {}).get('invoice', {}).get('entity', {})
            subscription_entity = payload.get('payload', {}).get('subscription', {}).get('entity', {})

            invoice_id = invoice_entity.get('id')
            invoice_number = invoice_entity.get('invoice_number') or invoice_entity.get('receipt')
            rz_payment_id = invoice_entity.get('payment_id')
            rz_sub_id = invoice_entity.get('subscription_id') or subscription_entity.get('id')
            current_end_ts = subscription_entity.get('current_end')  # Unix timestamp
            notes = subscription_entity.get('notes') or invoice_entity.get('notes') or {}

            if not rz_sub_id:
                logger.warning('[Webhook] invoice.paid has no subscription_id — ignoring')
                return jsonify({'status': 'ignored', 'reason': 'no subscription_id'}), 200

            # Idempotency: skip if this invoice was already processed
            if invoice_id:
                existing = PaymentTransaction.query.filter_by(invoice_id=invoice_id).first()
                if existing:
                    logger.info(f'[Webhook] Invoice {invoice_id} already processed — skipping')
                    return jsonify({'status': 'already_processed'}), 200

            # Resolve client_id and plan info from notes or existing transaction
            client_id = notes.get('client_id')
            plan_id = notes.get('plan_id')
            billing_cycle = notes.get('billing_cycle', 'monthly')

            # Find pending/authorized transaction for this subscription
            pending_tx = PaymentTransaction.query.filter_by(
                razorpay_subscription_id=rz_sub_id
            ).filter(
                PaymentTransaction.status.in_(['created', 'authorized'])
            ).order_by(PaymentTransaction.created_at.desc()).first()

            active_tx = None

            if pending_tx:
                # First payment — update existing transaction
                if not client_id:
                    client_id = str(pending_tx.client_id)
                if not plan_id:
                    plan_id = str(pending_tx.plan_id)
                if not billing_cycle:
                    billing_cycle = pending_tx.billing_cycle
                pending_tx.status = 'paid'
                pending_tx.razorpay_payment_id = rz_payment_id
                pending_tx.paid_at = datetime.utcnow()
                if invoice_id:
                    pending_tx.invoice_id = invoice_id
                if invoice_number:
                    pending_tx.invoice_number = invoice_number
                active_tx = pending_tx
            else:
                # Renewal cycle — create a new transaction record
                if not client_id:
                    logger.warning(f'[Webhook] invoice.paid: cannot resolve client for sub {rz_sub_id}')
                    return jsonify({'status': 'ignored', 'reason': 'cannot resolve client_id'}), 200

                amount_paid = invoice_entity.get('amount_paid') or invoice_entity.get('amount') or 0
                renewal_tx = PaymentTransaction(
                    transaction_id=str(uuid.uuid4()),
                    client_id=client_id,
                    plan_id=plan_id,
                    razorpay_subscription_id=rz_sub_id,
                    razorpay_payment_id=rz_payment_id,
                    invoice_id=invoice_id,
                    invoice_number=invoice_number,
                    amount=amount_paid,
                    currency='INR',
                    billing_cycle=billing_cycle,
                    status='paid',
                    paid_at=datetime.utcnow(),
                    created_at=datetime.utcnow(),
                )
                db.session.add(renewal_tx)
                active_tx = renewal_tx

            # Determine subscription_end_date — use Razorpay's actual next billing date
            if current_end_ts:
                end_date = datetime.utcfromtimestamp(int(current_end_ts))
            elif billing_cycle == 'yearly':
                end_date = datetime.utcnow() + timedelta(days=365)
            else:
                end_date = datetime.utcnow() + timedelta(days=30)

            # Activate client subscription
            client_entry = ClientEntry.query.filter_by(client_id=str(client_id)).first()
            if not client_entry:
                db.session.commit()
                logger.warning(f'[Webhook] ClientEntry not found for client_id {client_id}')
                return jsonify({'status': 'ignored', 'reason': 'client not found'}), 200

            old_data = client_entry.to_dict()
            client_entry.subscription_status = 'active'
            if plan_id:
                client_entry.plan_id = plan_id
            client_entry.subscription_end_date = end_date
            client_entry.razorpay_subscription_id = rz_sub_id  # set here for first time
            db.session.commit()

            # Clear cache
            cache = get_cache_manager()
            cache.delete(f"user_session:{str(client_id)}")

            log_action('UPDATE', 'client_entry', str(client_id), old_data, client_entry.to_dict())

            # Send appropriate email
            plan_obj = SubscriptionPlan.query.filter_by(plan_id=plan_id).first() if plan_id else None
            plan_name = plan_obj.name if plan_obj else 'Unknown'
            end_date_str = end_date.strftime('%d %b %Y')
            amount_val = active_tx.amount if active_tx else 0
            old_status = old_data.get('subscription_status')
            old_plan_id = old_data.get('plan_id')

            if old_status in ('cancelled', 'expired'):
                send_subscription_reactivated(
                    client_entry.email, client_entry.client_name, plan_name,
                    billing_cycle, amount_val, end_date_str,
                )
            elif old_plan_id and str(old_plan_id) != str(plan_id):
                old_plan = SubscriptionPlan.query.filter_by(plan_id=old_plan_id).first()
                old_plan_name = old_plan.name if old_plan else 'Unknown'
                send_plan_switched(
                    client_entry.email, client_entry.client_name, old_plan_name, plan_name,
                    billing_cycle, amount_val, end_date_str,
                )
            else:
                send_subscription_activated(
                    client_entry.email, client_entry.client_name, plan_name,
                    billing_cycle, amount_val, end_date_str,
                )

            logger.info(f'[Webhook] Subscription activated for client {client_id}, end_date {end_date}')
            return jsonify({'status': 'activated'}), 200

        # ----------------------------------------------------------------
        # invoice.payment_failed — track retry count, don't restrict access
        # ----------------------------------------------------------------
        elif event == 'invoice.payment_failed':
            invoice_entity = payload.get('payload', {}).get('invoice', {}).get('entity', {})
            rz_sub_id = invoice_entity.get('subscription_id')

            if not rz_sub_id:
                return jsonify({'status': 'ignored', 'reason': 'no subscription_id'}), 200

            transaction = PaymentTransaction.query.filter_by(
                razorpay_subscription_id=rz_sub_id
            ).filter(
                PaymentTransaction.status.in_(['created', 'authorized'])
            ).order_by(PaymentTransaction.created_at.desc()).first()

            if transaction:
                transaction.payment_failure_count = (transaction.payment_failure_count or 0) + 1
                transaction.last_failure_at = datetime.utcnow()
                db.session.commit()
                logger.info(f'[Webhook] Payment failed for sub {rz_sub_id}, attempt #{transaction.payment_failure_count}')
            else:
                logger.warning(f'[Webhook] invoice.payment_failed: no pending tx for sub {rz_sub_id}')

            return jsonify({'status': 'tracked'}), 200

        # ----------------------------------------------------------------
        # subscription.cancelled — user keeps access until subscription_end_date
        # ----------------------------------------------------------------
        elif event == 'subscription.cancelled':
            sub_entity = payload.get('payload', {}).get('subscription', {}).get('entity', {})
            rz_sub_id = sub_entity.get('id')

            if not rz_sub_id:
                return jsonify({'status': 'ignored'}), 200

            client_entry = ClientEntry.query.filter_by(razorpay_subscription_id=rz_sub_id).first()
            if not client_entry:
                logger.warning(f'[Webhook] subscription.cancelled: client not found for sub {rz_sub_id}')
                return jsonify({'status': 'ignored', 'reason': 'client not found'}), 200

            old_data = client_entry.to_dict()
            client_entry.subscription_status = 'cancelled'
            db.session.commit()

            cache = get_cache_manager()
            cache.delete(f"user_session:{str(client_entry.client_id)}")
            log_action('UPDATE', 'client_entry', str(client_entry.client_id), old_data, client_entry.to_dict())

            plan_obj = SubscriptionPlan.query.filter_by(plan_id=client_entry.plan_id).first()
            plan_name = plan_obj.name if plan_obj else 'Unknown'
            end_date_str = client_entry.subscription_end_date.strftime('%d %b %Y') if client_entry.subscription_end_date else 'N/A'
            send_subscription_cancelled(client_entry.email, client_entry.client_name, plan_name, end_date_str)

            logger.info(f'[Webhook] Subscription cancelled for client {client_entry.client_id}')
            return jsonify({'status': 'cancelled'}), 200

        # ----------------------------------------------------------------
        # subscription.halted — all retries exhausted, expire the subscription
        # ----------------------------------------------------------------
        elif event == 'subscription.halted':
            sub_entity = payload.get('payload', {}).get('subscription', {}).get('entity', {})
            rz_sub_id = sub_entity.get('id')

            if not rz_sub_id:
                return jsonify({'status': 'ignored'}), 200

            client_entry = ClientEntry.query.filter_by(razorpay_subscription_id=rz_sub_id).first()
            if not client_entry:
                logger.warning(f'[Webhook] subscription.halted: client not found for sub {rz_sub_id}')
                return jsonify({'status': 'ignored', 'reason': 'client not found'}), 200

            old_data = client_entry.to_dict()
            client_entry.subscription_status = 'expired'
            db.session.commit()

            cache = get_cache_manager()
            cache.delete(f"user_session:{str(client_entry.client_id)}")
            log_action('UPDATE', 'client_entry', str(client_entry.client_id), old_data, client_entry.to_dict())

            logger.info(f'[Webhook] Subscription halted (expired) for client {client_entry.client_id}')
            return jsonify({'status': 'expired'}), 200

        else:
            logger.info(f'[Webhook] Unhandled event: {event}')
            return jsonify({'status': 'ignored'}), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f'[Webhook] Error processing webhook: {str(e)}')
        return jsonify({'error': 'Webhook processing failed'}), 500


@subscription_bp.route('/history', methods=['GET'])
@authenticate(allow_expired=True)
def payment_history():
    """Get payment history for the current client"""
    try:
        transactions = PaymentTransaction.query.filter_by(
            client_id=g.user['client_id']
        ).order_by(PaymentTransaction.created_at.desc()).all()

        return jsonify({
            'success': True,
            'transactions': [t.to_dict() for t in transactions]
        }), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch payment history', 'message': str(e)}), 500


@subscription_bp.route('/cancel', methods=['POST'])
@authenticate(allow_expired=True)
def cancel_subscription():
    """Cancel an active subscription. User keeps access until subscription_end_date."""
    try:
        data = request.get_json() or {}
        reason = data.get('reason', '').strip()

        client_entry = ClientEntry.query.filter_by(client_id=g.user['client_id']).first()
        if not client_entry:
            return jsonify({'error': 'Client not found'}), 404

        if client_entry.subscription_status != 'active':
            return jsonify({'error': 'No active subscription to cancel'}), 400

        # Cancel with Razorpay at end of current cycle (user keeps access until period end)
        if client_entry.razorpay_subscription_id:
            try:
                import razorpay
                rz_client = razorpay.Client(auth=(Config.RAZORPAY_KEY_ID, Config.RAZORPAY_KEY_SECRET))
                rz_client.subscription.cancel(
                    client_entry.razorpay_subscription_id,
                    {'cancel_at_cycle_end': 1}
                )
                logger.info(f'[Cancel] Razorpay sub {client_entry.razorpay_subscription_id} cancelled at cycle end')
            except Exception as rz_err:
                logger.error(f'[Cancel] Razorpay cancel failed: {rz_err} — continuing with local cancel')

        old_data = client_entry.to_dict()
        client_entry.subscription_status = 'cancelled'
        db.session.commit()

        # Clear session cache
        cache = get_cache_manager()
        cache.delete(f"user_session:{g.user['user_id']}")

        new_data = client_entry.to_dict()
        if reason:
            new_data['cancellation_reason'] = reason
        log_action('UPDATE', 'client_entry', g.user['client_id'], old_data, new_data)

        # Send cancellation email
        plan = SubscriptionPlan.query.filter_by(plan_id=client_entry.plan_id).first()
        plan_name = plan.name if plan else 'Unknown'
        end_date_str = client_entry.subscription_end_date.strftime('%d %b %Y') if client_entry.subscription_end_date else 'N/A'
        user_email = g.user.get('email', client_entry.email)

        send_subscription_cancelled(user_email, client_entry.client_name, plan_name, end_date_str, reason)

        return jsonify({
            'success': True,
            'message': 'Subscription cancelled successfully',
            'subscription_status': 'cancelled',
            'subscription_end_date': client_entry.subscription_end_date.isoformat() if client_entry.subscription_end_date else None,
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to cancel subscription', 'message': str(e)}), 500


@subscription_bp.route('/admin/seed-razorpay-plans', methods=['POST'])
@authenticate()
def seed_razorpay_plans():
    """
    Super-admin only: Create Razorpay Plan objects for all active SubscriptionPlans.
    Must be called once before users can subscribe with auto-renewal.
    """
    try:
        if not g.user.get('is_super_admin'):
            return jsonify({'error': 'Super admin access required'}), 403

        if not Config.RAZORPAY_KEY_ID or not Config.RAZORPAY_KEY_SECRET:
            return jsonify({'error': 'Razorpay not configured'}), 503

        import razorpay
        rz_client = razorpay.Client(auth=(Config.RAZORPAY_KEY_ID, Config.RAZORPAY_KEY_SECRET))

        plans = SubscriptionPlan.query.filter_by(is_active=True).all()
        results = []

        for plan in plans:
            plan_result = {
                'plan_id': str(plan.plan_id),
                'name': plan.name,
                'monthly': None,
                'yearly': None,
            }

            # Seed monthly plan
            if not plan.razorpay_monthly_plan_id:
                try:
                    rz_plan = rz_client.plan.create(data={
                        'period': 'monthly',
                        'interval': 1,
                        'item': {
                            'name': f'{plan.name} - Monthly',
                            'amount': plan.monthly_price,
                            'currency': 'INR',
                        },
                        'notes': {'internal_plan_id': str(plan.plan_id)},
                    })
                    plan.razorpay_monthly_plan_id = rz_plan['id']
                    plan_result['monthly'] = {'created': rz_plan['id']}
                    logger.info(f'[Seed] Created monthly plan {rz_plan["id"]} for {plan.name}')
                except Exception as e:
                    plan_result['monthly'] = {'error': str(e)}
                    logger.error(f'[Seed] Failed monthly plan for {plan.name}: {e}')
            else:
                plan_result['monthly'] = {'existing': plan.razorpay_monthly_plan_id}

            # Seed yearly plan
            if not plan.razorpay_yearly_plan_id:
                try:
                    rz_plan = rz_client.plan.create(data={
                        'period': 'yearly',
                        'interval': 1,
                        'item': {
                            'name': f'{plan.name} - Yearly',
                            'amount': plan.yearly_price,
                            'currency': 'INR',
                        },
                        'notes': {'internal_plan_id': str(plan.plan_id)},
                    })
                    plan.razorpay_yearly_plan_id = rz_plan['id']
                    plan_result['yearly'] = {'created': rz_plan['id']}
                    logger.info(f'[Seed] Created yearly plan {rz_plan["id"]} for {plan.name}')
                except Exception as e:
                    plan_result['yearly'] = {'error': str(e)}
                    logger.error(f'[Seed] Failed yearly plan for {plan.name}: {e}')
            else:
                plan_result['yearly'] = {'existing': plan.razorpay_yearly_plan_id}

            results.append(plan_result)

        db.session.commit()

        return jsonify({'success': True, 'results': results}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to seed plans', 'message': str(e)}), 500
