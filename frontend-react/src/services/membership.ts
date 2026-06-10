/**
 * Valoryx - Membership / Loyalty Card Service
 *
 * All calls go through the shared axios instance (`@/lib/api`).
 * Never use raw fetch with a hardcoded base URL — that breaks Vite's module graph.
 *
 * Errors are normalised to a human-readable string via `getMembershipError`,
 * so callers can surface a friendly message without inspecting axios internals.
 */

import api from '@/lib/api'
import type { AxiosError } from 'axios'
import type {
  ApiEnvelope,
  MembershipTier,
  TierWritePayload,
  MembershipCard,
  EnrollPayload,
  AdjustPayload,
  CardDetail,
  CardLookupResult,
  MembershipReport,
  PaginatedCards,
} from '@/types/membership'

const BASE = '/membership'

// ─── Error formatting ────────────────────────────────────────────────────────

interface ErrorBody {
  error?: string
  message?: string
}

/**
 * Extract a user-friendly message from an unknown thrown value.
 * Keeps the service layer the single place that understands axios error shapes.
 */
export function getMembershipError(err: unknown, fallback = 'Something went wrong'): string {
  const axiosErr = err as AxiosError<ErrorBody> | undefined
  return (
    axiosErr?.response?.data?.error ||
    axiosErr?.response?.data?.message ||
    axiosErr?.message ||
    fallback
  )
}

// ─── Tiers ─────────────────────────────────────────────────────────────────

const listTiers = () =>
  api.get<ApiEnvelope<MembershipTier[]>>(`${BASE}/tiers`)

const createTier = (payload: TierWritePayload) =>
  api.post<ApiEnvelope<MembershipTier>>(`${BASE}/tiers`, payload)

const updateTier = (tierId: string, payload: TierWritePayload) =>
  api.put<ApiEnvelope<MembershipTier>>(`${BASE}/tiers/${tierId}`, payload)

/** Soft-deactivates a tier (existing cards keep working). */
const deleteTier = (tierId: string) =>
  api.delete<ApiEnvelope<null>>(`${BASE}/tiers/${tierId}`)

// ─── Cards ───────────────────────────────────────────────────────────────────

/** Enroll a customer into a tier (charges the enrollment fee if the tier is paid). */
const enrollCard = (payload: EnrollPayload) =>
  api.post<ApiEnvelope<MembershipCard>>(`${BASE}/cards`, payload)

/**
 * Resolve a card by phone / membership number / QR-barcode payload.
 * Single hot-path query — returns the card + embedded balances.
 */
const lookupCard = (q: string) =>
  api.get<ApiEnvelope<CardLookupResult | null>>(`${BASE}/cards/lookup`, {
    params: { q },
  })

/** Card detail + computed monthly/yearly stats + full ledger. */
const getCard = (cardId: string) =>
  api.get<ApiEnvelope<CardDetail>>(`${BASE}/cards/${cardId}`)

/** Paginated card list, optionally filtered by tier. */
const listCards = (params?: { tier_id?: string; page?: number; per_page?: number; search?: string }) =>
  api.get<ApiEnvelope<PaginatedCards>>(`${BASE}/cards`, { params })

/** Manual owner-only point/tier/status adjustment (writes a ledger entry). */
const adjustCard = (cardId: string, payload: AdjustPayload) =>
  api.post<ApiEnvelope<MembershipCard>>(`${BASE}/cards/${cardId}/adjust`, payload)

// ─── Reporting ─────────────────────────────────────────────────────────────

const getReport = () =>
  api.get<ApiEnvelope<MembershipReport>>(`${BASE}/report`)

const membershipService = {
  listTiers,
  createTier,
  updateTier,
  deleteTier,
  enrollCard,
  lookupCard,
  getCard,
  listCards,
  adjustCard,
  getReport,
}

export default membershipService
