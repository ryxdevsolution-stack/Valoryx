import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom'
import DashboardLayout from '@/components/DashboardLayout'
import api from '@/lib/api'
import { usePermissions } from '@/hooks/usePermissions'
import { useClient } from '@/contexts/ClientContext'
import { Users2 } from 'lucide-react'
import { focusRowById } from '@/utils/focusRow'
import EmployeePanel from '@/components/salary/EmployeePanel'
import AttendancePanel from '@/components/salary/AttendancePanel'
import SalaryPanel from '@/components/salary/SalaryPanel'
import PendingOTPanel from '@/components/salary/PendingOTPanel'
import {
  AddEmployeeModal,
  MarkAttendanceModal,
  NewCycleModal,
  EditCycleModal,
  AddAdvanceModal,
  MarkDayOffModal,
  BulkCheckInOutModal,
  ManualHoursModal,
  BulkManualHoursModal,
  AdjustHoursModal,
  EditEmployeeModal,
  type DeductionCategory,
  type BulkResult,
} from '@/components/salary/SalaryModals'
import EmployeeHistory from '@/components/salary/EmployeeHistory'

// ─── Types (exported so sub-components can import them) ───────────────────────

export interface Employee {
  employee_id: string
  name: string
  phone: string | null
  email: string | null
  pay_type: 'hourly' | 'daily'
  rate: number
  ot_multiplier: number | null
  branch_id: string | null
  is_active: boolean
}

// Day-off status values — must match backend _DAY_OFF_STATUSES.
// 'present' is the default for actual check-in records.
export type AttendanceStatus =
  | 'present'
  | 'paid_leave'
  | 'unpaid_leave'
  | 'absent'
  | 'holiday'
  | 'weekly_off'

export interface AttendancePunch {
  attendance_id: string
  check_in: string | null // null for day-off rows on Postgres
  check_out: string | null
  total_minutes: number | null
  notes: string | null
  status?: AttendanceStatus
  reason?: string | null
  marked_by_name?: string
  deduction_minutes?: number
  deduction_notes?: string | null
  is_manual_entry?: boolean
}

export interface AttendanceDay {
  work_date: string
  punches: AttendancePunch[]
  day_total_minutes: number
  day_hours: number
  day_status?: AttendanceStatus
  day_reason?: string | null
}

export interface DailyBreakdown {
  date: string
  total_minutes: number
  hours_worked: number
  days_counted: number
  amount_earned: number
  ot_minutes: number
  ot_pay: number
}

export interface OTSummary {
  total_ot_minutes: number
  total_ot_pay: number
  ot_multiplier: number
}

export interface SalaryAdvance {
  advance_id: string
  amount: number
  category?: DeductionCategory
  advance_date: string
  notes: string | null
}

export interface SalaryCycle {
  cycle_id: string
  employee_id: string
  start_date: string
  end_date: string
  status: 'open' | 'paid'
  gross_salary: number | null
  total_advances: number
  net_salary: number | null
  paid_at: string | null
  rate_snapshot: number | null
  pay_type_snap: string | null
  full_day_mins: number
  daily_breakdown?: DailyBreakdown[]
  advances?: SalaryAdvance[]
  ot_summary?: OTSummary
}

// ─── Modal state enum ─────────────────────────────────────────────────────────

type ActiveModal =
  | { type: 'add-employee' }
  | { type: 'edit-employee'; employee: Employee }
  | { type: 'mark-attendance'; prefillDate?: string }
  | { type: 'mark-day-off'; workDate: string }
  | { type: 'manual-hours'; workDate?: string }
  | { type: 'adjust-hours'; punch: AttendancePunch }
  | { type: 'new-cycle' }
  | { type: 'edit-cycle'; cycle: SalaryCycle }
  | { type: 'add-advance'; cycles: SalaryCycle[] }
  | { type: 'history'; employee: Employee }
  | { type: 'bulk-checkin' }
  | { type: 'bulk-checkout' }
  | { type: 'bulk-manual-hours' }
  | null

// ─── Toast ────────────────────────────────────────────────────────────────────

interface Toast {
  msg: string
  kind: 'success' | 'error'
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SalaryPage() {
  const { hasPermission } = usePermissions()
  const { user } = useClient()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()

  const [employees, setEmployees] = useState<Employee[]>([])
  const [empLoading, setEmpLoading] = useState(false)
  const [selected, setSelected] = useState<Employee | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [modal, setModal] = useState<ActiveModal>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [cycleRefresh, setCycleRefresh] = useState(0)
  const [attendanceRefresh, setAttendanceRefresh] = useState(0)

  const hasManagerAccess =
    user?.role === 'owner' ||
    user?.role === 'manager' ||
    hasPermission('view_employees')

  function showToast(msg: string, kind: 'success' | 'error' = 'success') {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 3000)
  }

