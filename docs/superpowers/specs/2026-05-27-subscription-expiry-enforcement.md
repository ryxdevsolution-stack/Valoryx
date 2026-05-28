# Subscription Expiry Enforcement — Design

**Date:** 2026-05-27
**Status:** Implemented (Razorpay checkout deferred)

## Goal

Reliably block users when their trial or paid subscription expires, with a
3-day rolling warning banner before expiry, and a role-aware upgrade page that
only offers payment to owners and managers.

## Backend enforcement

The auth middleware (`backend/utils/auth_middleware.py`) checks subscription
state on every authenticated request. Two paths now auto-flip status to
`expired` and return 403:

1. **Trial expiry** — `subscription_status == 'trial'` AND `trial_end_date < now()`.
   Returns `code: 'TRIAL_EXPIRED'`.
2. **Active subscription expiry** — `subscription_status == 'active'` AND
   `subscription_end_date < now()`. Returns `code: 'SUBSCRIPTION_EXPIRED'`.

A manual `subscription_status == 'expired'` (set via the Manage Membership
modal) is also blocked.

Super-admins bypass all checks. Endpoints with `allow_expired=True` (e.g.,
`/subscription/*`, profile) remain accessible so the user can still renew.

## Model properties

Two new computed properties added to `ClientEntry` (`backend/models/client_model.py`):

- `is_subscription_expired` — returns `True` when `subscription_status == 'active'`
  and `subscription_end_date` is in the past.
- `subscription_days_remaining` — returns integer days until expiry for active
  subscriptions; `None` for trial/expired/cancelled. Returns `0` if already past
  (shouldn't happen in practice — middleware flips status first).

Both are exposed in `to_dict()` and in `g.client` (the per-request context dict
populated by the middleware).

## Frontend — warning banner

`SubscriptionWarningBanner` (`frontend-react/src/components/SubscriptionWarningBanner.tsx`)
shows a sticky amber banner at the top of every page inside `DashboardLayout`
when `trial_days_remaining` OR `subscription_days_remaining` is between 0 and
3 inclusive.

- Owner/Manager sees a **Renew** button next to the message.
- Other roles see "ask your owner or manager to renew."
- Dismissible per-day (`localStorage['valoryx.subWarnDismissedAt']`) — reappears
  the next calendar day so it never gets permanently ignored.

Mounted in `DashboardLayout` immediately after the existing `TrialBanner` (line 12).

## Frontend — `/upgrade` page

`pages/TrialExpired.tsx` (route `/upgrade`) renders two layouts based on role:

| Role | Layout |
|---|---|
| `owner` or `manager` | Pricing cards (`PricingCards` component) + Razorpay placeholder card |
| Anyone else | Read-only "contact your owner" view with the client's email on file |

Both views share the contact section (WhatsApp/email) and a Logout button.

The page also auto-detects whether the expired entity was a trial or a paid
subscription and adjusts the heading and subtitle accordingly.

## Frontend — axios interceptor

`frontend-react/src/lib/api.ts` now intercepts both `TRIAL_EXPIRED` and
`SUBSCRIPTION_EXPIRED` 403 codes and redirects to `/upgrade` (or `#/upgrade`
in Electron). Subscription API calls and pages already on `/upgrade` are
excluded from the redirect.

## Deferred: Razorpay integration

The Razorpay checkout redirect is **not yet wired**. The owner/manager view
shows a placeholder card titled "Online payment coming soon". When the
integration lands:

1. Replace the placeholder card with a "Pay with Razorpay" button.
2. Wire it to the existing `PricingCards.onSubscribed` callback or a new
   `/subscription/create-order` endpoint that returns a Razorpay order ID.
3. On success, the existing `handleSubscribed` callback redirects to dashboard.

The backend already has `razorpay_subscription_id` on `ClientEntry` and
`razorpay_monthly_plan_id` / `razorpay_yearly_plan_id` on `SubscriptionPlan`
— the schema is ready.

## Audit log

The middleware logs the auto-expiry transitions in `audit_log` (best-effort —
if the commit fails, the request still returns 403 so the user can't continue
working). Manual changes via the Manage Membership modal produce
`SUBSCRIPTION_UPDATE` rows with `old_data` and `new_data` snapshots — see
`backend/routes/admin.py:update_client_subscription`.

## Out of scope

- Sending an email reminder when expiry is approaching.
- Grace period (e.g., 24h after expiry where the user can still log in to renew).
  Users CAN still hit `/subscription/*` and `/profile` endpoints — they just
  can't use the rest of the app.
- Per-feature gating (e.g., "trial users can only create 100 bills"). Today
  all paid features are uniformly gated by expiry status.
