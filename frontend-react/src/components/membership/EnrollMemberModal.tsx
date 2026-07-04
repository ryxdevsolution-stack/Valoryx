/**
 * EnrollMemberModal — assign a membership card to a customer.
 *
 * Search an existing customer (by name / phone / code via /customer/search),
 * pick a tier, enroll. The backend generates the card number, charges the
 * tier's enrollment fee (if any), and sets expiry from validity_days.
 */
import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { useCurrency } from '@/lib/useCurrency'
import membershipService, { getMembershipError } from '@/services/membership'
import type { MembershipCard, MembershipTier } from '@/types/membership'

interface CustomerHit {
  customer_id: string
  customer_code?: number
  customer_name: string
  customer_phone: string
}

interface EnrollMemberModalProps {
  tiers: MembershipTier[]
  onClose: () => void
  onEnrolled: (card: MembershipCard) => void
  onToast: (msg: string, type?: 'success' | 'error') => void
}

const inputCls =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function EnrollMemberModal({ tiers, onClose, onEnrolled, onToast }: EnrollMemberModalProps) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<CustomerHit[]>([])
  const [searching, setSearching] = useState(false)
  const [customer, setCustomer] = useState<CustomerHit | null>(null)
  const [tierId, setTierId] = useState(tiers[0]?.tier_id ?? '')
  const [saving, setSaving] = useState(false)
  const { format } = useCurrency()

  const activeTiers = useMemo(() => tiers.filter(t => t.is_active), [tiers])
  const tier = activeTiers.find(t => t.tier_id === tierId) ?? null

  // Debounced customer search
  useEffect(() => {
    const q = search.trim()
    if (q.length < 2 || customer) { setResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await api.get<{ success: boolean; customers: CustomerHit[] }>(
          '/customer/search', { params: { q } }
        )
        setResults(res.data.customers || [])
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [search, customer])

  const submit = async () => {
    if (!customer || !tier) return
    setSaving(true)
    try {
      const res = await membershipService.enrollCard({
        customer_id: customer.customer_id,
        tier_id: tier.tier_id,
      })
      onToast(res.data.message || `Enrolled ${customer.customer_name}`)
      onEnrolled(res.data.data)
      onClose()
    } catch (err) {
      onToast(getMembershipError(err, 'Failed to enroll'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Enroll Member</h2>
          <button type="button" onClick={onClose} aria-label="Close"
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-4">
          {/* Customer picker */}
          <div className="relative">
            <label htmlFor="enroll-customer" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Customer <span className="text-red-400">*</span>
            </label>
            {customer ? (
              <div className="flex items-center justify-between px-3 py-2 border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 rounded-lg text-sm">
                <span className="text-gray-900 dark:text-white">
                  {customer.customer_name}
                  <span className="text-gray-500 dark:text-gray-400"> · {customer.customer_phone}</span>
                </span>
                <button type="button" onClick={() => { setCustomer(null); setSearch('') }}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Change</button>
              </div>
            ) : (
              <>
                <input id="enroll-customer" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search name, phone or code…" className={inputCls} autoComplete="off" />
                {searching && <p className="mt-1 text-xs text-gray-400">Searching…</p>}
                {results.length > 0 && (
                  <ul className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {results.map(c => (
                      <li key={c.customer_id}>
                        <button type="button" onClick={() => setCustomer(c)}
                          className="w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-0">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{c.customer_name}</span>
                          <span className="block text-xs text-gray-500 dark:text-gray-400">
                            {c.customer_phone}{c.customer_code ? ` · #${c.customer_code}` : ''}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {!searching && search.trim().length >= 2 && results.length === 0 && (
                  <p className="mt-1 text-xs text-gray-400">
                    No customers found — customers are created automatically when billed with a phone number.
                  </p>
                )}
              </>
            )}
          </div>

          {/* Tier picker */}
          <div>
            <label htmlFor="enroll-tier" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Card tier <span className="text-red-400">*</span>
            </label>
            <select id="enroll-tier" value={tierId} onChange={e => setTierId(e.target.value)} className={inputCls}>
              {activeTiers.map(t => <option key={t.tier_id} value={t.tier_id}>{t.name}</option>)}
            </select>
            {tier && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {tier.enrollment_fee != null && tier.enrollment_fee > 0
                  ? `${format(tier.enrollment_fee)} enrollment fee`
                  : 'Free enrollment'}
                {tier.validity_days != null ? ` · valid ${tier.validity_days} days` : ' · never expires'}
                {tier.discount_percentage != null ? ` · ${tier.discount_percentage}% discount` : ''}
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-700">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">Cancel</button>
          <button type="button" onClick={submit} disabled={saving || !customer || !tier}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">
            {saving ? 'Enrolling…' : 'Enroll'}
          </button>
        </div>
      </div>
    </div>
  )
}
