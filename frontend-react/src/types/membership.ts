/**
 * Valoryx - Membership / Loyalty Card Types
 *
 * Type definitions for the tier-based customer membership program.
 * Mirrors the backend API contract: all responses are { success, data, message }.
 *
 * Design reference: docs/superpowers/specs/2026-06-10-membership-cards-design.md
 */

// ============================================================================
// SHARED
// ============================================================================

/** Generic envelope returned by every membership endpoint. */
export interface ApiEnvelope<T> {
  success: boolean
  data: T
  message?: string
}

export type CardStatus = 'active' | 'expired' | 'cancelled'

export type LedgerEventType =
  | 'earn'
  | 'redeem'
  | 'negotiate'
  | 'upgrade'
  | 'enroll'
  | 'adjust'

// ============================================================================
// MEMBERSHIP TIER
// ============================================================================

/**
 * Owner-defined card type. Every benefit column is nullable —
 * `null` means the tier does not offer that benefit.
 */
export interface MembershipTier {
  tier_id: string
  client_id: string
  name: string
  description: string | null
  color: string | null
  /** Auto-discount applied at billing (%). */
  discount_percentage: number | null
  /** Points earned per ₹100 spent. */
  points_per_100: number | null
  /** ₹ value per point (e.g. 0.10 → 100 pts = ₹10). */
  redemption_rate: number | null
  /** ₹ negotiation cap per period (see negotiable_budget_period). */
  monthly_negotiable_budget: number | null
  /** Budget window: calendar month (default) or calendar year. */
  negotiable_budget_period?: 'monthly' | 'yearly'
  /** Lifetime points needed to auto-promote. */
  upgrade_threshold_points: number | null
  /** Target tier for auto-upgrade. */
  upgrade_to_tier_id: string | null
  /** NULL/0 = free enrollment, else paid. */
  enrollment_fee: number | null
  /** NULL = never expires. */
  validity_days: number | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at?: string | null
}

/**
 * Tier write payload. Each benefit is optional; sending `null` clears it.
 * `name` is the only required field.
 */
export interface TierWritePayload {
  name: string
  description?: string | null
  color?: string | null
  discount_percentage?: number | null
  points_per_100?: number | null
  redemption_rate?: number | null
  monthly_negotiable_budget?: number | null
  negotiable_budget_period?: 'monthly' | 'yearly'
  upgrade_threshold_points?: number | null
  upgrade_to_tier_id?: string | null
  enrollment_fee?: number | null
  validity_days?: number | null
  is_active?: boolean
  sort_order?: number
}

// ============================================================================
// MEMBERSHIP CARD
// ============================================================================

/** A customer's single membership card (1:1 with customer). */
export interface MembershipCard {
  card_id: string
  client_id: string
  customer_id: string
  customer_name?: string | null
  customer_phone?: string | null
  /** Typed number + QR/barcode payload; server-generated, prefixed + zero-padded. */
  membership_number: string
  tier_id: string
  /** Resolved tier (lookup/detail responses embed it). */
  tier?: MembershipTier | null
  /** Spendable balance (up & down). */
  redeemable_points: number
  /** Monotonic; drives auto-upgrades. */
  lifetime_points: number
  enrolled_at: string
  /** NULL = never expires. */
  expires_at: string | null
  status: CardStatus
}

/** Enroll a customer into a tier — by id, or by phone (+ name) for counter
 *  enrollment, which auto-creates the customer if they're new. */
export interface EnrollPayload {
  customer_id?: string
  customer_phone?: string
  customer_name?: string
  tier_id: string
}

/** Manual owner adjustment — writes an `adjust` ledger entry. */
export interface AdjustPayload {
  /** +/- redeemable points (optional). */
  points_delta?: number
  /** Move card to a different tier (optional). */
  tier_id?: string
  /** Override card status (optional). */
  status?: CardStatus
  /** Required audit note. */
  note: string
}

// ============================================================================
// LEDGER
// ============================================================================

/** Append-only ledger line; source of truth for all computed figures. */
export interface LedgerEntry {
  ledger_id: string
  card_id: string
  bill_id: string | null
  event_type: LedgerEventType
  points_delta: number
  amount_delta: number
  note: string | null
  created_at: string
}

// ============================================================================
// COMPUTED STATS
// ============================================================================

/** Per-period figures computed from the ledger. */
export interface PeriodStats {
  spend: number
  points_earned: number
  points_redeemed: number
  negotiable_used: number
}

/** Card detail response: card + tiers context + computed stats + ledger. */
export interface CardDetail {
  card: MembershipCard
  /** The tier the card will auto-upgrade into next, if any. */
  next_tier: MembershipTier | null
  this_month: PeriodStats
  this_year: PeriodStats
  ledger: LedgerEntry[]
  /** Remaining negotiable budget for the current month (₹). */
  monthly_negotiable_remaining: number | null
}

/** Lookup response: card + tier context + spendable value, used at the billing counter. */
export interface CardLookupResult {
  card: MembershipCard
  tier: MembershipTier | null
  /** Redeemable points expressed in ₹ (null when the tier has no redemption). */
  redeemable_value: number | null
  /** Remaining monthly negotiable budget in ₹ (null when the tier has no budget). */
  remaining_monthly_budget: number | null
}

// ============================================================================
// REPORTING
// ============================================================================

export interface TierMemberCount {
  tier_id: string
  tier_name: string
  tier_color: string | null
  member_count: number
}

export interface TopMember {
  card_id: string
  customer_name: string
  membership_number: string
  tier_name: string
  total_spend: number
}

export interface MembershipReport {
  members_per_tier: TierMemberCount[]
  /** Σ(redeemable_points × redemption_rate) across all active cards (₹). */
  outstanding_points_liability: number
  top_members: TopMember[]
  /** Count of `upgrade` ledger events in the current calendar month. */
  upgrades_this_month: number
  total_active_members: number
}

// ============================================================================
// LIST / PAGINATION
// ============================================================================

export interface PaginatedCards {
  cards: MembershipCard[]
  total: number
  page: number
  per_page: number
}
