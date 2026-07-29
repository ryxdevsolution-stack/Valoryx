# Auto-Sync as a Paid Entitlement — Design

**Date:** 2026-07-29
**Status:** Awaiting review
**Author:** Design session with Ramesh

## Goal

Background auto-sync runs only while a customer's subscription is paid, for exactly the period they paid for. Pay for one month, get one month of auto-sync. Pay for six, get six.

## Background

Two facts make this feature small:

1. **Auto-sync does not currently work at all.** `init_sync_scheduler()` in `backend/services/sync_scheduler.py` is never called from anywhere, so the hourly loop and its thread never start. `_get_or_init_scheduler()` in `app.py` builds the object and sets `scheduler.running = True` by hand without calling `.start()`. `/api/sync/status` reports that flag, so it answers `running: true` while `next_sync`, `last_upload` and `last_download` are all `null` — verified against the live backend on 2026-07-29.

2. **The billing plumbing already exists.** v1.1.23 made `subscription_end_date` cloud-owned and added `download_subscription_status()` plus `POST /api/sync/subscription` to pull it down. The admin panel (`backend/routes/admin.py:1398-1468`) already lets a super-admin set any status and end date for a client.

So this feature is not "build entitlement". It is "start the loop that was never started, and have it read a date that is already there".

## Decisions

| Question | Decision | Rationale |
|---|---|---|
| Is auto-sync an add-on, a tier feature, or included? | **Included in any active plan** | No new SKU, no new columns. The paid period is already encoded in `subscription_end_date`, so "₹1500 = 1 month" and "6 months = 6 months" both fall out for free. |
| What syncs when unpaid? | **Nothing**, except one final backup at expiry | Chosen deliberately as a commercial lever. The single expiry backup prevents the customer losing bills they earned while paid. |
| Does the trial get auto-sync? | **Yes** | Customers experience the value across the 14 days, then lose it at expiry. Their trial data is already in the cloud when they convert. |
| Which billing periods? | **Both: a ₹1500/month recurring Razorpay plan AND admin-set dates** | Two ways in, one column out. Razorpay recurring handles ordinary customers; admin override handles negotiated deals. Neither needs a new `billing_cycle` value or changes to the five hardcoded 30/365-day sites. |
| Where is the gate enforced? | **In the scheduler loop, self-healing from the cloud** | See "Enforcement and its limits". |

## How `subscription_end_date` gets set

Three writers, one column. The entitlement rule reads the result and does not care which path wrote it — that is what keeps this feature small.

| Path | Mechanism | Status |
|---|---|---|
| First purchase | `verify-payment` → `_apply_activation` | Exists |
| Recurring renewal | `invoice.paid` webhook, using Razorpay's actual `current_end` timestamp rather than a guessed +30 days | Exists |
| Missed webhook | `subscription_reconciler` re-syncs status and end date from Razorpay | Exists |
| Negotiated / manual | Super-admin endpoint, `admin.py:1398-1468` | Exists |
| Desktop learns of any of the above | `POST /api/sync/subscription` (v1.1.23), refreshed every cycle by Task 3 | Exists |

**Operational prerequisite (not code):** the ₹1500/month recurring plan must be created via `POST /api/subscription/admin/plans`, which creates the plan row and both Razorpay Plan objects in one step. `monthly_price` is in paise — ₹1500 is `150000`. Until a plan has `razorpay_monthly_plan_id`, checkout returns 503, so no customer can reach the paid state at all.

## The entitlement rule

One rule, one source of truth:

```
entitled  ==  subscription_status in ('trial', 'active')
              AND the relevant end date is in the future
```

Where "relevant end date" is `trial_end_date` when status is `trial`, and `subscription_end_date` when status is `active`. This mirrors `ClientEntry.is_trial_expired` / `is_subscription_expired` exactly, so the sync gate and the login gate can never disagree.

Nothing else is consulted. Not the plan, not the price, not the billing cycle.

## Behaviour matrix

| State | Background loop | Manual Sync button | One-time expiry backup |
|---|---|---|---|
| Trial, within 14 days | runs | enabled | — |
| Active, before end date | runs | enabled | — |
| The cycle where entitlement lapses | performs final upload, then stops | — | fires once |
| Expired / cancelled | does not run | disabled | already happened |
| Renewed after expiry | resumes | enabled | reset, available again on next expiry |

## Components and changes

### 1. `backend/services/sync_scheduler.py`

- Add `_is_entitled()` — reads the local `client_entry` row and applies the entitlement rule above.
- `_run_loop()` gains, at the top of each cycle:
  1. Refresh billing state from the cloud via `sync_service.download_subscription_status(client_id)`. This is what makes the gate self-healing (see below). Failure here is non-fatal — fall through to the local check.
  2. If entitled: run the normal upload + download cycle.
  3. If not entitled and the final backup has not yet been taken: run one upload, record that it happened, then idle.
  4. If not entitled and the final backup was already taken: idle. Keep looping (cheaply) so a renewal is picked up without an app restart.
- `get_status()` returns `running` derived from `self.thread is not None and self.thread.is_alive()`, never a hand-set flag. Add `entitled` and `paid_until` to the payload.

### 2. `backend/app.py`

- `_get_or_init_scheduler()` calls `scheduler.start()` instead of setting `running = True`.
- `set_client_id` must be called on login — the scheduler currently holds `client_id: null`, which disables the download half of every sync.
- `/api/sync/trigger`, `/api/sync/download` and `/api/sync/full` reject when not entitled, so the manual button cannot bypass the gate. `/api/sync/subscription` stays open — it is how an unpaid customer proves they paid.

