/**
 * MembershipBillingPanel — counter-side membership lookup + redemption.
 *
 * Resolves a card by phone / membership number / scanned QR-barcode (all three
 * collapse to one lookup), auto-applies the tier discount via `onApply`, shows
 * balances + remaining monthly negotiable budget, and lets staff redeem points
 * as money off the current bill. The redeemed ₹ value is mirrored into the bill
 * total by the parent; the backend re-computes it authoritatively on finalize.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import membershipService, { getMembershipError } from '@/services/membership'
import type { CardLookupResult, MembershipTier } from '@/types/membership'

interface MembershipBillingPanelProps {
  /** Pre-fills the lookup box (the customer's phone on the bill). */
  customerPhone: string
  /** Customer name on the bill — used for quick enrollment of a new customer. */
  customerName: string
  /** The card currently attached to this bill (undefined = none). */
  attachedCardId?: string
  /** Points the cashier has chosen to redeem on this bill. */
  redeemPoints: number
  /** Bill payable BEFORE point redemption — caps how many points can be redeemed. */
  billPayableBeforeRedeem: number
  /** Called when a card is found and attached (parent applies tier discount + rate). */
  onApply: (result: CardLookupResult) => void
  /** Called when the redeem-points value changes (already clamped to a valid range). */
  onRedeemChange: (points: number) => void
  /** Called to detach the card from the bill. */
  onRemove: () => void
}

const money = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

