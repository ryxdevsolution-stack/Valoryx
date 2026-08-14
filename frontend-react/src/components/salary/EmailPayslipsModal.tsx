import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Check, Loader2, Mail, X } from 'lucide-react'
import api from '@/lib/api'
import { useCurrency } from '@/lib/useCurrency'
import type { Employee, SalaryCycle } from '@/pages/Salary'
import { formatSalaryDate as fmtDate } from '@/utils/salary'

/**
 * Email payslips to several employees in one pass.
 *
 * Each employee gets ONE cycle picked for them — a payslip covers a pay period,
 * so "send payslips to these 12 people" is only meaningful once you have said
 * which period. The most recent paid cycle is preselected because that is the
 * one being settled; the dropdown lets an admin correct it per person without
 * leaving the dialog.
 *
 * Rows whose employee has no email on file are shown, disabled, and counted —
 * silently dropping them would look like the payslip was sent.
 */

interface Props {
  employees: Employee[]
  onClose: () => void
  onToast: (msg: string, kind?: 'success' | 'error') => void
}

interface Row {
  employee: Employee
  cycles: SalaryCycle[]
  cycleId: string | null
  checked: boolean
  /** Filled in after sending. */
  outcome?: { sent: boolean; error: string | null }
}

interface SendResult {
  cycle_id: string
  employee_name: string | null
  sent: boolean
  error: string | null
}

function cycleLabel(c: SalaryCycle, cur: string): string {
  const period = `${fmtDate(c.start_date)} – ${fmtDate(c.end_date)}`
  const net = c.net_salary == null ? '' : ` · ${cur}${Number(c.net_salary).toFixed(2)}`
  return `${period} · ${c.status === 'paid' ? 'Paid' : 'Open'}${net}`
}

/** Most recent paid cycle, else most recent cycle of any status. */
function preferredCycle(cycles: SalaryCycle[]): SalaryCycle | null {
  if (cycles.length === 0) return null
  const byRecency = [...cycles].sort((a, b) => b.start_date.localeCompare(a.start_date))
  return byRecency.find(c => c.status === 'paid') ?? byRecency[0]
}