  const fetchEmployees = useCallback(async () => {
    setEmpLoading(true)
    try {
      const res = await api.get('/employees')
      setEmployees(res.data.data ?? [])
    } catch {
      showToast('Failed to load employees', 'error')
    } finally {
      setEmpLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchEmployees()
  }, [fetchEmployees])

  // Deep-link focus: scroll to and highlight the employee row matching ?focus=<employee_id>
  useEffect(() => {
    const focus = searchParams.get('focus')
    if (!focus) return
    if (!employees || employees.length === 0) return
    focusRowById(focus)
    const next = new URLSearchParams(searchParams)
    next.delete('focus')
    navigate({ pathname: location.pathname, search: next.toString() }, { replace: true })
  }, [employees, searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Handlers ───────────────────────────────────────────────────────────────

  async function handleAddEmployee(
    data: Omit<Employee, 'employee_id' | 'branch_id' | 'is_active'>
  ) {
    await api.post('/employees', data)
    showToast('Employee added')
    fetchEmployees()
  }

  async function handleEditEmployee(
    employeeId: string,
    data: Partial<Omit<Employee, 'employee_id' | 'branch_id' | 'is_active'>>
  ) {
    await api.put(`/employees/${employeeId}`, data)
    showToast('Employee updated')
    fetchEmployees()
    // If the edited employee is currently selected, refresh its cached copy
    // so the attendance/salary panels show the new rate/pay_type immediately.
    setSelected(sel => (sel && sel.employee_id === employeeId ? { ...sel, ...data } as Employee : sel))
  }

  async function handleMarkAttendance(
    employeeId: string,
    checkIn: string,
    notes: string
  ) {
    await api.post(`/employees/${employeeId}/attendance/checkin`, { check_in: checkIn, notes })
    showToast('Attendance marked')
    setAttendanceRefresh(n => n + 1)
  }

  async function handleNewCycle(
    employeeId: string,
    data: { start_date: string; end_date: string; full_day_mins: number }
  ) {
    await api.post(`/employees/${employeeId}/cycles`, data)
    showToast('Salary cycle created')
    setCycleRefresh(n => n + 1)
    // The attendance calendar keeps its own cycle list — refresh it too so the
    // newly-covered days become clickable immediately.
    setAttendanceRefresh(n => n + 1)
  }

  async function handleEditCycle(
    employeeId: string,
    cycleId: string,
    data: { start_date: string; end_date: string; full_day_mins: number }
  ) {
    await api.put(`/employees/${employeeId}/cycles/${cycleId}`, data)
    showToast('Cycle updated')
    setCycleRefresh(n => n + 1)
  }

  async function handleAddAdvance(
    employeeId: string,
    data: { amount: number; category: DeductionCategory; advance_date: string; notes: string; cycle_id?: string }
  ) {
    await api.post(`/employees/${employeeId}/advances`, data)
    showToast('Deduction recorded')
    setCycleRefresh(n => n + 1)
  }

  async function handleManualHours(
    employeeId: string,
    data: { work_date: string; to_date?: string; hours: number; notes: string }
  ) {
    await api.post(`/employees/${employeeId}/attendance/manual`, data)
    showToast(data.to_date && data.to_date !== data.work_date
      ? `${data.hours}h recorded from ${data.work_date} to ${data.to_date}`
      : `${data.hours}h recorded for ${data.work_date}`)
    setAttendanceRefresh(n => n + 1)
    setCycleRefresh(n => n + 1)
  }

  async function handleBulkManualHours(
    data: { work_date: string; to_date?: string; hours: number; notes: string }
  ): Promise<BulkResult[]> {
    const res = await api.post('/employees/attendance/bulk-manual', { employee_ids: selectedIds, ...data })
    const results: BulkResult[] = res.data.data?.results ?? []
    const succeeded = results.filter(r => r.success).length
    showToast(`${data.hours}h recorded for ${succeeded} of ${results.length} employee-days`)
    setAttendanceRefresh(n => n + 1)
    setCycleRefresh(n => n + 1)
    return results
  }

  async function handleAdjustHours(
    attendanceId: string,
    data: { deduction_minutes: number; notes: string }
  ) {
    await api.post(`/employees/attendance/${attendanceId}/adjust-hours`, data)
    showToast(data.deduction_minutes > 0 ? `Deducted ${data.deduction_minutes} min` : 'Adjustment cleared')
    setAttendanceRefresh(n => n + 1)
    setCycleRefresh(n => n + 1)
  }

  function handleToggleSelect(employeeId: string) {
    setSelectedIds(ids => ids.includes(employeeId) ? ids.filter(id => id !== employeeId) : [...ids, employeeId])
  }

  function handleSelectAllToggle(visibleIds: string[]) {
    setSelectedIds(ids => {
      const allSelected = visibleIds.length > 0 && visibleIds.every(id => ids.includes(id))
      return allSelected ? ids.filter(id => !visibleIds.includes(id)) : Array.from(new Set([...ids, ...visibleIds]))
    })
  }

  async function handleBulkCheckIn(checkIn: string): Promise<BulkResult[]> {
    const res = await api.post('/employees/attendance/bulk-checkin', { employee_ids: selectedIds, check_in: checkIn })
    const results: BulkResult[] = res.data.data?.results ?? []
    const succeeded = results.filter(r => r.success).length
    showToast(`Checked in ${succeeded} of ${results.length} employees`)
    setAttendanceRefresh(n => n + 1)
    return results
  }

  async function handleBulkCheckOut(checkOut: string): Promise<BulkResult[]> {
    const res = await api.post('/employees/attendance/bulk-checkout', { employee_ids: selectedIds, check_out: checkOut })
    const results: BulkResult[] = res.data.data?.results ?? []
    const succeeded = results.filter(r => r.success).length
    showToast(`Checked out ${succeeded} of ${results.length} employees`)
    setAttendanceRefresh(n => n + 1)
    return results
  }

  const employeeNameMap = Object.fromEntries(employees.map(e => [e.employee_id, e.name]))

  async function handleMarkDayOff(
    employeeId: string,
    data: { work_date: string; status: string; reason: string; notes: string }
  ) {
    await api.post(`/employees/${employeeId}/day-off`, data)
    showToast(`Marked as ${data.status.replace('_', ' ')}`)
    setCycleRefresh(n => n + 1)
    // Refresh the attendance list/calendar so the new entry appears immediately
    setAttendanceRefresh(n => n + 1)
  }

  return (
    <DashboardLayout>
      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[70] px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium text-white transition-all ${
            toast.kind === 'error'
              ? 'bg-red-600 dark:bg-red-500'
              : 'bg-gray-900 dark:bg-gray-100 dark:text-gray-900'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Page header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-gray-900 dark:bg-white flex items-center justify-center">
          <Users2 className="w-5 h-5 text-white dark:text-gray-900" strokeWidth={2.5} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Salary &amp; Attendance</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Manage employees, attendance, and payroll cycles</p>
        </div>
      </div>

      {/* Responsive panel layout.
          Mobile (<md):  single column, panels stack and the page scrolls naturally.
          Tablet (md):   employees + attendance side by side, salary spans the full
                         width underneath — attendance keeps a usable calendar width
                         instead of being squeezed into a third of a narrow screen.
          Desktop (≥lg): 3 columns. Salary is capped rather than 1fr because its
                         content (cycle list + stats) is sparse; the freed width goes
                         to the attendance calendar, which is the data-dense panel.
          Fixed viewport height only kicks in at lg, where all 3 panels are side by
          side; below that the grid is auto-height so nothing gets squashed. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[240px_minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)_minmax(300px,340px)] lg:h-[calc(100vh-200px)] lg:min-h-[520px]">
        {/* Left: Employees */}
        <EmployeePanel
          employees={employees}
          loading={empLoading}
          selectedId={selected?.employee_id ?? null}
          onSelect={setSelected}
          onAdd={() => setModal({ type: 'add-employee' })}
          onHistory={(emp) => setModal({ type: 'history', employee: emp })}
          onEdit={(emp) => setModal({ type: 'edit-employee', employee: emp })}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onSelectAllToggle={handleSelectAllToggle}
          onBulkCheckIn={() => setModal({ type: 'bulk-checkin' })}
          onBulkCheckOut={() => setModal({ type: 'bulk-checkout' })}
          onBulkManualHours={() => setModal({ type: 'bulk-manual-hours' })}
        />

        {/* Center: Attendance */}
        {selected ? (
          <AttendancePanel
            employee={selected}
            onMarkAttendance={(prefillDate) => setModal({ type: 'mark-attendance', prefillDate })}
            onMarkDayOff={(workDate) => setModal({ type: 'mark-day-off', workDate })}
            onManualHours={(workDate) => setModal({ type: 'manual-hours', workDate })}
            onAdjustHours={(punch) => setModal({ type: 'adjust-hours', punch })}
            onCreateCycle={() => setModal({ type: 'new-cycle' })}
            hasManagerAccess={hasManagerAccess}
            refreshSignal={attendanceRefresh}
          />
        ) : (
          <EmptySlate message="Select an employee to view attendance" />
        )}

        {/* Right: Salary — full width under the other two at md, own column at lg */}
        <div className="md:col-span-2 lg:col-span-1 min-w-0 min-h-0">
          {selected ? (
            <SalaryPanel
              employee={selected}
              onNewCycle={() => setModal({ type: 'new-cycle' })}
              onEditCycle={(cycle) => setModal({ type: 'edit-cycle', cycle })}
              onAddAdvance={(cycles) => setModal({ type: 'add-advance', cycles })}
              refreshSignal={cycleRefresh}
              canManage={hasManagerAccess}
              onCyclesChanged={() => setAttendanceRefresh(n => n + 1)}
            />
          ) : (
            <EmptySlate message="Select an employee to view salary" />
          )}
        </div>
      </div>

      {/* Pending OT approvals — shown below the main panels when manager is viewing an employee */}
      {selected && hasManagerAccess && (
        <div className="mt-4">
          <PendingOTPanel
            employeeId={selected.employee_id}
            onApproved={() => setCycleRefresh(v => v + 1)}
          />
        </div>
      )}

      {/* Modals */}
      {modal?.type === 'add-employee' && (
        <AddEmployeeModal
          onClose={() => setModal(null)}
          onSave={handleAddEmployee}
        />
      )}
      {modal?.type === 'edit-employee' && (
        <EditEmployeeModal
          employee={modal.employee}
          onClose={() => setModal(null)}
          onSave={handleEditEmployee}
        />
      )}
      {modal?.type === 'mark-attendance' && selected && (
        <MarkAttendanceModal
          employee={selected}
          onClose={() => setModal(null)}
          onSave={handleMarkAttendance}
          prefillDate={modal.prefillDate}
        />
      )}
      {modal?.type === 'mark-day-off' && selected && (
        <MarkDayOffModal
          employee={selected}
          workDate={modal.workDate}
          onClose={() => setModal(null)}
          onSave={handleMarkDayOff}
        />
      )}
      {modal?.type === 'new-cycle' && selected && (
        <NewCycleModal
          employee={selected}
          onClose={() => setModal(null)}
          onSave={handleNewCycle}
        />
      )}
      {modal?.type === 'edit-cycle' && selected && (
        <EditCycleModal
          employee={selected}
          cycle={modal.cycle}
          onClose={() => setModal(null)}
          onSave={handleEditCycle}
        />
      )}
      {modal?.type === 'add-advance' && selected && (
        <AddAdvanceModal
          employee={selected}
          openCycles={modal.cycles.filter(c => c.status === 'open')}
          onClose={() => setModal(null)}
          onSave={handleAddAdvance}
        />
      )}
      {modal?.type === 'history' && (
        <EmployeeHistory
          employee={modal.employee}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'manual-hours' && selected && (
        <ManualHoursModal
          employee={selected}
          workDate={modal.workDate}
          onClose={() => setModal(null)}
          onSave={handleManualHours}
        />
      )}
      {(modal?.type === 'bulk-checkin' || modal?.type === 'bulk-checkout') && (
        <BulkCheckInOutModal
          mode={modal.type === 'bulk-checkin' ? 'checkin' : 'checkout'}
          employeeNames={employeeNameMap}
          selectedIds={selectedIds}
          onClose={() => { setModal(null); setSelectedIds([]) }}
          onSave={modal.type === 'bulk-checkin' ? handleBulkCheckIn : handleBulkCheckOut}
        />
      )}
      {modal?.type === 'bulk-manual-hours' && (
        <BulkManualHoursModal
          employeeNames={employeeNameMap}
          selectedIds={selectedIds}
          onClose={() => { setModal(null); setSelectedIds([]) }}
          onSave={handleBulkManualHours}
        />
      )}
      {modal?.type === 'adjust-hours' && selected && (
        <AdjustHoursModal
          employeeName={selected.name}
          punch={modal.punch}
          onClose={() => setModal(null)}
          onSave={handleAdjustHours}
        />
      )}
    </DashboardLayout>
  )
}

// ─── Empty state placeholder ──────────────────────────────────────────────────

function EmptySlate({ message }: { message: string }) {
  // min-h on mobile so the placeholder has visible body even without a parent height;
  // on desktop it still stretches via the grid row.
  return (
    <div className="flex items-center justify-center min-h-[120px] md:min-h-0 bg-white dark:bg-gray-900 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 py-8 md:py-0">
      <p className="text-sm text-gray-400 dark:text-gray-600 text-center px-6">{message}</p>
    </div>
  )
}
