/**
 * LedgerTable — human-readable rendering of membership ledger rows.
 * Handles loading / error / empty states.
 */
import { useMemo } from 'react'
import type { LedgerEntry, LedgerEventType } from '@/types/membership'

interface LedgerTableProps {
  entries: LedgerEntry[]
  loading?: boolean
  error?: string | null
}

const EVENT_LABEL: Record<LedgerEventType, string> = {
  earn: 'Earned',
  redeem: 'Redeemed',
  negotiate: 'Negotiated',
  upgrade: 'Upgraded',
  enroll: 'Enrolled',
  adjust: 'Adjustment',
}

const EVENT_BADGE: Record<LedgerEventType, string> = {
  earn: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  redeem: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  negotiate: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
  upgrade: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  enroll: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
  adjust: 'bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300',
}

const dateFmt = new Intl.DateTimeFormat('en-IN', {
  year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
})

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d)
}

function signed(n: number): string {
  if (n > 0) return `+${n.toLocaleString('en-IN')}`
  return n.toLocaleString('en-IN')
}

export default function LedgerTable({ entries, loading = false, error = null }: LedgerTableProps) {
  const rows = useMemo(() => entries ?? [], [entries])

  if (loading) {
    return <div className="text-center py-10 text-gray-400 dark:text-gray-500 text-sm">Loading history…</div>
  }
  if (error) {
    return <div className="text-center py-10 text-red-500 text-sm">{error}</div>
  }
  if (rows.length === 0) {
    return <div className="text-center py-10 text-gray-400 dark:text-gray-500 text-sm">No activity yet</div>
  }

  return (
    <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-xl">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-900/50 text-xs text-gray-500 dark:text-gray-400 uppercase">
          <tr>
            <th scope="col" className="px-4 py-3 text-left">Date</th>
            <th scope="col" className="px-4 py-3 text-left">Event</th>
            <th scope="col" className="px-4 py-3 text-right">Points</th>
            <th scope="col" className="px-4 py-3 text-right">Amount</th>
            <th scope="col" className="px-4 py-3 text-left">Note</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {rows.map(e => (
            <tr key={e.ledger_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
              <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatDate(e.created_at)}</td>
              <td className="px-4 py-2.5">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${EVENT_BADGE[e.event_type]}`}>
                  {EVENT_LABEL[e.event_type]}
                </span>
              </td>
              <td className={`px-4 py-2.5 text-right font-medium ${e.points_delta > 0 ? 'text-green-600 dark:text-green-400' : e.points_delta < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                {e.points_delta !== 0 ? signed(e.points_delta) : '—'}
              </td>
              <td className={`px-4 py-2.5 text-right font-medium ${e.amount_delta > 0 ? 'text-green-600 dark:text-green-400' : e.amount_delta < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                {e.amount_delta !== 0 ? `₹${signed(e.amount_delta)}` : '—'}
              </td>
              <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">{e.note || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
