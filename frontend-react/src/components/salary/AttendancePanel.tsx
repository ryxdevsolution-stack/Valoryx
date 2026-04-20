import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, LogIn, LogOut, Clock, RefreshCw } from 'lucide-react'
import api from '@/lib/api'
import type { Employee, AttendanceDay } from '@/pages/Salary'

interface AttendancePanelProps {
  employee: Employee
  // Open the Mark Attendance modal. If a prefillDate (YYYY-MM-DD) is passed,
  // the modal opens on that specific date — used for back-filling from the calendar.
  onMarkAttendance: (prefillDate?: string) => void
  // Open the Mark Day Off modal for a specific date — for marking leave / absent
  // / holiday on a day without actual check-in punches.
  onMarkDayOff: (workDate: string) => void
  hasManagerAccess: boolean
  // Bumps when an external action (check-in/out, day-off save) should force
  // the panel to re-fetch its attendance data. Acts like a useEffect trigger.
  refreshSignal?: number
}

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' })
}

// Paid day-off statuses — match backend _DAY_OFF_PAID_STATUSES
const PAID_OFF_STATUSES = new Set(['paid_leave', 'holiday', 'weekly_off'])
const UNPAID_OFF_STATUSES = new Set(['absent', 'unpaid_leave'])

// Mini calendar footer — visual overview of attendance for the displayed month.
// Four states per cell:
//   - Present (green, has punches)       → expand that day's punches
//   - Paid day-off (amber)               → open day-off modal (to edit)
//   - Unpaid day-off (gray with border)  → open day-off modal (to edit)
//   - Unmarked absent (plain gray)       → open day-off modal (to create)
//   - Future date                        → disabled
function MiniCalendar({
  year, month, days, onSelectPresent, onMarkDayOff, canMark,
}: {
  year: number
  month: number
  days: AttendanceDay[]
  onSelectPresent: (workDate: string) => void
  onMarkDayOff: (workDate: string) => void
  canMark: boolean
}) {
  const firstDow = new Date(year, month - 1, 1).getDay() // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate()
  const todayStr = new Date().toISOString().slice(0, 10)
  // Map workDate → day_status so we can branch three ways (present / paid off / unpaid off)
  const dayStatusMap = new Map(days.map(d => [d.work_date, d.day_status ?? 'present']))

  // Pad the start of the grid with empty cells so day-1 lands under its weekday.
  const cells: Array<{ date: string; day: number } | null> = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      return { date, day }
    }),
  ]

  return (
    <div className="border-t border-gray-100 dark:border-gray-800 px-3 py-3 bg-gray-50/60 dark:bg-gray-800/20">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Monthly overview
        </p>
        <div className="flex items-center gap-2 text-[10px] text-gray-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-500" />Present</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-400" />Paid off</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-gray-400 dark:bg-gray-600" />Unpaid</span>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="text-[9px] font-medium text-gray-400">{d}</div>
        ))}
        {cells.map((cell, i) => {
          if (!cell) return <div key={`pad-${i}`} />
          const status = dayStatusMap.get(cell.date)
          const hasEntry = status !== undefined
          const isPresent = status === 'present'
          const isPaidOff = status !== undefined && PAID_OFF_STATUSES.has(status)
          const isUnpaidOff = status !== undefined && UNPAID_OFF_STATUSES.has(status)
          const isToday = cell.date === todayStr
          const isFuture = cell.date > todayStr
          // Any recorded day (present OR day-off) is clickable for viewing;
          // unrecorded past days are clickable only for admins who can mark off.
          const canClick = hasEntry || (canMark && !isFuture)
          const handleClick = () => {
            // If the day already has any entry, open it in the list above —
            // don't re-open the creation modal (that would confuse "is my save lost?").
            if (hasEntry) onSelectPresent(cell.date)
            else if (canMark && !isFuture) onMarkDayOff(cell.date)
          }
          const tooltip = isPresent
            ? 'Click to view punches'
            : isPaidOff
              ? `Paid day off (${status!.replace('_', ' ')}) — click to view`
              : isUnpaidOff
                ? `Unpaid (${status!.replace('_', ' ')}) — click to view`
                : isFuture
                  ? 'Future date'
                  : canMark
                    ? 'Absent — click to mark leave / absent'
                    : 'Absent — no attendance recorded'
          return (
            <button
              key={cell.date}
              type="button"
              onClick={handleClick}
              disabled={!canClick}
              title={tooltip}
              className={[
                'aspect-square rounded-md text-[10px] font-semibold transition-colors',
                isPresent
                  ? 'bg-green-500 text-white hover:bg-green-600 cursor-pointer'
                  : isPaidOff
                    ? 'bg-amber-400 text-amber-950 hover:bg-amber-500 cursor-pointer'
                    : isUnpaidOff
                      ? 'bg-gray-400 dark:bg-gray-600 text-white ring-1 ring-gray-500 dark:ring-gray-500 hover:bg-gray-500 cursor-pointer'
                      : isFuture
                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                        : canMark
                          ? 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 hover:text-amber-700 dark:hover:text-amber-300 cursor-pointer'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-default',
                isToday ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-gray-50 dark:ring-offset-gray-900' : '',
              ].join(' ')}
            >
              {cell.day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function AttendancePanel({
  employee,
  onMarkAttendance,
  onMarkDayOff,
  hasManagerAccess,
  refreshSignal = 0,
}: AttendancePanelProps) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [days, setDays] = useState<AttendanceDay[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedDay, setExpandedDay] = useState<string | null>(null)
  const [checkingOut, setCheckingOut] = useState<string | null>(null)

  const fetchAttendance = useCallback(async () => {
    setLoading(true)
    try {
      const from = `${year}-${String(month).padStart(2, '0')}-01`
      const daysInMonth = new Date(year, month, 0).getDate()
      const to = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
      const res = await api.get(`/employees/${employee.employee_id}/attendance`, {
        params: { from, to },
      })
      setDays(res.data.data ?? [])
    } catch {
      setDays([])
    } finally {
      setLoading(false)
    }
  }, [employee.employee_id, year, month])

  useEffect(() => {
    fetchAttendance()
    // refreshSignal intentionally in deps — parent bumps it after check-in /
    // check-out / day-off saves to force a re-fetch.
  }, [fetchAttendance, refreshSignal])

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  async function handleCheckout(attendanceId: string) {
    setCheckingOut(attendanceId)
    try {
      await api.post(`/employees/${employee.employee_id}/attendance/checkout`, {
        check_out: new Date().toISOString(),
      })
      fetchAttendance()
    } finally {
      setCheckingOut(null)
    }
  }

  const totalHours = days.reduce((acc, d) => acc + d.day_total_minutes, 0)
  const openPunch = days.flatMap(d => d.punches).find(p => p.check_out === null)

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{employee.name}</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Attendance</p>
        </div>
        <div className="flex items-center gap-2">
          {openPunch && (
            <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 animate-pulse">
              Clocked In
            </span>
          )}
          {hasManagerAccess && (
            openPunch ? (
              <button
                type="button"
                onClick={() => handleCheckout(openPunch.attendance_id)}
                disabled={checkingOut === openPunch.attendance_id}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                <LogOut className="w-3.5 h-3.5" />
                {checkingOut === openPunch.attendance_id ? 'Saving...' : 'Check Out'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onMarkAttendance()}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:opacity-90 transition-opacity"
              >
                <LogIn className="w-3.5 h-3.5" />
                Check In
              </button>
            )
          )}
          <button
            type="button"
            onClick={fetchAttendance}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Month picker */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
        <button
          type="button"
          onClick={prevMonth}
          className="p-1 rounded-lg text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
          {monthLabel(year, month)}
        </span>
        <button
          type="button"
          onClick={nextMonth}
          className="p-1 rounded-lg text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          disabled={year === now.getFullYear() && month === now.getMonth() + 1}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Summary bar */}
      <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/30 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <Clock className="w-3.5 h-3.5" />
          <span>Total this month: <strong className="text-gray-900 dark:text-white">{formatMinutes(totalHours)}</strong></span>
          <span className="mx-1">·</span>
          <span><strong className="text-gray-900 dark:text-white">{days.length}</strong> days</span>
        </div>
      </div>

      {/* Day list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 dark:border-gray-600 dark:border-t-gray-200 rounded-full animate-spin" />
          </div>
        ) : days.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400 dark:text-gray-600">
            <p className="text-sm">No attendance records</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {days.map(day => {
              const dayStatus = day.day_status ?? 'present'
              const isDayOff = dayStatus !== 'present'
              const isPaidOff = PAID_OFF_STATUSES.has(dayStatus)
              return (
              <li key={day.work_date}>
                <button
                  type="button"
                  onClick={() => setExpandedDay(expandedDay === day.work_date ? null : day.work_date)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {new Date(day.work_date + 'T00:00:00').toLocaleDateString('default', {
                          weekday: 'short', month: 'short', day: 'numeric',
                        })}
                      </span>
                      {isDayOff ? (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase ${
                          isPaidOff
                            ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}>
                          {dayStatus.replace('_', ' ')}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {day.punches.length} punch{day.punches.length !== 1 ? 'es' : ''}
                        </span>
                      )}
                    </div>
                    {isDayOff && day.day_reason && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                        {day.day_reason}
                      </p>
                    )}
                  </div>
                  {!isDayOff && (
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex-shrink-0">
                      {formatMinutes(day.day_total_minutes)}
                    </span>
                  )}
                </button>

                {expandedDay === day.work_date && (
                  <ul className="px-4 pb-2 space-y-1.5">
                    {day.punches.map(punch => (
                      <li
                        key={punch.attendance_id}
                        className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"
                      >
                        <div className="text-xs space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <LogIn className="w-3 h-3 text-green-500" />
                            <span className="text-gray-700 dark:text-gray-300">
                              {punch.check_in
                                ? new Date(punch.check_in).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
                                : '—'}
                            </span>
                          </div>
                          {punch.check_out ? (
                            <div className="flex items-center gap-1.5">
                              <LogOut className="w-3 h-3 text-red-400" />
                              <span className="text-gray-700 dark:text-gray-300">
                                {new Date(punch.check_out).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
                              </span>
                            </div>
                          ) : hasManagerAccess ? (
                            <button
                              type="button"
                              onClick={() => handleCheckout(punch.attendance_id)}
                              disabled={checkingOut === punch.attendance_id}
                              className="flex items-center gap-1 text-orange-600 dark:text-orange-400 hover:underline disabled:opacity-50"
                            >
                              <LogOut className="w-3 h-3" />
                              {checkingOut === punch.attendance_id ? 'Saving...' : 'Check out now'}
                            </button>
                          ) : (
                            <span className="text-orange-500 text-xs">Still clocked in</span>
                          )}
                        </div>
                        {punch.total_minutes !== null && (
                          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                            {formatMinutes(punch.total_minutes)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Mini monthly calendar footer */}
      <MiniCalendar
        year={year}
        month={month}
        days={days}
        canMark={hasManagerAccess}
        onSelectPresent={(workDate) => setExpandedDay(expandedDay === workDate ? null : workDate)}
        onMarkDayOff={(workDate) => onMarkDayOff(workDate)}
      />
    </div>
  )
}
