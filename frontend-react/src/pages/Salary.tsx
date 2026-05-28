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
} from '@/components/salary/SalaryModals'
import EmployeeHistory from '@/components/salary/EmployeeHistory'

// ─── Types (exported so sub-components can import them) ───────────────────────

export interface Employee {
  employee_id: string
  name: string
  phone: string | null
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
  | { type: 'mark-attendance'; prefillDate?: string }
  | { type: 'mark-day-off'; workDate: string }
  | { type: 'new-cycle' }
  | { type: 'edit-cycle'; cycle: SalaryCycle }
  | { type: 'add-advance'; cycles: SalaryCycle[] }
  | { type: 'history'; employee: Employee }
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
  const [modal, setModal] = useState<ActiveModal>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [cycleRefresh, setCycleRefresh] = useState(0)
  const [attendanceRefresh, setAttendanceRefresh] = useState(0)

  const hasManagerAccess =
    user?.role === 'owner' ||
    user?.role === 'manager' ||
    hasPermission('view_stock')

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
    data: { amount: number; advance_date: string; notes: string; cycle_id?: string }
  ) {
    await api.post(`/employees/${employeeId}/advances`, data)
    showToast('Advance recorded')
    setCycleRefresh(n => n + 1)
  }

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

      {/* 3-panel layout.
          Mobile: auto-height, panels stack and page scrolls naturally.
          Desktop (≥md): fixed viewport height so the 3 panels share the screen nicely. */}
      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr_1fr] gap-4 md:h-[calc(100vh-200px)] md:min-h-[500px]">
        {/* Left: Employees */}
        <EmployeePanel
          employees={employees}
          loading={empLoading}
          selectedId={selected?.employee_id ?? null}
          onSelect={setSelected}
          onAdd={() => setModal({ type: 'add-employee' })}
          onHistory={(emp) => setModal({ type: 'history', employee: emp })}
        />

        {/* Center: Attendance */}
        {selected ? (
          <AttendancePanel
            employee={selected}
            onMarkAttendance={(prefillDate) => setModal({ type: 'mark-attendance', prefillDate })}
            onMarkDayOff={(workDate) => setModal({ type: 'mark-day-off', workDate })}
            onCreateCycle={() => setModal({ type: 'new-cycle' })}
            hasManagerAccess={hasManagerAccess}
            refreshSignal={attendanceRefresh}
          />
        ) : (
          <EmptySlate message="Select an employee to view attendance" />
        )}

        {/* Right: Salary */}
        {selected ? (
          <SalaryPanel
            employee={selected}
            onNewCycle={() => setModal({ type: 'new-cycle' })}
            onEditCycle={(cycle) => setModal({ type: 'edit-cycle', cycle })}
            onAddAdvance={(cycles) => setModal({ type: 'add-advance', cycles })}
            refreshSignal={cycleRefresh}
          />
        ) : (
          <EmptySlate message="Select an employee to view salary" />
        )}
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
