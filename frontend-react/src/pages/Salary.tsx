import { useState, useEffect, useCallback } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import api from '@/lib/api'
import { usePermissions } from '@/hooks/usePermissions'
import { useClient } from '@/contexts/ClientContext'
import { Users2 } from 'lucide-react'
import EmployeePanel from '@/components/salary/EmployeePanel'
import AttendancePanel from '@/components/salary/AttendancePanel'
import SalaryPanel from '@/components/salary/SalaryPanel'
import {
  AddEmployeeModal,
  MarkAttendanceModal,
  NewCycleModal,
  AddAdvanceModal,
} from '@/components/salary/SalaryModals'
import EmployeeHistory from '@/components/salary/EmployeeHistory'

// ─── Types (exported so sub-components can import them) ───────────────────────

export interface Employee {
  employee_id: string
  name: string
  phone: string | null
  pay_type: 'hourly' | 'daily'
  rate: number
  branch_id: string | null
  is_active: boolean
}

export interface AttendancePunch {
  attendance_id: string
  check_in: string
  check_out: string | null
  total_minutes: number | null
  notes: string | null
  marked_by_name?: string
}

export interface AttendanceDay {
  work_date: string
  punches: AttendancePunch[]
  day_total_minutes: number
  day_hours: number
}

export interface DailyBreakdown {
  date: string
  total_minutes: number
  hours_worked: number
  days_counted: number
  amount_earned: number
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
}

// ─── Modal state enum ─────────────────────────────────────────────────────────

type ActiveModal =
  | { type: 'add-employee' }
  | { type: 'mark-attendance' }
  | { type: 'new-cycle' }
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

  const [employees, setEmployees] = useState<Employee[]>([])
  const [empLoading, setEmpLoading] = useState(false)
  const [selected, setSelected] = useState<Employee | null>(null)
  const [modal, setModal] = useState<ActiveModal>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [cycleRefresh, setCycleRefresh] = useState(0)

  const hasManagerAccess =
    user?.role === 'owner' ||
    user?.role === 'admin' ||
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
  }

  async function handleNewCycle(
    employeeId: string,
    data: { start_date: string; end_date: string; full_day_mins: number }
  ) {
    await api.post(`/employees/${employeeId}/cycles`, data)
    showToast('Salary cycle created')
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

      {/* 3-panel layout */}
      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr_1fr] gap-4 h-[calc(100vh-200px)] min-h-[500px]">
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
            onMarkAttendance={() => setModal({ type: 'mark-attendance' })}
            hasManagerAccess={hasManagerAccess}
          />
        ) : (
          <EmptySlate message="Select an employee to view attendance" />
        )}

        {/* Right: Salary */}
        {selected ? (
          <SalaryPanel
            employee={selected}
            onNewCycle={() => setModal({ type: 'new-cycle' })}
            onAddAdvance={(cycles) => setModal({ type: 'add-advance', cycles })}
            refreshSignal={cycleRefresh}
          />
        ) : (
          <EmptySlate message="Select an employee to view salary" />
        )}
      </div>

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
        />
      )}
      {modal?.type === 'new-cycle' && selected && (
        <NewCycleModal
          employee={selected}
          onClose={() => setModal(null)}
          onSave={handleNewCycle}
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
  return (
    <div className="flex items-center justify-center bg-white dark:bg-gray-900 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
      <p className="text-sm text-gray-400 dark:text-gray-600 text-center px-6">{message}</p>
    </div>
  )
}
