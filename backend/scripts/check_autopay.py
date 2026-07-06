#!/usr/bin/env python3
"""
Autopay live check — read-only diagnostic.

Pulls every Razorpay subscription's renewal state and cross-checks it against the
local client_entry rows, so you can see — definitively — whether autopay is firing
on LIVE and whether the DB matches Razorpay's truth.

Run on the server where live keys + DB_URL live:
    cd /var/www/Valoryx/backend && python3 scripts/check_autopay.py

Makes NO writes to Razorpay or the DB. Safe to run anytime.
"""
import os
import sys
from datetime import datetime, timezone

# ── Load backend/.env (dotenv if available, else a tiny manual parser) ────────
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

KEY = os.environ.get('RAZORPAY_KEY_ID', '')
SEC = os.environ.get('RAZORPAY_KEY_SECRET', '')
DB_URL = os.environ.get('DB_URL') or os.environ.get('DATABASE_URL')

if not KEY or not SEC:
    print('ERROR: RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not found in .env')
    sys.exit(1)

MODE = 'LIVE' if KEY.startswith('rzp_live') else 'TEST'
print(f'Razorpay mode: {MODE}  ({KEY[:12]}…)')
print(f'DB: {"configured" if DB_URL else "NOT configured — Razorpay-only view"}\n')


def _ts(x):
    return datetime.fromtimestamp(x, timezone.utc).strftime('%Y-%m-%d') if x else '—'


# ── Fetch all subscriptions (paginated) ──────────────────────────────────────
import razorpay
rz = razorpay.Client(auth=(KEY, SEC))

subs, skip = [], 0
while True:
    page = rz.subscription.all({'count': 100, 'skip': skip})
    items = page.get('items', [])
    subs += items
    if len(items) < 100:
        break
    skip += 100

# ── Pull the DB view (razorpay_subscription_id -> status/end/name) ────────────
db_map = {}
if DB_URL:
    try:
        from sqlalchemy import create_engine, text
        eng = create_engine(DB_URL)
        with eng.connect() as c:
            rows = c.execute(text(
                "SELECT razorpay_subscription_id, client_name, subscription_status, "
                "subscription_end_date FROM client_entry "
                "WHERE razorpay_subscription_id IS NOT NULL"
            ))
            for r in rows:
                db_map[r[0]] = {'name': r[1], 'status': r[2], 'end': r[3]}
    except Exception as e:
        print(f'WARNING: DB lookup failed ({e}) — showing Razorpay-only view\n')

now = datetime.now(timezone.utc)
renewed = overdue = drift = 0

_LIVE_STATES = ('active', 'authenticated', 'charged')

# Count active subscriptions per owning client (from the sub's notes.client_id).
# Two live subs for the same client = a duplicate → double-billing risk.
active_by_client = {}
for s in subs:
    if s.get('status') in _LIVE_STATES:
        cid = (s.get('notes') or {}).get('client_id')
        if cid:
            active_by_client.setdefault(cid, []).append(s['id'])
dupe_clients = {c: ids for c, ids in active_by_client.items() if len(ids) > 1}

print(f'{"SUBSCRIPTION":24} {"RZ_STATUS":11} {"PAID":4} {"NEXT_CHG":10} {"CUR_END":10} '
      f'{"DB_STATUS":11} {"DB_END":11} FLAGS')
print('-' * 116)

orphan = dupe = 0
for s in sorted(subs, key=lambda x: x.get('paid_count', 0), reverse=True):
    sid = s['id']
    st = s.get('status')
    pc = s.get('paid_count', 0) or 0
    ca = s.get('charge_at')
    ce = s.get('current_end')
    cid = (s.get('notes') or {}).get('client_id')
    db = db_map.get(sid, {})

    flags = []
    if pc >= 2:
        renewed += 1
        flags.append('RENEWED')
    if st == 'active' and ca and datetime.fromtimestamp(ca, timezone.utc) < now:
        overdue += 1
        flags.append('OVERDUE')
    if db and st in _LIVE_STATES and db.get('status') != 'active':
        drift += 1
        flags.append('DB≠ACTIVE')
    # Active on Razorpay but no client_entry points here — a paying customer the app doesn't track.
    if st in _LIVE_STATES and not db:
        orphan += 1
        flags.append('ORPHAN(client=%s)' % (cid[:8] if cid else '?'))
    if cid in dupe_clients and st in _LIVE_STATES:
        dupe += 1
        flags.append('DUPLICATE')

    print(f'{sid:24} {str(st):11} {pc:<4} {_ts(ca):10} {_ts(ce):10} '
          f'{str(db.get("status", "-")):11} {str(db.get("end", "-"))[:10]:11} {",".join(flags)}')

print('-' * 116)
print(f'\nSUMMARY: {len(subs)} subscriptions | renewed (paid_count>=2): {renewed} | '
      f'overdue-active: {overdue} | DB-drift: {drift} | orphan-active: {orphan} | duplicate-active: {dupe}')

if dupe_clients:
    print('\n🔴 DUPLICATE ACTIVE SUBSCRIPTIONS (same client, >1 active = double-billing risk):')
    for c, ids in dupe_clients.items():
        print(f'   client {c}: {", ".join(ids)}')

if MODE == 'TEST':
    print('\nNOTE: TEST mode does NOT auto-fire recurring charges — paid_count stays 1 '
          'and charge dates go overdue. Real renewal proof requires LIVE keys.')
elif renewed == 0:
    print('\n⚠️  No subscription has reached paid_count>=2 yet — no LIVE renewal has '
          'occurred so far (may simply be that no cycle has come due). Re-run after a '
          'subscription passes its next charge date.')
else:
    print(f'\n✅ {renewed} subscription(s) have auto-renewed on LIVE. Check the DB-drift '
          'count above is 0 — that confirms your webhook/reconciler recorded them.')
