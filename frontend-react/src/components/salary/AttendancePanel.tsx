import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, LogIn, LogOut, Clock, RefreshCw } from 'lucide-react'
import api from '@/lib/api'
import type { Employee, AttendanceDay } from '@/pages/Salary'

interface AttendancePanelProps {
  employee: Employee
  onMarkAttendance: () => void
  hasManagerAccess: boolean
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

export default function AttendancePanel({
  employee,
  onMarkAttendance,
  hasManagerAccess,
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
  }, [fetchAttendance])

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
                onClick={onMarkAttendance}
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
            {days.map(day => (
              <li key={day.work_date}>
                <button
                  type="button"
                  onClick={() => setExpandedDay(expandedDay === day.work_date ? null : day.work_date)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
                >
                  <div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {new Date(day.work_date + 'T00:00:00').toLocaleDateString('default', {
                        weekday: 'short', month: 'short', day: 'numeric',
                      })}
                    </span>
                    <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                      {day.punches.length} punch{day.punches.length !== 1 ? 'es' : ''}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    {formatMinutes(day.day_total_minutes)}
                  </span>
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
                              {new Date(punch.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          {punch.check_out ? (
                            <div className="flex items-center gap-1.5">
                              <LogOut className="w-3 h-3 text-red-400" />
                              <span className="text-gray-700 dark:text-gray-300">
                                {new Date(punch.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
