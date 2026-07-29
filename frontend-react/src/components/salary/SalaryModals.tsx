import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { useCurrency } from '@/lib/useCurrency'
import type { AttendanceStatus, AttendancePunch, Employee, SalaryCycle } from '@/pages/Salary'
import { formatMinutes } from '@/utils/salary'

// ─── Shared Modal Shell ───────────────────────────────────────────────────────

interface ModalShellProps {
  title: string
  onClose: () => void
  children: React.ReactNode
}

function ModalShell({ title, onClose, children }: ModalShellProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">{children}</div>
      </div>
    </div>
  )
}

function InputField({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputClass =
  'w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-300'

// ─── Add Employee Modal ───────────────────────────────────────────────────────

interface AddEmployeeForm {
  name: string
  phone: string
  email: string
  pay_type: 'hourly' | 'daily'
  rate: string
  ot_multiplier: string
}

interface AddEmployeeModalProps {
  onClose: () => void
  onSave: (data: Omit<Employee, 'employee_id' | 'branch_id' | 'is_active'>) => Promise<void>
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function AddEmployeeModal({ onClose, onSave }: AddEmployeeModalProps) {
  const { symbol: cur } = useCurrency()
  const [form, setForm] = useState<AddEmployeeForm>({
    name: '', phone: '', email: '', pay_type: 'daily', rate: '', ot_multiplier: '1.5',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required'); return }
    if (!form.rate || isNaN(Number(form.rate))) { setError('Valid rate is required'); return }
    const otMul = parseFloat(form.ot_multiplier)
    if (isNaN(otMul) || otMul < 0) { setError('OT multiplier must be a non-negative number'); return }
    if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) { setError('Invalid email address'); return }
    setSaving(true)
    try {
      await onSave({
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        pay_type: form.pay_type,
        rate: Number(form.rate),
        ot_multiplier: otMul,
      })
      onClose()
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined
      setError(msg ?? 'Failed to save employee')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title="Add Employee" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>
        )}
        <InputField label="Full Name" required>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Ravi Kumar"
            className={inputClass}
            autoFocus
          />
        </InputField>
        <div className="grid grid-cols-2 gap-3">
          <InputField label="Phone">
            <input
              type="tel"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="e.g. 9876543210"
              className={inputClass}
            />
          </InputField>
          <InputField label="Email">
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="e.g. ravi@example.com"
              className={inputClass}
            />
          </InputField>
        </div>
        <InputField label="Pay Type" required>
          <div className="flex gap-3">
            {(['hourly', 'daily'] as const).map(pt => (
              <label key={pt} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="pay_type"
                  value={pt}
                  checked={form.pay_type === pt}
                  onChange={() => setForm(f => ({ ...f, pay_type: pt }))}
                  className="accent-gray-900 dark:accent-white"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">{pt}</span>
              </label>
            ))}
          </div>
        </InputField>
        <InputField label={`Rate (${cur}/${form.pay_type === 'hourly' ? 'hr' : 'day'})`} required>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.rate}
            onChange={e => setForm(f => ({ ...f, rate: e.target.value }))}
            placeholder="e.g. 500"
            className={inputClass}
          />
        </InputField>
        <InputField label="OT Multiplier">
          <input
            type="number"
            step="0.1"
            min="0"
            value={form.ot_multiplier}
            onChange={e => setForm(f => ({ ...f, ot_multiplier: e.target.value }))}
            placeholder="1.5"
            className={inputClass}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Rate multiplier for overtime pay (e.g. 1.5 = 1.5× regular rate)
          </p>
        </InputField>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? 'Saving...' : 'Add Employee'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ─── Edit Employee Modal ──────────────────────────────────────────────────────
// Same fields as AddEmployeeModal, pre-filled from the existing employee.
// Backend PUT /employees/<id> already supported all these fields; this is
// the first UI wired up to actually call it (previously the only way to
// change an employee's rate/phone/etc. was to delete and re-add them).

interface EditEmployeeForm {
  name: string
  phone: string
  email: string
  pay_type: 'hourly' | 'daily'
  rate: string
  ot_multiplier: string
}

interface EditEmployeeModalProps {
  employee: Employee
  onClose: () => void
  onSave: (employeeId: string, data: Partial<Omit<Employee, 'employee_id' | 'branch_id' | 'is_active'>>) => Promise<void>
}

export function EditEmployeeModal({ employee, onClose, onSave }: EditEmployeeModalProps) {
  const { symbol: cur } = useCurrency()
  const [form, setForm] = useState<EditEmployeeForm>({
    name: employee.name,
    phone: employee.phone ?? '',
    email: employee.email ?? '',
    pay_type: employee.pay_type,
    rate: String(employee.rate),
    ot_multiplier: employee.ot_multiplier != null ? String(employee.ot_multiplier) : '1.5',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required'); return }
    if (!form.rate || isNaN(Number(form.rate))) { setError('Valid rate is required'); return }
    const otMul = parseFloat(form.ot_multiplier)
    if (isNaN(otMul) || otMul < 0) { setError('OT multiplier must be a non-negative number'); return }
    if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) { setError('Invalid email address'); return }
    setSaving(true)
    try {
      await onSave(employee.employee_id, {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        pay_type: form.pay_type,
        rate: Number(form.rate),
        ot_multiplier: otMul,
      })
      onClose()
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined
      setError(msg ?? 'Failed to update employee')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title="Edit Employee" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>
        )}
        <InputField label="Full Name" required>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className={inputClass}
            autoFocus
          />
        </InputField>
        <div className="grid grid-cols-2 gap-3">
          <InputField label="Phone">
            <input
              type="tel"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="e.g. 9876543210"
              className={inputClass}
            />
          </InputField>
          <InputField label="Email">
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="e.g. ravi@example.com"
              className={inputClass}
            />
          </InputField>
        </div>
        <InputField label="Pay Type" required>
          <div className="flex gap-3">
            {(['hourly', 'daily'] as const).map(pt => (
              <label key={pt} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="edit_pay_type"
                  value={pt}
                  checked={form.pay_type === pt}
                  onChange={() => setForm(f => ({ ...f, pay_type: pt }))}
                  className="accent-gray-900 dark:accent-white"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">{pt}</span>
              </label>
            ))}
          </div>
        </InputField>
        <InputField label={`Rate (${cur}/${form.pay_type === 'hourly' ? 'hr' : 'day'})`} required>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.rate}
            onChange={e => setForm(f => ({ ...f, rate: e.target.value }))}
            className={inputClass}
          />
          <p className="text-[11px] text-gray-400 mt-1">
            Only affects future salary cycles — past cycles keep their frozen rate snapshot.
          </p>
        </InputField>
        <InputField label="OT Multiplier">
          <input
            type="number"
            step="0.1"
            min="0"
            value={form.ot_multiplier}
            onChange={e => setForm(f => ({ ...f, ot_multiplier: e.target.value }))}
            className={inputClass}
          />
        </InputField>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ─── Mark Attendance Modal ────────────────────────────────────────────────────

interface MarkAttendanceModalProps {
  employee: Employee
  onClose: () => void
  onSave: (employeeId: string, checkIn: string, notes: string) => Promise<void>
  // Pre-fill the date portion; time defaults to current IST time. Used when
  // back-filling attendance from the mini-calendar (click on an absent day).
  prefillDate?: string
}

export function MarkAttendanceModal({ employee, onClose, onSave, prefillDate }: MarkAttendanceModalProps) {
  // Pre-fill with IST (Asia/Kolkata) "now" — datetime-local expects YYYY-MM-DDTHH:MM
  const istParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date()).reduce<Record<string, string>>((acc, p) => { acc[p.type] = p.value; return acc }, {})
  const defaultDate = `${istParts.year}-${istParts.month}-${istParts.day}`
  const defaultTime = `${istParts.hour}:${istParts.minute}`
  // If a prefillDate was supplied (e.g. "2026-04-15") use that day with current IST time
  const nowIso = `${prefillDate ?? defaultDate}T${defaultTime}`
  const [checkIn, setCheckIn] = useState(nowIso)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!checkIn) { setError('Check-in time is required'); return }
    setSaving(true)
    try {
      await onSave(employee.employee_id, new Date(checkIn).toISOString(), notes.trim())
      onClose()
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined
      setError(msg ?? 'Failed to mark attendance')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title="Mark Attendance" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>
        )}
        <InputField label="Employee">
          <input type="text" value={employee.name} disabled className={`${inputClass} opacity-70`} />
        </InputField>
        <InputField label="Check-in Time" required>
          <input
            type="datetime-local"
            value={checkIn}
            onChange={e => setCheckIn(e.target.value)}
            className={inputClass}
            autoFocus
          />
        </InputField>
        <InputField label="Notes">
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Optional notes..."
            className={inputClass}
          />
        </InputField>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Check In'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ─── New Cycle Modal ──────────────────────────────────────────────────────────

interface NewCycleModalProps {
  employee: Employee
  onClose: () => void
  onSave: (employeeId: string, data: { start_date: string; end_date: string; full_day_mins: number }) => Promise<void>
}

const PRESETS = [
  { label: '1–25', start: '01', end: '25' },
  { label: '1–27', start: '01', end: '27' },
  { label: '1–30', start: '01', end: '30' },
  { label: '26–25', start: '26', end: '25' },
  { label: '28–27', start: '28', end: '27' },
]

export function NewCycleModal({ employee, onClose, onSave }: NewCycleModalProps) {
  const now = new Date()
  const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  // Default to the FULL current month (1 → last day) so the cycle always covers
  // today and every day of the month. `new Date(y, monthIndex + 1, 0)` rolls to
  // day 0 of next month = the last day of this month (handles 28/29/30/31).
  const lastDayOfMonth = String(
    new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
  ).padStart(2, '0')
  const [startDate, setStartDate] = useState(`${currentYearMonth}-01`)
  const [endDate, setEndDate] = useState(`${currentYearMonth}-${lastDayOfMonth}`)
  const [fullDayHours, setFullDayHours] = useState('8')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Convert hours (possibly fractional) → minutes. 8 → 480, 7.5 → 450, 9.25 → 555.
  const fullDayMinutes = Math.round((Number(fullDayHours) || 0) * 60)
  const minsLabel = (() => {
    const h = Math.floor(fullDayMinutes / 60)
    const m = fullDayMinutes % 60
    if (m === 0) return `${h} hour${h === 1 ? '' : 's'}`
    return `${h}h ${m}m`
  })()

  function applyPreset(start: string, end: string) {
    const ym = currentYearMonth
    let endYM = ym
    // if end < start numerically, end is next month
    if (Number(end) < Number(start)) {
      const d = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      endYM = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }
    setStartDate(`${ym}-${start}`)
    setEndDate(`${endYM}-${end}`)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!startDate || !endDate) { setError('Start and end dates are required'); return }
    setSaving(true)
    try {
      await onSave(employee.employee_id, {
        start_date: startDate,
        end_date: endDate,
        full_day_mins: fullDayMinutes || 480,
      })
      onClose()
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined
      setError(msg ?? 'Failed to create cycle')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title="New Salary Cycle" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>
        )}

        {/* Preset buttons */}
        <div>
          <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Quick presets</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(p => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p.start, p.end)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <InputField label="Start Date" required>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className={inputClass}
            />
          </InputField>
          <InputField label="End Date" required>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className={inputClass}
            />
          </InputField>
        </div>

        <InputField label="Full Day Hours">
          <input
            type="number"
            min="1"
            max="24"
            step="0.5"
            value={fullDayHours}
            onChange={e => setFullDayHours(e.target.value)}
            className={inputClass}
            placeholder="e.g. 8"
          />
          <p className="text-[11px] text-gray-400 mt-1">
            How many hours count as a full day = <strong>{minsLabel}</strong>
            {' '}({fullDayMinutes} min). Used for daily-rate employees — working less counts as a fraction of a day.
          </p>
        </InputField>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? 'Creating...' : 'Create Cycle'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ─── Edit Cycle Modal ────────────────────────────────────────────────────────
// Similar to NewCycleModal but pre-fills from an existing cycle's values.
// Only reachable for cycles with status='open' — paid cycles are not editable.

interface EditCycleModalProps {
  employee: Employee
  cycle: SalaryCycle
  onClose: () => void
  onSave: (
    employeeId: string,
    cycleId: string,
    data: { start_date: string; end_date: string; full_day_mins: number }
  ) => Promise<void>
}

export function EditCycleModal({ employee, cycle, onClose, onSave }: EditCycleModalProps) {
  // Backend returns dates as timestamps ("Wed, 01 Apr 2026 00:00:00 GMT") OR YYYY-MM-DD.
  // Normalize into the YYYY-MM-DD format that the <input type="date"> expects.
  const toDateInput = (d: string | null): string => {
    if (!d) return ''
    // If already YYYY-MM-DD, keep it
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d
    try {
      const parsed = new Date(d)
      if (isNaN(parsed.getTime())) return ''
      return parsed.toISOString().slice(0, 10)
    } catch { return '' }
  }

  const [startDate, setStartDate] = useState(toDateInput(cycle.start_date))
  const [endDate, setEndDate] = useState(toDateInput(cycle.end_date))
  // Backend stores minutes; show hours to the admin, convert back on save.
  const initialHours = cycle.full_day_mins ? (cycle.full_day_mins / 60).toString() : '8'
  const [fullDayHours, setFullDayHours] = useState(initialHours)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const fullDayMinutes = Math.round((Number(fullDayHours) || 0) * 60)
  const minsLabel = (() => {
    const h = Math.floor(fullDayMinutes / 60)
    const m = fullDayMinutes % 60
    if (m === 0) return `${h} hour${h === 1 ? '' : 's'}`
    return `${h}h ${m}m`
  })()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!startDate || !endDate) { setError('Start and end dates are required'); return }
    if (startDate > endDate) { setError('Start date must be on or before end date'); return }
    setSaving(true)
    try {
      await onSave(employee.employee_id, cycle.cycle_id, {
        start_date: startDate,
        end_date: endDate,
        full_day_mins: fullDayMinutes || 480,
      })
      onClose()
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined
      setError(msg ?? 'Failed to update cycle')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title="Edit Salary Cycle" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>
        )}

        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
          <p className="text-[11px] text-amber-700 dark:text-amber-300">
            <strong>Editing open cycle for {employee.name}.</strong> After saving, click <em>Calculate</em> to recompute the gross based on the new date range.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <InputField label="Start Date" required>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className={inputClass}
            />
          </InputField>
          <InputField label="End Date" required>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className={inputClass}
            />
          </InputField>
        </div>

        <InputField label="Full Day Hours">
          <input
            type="number"
            min="1"
            max="24"
            step="0.5"
            value={fullDayHours}
            onChange={e => setFullDayHours(e.target.value)}
            className={inputClass}
          />
          <p className="text-[11px] text-gray-400 mt-1">
            = <strong>{minsLabel}</strong> ({fullDayMinutes} min)
          </p>
        </InputField>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ─── Add Advance / Deduction Modal ────────────────────────────────────────────