export default function MembershipBillingPanel({
  customerPhone,
  customerName,
  attachedCardId,
  redeemPoints,
  billPayableBeforeRedeem,
  onApply,
  onRedeemChange,
  onRemove,
}: MembershipBillingPanelProps) {
  const [query, setQuery] = useState(customerPhone || '')
  const [result, setResult] = useState<CardLookupResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notMember, setNotMember] = useState(false)
  // Avoid re-applying the tier discount when only restoring the display.
  const restoredFor = useRef<string | null>(null)

  // Quick enrollment at the counter (no card found → pick a tier → enroll)
  const [tiers, setTiers] = useState<MembershipTier[] | null>(null)
  const [enrollTierId, setEnrollTierId] = useState('')
  const [enrolling, setEnrolling] = useState(false)

  const doLookup = useCallback(async (q: string, applyOnFound: boolean) => {
    const term = q.trim()
    if (!term) {
      setError('Enter a phone number or membership number')
      return
    }
    setLoading(true)
    setError(null)
    setNotMember(false)
    try {
      const res = await membershipService.lookupCard(term)
      const data = res.data.data
      if (data?.card?.card_id) {
        setResult(data)
        if (applyOnFound) onApply(data)
      } else {
        setResult(null)
        setNotMember(true)
        if (applyOnFound) onRemove()
      }
    } catch (err) {
      setError(getMembershipError(err, 'Lookup failed'))
    } finally {
      setLoading(false)
    }
  }, [onApply, onRemove])

  // Restore the card display after a tab switch (card attached but no result yet).
  // The clear branch must fire only on the attached→detached TRANSITION — this
  // effect re-runs on every parent render (doLookup identity changes), and an
  // unconditional clear would wipe the "not a member → enroll" prompt instantly.
  const prevAttached = useRef(attachedCardId)
  useEffect(() => {
    if (attachedCardId && !result && customerPhone && restoredFor.current !== attachedCardId) {
      restoredFor.current = attachedCardId
      doLookup(customerPhone, false)
    }
    if (!attachedCardId && prevAttached.current) {
      setResult(null)
      setNotMember(false)
      restoredFor.current = null
    }
    prevAttached.current = attachedCardId
  }, [attachedCardId, customerPhone, result, doLookup])

  // When the bill's customer changes (phone fills in, tab switch, bill completed),
  // mirror the phone into the lookup box so auto-fetch fires — and lift any
  // remove-suppression, since this is a different/new bill context now.
  // Mirroring '' on reset also stops a stale query leaking into a fresh tab.
  const lastPhone = useRef(customerPhone)
  useEffect(() => {
    if (customerPhone !== lastPhone.current) {
      lastPhone.current = customerPhone
      suppressTerm.current = null
      if (!attachedCardId) setQuery(customerPhone || '')
    }
  }, [customerPhone, attachedCardId])

  // Auto-fetch: debounced; only fires once the input looks like a complete key
  // (10+ digit phone or a prefixed membership number), so partial typing doesn't
  // spam the lookup endpoint with misses. doLookup is read through a ref because
  // its identity changes with the parent's inline callbacks — depending on it
  // directly would re-arm the timer on every render. suppressTerm blocks
  // auto-re-attach ONLY after an explicit ✕ remove for the same query — it is
  // lifted as soon as the bill's customer changes (next bill / tab switch).
  const doLookupRef = useRef(doLookup)
  useEffect(() => { doLookupRef.current = doLookup }, [doLookup])
  const suppressTerm = useRef<string | null>(null)
  useEffect(() => {
    if (result) return
    const term = query.trim()
    const looksComplete = /^\d{10,}$/.test(term) || /^[A-Za-z]{2,5}-\w{3,}$/.test(term)
    if (!looksComplete || term === suppressTerm.current) return
    const t = setTimeout(() => {
      doLookupRef.current(term, true)
    }, 400)
    return () => clearTimeout(t)
  }, [query, result])

  // Lazy-load active tiers the first time "not a member" shows, for quick enroll.
  useEffect(() => {
    if (!notMember || tiers !== null) return
    membershipService.listTiers()
      .then(res => {
        const active = (res.data.data || []).filter(t => t.is_active)
        setTiers(active)
        if (active.length > 0) setEnrollTierId(active[0].tier_id)
      })
      .catch(() => setTiers([]))
  }, [notMember, tiers])

  // The phone for enrollment: the typed query if it's a phone, else the bill's phone.
  const enrollPhone = /^\d{10,}$/.test(query.trim()) ? query.trim() : (customerPhone || '').trim()

  const quickEnroll = async () => {
    if (!enrollTierId || !enrollPhone) return
    setEnrolling(true)
    setError(null)
    try {
      const res = await membershipService.enrollCard({
        customer_phone: enrollPhone,
        customer_name: customerName.trim() || undefined,
        tier_id: enrollTierId,
      })
      const newCard = res.data.data
      const attached: CardLookupResult = {
        card: newCard,
        tier: newCard.tier ?? null,
        redeemable_value: 0,
        remaining_monthly_budget: newCard.tier?.monthly_negotiable_budget ?? null,
      }
      setResult(attached)
      setNotMember(false)
      onApply(attached)
    } catch (err) {
      setError(getMembershipError(err, 'Failed to enroll'))
    } finally {
      setEnrolling(false)
    }
  }

  const card = result?.card
  const tier = result?.tier
  const rate = tier?.redemption_rate ?? 0
  const maxByBalance = card?.redeemable_points ?? 0
  const maxByBill = rate > 0 ? Math.floor(billPayableBeforeRedeem / rate) : 0
  const maxRedeem = Math.max(0, Math.min(maxByBalance, maxByBill))

  const handleRedeemInput = (raw: string) => {
    const n = Math.floor(Number(raw) || 0)
    onRedeemChange(Math.max(0, Math.min(n, maxRedeem)))
  }

  const handleRemove = () => {
    // Suppress auto-re-attach for this same query — the cashier explicitly
    // removed the card. Lifted when the bill's customer changes.
    suppressTerm.current = query.trim() || null
    setResult(null)
    setNotMember(false)
    restoredFor.current = null
    onRemove()
  }

  return (
    <div>
      <label className="block text-base font-bold text-gray-700 dark:text-gray-300 mb-1">
        Membership Card
      </label>

      {/* Lookup row (hidden once a card is attached) — auto-fetches as you type/scan */}
      {!card && (
        <>
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); doLookup(query, true) } }}
              placeholder="Phone / membership no. / scan QR"
              aria-label="Find membership card"
              className="w-full p-2 pr-8 text-xs border-2 border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
            />
            {loading && (
              <Loader2 className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-purple-500" aria-label="Looking up card" />
            )}
          </div>
          {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
          {notMember && (
            <div className="mt-1.5">
              {tiers === null ? (
                <p className="text-xs text-gray-400">Loading tiers…</p>
              ) : tiers.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Not a member — no card tiers exist yet (owner creates them under Membership).
                </p>
              ) : !enrollPhone ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Not a member — enter the customer's phone to enroll them.
                </p>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Not a member —</span>
                  <select
                    value={enrollTierId}
                    onChange={(e) => setEnrollTierId(e.target.value)}
                    aria-label="Card tier for enrollment"
                    className="p-1.5 text-xs border-2 border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    {tiers.map(t => (
                      <option key={t.tier_id} value={t.tier_id}>
                        {t.name}{t.enrollment_fee ? ` (₹${t.enrollment_fee})` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={quickEnroll}
                    disabled={enrolling}
                    className="px-3 py-1.5 text-xs font-semibold rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
                  >
                    {enrolling ? 'Enrolling…' : 'Enroll & attach'}
                  </button>
                  {!customerName.trim() && (
                    <span className="text-[11px] text-amber-600 dark:text-amber-400">new customer? fill name on the bill</span>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Attached card — input shrinks to a small chip; tier / points / discount
          show inline on the right so the row keeps its height */}
      {card && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <div className="relative w-36 shrink-0" title={card.customer_name || undefined}>
            <input
              type="text"
              readOnly
              value={card.membership_number}
              aria-label={`Membership card ${card.membership_number}${card.customer_name ? ` — ${card.customer_name}` : ''}`}
              className="w-full p-2 pr-7 text-xs font-mono border-2 border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700"
            />
            <button type="button" onClick={handleRemove} aria-label="Remove card from bill"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold text-white shrink-0"
            style={{ background: tier?.color || '#7c3aed' }}>
            {tier?.name || 'Member'}
          </span>

          <span className="text-[11px] font-semibold text-gray-900 dark:text-white whitespace-nowrap">
            {card.redeemable_points.toLocaleString('en-IN')} pts
            {result?.redeemable_value != null && (
              <span className="text-green-600 dark:text-green-400"> ≈ {money(result.redeemable_value)}</span>
            )}
          </span>

          {rate > 0 && maxRedeem > 0 && (
            <span className="flex items-center gap-1 whitespace-nowrap">
              <label className="text-[11px] text-gray-600 dark:text-gray-300" htmlFor="redeem-pts">Redeem</label>
              <input
                id="redeem-pts"
                type="number"
                min={0}
                max={maxRedeem}
                value={redeemPoints || ''}
                onChange={(e) => handleRedeemInput(e.target.value)}
                placeholder="0"
                className="w-16 p-1 text-xs border-2 border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              {(redeemPoints || 0) > 0 && (
                <span className="text-[11px] text-green-600 dark:text-green-400">−{money((redeemPoints || 0) * rate)}</span>
              )}
              <button type="button" onClick={() => onRedeemChange(maxRedeem)}
                className="text-[11px] text-purple-600 dark:text-purple-400 hover:underline">
                Max
              </button>
            </span>
          )}

          {tier?.discount_percentage != null && (
            <span className="text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap">
              {tier.discount_percentage}% off applied
            </span>
          )}
          {result?.remaining_monthly_budget != null && (
            <span className="text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap"
              title="Tier's negotiation allowance left this period (month or year) — reduces when '₹ Price' negotiation is used on a member's bill; resets at the period start">
              · Negotiable left {money(result.remaining_monthly_budget)}/{result?.tier?.negotiable_budget_period === 'yearly' ? 'yr' : 'mo'}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
