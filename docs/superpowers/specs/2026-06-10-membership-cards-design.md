# Membership / Loyalty Card Program — Design Spec

**Date:** 2026-06-10
**Status:** Approved (design); pending implementation plan
**Approach:** Dedicated membership module (mirrors the existing Suppliers module pattern)

## 1. Goal

Add a customer membership/loyalty card program to Valoryx billing so shops can retain
customers through tier-based discounts, points, monthly negotiable allowances, and
automatic tier upgrades. The owner defines card tiers once; staff use cards at the billing
counter. Multi-tenant via `client_id`, offline-SQLite-first with Supabase sync.

## 2. Core Decisions (from brainstorming)

- **Tier-based** (predefined card types), not per-customer custom cards.
- **Every benefit on a tier is optional** (NULL = tier doesn't offer it): discount %, points
  earning, points redemption, monthly negotiable budget, auto-upgrade, paid enrollment fee/validity.
- **Two point counters:** `redeemable_points` (spendable, up & down) and `lifetime_points`
  (monotonic, drives auto-upgrades). Customer chooses at billing: redeem now or save.
- **Full ledger** — every earn/redeem/negotiate/upgrade/enroll/adjust is an append-only line
  item. All monthly/yearly figures are computed from the ledger; no drifting counters.
- **Lookup by all three:** phone, membership number, and QR/barcode (one identifier, three entry paths).
- **Owner-only** create/edit tiers and manual adjustments; manager/staff can enroll & use cards.
- **Single consolidated owner page** (`/membership`, one nav item) containing tier builder,
  member list, manual enroll/adjust, and reporting. Only the billing-screen lookup panel lives outside it.
- Roles in scope: `owner`, `manager`, `staff` (admin and extra cashier role removed).

## 3. Data Model (migration v27 — 3 new tables)

All tables include `client_id`, `created_at`, `updated_at`, `synced_at` for tenant + sync.

### `membership_tier`
Owner-defined card types. Benefit columns are nullable; NULL = not offered.

| Column | Type | Notes |
|---|---|---|
| `tier_id` | PK (UUID) | |
| `client_id` | FK → client_entry | tenant, indexed |
| `name`, `description`, `color` | str | display |
| `discount_percentage` | numeric, nullable | auto-discount at billing |
| `points_per_100` | numeric, nullable | points earned per ₹100 spent |
| `redemption_rate` | numeric, nullable | ₹ value per point (e.g. 0.10 → 100 pts = ₹10) |
| `monthly_negotiable_budget` | numeric, nullable | ₹ negotiation cap per calendar month |
| `upgrade_threshold_points` | int, nullable | lifetime points to auto-promote |
| `upgrade_to_tier_id` | FK → self, nullable | target tier |
| `enrollment_fee` | numeric, nullable | NULL/0 = free, else paid |
| `validity_days` | int, nullable | NULL = never expires |
| `is_active` | bool | soft toggle |
| `sort_order` | int | display order |

### `membership_card`
One per customer (1:1).

| Column | Type | Notes |
|---|---|---|
| `card_id` | PK (UUID) | |
| `client_id` | FK | tenant |
| `customer_id` | FK → customer, unique | 1:1 |
| `membership_number` | str, unique, indexed | typed number + QR/barcode payload; server-generated, prefixed + zero-padded |
| `tier_id` | FK → membership_tier | current tier |
| `redeemable_points` | int, default 0 | spendable balance |
| `lifetime_points` | int, default 0 | monotonic; drives upgrades |
| `enrolled_at` | datetime | |
| `expires_at` | datetime, nullable | NULL = never |
| `status` | str | `active` / `expired` / `cancelled` |

### `membership_ledger`
Append-only event log; source of truth for all computed figures.

| Column | Type | Notes |
|---|---|---|
| `ledger_id` | PK (UUID) | |
| `client_id` | FK | tenant |
| `card_id` | FK → membership_card, indexed | |
| `bill_id` | nullable, indexed | bill that caused the event; used for idempotency |
| `event_type` | str | `earn` / `redeem` / `negotiate` / `upgrade` / `enroll` / `adjust` |
| `points_delta` | int | +/- points |
| `amount_delta` | numeric | +/- ₹ |
| `note` | text | audit |
| `created_at` | datetime | |

Indexes: `(card_id, created_at)` for history/period queries; unique-ish guard on
`(bill_id, event_type)` to support idempotent finalize.

## 4. Billing Flow

On `CreateBill.tsx`, a **Membership Card** panel:

1. **Look up** by phone / membership number / QR-barcode scan → resolves to one card.
   Panel shows tier badge, redeemable points (+₹ value), lifetime points, remaining monthly
   negotiable budget. No card → "Not a member → [Enroll]"; billing otherwise unchanged.
2. **Auto-apply** tier `discount_percentage` into the bill's existing `discount_percentage`
   (staff can override within rules).
3. **Points choice (customer's call):** *Redeem now* (enter points ≤ redeemable balance →
   converted via `redemption_rate` to ₹ off this bill) or *Save* (do nothing).
4. **Negotiation within budget:** existing `negotiable_amount` checked against
   `monthly_negotiable_budget` − (ledger `negotiate` sum for current month). Over budget → blocked.
5. **On finalize only** (drafts earn nothing), in **one DB transaction**:
   - `earn`: `floor(final_amount / 100) * points_per_100` → +redeemable, +lifetime
   - `redeem`: if used → −redeemable points, −₹
   - `negotiate`: if used → −₹ against monthly budget
   - `upgrade`: while `lifetime_points ≥ upgrade_threshold_points`, move to `upgrade_to_tier_id` (loop)
   - **Idempotency:** keyed on `bill_id`; a repeat finalize for the same bill is a no-op.

## 5. Owner Management (single page `/membership`)

Owner-only (guarded server-side, not just UI). Panels/tabs within one page:

- **Tier builder** — each benefit is a toggle; on = reveal its input. Unchecked = NULL in DB.
- **Members list** — per tier; manual enroll / move / cancel; manual point `adjust` (writes ledger).
- **Reporting** — members per tier, outstanding points liability (points × redemption_rate),
  top members by spend, upgrades this month. All ledger-derived.

### API (`backend/routes/membership.py`, registered like suppliers; `{ success, data, message }`)

| Method | Endpoint | Who | Purpose |
|---|---|---|---|
| GET | `/membership/tiers` | auth | list tiers |
| POST/PUT/DELETE | `/membership/tiers[/:id]` | owner | create/edit/deactivate (soft) tier |
| POST | `/membership/cards` | owner/mgr | enroll customer → tier (charges fee if paid) |
| GET | `/membership/cards/lookup?q=` | auth | resolve phone/number/barcode → card + balances (hot path, single indexed query) |
| GET | `/membership/cards/:id` | auth | card detail + computed monthly/yearly stats + ledger |
| POST | `/membership/cards/:id/adjust` | owner | manual point/tier adjustment |

Ledger commit on bill finalize is an internal service call inside the bill transaction, not a
separate public endpoint. All list endpoints paginated. Parameterized queries / ORM only.

## 6. Customer Card View

Reachable from `Customers.tsx` and the billing lookup panel:
- Tier badge, membership number, rendered **QR/barcode** (printable). Membership number is the
  barcode payload → reuses existing scanner path; QR/barcode rendering checks for an already-bundled
  lib before adding a dependency (avoid transitive-dep build breaks).
- Two counters: "Redeemable: N pts (≈ ₹X)" and "Lifetime: N pts" + progress bar to next tier.
- This-month / this-year spend, points earned/redeemed, negotiable used vs budget (ledger-computed).
- Full history table = human-readable ledger rows.

## 7. Frontend Structure (per conventions)

- `services/membership.ts` — all calls via shared axios instance (no raw fetch).
- `types/membership.ts` — `MembershipTier`, `MembershipCard`, `LedgerEntry`.
- `pages/Membership.tsx` (owner, single page) + `components/membership/` (TierForm, MembersList,
  CardView, LedgerTable, Reporting) + `components/billing/MembershipPanel.tsx` wired into CreateBill.
- Components < 300 lines; loading/error/empty states on every data view.

## 8. Edge Cases

- **Double-submit/retry on finalize** → idempotent (ledger keyed to `bill_id`); single transaction with rollback.
- **Bill cancelled after finalize** → reversing `adjust` entries claw back earned & restore redeemed points.
- **Redeem > balance** → rejected server-side.
- **Negotiation over monthly budget** → blocked with clear message.
- **Card expired** (paid tier past `expires_at`) → benefits suspended; renewal re-activates.
- **Tier deactivated while held** → soft-deactivate only; existing cards keep working; never hard-delete a tier with live cards.
- **Multiple upgrade thresholds in one bill** → upgrade loop applies in order.
- **Customer with no card** → billing identical to today.

## 9. Security

- Owner-only writes re-checked server-side.
- Parameterized / ORM queries only — no string interpolation.
- Membership number generated server-side, prefixed + zero-padded (not trivially guessable).
- No PII or balances in logs.

## 10. Testing

- **Backend** (`backend/tests/`): tier CRUD + permission denial; enroll free & paid; finalize
  transaction (earn/redeem/negotiate/upgrade); idempotency on double-submit; cancellation reversal;
  budget enforcement; lookup by all three keys; expiry handling.
- **Frontend:** lookup panel states (member/non-member/expired); redeem validation; tier-form toggle logic.
- Auto quality pipeline after: code-reviewer → performance-optimizer → tester.

## 11. Out of Scope (v1, YAGNI)

- Multiple cards per customer.
- Cross-tenant / shared cards.
- Family/group cards, referral bonuses, time-limited promo multipliers.
- Customer self-service portal (cards are managed in-store).
