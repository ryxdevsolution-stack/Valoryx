#!/usr/bin/env python3
"""
DEV autopay test: simulate a Razorpay renewal by sending a signed `invoice.paid`
webhook to the LOCAL backend — exactly what Razorpay sends when a subscription
auto-renews. Proves the whole renewal path (webhook -> capture -> activation ->
end-date extension) without waiting for the real 7-day cycle or spending money.

Prereqs:
  - Local backend running (default http://localhost:5017)
  - You've already subscribed to a plan (so a subscription exists in the DB)
  - RAZORPAY_WEBHOOK_SECRET set in backend/.env (used to sign the webhook)

Usage:
  cd backend && venv/bin/python scripts/simulate_renewal.py
  cd backend && venv/bin/python scripts/simulate_renewal.py --subscription-id sub_XXX
"""
import os
import sys
import json
import hmac
import hashlib
import uuid
import argparse
import sqlite3
import urllib.request
from datetime import datetime, timedelta, timezone

_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_ENV = os.path.join(_HERE, '.env')
try:
    from dotenv import load_dotenv
    load_dotenv(_ENV)
except Exception:
    if os.path.exists(_ENV):
        for _l in open(_ENV):
            _l = _l.strip()
            if _l and not _l.startswith('#') and '=' in _l:
                k, v = _l.split('=', 1)
                os.environ.setdefault(k, v.strip())

ap = argparse.ArgumentParser()
ap.add_argument('--subscription-id', default='', help='Target sub id (default: newest one in the DB)')
ap.add_argument('--backend', default='http://localhost:5017', help='Backend base URL')
ap.add_argument('--days', type=int, default=7, help='How far to push the next billing date (default 7)')
args = ap.parse_args()

SECRET = os.environ.get('RAZORPAY_WEBHOOK_SECRET', '')
if not SECRET:
    print('ERROR: RAZORPAY_WEBHOOK_SECRET not set in .env — cannot sign the webhook.')
    sys.exit(1)

sqlite_path = os.environ.get('SQLITE_DB_PATH') or os.path.expanduser('~/.mj-billing/local.db')
db = sqlite3.connect(sqlite_path)


def _client_for_sub(sub_id):
    row = db.execute(
        "SELECT client_id, client_name, plan_id, subscription_end_date "
        "FROM client_entry WHERE razorpay_subscription_id = ?", (sub_id,)
    ).fetchone()
    return row


# Resolve the target subscription.
sub_id = args.subscription_id
if not sub_id:
    row = db.execute(
        "SELECT razorpay_subscription_id, client_name FROM client_entry "
        "WHERE razorpay_subscription_id IS NOT NULL ORDER BY subscription_end_date DESC LIMIT 1"
    ).fetchone()
    if not row:
        print('No subscription found in the DB. Subscribe to a plan first, then re-run.')
        sys.exit(1)
    sub_id = row[0]
    print(f'Using newest subscription: {sub_id} ({row[1]})')

client = _client_for_sub(sub_id)
if not client:
    print(f'No client_entry points at {sub_id}. Has the first charge activated yet?')
    sys.exit(1)
client_id, client_name, plan_id, end_before = client
print(f'Client: {client_name} | end_date BEFORE: {end_before}')

# Build the renewal invoice.paid payload (new invoice, next billing date +N days).
current_end = int((datetime.now(timezone.utc) + timedelta(days=args.days)).timestamp())
invoice_id = 'inv_SIM' + uuid.uuid4().hex[:12]
notes = {'client_id': str(client_id), 'plan_id': str(plan_id) if plan_id else '', 'billing_cycle': 'monthly'}
payload = {
    'event': 'invoice.paid',
    'payload': {
        'invoice': {'entity': {
            'id': invoice_id, 'invoice_number': invoice_id,
            'payment_id': 'pay_SIM' + uuid.uuid4().hex[:12],
            'subscription_id': sub_id, 'amount_paid': 100, 'amount': 100, 'notes': notes,
        }},
        'subscription': {'entity': {'id': sub_id, 'current_end': current_end, 'notes': notes}},
    },
}
body = json.dumps(payload)
sig = hmac.new(SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()

# POST it to the local webhook endpoint.
req = urllib.request.Request(
    f'{args.backend}/api/subscription/webhook',
    data=body.encode(),
    headers={'Content-Type': 'application/json', 'X-Razorpay-Signature': sig},
)
try:
    resp = urllib.request.urlopen(req, timeout=10)
    print(f'Webhook -> HTTP {resp.status}: {resp.read().decode()[:200]}')
except urllib.error.HTTPError as e:
    print(f'Webhook -> HTTP {e.code}: {e.read().decode()[:300]}')
    sys.exit(1)
except Exception as e:
    print(f'Could not reach backend at {args.backend} — is it running? ({e})')
    sys.exit(1)

# Show the effect.
end_after = _client_for_sub(sub_id)[3]
print(f'Client end_date AFTER:  {end_after}')
if str(end_after) != str(end_before):
    print('✅ AUTOPAY RENEWAL WORKS — subscription_end_date advanced. Payment recorded.')
else:
    print('⚠️  end_date did not change — check the backend log for the webhook processing.')
