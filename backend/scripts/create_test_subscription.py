#!/usr/bin/env python3
"""
Create a Razorpay subscription for END-TO-END autopay testing.

Use with a cheap, short-cycle plan (e.g. the ₹1 "Razer Auto" / weekly plan) to
get a REAL live renewal in days instead of a month. It stamps the subscription
with notes.client_id so your webhook + reconciler treat it like a real customer.

Run on the server (live keys in .env):
    cd /var/www/Valoryx/backend
    venv/bin/python3 scripts/create_test_subscription.py \
        --plan plan_TAC4qn2h85Bcy7 --client-id <A_REAL_CLIENT_UUID> --cycles 4

Then open the printed short_url and pay ₹1. Watch it with scripts/check_autopay.py:
paid_count goes 1 → 2 after the first weekly auto-charge = autopay proven.

NOTE: this creates a REAL subscription that will auto-charge every cycle until you
cancel it. It's ₹1, but CANCEL it in the dashboard once you've seen paid_count>=2.
"""
import os
import sys
import argparse

# ── Load backend/.env ─────────────────────────────────────────────────────────
_ENV = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env')
try:
    from dotenv import load_dotenv
    load_dotenv(_ENV)
except Exception:
    if os.path.exists(_ENV):
        for _line in open(_ENV):
            _line = _line.strip()
            if _line and not _line.startswith('#') and '=' in _line:
                _k, _v = _line.split('=', 1)
                os.environ.setdefault(_k, _v.strip())

ap = argparse.ArgumentParser(description='Create a test Razorpay subscription for autopay testing.')
ap.add_argument('--plan', required=True, help='Razorpay plan id (e.g. plan_TAC4qn2h85Bcy7)')
ap.add_argument('--client-id', required=True, help='Your client_entry.client_id to attach (notes.client_id)')
ap.add_argument('--app-plan-id', default='', help='Optional app subscription_plan.plan_id for notes.plan_id')
ap.add_argument('--cycles', type=int, default=4, help='total_count (how many cycles before it ends). Default 4.')
ap.add_argument('--billing-cycle', default='weekly', help='notes.billing_cycle label. Default weekly.')
args = ap.parse_args()

KEY = os.environ.get('RAZORPAY_KEY_ID', '')
SEC = os.environ.get('RAZORPAY_KEY_SECRET', '')
if not KEY or not SEC:
    print('ERROR: Razorpay keys not found in .env')
    sys.exit(1)

MODE = 'LIVE' if KEY.startswith('rzp_live') else 'TEST'
print(f'Razorpay mode: {MODE}  ({KEY[:12]}…)')
if MODE == 'LIVE':
    print('⚠️  LIVE mode — this creates a REAL subscription that charges real money each cycle.')

import razorpay
rz = razorpay.Client(auth=(KEY, SEC))

notes = {'client_id': args.client_id, 'billing_cycle': args.billing_cycle, 'test': 'autopay'}
if args.app_plan_id:
    notes['plan_id'] = args.app_plan_id

sub = rz.subscription.create(data={
    'plan_id': args.plan,
    'total_count': args.cycles,
    'customer_notify': 1,
    'notes': notes,
})

print('\n✅ Subscription created:')
print(f'   id:         {sub.get("id")}')
print(f'   status:     {sub.get("status")}')
print(f'   plan:       {args.plan}')
print(f'   notes:      {notes}')
print(f'   total_count:{sub.get("total_count")}')
short_url = sub.get('short_url')
if short_url:
    print(f'\n👉 Open this link and pay ₹1 to authenticate the mandate:\n   {short_url}')
else:
    print('\n(no short_url returned — authenticate via your app checkout using this subscription_id)')

print('\nNext: after paying, run  venv/bin/python3 scripts/check_autopay.py')
print('Watch this sub go paid_count 1 → 2 after the first auto-charge. Then CANCEL it in the dashboard.')
