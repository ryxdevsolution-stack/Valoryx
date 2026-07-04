import { useState, useEffect } from 'react'
import { X, Clock, TrendingUp, Banknote, Calendar, ChevronDown, ChevronUp, CheckCircle2, Circle } from 'lucide-react'
import api from '@/lib/api'
import { useCurrency } from '@/lib/useCurrency'
import type { Employee } from '@/pages/Salary'
import { formatMinutes as fmtMins, formatSalaryDate as fmtDate } from '@/utils/salary'

interface HistoryAdvance {
  advance_id: string
  amount: number
  advance_date: string
  notes: string | null
}

interface HistoryBreakdown {
  date: string
  total_minutes: number
  hours_worked: number
  days_counted: number
  amount_earned: number
}

interface HistoryCycle {
  cycle_id: string
  start_date: string
  end_date: string
  status: 'open' | 'paid'
  gross_salary: number
  total_advances: number
  net_salary: number
  paid_at: string | null
  rate_snapshot: number | null
  pay_type_snap: string | null
  full_day_mins: number
  advances: HistoryAdvance[]
  daily_breakdown: HistoryBreakdown[]
}

interface HistoryData {
  employee: Employee
  cycles: HistoryCycle[]
  attendance_summary: {
    total_days_worked: number
    total_minutes_worked: number
    total_hours_worked: number
  }
  totals: {
    total_cycles: number
    paid_cycles: number
    open_cycles: number
    total_earned: number
    total_advances_taken: number
    total_net_paid: number
  }
}

