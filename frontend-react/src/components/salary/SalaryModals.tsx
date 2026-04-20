import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import type { Employee, SalaryCycle } from '@/pages/Salary'

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
  pay_type: 'hourly' | 'daily'
  rate: string
}

interface AddEmployeeModalProps {
  onClose: () => void
  onSave: (data: Omit<Employee, 'employee_id' | 'branch_id' | 'is_active'>) => Promise<void>
}

export function AddEmployeeModal({ onClose, onSave }: AddEmployeeModalProps) {
  const [form, setForm] = useState<AddEmployeeForm>({
    name: '', phone: '', pay_type: 'daily', rate: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required'); return }
    if (!form.rate || isNaN(Number(form.rate))) { setError('Valid rate is required'); return }
    setSaving(true)
    try {
      await onSave({
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        pay_type: form.pay_type,
        rate: Number(form.rate),
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
        <InputField label="Phone">
          <input
            type="tel"
            value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            placeholder="e.g. 9876543210"
            className={inputClass}
          />
        </InputField>
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
        <InputField label={`Rate (₹/${form.pay_type === 'hourly' ? 'hr' : 'day'})`} required>
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

// ─── Mark Attendance Modal ────────────────────────────────────────────────────

interface MarkAttendanceModalProps {
  employee: Employee
  onClose: () => void
  onSave: (employeeId: string, checkIn: string, notes: string) => Promise<void>
}

export function MarkAttendanceModal({ employee, onClose, onSave }: MarkAttendanceModalProps) {
  const nowIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16)
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
  const [startDate, setStartDate] = useState(`${currentYearMonth}-01`)
  const [endDate, setEndDate] = useState(`${currentYearMonth}-25`)
  const [fullDayMins, setFullDayMins] = useState('480')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
        full_day_mins: Number(fullDayMins) || 480,
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

        <InputField label="Full Day Minutes">
          <input
            type="number"
            min="60"
            max="1440"
            value={fullDayMins}
            onChange={e => setFullDayMins(e.target.value)}
            className={inputClass}
          />
          <p className="text-[11px] text-gray-400 mt-1">Default 480 = 8 hours. Used for daily-rate employees.</p>
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

// ─── Add Advance Modal ────────────────────────────────────────────────────────

interface AddAdvanceModalProps {
  employee: Employee
  openCycles: SalaryCycle[]
  onClose: () => void
  onSave: (employeeId: string, data: { amount: number; advance_date: string; notes: string; cycle_id?: string }) => Promise<void>
}

export function AddAdvanceModal({ employee, openCycles, onClose, onSave }: AddAdvanceModalProps) {
  const todayIso = new Date().toISOString().split('T')[0]
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayIso)
  const [notes, setNotes] = useState('')
  const [cycleId, setCycleId] = useState('')
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
        advance_date: date,
        notes: notes.trim(),
        ...(cycleId ? { cycle_id: cycleId } : {}),
      })
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
    <ModalShell title="Add Salary Advance" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>
        )}
        <InputField label="Employee">
          <input type="text" value={employee.name} disabled className={`${inputClass} opacity-70`} />
        </InputField>
        <InputField label="Amount (₹)" required>
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
                  {c.start_date} – {c.end_date}
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
            {saving ? 'Saving...' : 'Add Advance'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
