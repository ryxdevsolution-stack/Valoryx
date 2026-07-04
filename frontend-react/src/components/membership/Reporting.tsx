/**
 * Reporting — membership analytics, all ledger-derived:
 * members per tier, outstanding points liability, top members by spend,
 * and upgrades this month. Handles loading / error / empty states.
 */
import { useCallback, useEffect, useState } from 'react'
import membershipService, { getMembershipError } from '@/services/membership'
import { useCurrency } from '@/lib/useCurrency'
import type { MembershipReport } from '@/types/membership'

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-white dark:bg-gray-800">
      <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent || 'text-gray-900 dark:text-white'}`}>{value}</p>
    </div>
  )
}

export default function Reporting() {
  const [report, setReport] = useState<MembershipReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { format: money } = useCurrency()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await membershipService.getReport()
      setReport(res.data.data)
    } catch (err) {
      setError(getMembershipError(err, 'Failed to load report'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return <div className="text-center py-12 text-gray-400 dark:text-gray-500">Loading report…</div>
  }
  if (error || !report) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-3">{error || 'No report available'}</p>
        <button type="button" onClick={load} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Retry</button>
      </div>
    )
  }

  const hasData =
    report.total_active_members > 0 ||
    report.members_per_tier.length > 0 ||
    report.top_members.length > 0

  if (!hasData) {
    return (
      <div className="text-center py-12 text-gray-400 dark:text-gray-500">
        <p className="text-lg">No membership activity yet</p>
        <p className="text-sm mt-1">Reports populate once customers are enrolled</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Headline stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Active Members" value={report.total_active_members.toLocaleString('en-IN')} />
        <StatCard label="Points Liability" value={money(report.outstanding_points_liability)} accent="text-amber-600 dark:text-amber-400" />
        <StatCard label="Upgrades This Month" value={report.upgrades_this_month.toLocaleString('en-IN')} accent="text-blue-600 dark:text-blue-400" />
      </div>

      {/* Members per tier */}
      <div>
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">Members per Tier</p>
        {report.members_per_tier.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">No tiers with members</p>
        ) : (
          <div className="space-y-2">
            {report.members_per_tier.map(t => {
              const pct = report.total_active_members > 0
                ? Math.round((t.member_count / report.total_active_members) * 100)
                : 0
              return (
                <div key={t.tier_id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-gray-800 dark:text-gray-200">{t.tier_name}</span>
                    <span className="text-gray-500 dark:text-gray-400">{t.member_count.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: t.tier_color || '#2563eb' }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Top members by spend */}
      <div>
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">Top Members by Spend</p>
        {report.top_members.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">No spend recorded yet</p>
        ) : (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50 text-xs text-gray-500 dark:text-gray-400 uppercase">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left">Member</th>
                  <th scope="col" className="px-4 py-3 text-left">Number</th>
                  <th scope="col" className="px-4 py-3 text-left">Tier</th>
                  <th scope="col" className="px-4 py-3 text-right">Total Spend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {report.top_members.map(m => (
                  <tr key={m.card_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-white">{m.customer_name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-600 dark:text-gray-400">{m.membership_number}</td>
                    <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">{m.tier_name}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-green-600 dark:text-green-400">{money(m.total_spend)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
