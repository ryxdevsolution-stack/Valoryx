/**
 * MembersList — members grouped/filtered by tier with owner actions:
 * enroll, move (tier change), cancel, and manual point adjust.
 * Handles loading / error / empty states. Selecting a row opens the card view.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, SlidersHorizontal } from 'lucide-react'
import membershipService, { getMembershipError } from '@/services/membership'
import type { MembershipCard, MembershipTier, AdjustPayload } from '@/types/membership'
import EnrollMemberModal from './EnrollMemberModal'

interface MembersListProps {
  tiers: MembershipTier[]
  onToast: (msg: string, type?: 'success' | 'error') => void
  onViewCard: (cardId: string) => void
}

const TIER_BADGE = 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium'

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  expired: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  cancelled: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
}

const inputCls =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function MembersList({ tiers, onToast, onViewCard }: MembersListProps) {
  const [cards, setCards] = useState<MembershipCard[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tierFilter, setTierFilter] = useState('')
  const [search, setSearch] = useState('')

  // Adjust modal state
  const [adjustCard, setAdjustCard] = useState<MembershipCard | null>(null)
  const [adjForm, setAdjForm] = useState<AdjustPayload>({ note: '' })
  const [adjSaving, setAdjSaving] = useState(false)

  // Enroll modal state
  const [enrolling, setEnrolling] = useState(false)

  const tierName = useMemo(() => {
    const map = new Map<string, MembershipTier>()
    tiers.forEach(t => map.set(t.tier_id, t))
    return map
  }, [tiers])

  const fetchCards = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await membershipService.listCards({
        tier_id: tierFilter || undefined,
        search: search.trim() || undefined,
        per_page: 100,
      })
      setCards(res.data.data.cards || [])
    } catch (err) {
      const msg = getMembershipError(err, 'Failed to load members')
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [tierFilter, search])

  useEffect(() => { fetchCards() }, [fetchCards])

  const openAdjust = useCallback((card: MembershipCard) => {
    setAdjustCard(card)
    setAdjForm({ note: '', points_delta: undefined, tier_id: card.tier_id, status: card.status })
  }, [])

  const submitAdjust = useCallback(async () => {
    if (!adjustCard) return
    if (!adjForm.note.trim()) { onToast('A note is required for adjustments', 'error'); return }
    setAdjSaving(true)
    try {
      const payload: AdjustPayload = {
        note: adjForm.note.trim(),
        points_delta: adjForm.points_delta != null && !Number.isNaN(adjForm.points_delta) ? adjForm.points_delta : undefined,
        tier_id: adjForm.tier_id && adjForm.tier_id !== adjustCard.tier_id ? adjForm.tier_id : undefined,
        status: adjForm.status && adjForm.status !== adjustCard.status ? adjForm.status : undefined,
      }
      await membershipService.adjustCard(adjustCard.card_id, payload)
      onToast('Card adjusted')
      setAdjustCard(null)
      fetchCards()
    } catch (err) {
      onToast(getMembershipError(err, 'Failed to adjust card'), 'error')
    } finally {
      setAdjSaving(false)
    }
  }, [adjustCard, adjForm, onToast, fetchCards])

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name, phone, number…"
          className="flex-1 min-w-48 px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <select value={tierFilter} onChange={e => setTierFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All tiers</option>
          {tiers.map(t => <option key={t.tier_id} value={t.tier_id}>{t.name}</option>)}
        </select>
        <button type="button" onClick={() => setEnrolling(true)}
          disabled={tiers.filter(t => t.is_active).length === 0}
          title={tiers.filter(t => t.is_active).length === 0 ? 'Create a card tier first' : undefined}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">
          + Enroll Member
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">Loading members…</div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-500 mb-3">{error}</p>
          <button type="button" onClick={fetchCards} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Retry</button>
        </div>
      ) : cards.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          <p className="text-lg">No members yet</p>
          <p className="text-sm mt-1">Click “+ Enroll Member” above to assign a customer their first card</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/50 text-xs text-gray-500 dark:text-gray-400 uppercase">
              <tr>
                <th scope="col" className="px-4 py-3 text-left">Member</th>
                <th scope="col" className="px-4 py-3 text-left">Number</th>
                <th scope="col" className="px-4 py-3 text-left">Tier</th>
                <th scope="col" className="px-4 py-3 text-right">Redeemable</th>
                <th scope="col" className="px-4 py-3 text-right">Lifetime</th>
                <th scope="col" className="px-4 py-3 text-left">Status</th>
                <th scope="col" className="px-4 py-3 text-left"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {cards.map(c => {
                const t = tierName.get(c.tier_id)
                return (
                  <tr key={c.card_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 dark:text-white">{c.customer_name || '—'}</p>
                      {c.customer_phone && <p className="text-xs text-gray-500 dark:text-gray-400">{c.customer_phone}</p>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-400">{c.membership_number}</td>
                    <td className="px-4 py-3">
                      <span className={TIER_BADGE} style={{ backgroundColor: `${t?.color || '#2563eb'}22`, color: t?.color || '#2563eb' }}>
                        {t?.name || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{c.redeemable_points.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{c.lifetime_points.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[c.status]}`}>{c.status}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button type="button" onClick={() => onViewCard(c.card_id)}
                        title="View card" aria-label={`View card ${c.membership_number}`}
                        className="p-1.5 mr-1 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => openAdjust(c)}
                        title="Adjust points / tier / status" aria-label={`Adjust card ${c.membership_number}`}
                        className="p-1.5 rounded-lg text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
                        <SlidersHorizontal className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Enroll modal */}
      {enrolling && (
        <EnrollMemberModal
          tiers={tiers}
          onClose={() => setEnrolling(false)}
          onEnrolled={() => fetchCards()}
          onToast={onToast}
        />
      )}

      {/* Adjust modal */}
      {adjustCard && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Adjust — {adjustCard.customer_name}</h2>
              <button type="button" onClick={() => setAdjustCard(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label htmlFor="adj-points" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Points adjustment (±)</label>
                <input id="adj-points" type="number" step="1"
                  value={adjForm.points_delta ?? ''}
                  onChange={e => setAdjForm(f => ({ ...f, points_delta: e.target.value === '' ? undefined : Number(e.target.value) }))}
                  placeholder="e.g. 100 or -50" className={inputCls} />
              </div>
              <div>
                <label htmlFor="adj-tier" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Move to tier</label>
                <select id="adj-tier" value={adjForm.tier_id ?? ''} onChange={e => setAdjForm(f => ({ ...f, tier_id: e.target.value }))} className={inputCls}>
                  {tiers.map(t => <option key={t.tier_id} value={t.tier_id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="adj-status" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                <select id="adj-status" value={adjForm.status ?? ''}
                  onChange={e => setAdjForm(f => ({ ...f, status: e.target.value as AdjustPayload['status'] }))} className={inputCls}>
                  <option value="active">Active</option>
                  <option value="expired">Expired</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label htmlFor="adj-note" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Note <span className="text-red-400">*</span></label>
                <textarea id="adj-note" rows={2} value={adjForm.note}
                  onChange={e => setAdjForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="Reason for this adjustment" className={`${inputCls} resize-none`} />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-700">
              <button type="button" onClick={() => setAdjustCard(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">Cancel</button>
              <button type="button" onClick={submitAdjust} disabled={adjSaving || !adjForm.note.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">
                {adjSaving ? 'Saving…' : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