export type DeductionCategory = 'cash_advance' | 'accommodation' | 'food' | 'transport' | 'other'

export const DEDUCTION_CATEGORIES: { value: DeductionCategory; label: string }[] = [
  { value: 'cash_advance', label: 'Cash Advance' },
  { value: 'accommodation', label: 'Accommodation' },
  { value: 'food', label: 'Food' },
  { value: 'transport', label: 'Transport' },
  { value: 'other', label: 'Other' },
]

interface AddAdvanceModalProps {
  employee: Employee
  openCycles: SalaryCycle[]
  onClose: () => void
  onSave: (employeeId: string, data: { amount: number; category: DeductionCategory; advance_date: string; notes: string; cycle_id?: string }) => Promise<void>
}

// localStorage key for sticky cycle selection — scoped per employee.
const STICKY_CYCLE_KEY = (empId: string) => `valoryx:salary:lastCycle:${empId}`

// Compact date formatter for the cycle dropdown — turns "Wed, 01 Apr 2026 00:00:00 GMT" → "1 Apr 2026".
function fmtCycleDate(d: string): string {
  try {
    const parsed = new Date(d)
    if (isNaN(parsed.getTime())) return d
    return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return d
  }
}

export function AddAdvanceModal({ employee, openCycles, onClose, onSave }: AddAdvanceModalProps) {
  const { symbol: cur } = useCurrency()
  const todayIso = new Date().toISOString().split('T')[0]
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<DeductionCategory>('cash_advance')
  const [date, setDate] = useState(todayIso)
  const [notes, setNotes] = useState('')

  // Sticky cycle selection: remember the last cycle the admin linked an advance to
  // for this employee, and pre-select it on subsequent opens — until they change it.
  const [cycleId, setCycleId] = useState<string>(() => {
    const stored = localStorage.getItem(STICKY_CYCLE_KEY(employee.employee_id)) ?? ''
    // Only honor the stored value if that cycle is still in the open list
    return openCycles.some(c => c.cycle_id === stored) ? stored : ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setError('Valid amount is required')
      return
    }
    setSaving(true)
    try {
      await onSave(employee.employee_id, {
        amount: Number(amount),
        category,
        advance_date: date,
        notes: notes.trim(),
        ...(cycleId ? { cycle_id: cycleId } : {}),
      })
      // Persist the last-used cycle (or clear it if admin unlinked) for next time
      if (cycleId) {
        localStorage.setItem(STICKY_CYCLE_KEY(employee.employee_id), cycleId)
      } else {
        localStorage.removeItem(STICKY_CYCLE_KEY(employee.employee_id))
      }
      onClose()
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined
      setError(msg ?? 'Failed to add advance')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title="Add Deduction" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>
        )}
        <InputField label="Employee">
          <input type="text" value={employee.name} disabled className={`${inputClass} opacity-70`} />
        </InputField>
        <InputField label="Category" required>
          <select
            value={category}
            onChange={e => setCategory(e.target.value as DeductionCategory)}
            className={inputClass}
          >
            {DEDUCTION_CATEGORIES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </InputField>
        <InputField label={`Amount (${cur})`} required>
          <input
            type="number"
            min="1"
            step="0.01"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="e.g. 500"
            className={inputClass}
            autoFocus
          />
        </InputField>
        <InputField label="Date" required>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className={inputClass}
          />
        </InputField>
        <InputField label="Notes">
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Optional notes..."
            className={inputClass}
          />
        </InputField>
        {openCycles.length > 0 && (
          <InputField label="Link to Cycle (optional)">
            <select
              value={cycleId}
              onChange={e => setCycleId(e.target.value)}
              className={inputClass}
            >
              <option value="">— Not linked —</option>
              {openCycles.map(c => (
                <option key={c.cycle_id} value={c.cycle_id}>
                  {fmtCycleDate(c.start_date)} – {fmtCycleDate(c.end_date)}
                </option>
              ))}
            </select>
          </InputField>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Add Deduction'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ─── Mark Day Off Modal ──────────────────────────────────────────────────────
// Used for back-filling a day the employee didn't check in — leave, holiday,
// absent, etc. Distinct from MarkAttendanceModal which records actual punches.

interface DayOffStatus {
  value: AttendanceStatus
  label: string
  description: string
  paid: boolean
}

// Presented in the order an admin most often reaches for (paid leave first, absent last)
const DAY_OFF_OPTIONS: DayOffStatus[] = [
  { value: 'paid_leave',   label: 'Paid Leave',   description: 'Sanctioned leave — full day pay',  paid: true },
  { value: 'holiday',      label: 'Holiday',      description: 'National or company holiday',       paid: true },
  { value: 'weekly_off',   label: 'Weekly Off',   description: 'Weekly rest day (e.g. Sunday)',     paid: true },
  { value: 'unpaid_leave', label: 'Unpaid Leave', description: 'Sanctioned — no pay for the day',   paid: false },
  { value: 'absent',       label: 'Absent',       description: 'Did not arrive — no pay',           paid: false },
]

interface MarkDayOffModalProps {
  employee: Employee
  workDate: string // YYYY-MM-DD
  onClose: () => void
  onSave: (
    employeeId: string,
    data: { work_date: string; status: AttendanceStatus; reason: string; notes: string }
  ) => Promise<void>
}

function fmtPrettyDate(isoDate: string): string {
  try {
    const d = new Date(isoDate + 'T00:00:00')
    if (isNaN(d.getTime())) return isoDate
    return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return isoDate }
}

export function MarkDayOffModal({ employee, workDate, onClose, onSave }: MarkDayOffModalProps) {
  const [status, setStatus] = useState<AttendanceStatus>('paid_leave')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const selected = DAY_OFF_OPTIONS.find(o => o.value === status)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave(employee.employee_id, {
        work_date: workDate,
        status,
        reason: reason.trim(),
        notes: notes.trim(),
      })
      onClose()
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined
      setError(msg ?? 'Failed to save day-off note')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title="Mark Day Off" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>
        )}

        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
          <p className="text-[11px] text-gray-500 dark:text-gray-400">Employee</p>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{employee.name}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5">Date</p>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{fmtPrettyDate(workDate)}</p>
        </div>

        <InputField label="Type" required>
          <div className="space-y-1.5">
            {DAY_OFF_OPTIONS.map(opt => (
              <label
                key={opt.value}
                className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                  status === opt.value
                    ? 'border-gray-900 dark:border-white bg-gray-50 dark:bg-gray-800'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/40'
                }`}
              >
                <input
                  type="radio"
                  name="day_off_status"
                  value={opt.value}
                  checked={status === opt.value}
                  onChange={() => setStatus(opt.value)}
                  className="mt-0.5 accent-gray-900 dark:accent-white"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{opt.label}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                      opt.paid
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                    }`}>
                      {opt.paid ? 'PAID' : 'UNPAID'}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{opt.description}</p>
                </div>
              </label>
            ))}
          </div>
        </InputField>

        <InputField label="Reason">
          <input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder={selected?.value === 'holiday' ? 'e.g. Diwali' : selected?.value === 'paid_leave' ? 'e.g. Sick leave' : 'Short label (optional)'}
            className={inputClass}
          />
        </InputField>

        <InputField label="Notes">
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Additional notes (optional)"
            className={inputClass}
          />
        </InputField>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ─── Bulk Check In / Check Out Modal ─────────────────────────────────────────
// One shared timestamp applied to every selected employee at once — for a
// supervisor marking a whole shift on one shared device rather than each of
// 100+ employees using their own phone.

export interface BulkResult {
  employee_id: string
  success: boolean
  error?: string
  name?: string
}

interface BulkCheckInOutModalProps {
  mode: 'checkin' | 'checkout'
  employeeNames: Record<string, string>
  selectedIds: string[]
  onClose: () => void
  onSave: (time: string) => Promise<BulkResult[]>
}

export function BulkCheckInOutModal({ mode, employeeNames, selectedIds, onClose, onSave }: BulkCheckInOutModalProps) {
  const istParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date()).reduce<Record<string, string>>((acc, p) => { acc[p.type] = p.value; return acc }, {})
  const [time, setTime] = useState(`${istParts.year}-${istParts.month}-${istParts.day}T${istParts.hour}:${istParts.minute}`)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<BulkResult[] | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!time) { setError('Time is required'); return }
    setSaving(true)
    setError('')
    try {
      const res = await onSave(new Date(time).toISOString())
      setResults(res)
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined
      setError(msg ?? `Failed to check ${mode === 'checkin' ? 'in' : 'out'}`)
    } finally {
      setSaving(false)
    }
  }

  const title = mode === 'checkin' ? 'Bulk Check In' : 'Bulk Check Out'
  const actionLabel = mode === 'checkin' ? 'Check In' : 'Check Out'

  if (results) {
    const succeeded = results.filter(r => r.success)
    const failed = results.filter(r => !r.success)
    return (
      <ModalShell title={title} onClose={onClose}>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {succeeded.length} of {results.length} employees checked {mode === 'checkin' ? 'in' : 'out'}.
        </p>
        {failed.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Skipped:</p>
            {failed.map(r => (
              <div key={r.employee_id} className="flex items-center justify-between text-xs bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-1.5">
                <span className="text-gray-700 dark:text-gray-300">{employeeNames[r.employee_id] ?? r.employee_id}</span>
                <span className="text-red-600 dark:text-red-400">{r.error}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:opacity-90 transition-opacity"
          >
            Done
          </button>
        </div>
      </ModalShell>
    )
  }

  return (
    <ModalShell title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>
        )}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
          <p className="text-[11px] text-gray-500 dark:text-gray-400">{selectedIds.length} employees selected</p>
          <p className="text-sm text-gray-700 dark:text-gray-300 truncate">
            {selectedIds.map(id => employeeNames[id] ?? id).join(', ')}
          </p>
        </div>
        <InputField label={`${actionLabel} Time`} required>
          <input
            type="datetime-local"
            value={time}
            onChange={e => setTime(e.target.value)}
            className={inputClass}
            autoFocus
          />
          <p className="text-[11px] text-gray-400 mt-1">Applied to everyone selected.</p>
        </InputField>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-colors ${
              mode === 'checkin' ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-700 hover:bg-gray-800'
            }`}
          >
            {saving ? 'Saving...' : `${actionLabel} All`}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ─── Manual Hours Modal ──────────────────────────────────────────────────────
// Directly type hours worked for a date instead of a check-in/check-out pair —
// for admins backfilling a past day who don't know the employee's exact clock
// times (the norm on a 100+-person shop floor with physical punch-ins).

interface ManualHoursModalProps {
  employee: Employee
  workDate?: string // YYYY-MM-DD, defaults to today
  onClose: () => void
  onSave: (employeeId: string, data: { work_date: string; to_date?: string; hours: number; notes: string }) => Promise<void>
}

export function ManualHoursModal({ employee, workDate, onClose, onSave }: ManualHoursModalProps) {
  const todayIso = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState(workDate ?? todayIso)
  const [toDate, setToDate] = useState(workDate ?? todayIso)
  const [isRange, setIsRange] = useState(false)
  const [hours, setHours] = useState('8')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const h = Number(hours)
    if (!date) { setError('Date is required'); return }
    if (isRange && toDate < date) { setError('End date must be on or after the start date'); return }
    if (isNaN(h) || h < 0 || h > 24) { setError('Hours must be between 0 and 24'); return }
    setSaving(true)
    try {
      await onSave(employee.employee_id, {
        work_date: date,
        ...(isRange ? { to_date: toDate } : {}),
        hours: h,
        notes: notes.trim(),
      })
      onClose()
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined
      setError(msg ?? 'Failed to save hours')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title="Enter Hours Manually" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>
        )}
        <InputField label="Employee">
          <input type="text" value={employee.name} disabled className={`${inputClass} opacity-70`} />
        </InputField>

        <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isRange}
            onChange={e => { setIsRange(e.target.checked); if (e.target.checked) setToDate(date) }}
            className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600"
          />
          Apply the same hours across a range of missed days
        </label>

        <div className={isRange ? 'grid grid-cols-2 gap-3' : ''}>
          <InputField label={isRange ? 'From Date' : 'Date'} required>
            <input
              type="date"
              value={date}
              onChange={e => { setDate(e.target.value); if (!isRange) setToDate(e.target.value) }}
              max={todayIso}
              className={inputClass}
            />
          </InputField>
          {isRange && (
            <InputField label="To Date" required>
              <input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                min={date}
                max={todayIso}
                className={inputClass}
              />
            </InputField>
          )}
        </div>

        <InputField label="Hours Worked (per day)" required>
          <input
            type="number"
            min="0"
            max="24"
            step="0.5"
            value={hours}
            onChange={e => setHours(e.target.value)}
            placeholder="e.g. 8.5"
            className={inputClass}
            autoFocus
          />
          <p className="text-[11px] text-gray-400 mt-1">
            {isRange
              ? 'Overwrites any existing record on each day in the range with this same manual hours entry — no clock times needed.'
              : 'Overwrites any existing record for this date with a manual hours entry — no clock times needed.'}
          </p>
        </InputField>
        <InputField label="Notes">
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Optional notes..."
            className={inputClass}
          />
        </InputField>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? 'Saving...' : 'Save Hours'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ─── Bulk Manual Hours Modal ─────────────────────────────────────────────────
// Same idea as ManualHoursModal but for many employees at once — e.g. the
// same shift length for a whole crew, over a date range, in one submit.

interface BulkManualHoursModalProps {
  employeeNames: Record<string, string>
  selectedIds: string[]
  onClose: () => void
  onSave: (data: { work_date: string; to_date?: string; hours: number; notes: string }) => Promise<BulkResult[]>
}

export function BulkManualHoursModal({ employeeNames, selectedIds, onClose, onSave }: BulkManualHoursModalProps) {
  const todayIso = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState(todayIso)
  const [toDate, setToDate] = useState(todayIso)
  const [isRange, setIsRange] = useState(false)
  const [hours, setHours] = useState('8')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<BulkResult[] | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const h = Number(hours)
    if (isRange && toDate < date) { setError('End date must be on or after the start date'); return }
    if (isNaN(h) || h < 0 || h > 24) { setError('Hours must be between 0 and 24'); return }
    setSaving(true)
    setError('')
    try {
      const res = await onSave({
        work_date: date,
        ...(isRange ? { to_date: toDate } : {}),
        hours: h,
        notes: notes.trim(),
      })
      setResults(res)
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined
      setError(msg ?? 'Failed to save hours')
    } finally {
      setSaving(false)
    }
  }

  if (results) {
    const succeeded = results.filter(r => r.success)
    const failed = results.filter(r => !r.success)
    return (
      <ModalShell title="Bulk Hours Entry" onClose={onClose}>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {succeeded.length} of {results.length} employee-days saved.
        </p>
        {failed.length > 0 && (
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Skipped:</p>
            {failed.map((r, i) => (
              <div key={`${r.employee_id}-${i}`} className="flex items-center justify-between text-xs bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-1.5 gap-2">
                <span className="text-gray-700 dark:text-gray-300 flex-shrink-0">{employeeNames[r.employee_id] ?? r.employee_id}</span>
                <span className="text-red-600 dark:text-red-400 text-right">{r.error}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:opacity-90 transition-opacity"
          >
            Done
          </button>
        </div>
      </ModalShell>
    )
  }

  return (
    <ModalShell title="Bulk Hours Entry" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>
        )}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
          <p className="text-[11px] text-gray-500 dark:text-gray-400">{selectedIds.length} employees selected</p>
          <p className="text-sm text-gray-700 dark:text-gray-300 truncate">
            {selectedIds.map(id => employeeNames[id] ?? id).join(', ')}
          </p>
        </div>

        <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isRange}
            onChange={e => { setIsRange(e.target.checked); if (e.target.checked) setToDate(date) }}
            className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600"
          />
          Apply across a range of days
        </label>

        <div className={isRange ? 'grid grid-cols-2 gap-3' : ''}>
          <InputField label={isRange ? 'From Date' : 'Date'} required>
            <input
              type="date"
              value={date}
              onChange={e => { setDate(e.target.value); if (!isRange) setToDate(e.target.value) }}
              max={todayIso}
              className={inputClass}
            />
          </InputField>
          {isRange && (
            <InputField label="To Date" required>
              <input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                min={date}
                max={todayIso}
                className={inputClass}
              />
            </InputField>
          )}
        </div>

        <InputField label="Hours Worked (per day, per employee)" required>
          <input
            type="number"
            min="0"
            max="24"
            step="0.5"
            value={hours}
            onChange={e => setHours(e.target.value)}
            placeholder="e.g. 8"
            className={inputClass}
            autoFocus
          />
        </InputField>
        <InputField label="Notes">
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Optional notes..."
            className={inputClass}
          />
        </InputField>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? 'Saving...' : 'Save Hours'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ─── Adjust Hours Modal ───────────────────────────────────────────────────────
// Deduct forgotten unpaid break time from a completed punch (e.g. worked 9h
// but forgot to clock out for a 1h lunch break) without destroying the
// original clocked total_minutes — the deduction is stored separately with a
// required note so payroll and the audit trail both show why.

interface AdjustHoursModalProps {
  employeeName: string
  punch: AttendancePunch
  onClose: () => void
  onSave: (attendanceId: string, data: { deduction_minutes: number; notes: string }) => Promise<void>
}

export function AdjustHoursModal({ employeeName, punch, onClose, onSave }: AdjustHoursModalProps) {
  const rawMinutes = punch.total_minutes ?? 0
  const [deductHours, setDeductHours] = useState(
    punch.deduction_minutes ? String(punch.deduction_minutes / 60) : ''
  )
  const [notes, setNotes] = useState(punch.deduction_notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const deductMinutes = Math.round((Number(deductHours) || 0) * 60)
  const effectiveMinutes = Math.max(0, rawMinutes - deductMinutes)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (deductMinutes < 0 || deductMinutes > rawMinutes) {
      setError(`Deduction must be between 0 and ${(rawMinutes / 60).toFixed(2)}h (this punch's recorded duration)`)
      return
    }
    if (deductMinutes > 0 && !notes.trim()) {
      setError('A note is required when deducting hours')
      return
    }
    setSaving(true)
    try {
      await onSave(punch.attendance_id, { deduction_minutes: deductMinutes, notes: notes.trim() })
      onClose()
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined
      setError(msg ?? 'Failed to adjust hours')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title="Adjust Hours" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>
        )}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
          <p className="text-[11px] text-gray-500 dark:text-gray-400">Employee</p>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{employeeName}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5">Recorded duration</p>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{formatMinutes(rawMinutes)}</p>
        </div>
        <InputField label="Deduct (hours)">
          <input
            type="number"
            min="0"
            max={(rawMinutes / 60).toString()}
            step="0.25"
            value={deductHours}
            onChange={e => setDeductHours(e.target.value)}
            placeholder="e.g. 1 for a forgotten lunch break"
            className={inputClass}
            autoFocus
          />
          <p className="text-[11px] text-gray-400 mt-1">
            Effective pay hours after deduction: <strong>{formatMinutes(effectiveMinutes)}</strong>
          </p>
        </InputField>
        <InputField label="Reason" required={deductMinutes > 0}>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. 1hr lunch break, forgot to clock out"
            className={inputClass}
          />
        </InputField>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? 'Saving...' : 'Save Adjustment'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
