/**
 * CardView — full membership card detail.
 *
 * Shows: tier badge, membership number, printable QR code (payload = membership
 * number, reuses the existing scanner path), two point counters with ₹ value and a
 * progress bar to the next tier, this-month / this-year stats, and the full ledger.
 *
 * QR rendering uses `qrcode.react` (already bundled — see package.json), so no new
 * dependency is added.
 */
import { useCallback, useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import membershipService, { getMembershipError } from '@/services/membership'
import { useClient } from '@/contexts/ClientContext'
import { useCurrency } from '@/lib/useCurrency'
import type { CardDetail, PeriodStats } from '@/types/membership'
import LedgerTable from './LedgerTable'
import { MembershipCardPrintButton, tierBenefitLines } from './MembershipCardPrint'

interface CardViewProps {
  cardId: string
  /** Called when the card could not be loaded (e.g. to close a drawer). */
  onError?: (message: string) => void
}

const fmtCurrency = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })
const money = (n: number, cur: string) => `${cur}${fmtCurrency.format(n)}`
const pts = (n: number) => `${n.toLocaleString('en-IN')} pts`

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  expired: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  cancelled: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
}

function StatBlock({ title, stats, cur }: { title: string; stats: PeriodStats; cur: string }) {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">{title}</p>
      <dl className="grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-gray-500 dark:text-gray-400">Spend</dt>
        <dd className="text-right font-medium text-gray-900 dark:text-white">{money(stats.spend, cur)}</dd>
        <dt className="text-gray-500 dark:text-gray-400">Earned</dt>
        <dd className="text-right font-medium text-green-600 dark:text-green-400">{pts(stats.points_earned)}</dd>
        <dt className="text-gray-500 dark:text-gray-400">Redeemed</dt>
        <dd className="text-right font-medium text-amber-600 dark:text-amber-400">{pts(stats.points_redeemed)}</dd>
        <dt className="text-gray-500 dark:text-gray-400">Negotiated</dt>
        <dd className="text-right font-medium text-purple-600 dark:text-purple-400">{money(stats.negotiable_used, cur)}</dd>
      </dl>
    </div>
  )
}

