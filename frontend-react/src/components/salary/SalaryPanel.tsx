import { useState, useEffect, useCallback } from 'react'
import { Plus, Calculator, CheckCircle, ChevronDown, ChevronUp, RefreshCw, Pencil } from 'lucide-react'
import api from '@/lib/api'
import type { Employee, SalaryCycle, SalaryAdvance } from '@/pages/Salary'

interface SalaryPanelProps {
  employee: Employee
  onNewCycle: () => void
  onEditCycle: (cycle: SalaryCycle) => void
  onAddAdvance: (cycles: SalaryCycle[]) => void
  refreshSignal: number
}

function formatMins(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function fmtDate(d: string): string {
  try {
    const s = d.includes('T') ? d : d.replace(' ', 'T')
    return new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return d
  }
}

const STATUS_STYLES: Record<string, string> = {
  open: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  paid: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
}

export default function SalaryPanel({
  employee,
  onNewCycle,
  onEditCycle,
  onAddAdvance,
  refreshSignal,
}: SalaryPanelProps) {
  const [cycles, setCycles] = useState<SalaryCycle[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [calculating, setCalculating] = useState<string | null>(null)
  const [markingPaid, setMarkingPaid] = useState<string | null>(null)
  const [payNote, setPayNote] = useState('')
  const [payNoteInput, setPayNoteInput] = useState<string | null>(null) // cycleId of open payment note

  const fetchCycles = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get(`/employees/${employee.employee_id}/cycles`)
      setCycles(res.data.data ?? [])
    } catch {
      setCycles([])
    } finally {
      setLoading(false)
    }
  }, [employee.employee_id])

  useEffect(() => {
    fetchCycles()
  }, [fetchCycles, refreshSignal])

  async function handleCalculate(cycleId: string) {
    setCalculating(cycleId)
    try {
      await api.post(`/employees/${employee.employee_id}/cycles/${cycleId}/calculate`)
      fetchCycles()
    } finally {
      setCalculating(null)
    }
  }

  async function handleMarkPaid(cycleId: string) {
    setMarkingPaid(cycleId)
    try {
      await api.post(`/employees/${employee.employee_id}/cycles/${cycleId}/mark-paid`, {
        payment_note: payNote,
      })
      setPayNoteInput(null)
      setPayNote('')
      fetchCycles()
    } finally {
      setMarkingPaid(null)
    }
  }

  return (
    // Mobile: auto-height; desktop: fills the parent's viewport height.
    <div className="flex flex-col md:h-full bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Salary Cycles</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{employee.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onAddAdvance(cycles)}
            className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            + Advance
          </button>
          <button
            type="button"
            onClick={onNewCycle}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:opacity-90 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" />
            New Cycle
          </button>
          <button
            type="button"
            onClick={fetchCycles}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* "No cycle covers today" banner — appears when the most recent cycle
          has ended but no new one has been created yet. Prevents the confusion
          of seeing an OPEN cycle from a past month while expecting to record
          today's attendance. */}
      {(() => {
        const todayStr = new Date().toISOString().slice(0, 10)
        const hasCoveringCycle = cycles.some(c => c.start_date <= todayStr && c.end_date >= todayStr)
        if (loading || cycles.length === 0 || hasCoveringCycle) return null
        return (
          <div className="px-4 py-3 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900/50 flex items-start justify-between gap-3">
            <p className="text-xs text-amber-800 dark:text-amber-200">
              <strong>No cycle covers today.</strong> The cycles below are from past periods. Create a new cycle to record attendance for the current month.
            </p>
            <button
              type="button"
              onClick={onNewCycle}
              className="shrink-0 text-xs font-medium px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-md whitespace-nowrap"
            >
              Create cycle
            </button>
          </div>
        )
      })()}

      {/* Cycle list — bounded on mobile; flex-grown on desktop */}
      <div className="md:flex-1 overflow-y-auto max-h-[400px] md:max-h-none divide-y divide-gray-100 dark:divide-gray-800">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 dark:border-gray-600 dark:border-t-gray-200 rounded-full animate-spin" />
          </div>
        ) : cycles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400 dark:text-gray-600">
            <p className="text-sm">No salary cycles yet</p>
          </div>
        ) : (
          cycles.map(cycle => {
            const isExpanded = expandedId === cycle.cycle_id
            return (
              <div key={cycle.cycle_id} className="transition-colors">
                {/* Cycle header row */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : cycle.cycle_id)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 text-left"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {fmtDate(cycle.start_date)} – {fmtDate(cycle.end_date)}
                      </span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[cycle.status]}`}>
                        {cycle.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                      {cycle.gross_salary !== null && (
                        <span>Gross: <strong className="text-gray-800 dark:text-gray-200">₹{Number(cycle.gross_salary).toFixed(2)}</strong></span>
                      )}
                      {Number(cycle.total_advances) > 0 && (
                        <span>Adv: <strong className="text-orange-600 dark:text-orange-400">-₹{Number(cycle.total_advances).toFixed(2)}</strong></span>
                      )}
                      {cycle.net_salary !== null && (
                        <span>Net: <strong className="text-green-700 dark:text-green-400">₹{Number(cycle.net_salary).toFixed(2)}</strong></span>
                      )}
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  )}
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-4 pb-4 bg-gray-50 dark:bg-gray-800/30 space-y-4">
                    {/* Action buttons.
                        advanceCoversSalary: the employee's advances already meet or exceed
                        their gross — closing the cycle means NO extra money changes hands.
                        The UI shifts from "Mark as Paid" (scary when net<0) to "Close Cycle". */}
                    {cycle.status === 'open' && (() => {
                      const gross = Number(cycle.gross_salary ?? 0)
                      const adv = Number(cycle.total_advances ?? 0)
                      const advanceCoversSalary = cycle.gross_salary !== null && adv >= gross && adv > 0
                      return (
                      <div className="flex items-center gap-2 pt-2 flex-wrap">
                        {advanceCoversSalary && (
                          <div className="w-full bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 mb-1">
                            <p className="text-[11px] text-blue-700 dark:text-blue-300">
                              <strong>Advance covers salary.</strong> Employee was paid ₹{adv.toFixed(2)} as advances; they earned ₹{gross.toFixed(2)} this cycle. No additional payment due — closing this cycle settles the period.
                            </p>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => handleCalculate(cycle.cycle_id)}
                          disabled={calculating === cycle.cycle_id}
                          className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                          <Calculator className="w-3.5 h-3.5" />
                          {calculating === cycle.cycle_id ? 'Calculating...' : 'Calculate'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onEditCycle(cycle)}
                          className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                          title="Change cycle dates or full-day hours"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        {cycle.gross_salary !== null && (
                          payNoteInput === cycle.cycle_id ? (
                            <div className="flex items-center gap-2 flex-1">
                              <input
                                type="text"
                                value={payNote}
                                onChange={e => setPayNote(e.target.value)}
                                placeholder="Payment note (optional)"
                                className="flex-1 text-xs px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-300"
                              />
                              <button
                                type="button"
                                onClick={() => handleMarkPaid(cycle.cycle_id)}
                                disabled={markingPaid === cycle.cycle_id}
                                className="flex items-center gap-1 text-xs font-medium px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                                {markingPaid === cycle.cycle_id ? 'Saving...' : 'Confirm'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setPayNoteInput(null)}
                                className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setPayNoteInput(cycle.cycle_id)}
                              className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              {advanceCoversSalary ? 'Close Cycle' : 'Mark as Paid'}
                            </button>
                          )
                        )}
                      </div>
                      )
                    })()}

                    {/* Daily breakdown */}
                    {cycle.daily_breakdown && cycle.daily_breakdown.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Daily Breakdown</p>
                        {/* OT summary banner — only show when there is any OT pay */}
                        {cycle.ot_summary && cycle.ot_summary.total_ot_minutes > 0 && (
                          <div className="mb-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-3 py-2 text-xs flex flex-wrap gap-x-4 gap-y-1">
                            <span className="text-amber-800 dark:text-amber-300">
                              Total OT: <strong>{formatMins(cycle.ot_summary.total_ot_minutes)}</strong>
                              {' '}({(cycle.ot_summary.total_ot_minutes / 60).toFixed(1)}h)
                            </span>
                            <span className="text-amber-800 dark:text-amber-300">
                              OT pay: <strong>₹{Number(cycle.ot_summary.total_ot_pay).toFixed(2)}</strong>
                            </span>
                            <span className="text-amber-600 dark:text-amber-400">
                              Multiplier: {cycle.ot_summary.ot_multiplier}×
                            </span>
                          </div>
                        )}
                        <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-gray-100 dark:bg-gray-800">
                                <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400">Date</th>
                                <th className="text-right px-3 py-2 font-medium text-gray-600 dark:text-gray-400">Hours</th>
                                <th className="text-right px-3 py-2 font-medium text-gray-600 dark:text-gray-400">Days</th>
                                <th className="text-right px-3 py-2 font-medium text-gray-600 dark:text-gray-400">Earned</th>
                                <th className="text-right px-3 py-2 font-medium text-amber-600 dark:text-amber-400">OT min</th>
                                <th className="text-right px-3 py-2 font-medium text-amber-600 dark:text-amber-400">OT pay</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                              {cycle.daily_breakdown.map(day => (
                                <tr key={day.date} className="bg-white dark:bg-gray-900/50">
                                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{fmtDate(day.date)}</td>
                                  <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{formatMins(Number(day.total_minutes))}</td>
                                  <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{Number(day.days_counted).toFixed(2)}</td>
                                  <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-white">₹{Number(day.amount_earned).toFixed(2)}</td>
                                  <td className="px-3 py-2 text-right text-amber-700 dark:text-amber-300">
                                    {Number(day.ot_minutes) > 0 ? `${day.ot_minutes}m` : '—'}
                                  </td>
                                  <td className="px-3 py-2 text-right text-amber-700 dark:text-amber-300 font-medium">
                                    {Number(day.ot_pay) > 0 ? `₹${Number(day.ot_pay).toFixed(2)}` : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Advances */}
                    {cycle.advances && cycle.advances.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Advances</p>
                        <ul className="space-y-1.5">
                          {cycle.advances.map((adv: SalaryAdvance) => (
                            <li
                              key={adv.advance_id}
                              className="flex items-center justify-between bg-orange-50 dark:bg-orange-900/20 rounded-lg px-3 py-2"
                            >
                              <div>
                                <span className="text-xs font-semibold text-orange-700 dark:text-orange-300">₹{Number(adv.amount).toFixed(2)}</span>
                                <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">{fmtDate(adv.advance_date)}</span>
                                {adv.notes && <span className="text-xs text-gray-400 ml-2">— {adv.notes}</span>}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Paid at info */}
                    {cycle.status === 'paid' && cycle.paid_at && (
                      <p className="text-xs text-green-600 dark:text-green-400">
                        Paid on {new Date(cycle.paid_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Lifetime stats footer — computed from loaded cycles */}
      <LifetimeStats cycles={cycles} />
    </div>
  )
}

function LifetimeStats({ cycles }: { cycles: SalaryCycle[] }) {
  const paidCycles = cycles.filter(c => c.status === 'paid')
  const totalEarned = cycles.reduce((sum, c) => sum + Number(c.gross_salary ?? 0), 0)
  const totalAdvances = cycles.reduce((sum, c) => sum + Number(c.total_advances ?? 0), 0)
  const totalNetPaid = paidCycles.reduce((sum, c) => sum + Number(c.net_salary ?? 0), 0)

  // Most recent paid_at across paid cycles
  const lastPaid = paidCycles
    .map(c => c.paid_at)
    .filter((x): x is string => !!x)
    .sort()
    .pop()

  const lastPaidLabel = lastPaid
    ? new Date(lastPaid).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'

  return (
    <div className="border-t border-gray-100 dark:border-gray-800 px-3 py-3 bg-gray-50/60 dark:bg-gray-800/20">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
        Lifetime stats
      </p>
      <div className="grid grid-cols-2 gap-2">
        <StatTile label="Total Earned" value={`₹${totalEarned.toFixed(2)}`} tone="green" />
        <StatTile label="Total Advances" value={`₹${totalAdvances.toFixed(2)}`} tone="orange" />
        <StatTile label="Net Paid Out" value={`₹${totalNetPaid.toFixed(2)}`} tone="blue" sub={`${paidCycles.length} paid cycle${paidCycles.length === 1 ? '' : 's'}`} />
        <StatTile label="Last Paid" value={lastPaidLabel} tone="gray" />
      </div>
    </div>
  )
}

function StatTile({
  label, value, tone, sub,
}: {
  label: string
  value: string
  tone: 'green' | 'orange' | 'blue' | 'gray'
  sub?: string
}) {
  const toneClass: Record<string, string> = {
    green: 'text-green-700 dark:text-green-400',
    orange: 'text-orange-700 dark:text-orange-400',
    blue: 'text-blue-700 dark:text-blue-400',
    gray: 'text-gray-900 dark:text-white',
  }
  return (
    <div className="rounded-lg bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 px-3 py-2">
      <p className="text-[10px] text-gray-400 dark:text-gray-500">{label}</p>
      <p className={`text-sm font-bold truncate ${toneClass[tone]}`}>{value}</p>
      {sub && <p className="text-[9px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}