// Region-aware currency (module helper, no hook): resolve the client's symbol +
// locale from localStorage — same pattern as the print/PDF services — so this
// never hardcodes ₹/INR.
function fmt(n: number | string) {
  let symbol = '₹', locale = 'en-IN'
  try {
    const c = JSON.parse(localStorage.getItem('client') || '{}')
    if (c.currency_symbol) symbol = c.currency_symbol
    if (c.locale) locale = c.locale
  } catch { /* localStorage unavailable / bad JSON */ }
  return symbol + Number(n).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface Props {
  employee: Employee
  onClose: () => void
}

export default function EmployeeHistory({ employee, onClose }: Props) {
  const [data, setData] = useState<HistoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedCycle, setExpandedCycle] = useState<string | null>(null)
  const { symbol } = useCurrency()

  useEffect(() => {
    api.get(`/employees/${employee.employee_id}/history`)
      .then(r => setData(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [employee.employee_id])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 md:p-8 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-3xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{employee.name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Complete Employment History · {symbol}{employee.rate}/{employee.pay_type === 'hourly' ? 'hr' : 'day'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
          </div>
        ) : !data ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Failed to load history</div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-6 border-b border-gray-100 dark:border-gray-800">
              <SummaryCard
                icon={<Calendar className="w-4 h-4" />}
                label="Days Worked"
                value={String(data.attendance_summary.total_days_worked)}
                sub={`${data.attendance_summary.total_hours_worked}h total`}
                color="blue"
              />
              <SummaryCard
                icon={<TrendingUp className="w-4 h-4" />}
                label="Total Earned"
                value={fmt(data.totals.total_earned)}
                sub={`${data.totals.paid_cycles} paid cycle${data.totals.paid_cycles !== 1 ? 's' : ''}`}
                color="green"
              />
              <SummaryCard
                icon={<Banknote className="w-4 h-4" />}
                label="Advances Taken"
                value={fmt(data.totals.total_advances_taken)}
                sub="from paid cycles"
                color="orange"
              />
              <SummaryCard
                icon={<Clock className="w-4 h-4" />}
                label="Net Received"
                value={fmt(data.totals.total_net_paid)}
                sub="after deductions"
                color="purple"
              />
            </div>

            {/* Cycles timeline */}
            <div className="p-6">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
                Salary Cycles ({data.totals.total_cycles})
              </h3>

              {data.cycles.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No salary cycles yet</p>
              ) : (
                <div className="space-y-3">
                  {data.cycles.map((cycle, idx) => (
                    <CycleCard
                      key={cycle.cycle_id}
                      cycle={cycle}
                      index={data.cycles.length - idx}
                      expanded={expandedCycle === cycle.cycle_id}
                      onToggle={() => setExpandedCycle(
                        expandedCycle === cycle.cycle_id ? null : cycle.cycle_id
                      )}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function SummaryCard({
  icon, label, value, sub, color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  color: 'blue' | 'green' | 'orange' | 'purple'
}) {
  const colors = {
    blue:   'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    green:  'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    orange: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400',
    purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
  }
  return (
    <div className="rounded-xl border border-gray-100 dark:border-gray-800 p-3">
      <div className={`w-7 h-7 rounded-lg ${colors[color]} flex items-center justify-center mb-2`}>
        {icon}
      </div>
      <p className="text-[11px] text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-sm font-bold text-gray-900 dark:text-white mt-0.5 truncate">{value}</p>
      <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>
    </div>
  )
}

function CycleCard({
  cycle, index, expanded, onToggle,
}: {
  cycle: HistoryCycle
  index: number
  expanded: boolean
  onToggle: () => void
}) {
  const isPaid = cycle.status === 'paid'
  return (
    <div className={`rounded-xl border ${isPaid ? 'border-green-200 dark:border-green-800' : 'border-gray-200 dark:border-gray-700'} overflow-hidden`}>
      {/* Cycle header row */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
      >
        {isPaid
          ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
          : <Circle className="w-4 h-4 text-gray-400 flex-shrink-0" />
        }
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              Cycle #{index}
            </span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
              isPaid
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
            }`}>
              {isPaid ? 'PAID' : 'OPEN'}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {fmtDate(cycle.start_date)} → {fmtDate(cycle.end_date)}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-bold text-gray-900 dark:text-white">{fmt(cycle.net_salary ?? 0)}</p>
          <p className="text-[10px] text-gray-400">net pay</p>
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
          : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
        }
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30">
          {/* Pay summary */}
          <div className="grid grid-cols-3 divide-x divide-gray-200 dark:divide-gray-700 px-4 py-3">
            <div className="pr-4">
              <p className="text-[10px] text-gray-400">Gross</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{fmt(cycle.gross_salary ?? 0)}</p>
            </div>
            <div className="px-4">
              <p className="text-[10px] text-gray-400">Advances</p>
              <p className="text-sm font-semibold text-orange-600 dark:text-orange-400">−{fmt(cycle.total_advances ?? 0)}</p>
            </div>
            <div className="pl-4">
              <p className="text-[10px] text-gray-400">Net</p>
              <p className="text-sm font-semibold text-green-600 dark:text-green-400">{fmt(cycle.net_salary ?? 0)}</p>
            </div>
          </div>

          {/* Daily breakdown */}
          {cycle.daily_breakdown.length > 0 && (
            <div className="px-4 pb-3">
              <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Daily Breakdown</p>
              <div className="space-y-1">
                {cycle.daily_breakdown.map(d => (
                  <div key={d.date} className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 dark:text-gray-400">{fmtDate(d.date)}</span>
                    <span className="text-gray-400">{fmtMins(d.total_minutes)}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{fmt(d.amount_earned)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Advances list */}
          {cycle.advances.length > 0 && (
            <div className="px-4 pb-3 border-t border-gray-100 dark:border-gray-700 pt-3">
              <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Advances</p>
              <div className="space-y-1">
                {cycle.advances.map(a => (
                  <div key={a.advance_id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 dark:text-gray-400">{fmtDate(a.advance_date)}</span>
                    {a.notes && <span className="text-gray-400 truncate max-w-[120px]">{a.notes}</span>}
                    <span className="font-medium text-orange-600 dark:text-orange-400">−{fmt(a.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Paid stamp */}
          {isPaid && cycle.paid_at && (
            <div className="px-4 pb-3 text-[10px] text-green-600 dark:text-green-400">
              ✓ Paid on {new Date(cycle.paid_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