export default function CardView({ cardId, onError }: CardViewProps) {
  const { client } = useClient()
  const { symbol: cur } = useCurrency()
  const [detail, setDetail] = useState<CardDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await membershipService.getCard(cardId)
      setDetail(res.data.data)
    } catch (err) {
      const msg = getMembershipError(err, 'Failed to load membership card')
      setError(msg)
      onError?.(msg)
    } finally {
      setLoading(false)
    }
  }, [cardId, onError])

  useEffect(() => { load() }, [load])

  if (loading) {
    return <div className="text-center py-16 text-gray-400 dark:text-gray-500">Loading card…</div>
  }
  if (error || !detail) {
    return (
      <div className="text-center py-16">
        <p className="text-red-500 mb-3">{error || 'Card not found'}</p>
        <button type="button" onClick={load}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Retry</button>
      </div>
    )
  }

  const { card, next_tier, this_month, this_year } = detail
  const tier = card.tier
  const redemptionRate = tier?.redemption_rate ?? 0
  const redeemableValue = card.redeemable_points * redemptionRate

  // Progress to the next tier (lifetime points vs. upgrade threshold).
  const threshold = tier?.upgrade_threshold_points ?? null
  const progressPct = threshold && threshold > 0
    ? Math.min(100, Math.round((card.lifetime_points / threshold) * 100))
    : null

  const accent = tier?.color || '#2563eb'

  const shopName = client?.client_name || 'Your Shop'
  const shopPhone = client?.phone || ''
  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const validFrom = card.enrolled_at ? fmtDate(card.enrolled_at) : ''
  const validTo = card.expires_at ? fmtDate(card.expires_at) : null

  return (
    <div className="space-y-6">
      {/* Printable card — front & back, standard credit-card aspect ratio */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* FRONT */}
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 print:hidden">Front</p>
          <div className="relative rounded-2xl text-white shadow-lg overflow-hidden aspect-[1.586]"
            style={{ background: `linear-gradient(135deg, ${accent}, ${accent}99 55%, ${accent}dd)` }}>
            {/* subtle sheen, like an embossed card */}
            <div className="absolute -top-12 -right-10 w-44 h-44 rounded-full bg-white/10" aria-hidden="true" />
            <div className="absolute -bottom-16 -left-8 w-40 h-40 rounded-full bg-black/10" aria-hidden="true" />
            <div className="relative h-full p-4 flex flex-col justify-between">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-extrabold tracking-wide uppercase truncate">{shopName}</p>
                <span className="shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-white/25 backdrop-blur">
                  {tier?.name || 'Member'}
                </span>
              </div>
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-semibold truncate">{card.customer_name || 'Member'}</p>
                  <p className="font-mono text-sm tracking-[0.18em] opacity-95">{card.membership_number}</p>
                  <p className="text-[10px] opacity-80 mt-0.5">
                    Valid: {validFrom}{validTo ? ` – ${validTo}` : ' · No expiry'}
                  </p>
                </div>
                <div className="bg-white p-1.5 rounded-lg shrink-0" aria-label={`QR code for membership ${card.membership_number}`}>
                  <QRCodeSVG value={card.membership_number} size={64} level="M" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* BACK */}
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 print:hidden">Back</p>
          <div className="relative rounded-2xl shadow-lg overflow-hidden aspect-[1.586] bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            {/* magnetic stripe */}
            <div className="h-7 mt-3" style={{ background: accent }} aria-hidden="true" />
            <div className="p-4 pt-2 flex flex-col justify-between h-[calc(100%-2.5rem)]">
              <ul className="text-[10px] leading-relaxed text-gray-600 dark:text-gray-300 space-y-0.5 mt-1">
                {tier?.discount_percentage != null && (
                  <li>• {tier.discount_percentage}% member discount on every bill</li>
                )}
                {tier?.points_per_100 != null && (
                  <li>• Earn {tier.points_per_100} point{Number(tier.points_per_100) === 1 ? '' : 's'} per {cur}100 spent</li>
                )}
                {tier?.redemption_rate != null && (
                  <li>• Redeem points as money off — 1 pt = {cur}{tier.redemption_rate}</li>
                )}
                {tier?.monthly_negotiable_budget != null && (
                  <li>• {cur}{tier.monthly_negotiable_budget} negotiation allowance per {tier.negotiable_budget_period === 'yearly' ? 'year' : 'month'}</li>
                )}
              </ul>
              <div className="border-t border-gray-300 dark:border-gray-600 pt-1.5">
                <p className="text-[10px] font-semibold text-gray-700 dark:text-gray-200">{shopName}{shopPhone ? ` · ${shopPhone}` : ''}</p>
                <p className="text-[9px] text-gray-400">
                  This card is the property of {shopName}. Present at billing to use benefits. Not transferable.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Status + print (hidden from print output) */}
      <div className="flex items-center justify-between print:hidden">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_BADGE[card.status]}`}>
          {card.status}
        </span>
        <MembershipCardPrintButton
          variant="button"
          data={{
            shopName,
            tierName: tier?.name || 'Member',
            accentColor: accent,
            memberName: card.customer_name || 'Member',
            cardNumber: card.membership_number,
            description: validTo ? `Valid ${validFrom} – ${validTo}` : `Valid from ${validFrom}`,
            qrValue: card.membership_number,
            benefits: tierBenefitLines(tier, cur),
            shopPhone,
          }}
        />
      </div>

      {/* Point counters */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Redeemable</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{pts(card.redeemable_points)}</p>
          {redemptionRate > 0 && (
            <p className="text-sm text-green-600 dark:text-green-400">≈ {money(redeemableValue, cur)}</p>
          )}
        </div>
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Lifetime</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{pts(card.lifetime_points)}</p>
          {progressPct !== null && next_tier && (
            <div className="mt-2">
              <div className="flex justify-between text-[11px] text-gray-500 dark:text-gray-400 mb-1">
                <span>Next: {next_tier.name}</span>
                <span>{card.lifetime_points} / {threshold}</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Period stats */}
      <div className="grid gap-4 sm:grid-cols-2">
        <StatBlock title="This Month" stats={this_month} cur={cur} />
        <StatBlock title="This Year" stats={this_year} cur={cur} />
      </div>

      {/* Ledger history */}
      <div>
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">History</p>
        <LedgerTable entries={detail.ledger} />
      </div>
    </div>
  )
}
