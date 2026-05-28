import { useState, useEffect, useCallback } from 'react'
import { Clock, Check, X } from 'lucide-react'
import api from '@/lib/api'
import { toast } from '@/utils/toast'

interface PendingOTRow {
  attendance_id: string
  work_date: string
  total_minutes: number
  auto_ot_minutes: number
  approved_ot_minutes: number | null
}

interface Props {
  employeeId: string
  onApproved: () => void
}

export default function PendingOTPanel({ employeeId, onApproved }: Props) {
  const [rows, setRows] = useState<PendingOTRow[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get(`/employees/${employeeId}/ot/pending`)
      setRows(r.data?.data || [])
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [employeeId])

  useEffect(() => {
    if (employeeId) load()
  }, [employeeId, load])

  const handleApprove = async (aid: string, minutes: number) => {
    try {
      await api.post(`/employees/attendance/${aid}/approve-ot`, { ot_minutes: minutes })
      toast.success(minutes > 0 ? `Approved ${minutes} min OT` : 'OT rejected')
      onApproved()
      load()
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'response' in e
        ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined
      toast.error(msg || 'Failed to update OT')
    }
  }

  if (loading) return <div className="text-sm text-gray-500 dark:text-gray-400 px-1">Loading pending OT…</div>
  if (rows.length === 0) return null

  return (
    <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        <h3 className="font-semibold text-amber-900 dark:text-amber-200 text-sm">
          Pending OT Approvals ({rows.length})
        </h3>
      </div>
      <p className="text-xs text-amber-800 dark:text-amber-300 mb-3">
        Auto-detected overtime needs your approval before it's paid. Approve as detected, reduce, or reject.
      </p>
      <div className="space-y-2">
        {rows.map(r => (
          <div
            key={r.attendance_id}
            className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg px-3 py-2 gap-2"
          >
            <div className="text-sm min-w-0">
              <span className="font-medium text-gray-900 dark:text-white">{r.work_date}</span>
              <span className="ml-2 text-gray-500 dark:text-gray-400 text-xs">
                Worked {Math.round(r.total_minutes / 60 * 10) / 10}h · {r.auto_ot_minutes} OT min detected
              </span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => handleApprove(r.attendance_id, r.auto_ot_minutes)}
                title={`Approve ${r.auto_ot_minutes} min`}
                className="text-xs px-2 py-1 rounded bg-green-600 hover:bg-green-700 text-white inline-flex items-center gap-1 transition-colors"
              >
                <Check className="w-3 h-3" /> Approve
              </button>
              <button
                type="button"
                onClick={() => handleApprove(r.attendance_id, 0)}
                title="Reject this OT (counts as 0 minutes)"
                className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 inline-flex items-center gap-1 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <X className="w-3 h-3" /> Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