### 3. `frontend-react/src/components/SyncButton.tsx`

Reads the extended status and shows:

| State | Text |
|---|---|
| Trial | "Auto-sync on — trial ends {date}" |
| Paid | "Auto-sync on — active until {date}" |
| Just lapsed | "Final backup complete. Sync paused." |
| Expired | "Sync paused — renew to turn it back on" |

Button disabled when not entitled, with the reason visible rather than a silent no-op.

### 4. `frontend-react/src/components/UpdateNotification.tsx`

The pre-update upload shipped in v1.1.23 runs before "Restart & Update" regardless of subscription state. Under "nothing syncs when unpaid" it becomes entitled-only: an unpaid customer's update proceeds straight to install with no upload. This is safe — their data was already captured by the one-time expiry backup, and nothing new is permitted to sync anyway.

Implementation note: it calls `/api/sync/trigger?type=upload`, which gains the entitlement check in §2. So this needs no separate gate — it inherits one, and its existing catch-and-continue already handles the refusal correctly by installing anyway.

### 5. One-time backup bookkeeping

The expiry backup must fire **once per expiry**, not on every loop iteration and not on every visit to the expired page. Record it in `sync_metadata` keyed by client, and clear that record whenever entitlement returns, so a renew-then-lapse cycle gets a fresh backup.

Note: `TrialExpired.tsx` (shipped v1.1.23) currently uploads on *every* mount. That becomes the same one-time backup and must consult the same record.

## Enforcement and its limits

The gate is checked on the customer's machine against the local `client_entry` row, which a determined user could edit.

Two things mitigate it, and one does not:

- **Self-healing.** Each cycle begins by pulling billing state from the cloud, and v1.1.23 excluded these columns from the upload's `ON CONFLICT DO UPDATE`. A forged local date is therefore overwritten with cloud truth on the next cycle, and can never propagate upward. Tampering buys at most one interval.
- **Clock tampering** is bounded the same way — the refreshed cloud date is compared against local time, so winding the clock back extends access only until the next refresh, and the login gate in `auth_middleware` still blocks the app itself.
- **What does not mitigate it:** the desktop holds `DB_URL`, i.e. direct Postgres credentials, read from `env.local` by `electron/main.js` and handed to Flask. Anyone extracting that string can write to Supabase directly regardless of this gate.

**This feature is therefore a commercial control, not a security boundary.** It stops ordinary customers from getting a paid feature for free. It does not stop an attacker. Closing that hole means moving sync behind an authenticated API and removing `DB_URL` from the client — a separate project, out of scope here.

## Edge cases

| Case | Behaviour |
|---|---|
| Cloud unreachable at cycle start | Refresh fails silently; fall back to the last known local date. An entitled customer keeps working offline. |
| Entitlement lapses mid-cycle | The check is at cycle start; an in-flight sync completes. Next cycle takes the final backup. |
| Renewal while the app is running | Next cycle's cloud refresh sees it and resumes. No restart needed. |
| Renewal while expired and idling | Same, or immediately via the "Already paid? Refresh my status" button shipped in v1.1.23. |
| `client_id` not yet known (before login) | Loop idles. No sync is attempted without a client. |
| Multiple gunicorn workers | On desktop the backend is single-process, so this does not arise. The cloud server does not run this scheduler. |

## Non-goals

- Adding a 6-month `billing_cycle` or new Razorpay plans. Admin-set dates cover it.
- Changing what sync uploads or downloads. The 17-table set is unchanged.
- Removing `DB_URL` from the desktop, or moving sync behind an authenticated API.
- Seeding the missing `razorpay_monthly_plan_id` values on Starter/Professional/Enterprise. Real but separate.

## Testing

- **Entitlement rule:** trial in-date, trial expired, active in-date, active expired, cancelled, missing dates — asserted directly against `_is_entitled()`.
- **Loop behaviour:** entitled cycle syncs; unentitled cycle does not; the first unentitled cycle takes exactly one backup; the second takes none; entitlement returning clears the record.
- **Status honesty:** `running` is false when no thread exists — this is the regression that let a dead scheduler report healthy for months, and must be locked shut.
- **Endpoint gating:** `/api/sync/trigger` refuses when unentitled; `/api/sync/subscription` still succeeds.
- **Self-healing:** a forged local date is corrected by the cloud refresh and the loop stops.

## Risks

| Risk | Mitigation |
|---|---|
| Turning on a loop that has never run in production may surface latent bugs in `sync_all`/`download_all` under real load | Ship with the interval configurable (`SYNC_INTERVAL_HOURS`, currently 2) and watch the first release closely. |
| Customers who relied on manual sync while expired lose it | Intended. The one-time expiry backup preserves everything earned while paid. |
| Perception that data is held hostage | The expiry backup plus clear UI copy ("Sync paused — renew to turn it back on") makes the state legible rather than silent. |

## Open items (not blocking)

- Starter / Professional / Enterprise still have no `razorpay_monthly_plan_id`, so real checkout returns 503. Until seeded, admin-set periods are the only route to a paid subscription.
- `electron/main.js` passes `DB_URL: ''` when `env.local` is absent, shadowing `backend/.env`. Dev-only, but it makes local testing of this feature impossible until fixed.
