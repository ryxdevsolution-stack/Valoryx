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
    Used by both /verify-payment and /webhook endpoints.

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
    # Clear all possible cached sessions for this client
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
    """Create a Razorpay order for subscription payment"""
    try:
        # Check if Razorpay is configured
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

        # Block duplicate subscription — allow only if switching plans or reactivating
        client_entry = ClientEntry.query.filter_by(client_id=g.user['client_id']).first()
        if client_entry and client_entry.subscription_status == 'active':
            if str(client_entry.plan_id) == str(plan_id):
                return jsonify({
                    'error': 'Already subscribed',
                    'message': 'You already have an active subscription on this plan.'
                }), 409

        # Block rapid duplicate clicks — reject if a pending order exists within last 2 minutes
        recent_pending = PaymentTransaction.query.filter_by(
            client_id=g.user['client_id'],
            status='created'
        ).filter(
            PaymentTransaction.created_at >= datetime.utcnow() - timedelta(minutes=2)
        ).first()

        if recent_pending:
            return jsonify({
                'success': True,
                'order_id': recent_pending.razorpay_order_id,
                'amount': recent_pending.amount,
                'currency': recent_pending.currency,
                'razorpay_key_id': Config.RAZORPAY_KEY_ID,
                'plan_name': SubscriptionPlan.query.filter_by(plan_id=recent_pending.plan_id).first().name if recent_pending.plan_id else '',
                'billing_cycle': recent_pending.billing_cycle,
                'reused_order': True,
            }), 200

        # Get plan
        plan = SubscriptionPlan.query.filter_by(plan_id=plan_id, is_active=True).first()
        if not plan:
            return jsonify({'error': 'Plan not found'}), 404

        amount = plan.yearly_price if billing_cycle == 'yearly' else plan.monthly_price

        # Create Razorpay order
        import razorpay
        client = razorpay.Client(auth=(Config.RAZORPAY_KEY_ID, Config.RAZORPAY_KEY_SECRET))

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

        razorpay_order = client.order.create(data=order_data)

        # Save transaction record
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


@subscription_bp.route('/verify-payment', methods=['POST'])
@authenticate(allow_expired=True)
def verify_payment():
    """Verify Razorpay payment signature and activate subscription"""
    try:
        if not Config.RAZORPAY_KEY_ID or not Config.RAZORPAY_KEY_SECRET:
            return jsonify({'error': 'Payment gateway not configured'}), 503

        data = request.get_json()
        razorpay_order_id = data.get('razorpay_order_id')
        razorpay_payment_id = data.get('razorpay_payment_id')
        razorpay_signature = data.get('razorpay_signature')

        if not all([razorpay_order_id, razorpay_payment_id, razorpay_signature]):
            return jsonify({'error': 'Missing payment verification fields'}), 400

        # Find transaction
        transaction = PaymentTransaction.query.filter_by(
            razorpay_order_id=razorpay_order_id,
            client_id=g.user['client_id']
        ).first()

        if not transaction:
            return jsonify({'error': 'Transaction not found'}), 404

        if transaction.status == 'paid':
            return jsonify({'success': True, 'message': 'Payment already verified'}), 200

        # Verify signature
        import razorpay
        rz_client = razorpay.Client(auth=(Config.RAZORPAY_KEY_ID, Config.RAZORPAY_KEY_SECRET))

        try:
            rz_client.utility.verify_payment_signature({
                'razorpay_order_id': razorpay_order_id,
                'razorpay_payment_id': razorpay_payment_id,
                'razorpay_signature': razorpay_signature,
            })
        except razorpay.errors.SignatureVerificationError:
            transaction.status = 'failed'
            db.session.commit()
            return jsonify({'error': 'Payment verification failed — invalid signature'}), 400

        # Payment verified — activate subscription
        _, end_date_iso = _activate_subscription(
            transaction, payment_id=razorpay_payment_id, signature=razorpay_signature
        )

        # Also clear cache for the logged-in user specifically
        cache = get_cache_manager()
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
    Razorpay webhook endpoint — safety net for payment activation.

    Handles payment.captured and payment.failed events.
    If the frontend /verify-payment call fails (browser closed, network issue),
    this webhook ensures the subscription still gets activated.

    Configure in Razorpay Dashboard → Settings → Webhooks:
      URL: https://your-domain.com/api/subscription/webhook
      Events: payment.captured, payment.failed
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

        # Parse event
        payload = request.get_json()
        event = payload.get('event', '')
        payment_entity = payload.get('payload', {}).get('payment', {}).get('entity', {})

        razorpay_order_id = payment_entity.get('order_id')
        razorpay_payment_id = payment_entity.get('id')

        if not razorpay_order_id:
            logger.info(f'[Webhook] Event {event} has no order_id — ignoring')
            return jsonify({'status': 'ignored'}), 200

        # Find the transaction
        transaction = PaymentTransaction.query.filter_by(
            razorpay_order_id=razorpay_order_id
        ).first()

        if not transaction:
            logger.warning(f'[Webhook] Transaction not found for order {razorpay_order_id}')
            return jsonify({'status': 'ignored', 'reason': 'transaction not found'}), 200

        if event == 'payment.captured':
            if transaction.status == 'paid':
                # Already activated by /verify-payment — nothing to do
                logger.info(f'[Webhook] Order {razorpay_order_id} already paid — skipping')
                return jsonify({'status': 'already_processed'}), 200

            logger.info(f'[Webhook] Activating subscription for order {razorpay_order_id}')
            _activate_subscription(transaction, payment_id=razorpay_payment_id)
            return jsonify({'status': 'activated'}), 200

        elif event == 'payment.failed':
            if transaction.status != 'paid':
                transaction.status = 'failed'
                db.session.commit()
                logger.info(f'[Webhook] Marked order {razorpay_order_id} as failed')
            return jsonify({'status': 'marked_failed'}), 200

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

        old_data = client_entry.to_dict()
        client_entry.subscription_status = 'cancelled'
        db.session.commit()

        # Clear session cache
        cache = get_cache_manager()
        cache.delete(f"user_session:{g.user['user_id']}")

        # Include cancellation reason in audit log
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
