import uuid
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

subscription_bp = Blueprint('subscription', __name__)


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
        now = datetime.utcnow()
        transaction.status = 'paid'
        transaction.razorpay_payment_id = razorpay_payment_id
        transaction.razorpay_signature = razorpay_signature
        transaction.paid_at = now

        # Update client subscription
        client_entry = ClientEntry.query.filter_by(client_id=g.user['client_id']).first()
        if client_entry:
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
            cache.delete(f"user_session:{g.user['user_id']}")

            log_action('UPDATE', 'client_entry', g.user['client_id'], old_data, client_entry.to_dict())

            # Send appropriate email based on action type
            plan = SubscriptionPlan.query.filter_by(plan_id=transaction.plan_id).first()
            plan_name = plan.name if plan else 'Unknown'
            end_date_str = end_date.strftime('%d %b %Y')
            user_email = g.user.get('email', client_entry.email)

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

        return jsonify({
            'success': True,
            'message': 'Payment verified and subscription activated',
            'subscription_status': 'active',
            'subscription_end_date': end_date.isoformat(),
            'plan_id': str(transaction.plan_id) if transaction else None,
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Payment verification failed', 'message': str(e)}), 500


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