export default function EmailPayslipsModal({ employees, onClose, onToast }: Props) {
  const { symbol: cur } = useCurrency()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !sending) onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, sending])

  const load = useCallback(async () => {
    setLoading(true)
    // One request per selected employee, in parallel. The bulk bar operates on a
    // hand-picked set (tens, not thousands), so this stays well inside what the
    // browser will run concurrently — and it reuses the endpoint the salary
    // panel already relies on rather than adding a near-duplicate one.
    const loaded = await Promise.all(
      employees.map(async employee => {
        let cycles: SalaryCycle[] = []
        try {
          const res = await api.get(`/employees/${employee.employee_id}/cycles`)
          cycles = res.data?.data ?? []
        } catch {
          cycles = []
        }
        const pick = preferredCycle(cycles)
        return {
          employee,
          cycles,
          cycleId: pick?.cycle_id ?? null,
          checked: !!pick && !!employee.email,
        } satisfies Row
      })
    )
    setRows(loaded)
    setLoading(false)
  }, [employees])

  useEffect(() => { load() }, [load])

  const sendable = rows.filter(r => r.checked && r.cycleId && r.employee.email)
  const noEmailCount = rows.filter(r => !r.employee.email).length
  const noCycleCount = rows.filter(r => r.employee.email && r.cycles.length === 0).length

  function toggle(employeeId: string) {
    setRows(rs => rs.map(r =>
      r.employee.employee_id === employeeId ? { ...r, checked: !r.checked } : r))
  }

  function pickCycle(employeeId: string, cycleId: string) {
    setRows(rs => rs.map(r =>
      r.employee.employee_id === employeeId ? { ...r, cycleId } : r))
  }

  async function send() {
    if (sendable.length === 0) return
    setSending(true)
    try {
      const res = await api.post('/employees/cycles/payslip/email-bulk', {
        cycle_ids: sendable.map(r => r.cycleId),
      })
      const results: SendResult[] = res.data?.results ?? []
      const byCycle = new Map(results.map(r => [r.cycle_id, r]))
      setRows(rs => rs.map(r => {
        const hit = r.cycleId ? byCycle.get(r.cycleId) : undefined
        return hit ? { ...r, outcome: { sent: hit.sent, error: hit.error } } : r
      }))
      setSent(true)
      const okCount = res.data?.sent ?? 0
      const failCount = res.data?.failed ?? 0
      onToast(
        res.data?.message ?? `${okCount} payslip${okCount === 1 ? '' : 's'} emailed`,
        failCount > 0 ? 'error' : 'success',
      )
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined
      onToast(msg ?? 'Failed to send payslips', 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto"
      onClick={() => { if (!sending) onClose() }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-2xl max-h-[92dvh] flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden my-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 sm:py-4 border-b border-gray-100 dark:border-gray-800 flex-none">
          <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white truncate">
            <Mail className="w-4 h-4" /> Email payslips
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-none disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Each employee is emailed their own payslip PDF for the pay period selected below.
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-10 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : (
            <>
              {(noEmailCount > 0 || noCycleCount > 0) && !sent && (
                <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-none" />
                  <span>
                    {noEmailCount > 0 && (
                      <>{noEmailCount} selected employee{noEmailCount === 1 ? ' has' : 's have'} no
                      email address on file and cannot be sent a payslip. </>
                    )}
                    {noCycleCount > 0 && (
                      <>{noCycleCount} {noCycleCount === 1 ? 'has' : 'have'} no salary cycle yet.</>
                    )}
                  </span>
                </div>
              )}

              <ul className="space-y-1.5">
                {rows.map(row => {
                  const emp = row.employee
                  const disabled = !emp.email || row.cycles.length === 0 || sending || sent
                  return (
                    <li
                      key={emp.employee_id}
                      className={`flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl px-3 py-2.5 border ${
                        row.outcome
                          ? row.outcome.sent
                            ? 'border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-900/20'
                            : 'border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20'
                          : 'border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      <label className="flex items-center gap-2 min-w-0 sm:w-56 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={row.checked && !disabled}
                          disabled={disabled}
                          onChange={() => toggle(emp.employee_id)}
                          className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 flex-none disabled:opacity-40"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-gray-900 dark:text-white truncate">
                            {emp.name}
                          </span>
                          <span className={`block text-xs truncate ${
                            emp.email ? 'text-gray-500 dark:text-gray-400' : 'text-amber-600 dark:text-amber-400'
                          }`}>
                            {emp.email ?? 'No email on file'}
                          </span>
                        </span>
                      </label>

                      <div className="flex-1 min-w-0">
                        {row.cycles.length === 0 ? (
                          <span className="text-xs text-gray-400">No salary cycles</span>
                        ) : (
                          <select
                            value={row.cycleId ?? ''}
                            disabled={disabled}
                            onChange={e => pickCycle(emp.employee_id, e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white cursor-pointer disabled:opacity-60"
                          >
                            {row.cycles.map(c => (
                              <option key={c.cycle_id} value={c.cycle_id}>
                                {cycleLabel(c, cur)}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      {row.outcome && (
                        <span className={`flex items-center gap-1 text-xs font-medium flex-none ${
                          row.outcome.sent
                            ? 'text-green-700 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}>
                          {row.outcome.sent
                            ? <><Check className="w-3.5 h-3.5" /> Sent</>
                            : <><AlertCircle className="w-3.5 h-3.5" /> {row.outcome.error ?? 'Failed'}</>}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-t border-gray-100 dark:border-gray-800 flex-none">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {sent
              ? `${rows.filter(r => r.outcome?.sent).length} sent`
              : `${sendable.length} of ${rows.length} ready to send`}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {sent ? 'Done' : 'Cancel'}
            </button>
            {!sent && (
              <button
                type="button"
                onClick={send}
                disabled={sending || loading || sendable.length === 0}
                className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-gray-900 dark:bg-white dark:text-gray-900 rounded-lg hover:opacity-90 transition disabled:opacity-50"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                {sending ? 'Sending…' : `Send ${sendable.length || ''}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
