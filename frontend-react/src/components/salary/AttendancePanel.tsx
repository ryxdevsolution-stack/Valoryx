import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, LogIn, LogOut, Clock, RefreshCw, PenLine } from 'lucide-react'
import api from '@/lib/api'
import { toast } from '@/utils/toast'
import type { Employee, AttendanceDay, AttendancePunch, SalaryCycle } from '@/pages/Salary'
import { formatMinutes, isDateCovered as isCovered } from '@/utils/salary'

interface AttendancePanelProps {
  employee: Employee
  // Open the Mark Attendance modal. If a prefillDate (YYYY-MM-DD) is passed,
  // the modal opens on that specific date — used for back-filling from the calendar.
  onMarkAttendance: (prefillDate?: string) => void
  // Open the Mark Day Off modal for a specific date — for marking leave / absent
  // / holiday on a day without actual check-in punches.
  onMarkDayOff: (workDate: string) => void
  // Open the "Enter hours manually" modal — direct hours entry for admins who
  // don't know an employee's exact clock times (backfilling a past day).
  onManualHours: (workDate?: string) => void
  hasManagerAccess: boolean
  // Bumps when an external action (check-in/out, day-off save) should force
  // the panel to re-fetch its attendance data. Acts like a useEffect trigger.
  refreshSignal?: number
  // Callback to open the create-cycle modal when no cycle covers the date.
  onCreateCycle?: () => void
  // Open the Adjust Hours modal for a completed punch — deducts forgotten
  // unpaid break time (e.g. a punch shows 9h but 1h was an unclocked lunch break).
  onAdjustHours: (punch: AttendancePunch) => void
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' })
}

// Paid day-off statuses — match backend _DAY_OFF_PAID_STATUSES
const PAID_OFF_STATUSES = new Set(['paid_leave', 'holiday', 'weekly_off'])
const UNPAID_OFF_STATUSES = new Set(['absent', 'unpaid_leave'])

// Mini calendar footer — visual overview of attendance for the displayed month.
// States per cell:
//   - Present (green, has punches)       → expand that day's punches
//   - Paid day-off (amber)               → open day-off modal (to edit)
//   - Unpaid day-off (gray with border)  → open day-off modal (to edit)
//   - Unmarked absent (plain gray)       → open day-off modal (to create)
//   - No cycle covering date (red dot)   → toast warning + prompt to create cycle
//   - Sealed cycle (grayed, strikethrough) → toast that cycle is sealed
//   - Future date                        → disabled
function MiniCalendar({
  year, month, days, onSelectPresent, onMarkDayOff, canMark, selectedDate, cycles, onCreateCycle,
}: {
  year: number
  month: number
  days: AttendanceDay[]
  onSelectPresent: (workDate: string) => void
  onMarkDayOff: (workDate: string) => void
  canMark: boolean
  // The workDate the user currently has "drilled into" — gets a stronger ring
  // so it's clear which tile's data is showing in the list above.
  selectedDate: string | null
  cycles: SalaryCycle[]
  onCreateCycle?: () => void
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
    // lg:flex-1 + min-h-0 — the calendar claims all height the day list doesn't
    // use, so the tiles grow into what used to be dead space instead of the grid
    // scrolling inside a 280px box.
    <div className="flex flex-col border-t border-gray-100 dark:border-gray-800 px-3 py-3 bg-gray-50/60 dark:bg-gray-800/20 lg:flex-1 lg:min-h-0">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Monthly overview
        </p>
        <div className="flex items-center gap-2 text-[10px] text-gray-400 flex-wrap">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-500" />Present</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-400" />Paid off</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-gray-400 dark:bg-gray-600" />Unpaid</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm border border-red-300 dark:border-red-700 bg-white dark:bg-gray-900" />No cycle</span>
        </div>
      </div>
      {/* Weekday header lives in its own grid — inside the cell grid the
          auto-rows-fr below would stretch these labels to full tile height.
          max-w below lg: when the panel is full-width (stacked layout) the
          square tiles would otherwise blow up to ~95px each. */}
      <div className="grid grid-cols-7 gap-1 lg:gap-1.5 text-center flex-none mb-1 w-full max-w-[420px] lg:max-w-none mx-auto">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="text-[9px] lg:text-[10px] font-medium text-gray-400">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 lg:gap-1.5 text-center w-full max-w-[420px] lg:max-w-none mx-auto lg:flex-1 lg:auto-rows-fr lg:min-h-0">
        {cells.map((cell, i) => {
          if (!cell) return <div key={`pad-${i}`} />
          const status = dayStatusMap.get(cell.date)
          const hasEntry = status !== undefined
          const isPresent = status === 'present'
          const isPaidOff = status !== undefined && PAID_OFF_STATUSES.has(status)
          const isUnpaidOff = status !== undefined && UNPAID_OFF_STATUSES.has(status)
          const isToday = cell.date === todayStr
          const isFuture = cell.date > todayStr
          // Cycle coverage for this cell
          const coverage = isCovered(cell.date, cycles)
          const noCycle = !isFuture && !coverage.covered
          const cycleSealed = !isFuture && coverage.covered && coverage.sealed
          // Any recorded day (present OR day-off) is clickable for viewing;
          // unrecorded past days are clickable only for admins who can mark off.
          const canClick = hasEntry || (canMark && !isFuture)
          const handleClick = () => {
            // If the day already has any entry, open it in the list above —
            // don't re-open the creation modal (that would confuse "is my save lost?").
            if (hasEntry) {
              onSelectPresent(cell.date)
              return
            }
            // Gate: no cycle covering this date
            if (noCycle && canMark) {
              toast.warning(`No salary cycle covers ${cell.date}. Create a cycle first.`)
              if (onCreateCycle) {
                // Show a slight delay so the toast is readable before modal opens
                setTimeout(onCreateCycle, 300)
              }
              return
            }
            if (cycleSealed && canMark) {
              toast.warning(`The salary cycle for ${cell.date} is sealed (paid). Cannot record attendance.`)
              return
            }
            if (canMark && !isFuture) onMarkDayOff(cell.date)
          }
          const tooltip = isPresent
            ? 'Click to view punches'
            : isPaidOff
              ? `Paid day off (${status!.replace('_', ' ')}) — click to view`
              : isUnpaidOff
                ? `Unpaid (${status!.replace('_', ' ')}) — click to view`
                : isFuture
                  ? 'Future date'
                  : noCycle
                    ? 'No salary cycle — create one first'
                    : cycleSealed
                      ? 'Cycle sealed (paid) — cannot mark attendance'
                      : canMark
                        ? 'Absent — click to mark leave / absent'
                        : 'Absent — no attendance recorded'
          return (
            <button
              key={cell.date}
              type="button"
              onClick={handleClick}
              disabled={!canClick && !noCycle && !cycleSealed}
              title={tooltip}
              className={[
                // Square tiles on small screens (keeps a ≥44px touch target in a
                // 7-column grid); at lg they stretch to fill the taller grid rows.
                'aspect-square lg:aspect-auto lg:h-full w-full min-h-[30px] flex items-center justify-center',
                'rounded-md text-[10px] lg:text-xs font-semibold transition-colors relative',
                isPresent
                  ? 'bg-green-500 text-white hover:bg-green-600 cursor-pointer'
                  : isPaidOff
                    ? 'bg-amber-400 text-amber-950 hover:bg-amber-500 cursor-pointer'
                    : isUnpaidOff
                      ? 'bg-gray-400 dark:bg-gray-600 text-white ring-1 ring-gray-500 dark:ring-gray-500 hover:bg-gray-500 cursor-pointer'
                      : isFuture
                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                        : noCycle
                          ? 'bg-white dark:bg-gray-900 text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 cursor-pointer hover:bg-red-50 dark:hover:bg-red-900/20'
                          : cycleSealed
                            ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 opacity-60 cursor-pointer line-through'
                            : canMark
                              ? 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 hover:text-amber-700 dark:hover:text-amber-300 cursor-pointer'
                              : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-default',
                // Selected tile gets a thick dark ring; "today" keeps blue ring as a secondary hint.
                // Selected ring wins on top if both apply.
                isToday && cell.date !== selectedDate ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-gray-50 dark:ring-offset-gray-900' : '',
                cell.date === selectedDate ? 'ring-[3px] ring-gray-900 dark:ring-white ring-offset-1 ring-offset-gray-50 dark:ring-offset-gray-900 scale-105' : '',
              ].join(' ')}
            >
              {cell.day}
              {/* Red dot indicator for no-cycle days */}
              {noCycle && !hasEntry && (
                <span className="absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full bg-red-500" />
              )}
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
  onManualHours,
  hasManagerAccess,
  refreshSignal = 0,
  onCreateCycle,
  onAdjustHours,
}: AttendancePanelProps) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [days, setDays] = useState<AttendanceDay[]>([])
  const [cycles, setCycles] = useState<SalaryCycle[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedDay, setExpandedDay] = useState<string | null>(null)
  const [checkingOut, setCheckingOut] = useState<string | null>(null)
  // Drill-down: which calendar date the user clicked. null = nothing selected,
  // list area shows a prompt. When set, the list shows ONLY that date's entry.
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  // Heartbeat for live-ticking timers on open punches. Updated every 30s so
  // any in-progress check-in displays its running elapsed time without DB writes.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  // Compute live minutes for a still-open real punch. A punch counts as
  // "still open" only when it has no check_out AND no total_minutes yet —
  // manual hours entries (bulk or single) always have check_out === null
  // (there was never a real clock-out event) but DO have total_minutes set,
  // so they must never be treated as open/clocked-in.
  function liveMinutesFor(punch: AttendancePunch): number | null {
    if (punch.check_out || punch.total_minutes !== null || !punch.check_in || punch.is_manual_entry) return null
    const checkInMs = new Date(punch.check_in).getTime()
    if (isNaN(checkInMs)) return null
    const elapsed = Math.max(0, Math.floor((Date.now() - checkInMs) / 60000))
    return elapsed
  }

  const fetchAttendance = useCallback(async () => {
    setLoading(true)
    try {
      const from = `${year}-${String(month).padStart(2, '0')}-01`
      const daysInMonth = new Date(year, month, 0).getDate()
      const to = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
      // allSettled (not all) — if attendance fails because the user lacks
      // view_attendance, the cycles fetch should still populate the calendar
      // coverage. Likewise the reverse. One failed fetch must not blank both.
      const [attResult, cycleResult] = await Promise.allSettled([
        api.get(`/employees/${employee.employee_id}/attendance`, { params: { from, to } }),
        api.get(`/employees/${employee.employee_id}/cycles`),
      ])
      setDays(attResult.status === 'fulfilled' ? (attResult.value.data.data ?? []) : [])
      setCycles(cycleResult.status === 'fulfilled' ? (cycleResult.value.data.data ?? []) : [])
    } finally {
      setLoading(false)
    }
  }, [employee.employee_id, year, month])

  useEffect(() => {
    fetchAttendance()
    // refreshSignal intentionally in deps — parent bumps it after check-in /
    // check-out / day-off saves to force a re-fetch.
  }, [fetchAttendance, refreshSignal])

  // Clear the selected date whenever the employee or month changes — otherwise
  // a stale date from a previous month/employee would stay highlighted.
  useEffect(() => {
    setSelectedDate(null)
    setExpandedDay(null)
  }, [employee.employee_id, year, month])

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

  // Deductions (forgotten unpaid breaks) reduce the effective total shown here,
  // matching what payroll actually pays — the raw day_total_minutes from the
  // backend doesn't subtract them since that field mirrors the clocked duration.
  const deductionMinutesFor = (day: AttendanceDay) =>
    day.punches.reduce((sum, p) => sum + (p.deduction_minutes ?? 0), 0)
  const totalHours = days.reduce((acc, d) => acc + d.day_total_minutes - deductionMinutesFor(d), 0)
  // A live "clocked in" punch = an ACTUAL work punch that hasn't been checked
  // out. Day-off rows (paid/unpaid leave, holiday, weekly off) also have
  // check_out === null (and a sentinel check_in on offline SQLite), so marking
  // another day off must NOT flip the header to "Clocked In / Check Out" for
  // today. Exclude day-off statuses and require a real check_in.
  const openPunch = days.flatMap(d => d.punches).find(
    p => p.check_out === null
      && p.total_minutes === null
      && !p.is_manual_entry
      && !!p.check_in
      && !PAID_OFF_STATUSES.has(p.status ?? '')
      && !UNPAID_OFF_STATUSES.has(p.status ?? '')
  )

  return (
    // Mobile: auto-height (no outer constraint), so the page scrolls naturally.
    // Desktop: fill the parent's fixed viewport height.
    // aria-label carries the employee name for screen readers — the visible title
    // is just "Attendance" since the name is already shown in the employee list
    // and the salary panel.
    <section
      aria-label={`Attendance for ${employee.name}`}
      className="flex flex-col lg:h-full bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Attendance</h2>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {openPunch && (() => {
            const liveMins = liveMinutesFor(openPunch)
            return (
              <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 flex items-center gap-1.5">
                <span className="relative flex w-1.5 h-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-600" />
                </span>
                Clocked In{liveMins !== null ? ` — ${formatMinutes(liveMins)}` : ''}
              </span>
            )
          })()}
          {hasManagerAccess && (
            <button
              type="button"
              onClick={() => onManualHours(selectedDate ?? undefined)}
              className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Directly type hours worked for a date — no clock times needed"
            >
              <PenLine className="w-3.5 h-3.5" />
              Hours
            </button>
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
            ) : (() => {
              const todayDateStr = new Date().toISOString().slice(0, 10)
              const todayCoverage = isCovered(todayDateStr, cycles)
              return (
                <button
                  type="button"
                  onClick={() => {
                    if (!todayCoverage.covered) {
                      toast.warning('No salary cycle covers today. Create a cycle first.')
                      if (onCreateCycle) setTimeout(onCreateCycle, 300)
                      return
                    }
                    if (todayCoverage.sealed) {
                      toast.warning("Today's salary cycle is sealed (paid). Cannot record attendance.")
                      return
                    }
                    onMarkAttendance()
                  }}
                  title={
                    !todayCoverage.covered
                      ? 'No salary cycle covers today — create one first'
                      : todayCoverage.sealed
                        ? "Today's cycle is sealed (paid)"
                        : undefined
                  }
                  className={[
                    'flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg',
                    (!todayCoverage.covered || todayCoverage.sealed)
                      ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed opacity-70'
                      : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90 transition-opacity',
                  ].join(' ')}
                >
                  <LogIn className="w-3.5 h-3.5" />
                  Check In
                </button>
              )
            })()
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

      {/* Day list — drill-down: shows ONLY the date the user clicked in the
          mini calendar below, so it never needs much room.
          It is deliberately NOT flex-1: capped at 40% of the panel so the
          leftover height goes to the calendar instead of sitting empty. */}
      <div className="overflow-y-auto min-h-[120px] max-h-[180px] lg:max-h-[40%] lg:flex-none">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 dark:border-gray-600 dark:border-t-gray-200 rounded-full animate-spin" />
          </div>
        ) : days.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400 dark:text-gray-600">
            <p className="text-sm">No attendance records this month</p>
          </div>
        ) : !selectedDate ? (
          // Nothing clicked yet — show a subtle hint pointing down to the calendar
          <div className="flex flex-col items-center justify-center h-32 text-gray-400 dark:text-gray-600 px-6 text-center">
            <svg className="w-6 h-6 mb-2 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm">Click a date in the calendar below to view details</p>
            <p className="text-[11px] mt-1 opacity-70">{days.length} {days.length === 1 ? 'day' : 'days'} recorded this month</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {days.filter(day => day.work_date === selectedDate).map(day => {
              const dayStatus = day.day_status ?? 'present'
              const isDayOff = dayStatus !== 'present'
              const isPaidOff = PAID_OFF_STATUSES.has(dayStatus)
              // Live day total — adds elapsed minutes from any still-open punch
              const liveExtra = day.punches.reduce((sum, p) => {
                const live = liveMinutesFor(p)
                return sum + (live ?? 0)
              }, 0)
              const liveDayTotal = Math.max(0, day.day_total_minutes + liveExtra - deductionMinutesFor(day))
              const hasOpenPunch = day.punches.some(p => liveMinutesFor(p) !== null)
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
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex-shrink-0 flex items-center gap-1.5">
                      {hasOpenPunch && (
                        <span className="relative flex w-2 h-2" title="Currently clocked in">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                        </span>
                      )}
                      {formatMinutes(liveDayTotal)}
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
                          {punch.is_manual_entry ? (
                            <div className="flex items-center gap-1.5">
                              <PenLine className="w-3 h-3 text-gray-400" />
                              <span className="text-gray-500 dark:text-gray-400">Manually entered — no clock times</span>
                            </div>
                          ) : (
                            <>
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
                              ) : punch.total_minutes !== null ? (
                                <span className="text-gray-400 text-xs">No check-out recorded</span>
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
                            </>
                          )}
                        </div>
                        {/* Duration: finalized on completed punches, live-ticking on open ones */}
                        {punch.total_minutes !== null ? (
                          <div className="flex items-center gap-2">
                            <div className="text-right">
                              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block">
                                {formatMinutes(Math.max(0, punch.total_minutes - (punch.deduction_minutes ?? 0)))}
                              </span>
                              {!!punch.deduction_minutes && (
                                <span
                                  className="text-[10px] text-orange-600 dark:text-orange-400"
                                  title={punch.deduction_notes ?? undefined}
                                >
                                  −{formatMinutes(punch.deduction_minutes)} ({punch.deduction_notes})
                                </span>
                              )}
                            </div>
                            {hasManagerAccess && (
                              <button
                                type="button"
                                onClick={() => onAdjustHours(punch)}
                                className="p-1 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
                                title="Adjust hours — deduct forgotten unpaid break time"
                              >
                                <PenLine className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ) : (() => {
                          const live = liveMinutesFor(punch)
                          if (live === null) return null
                          return (
                            <span className="text-xs font-semibold text-green-600 dark:text-green-400 flex items-center gap-1" title="Live — ticking every 30s">
                              <span className="relative flex w-1.5 h-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
                              </span>
                              {formatMinutes(live)}
                            </span>
                          )
                        })()}
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

      {/* Mini monthly calendar footer — clicking a recorded day drives the
          drill-down list above: sets selectedDate + auto-expands the entry. */}
      <MiniCalendar
        year={year}
        month={month}
        days={days}
        cycles={cycles}
        canMark={hasManagerAccess}
        selectedDate={selectedDate}
        onCreateCycle={onCreateCycle}
        onSelectPresent={(workDate) => {
          // Toggle: clicking the same day again clears the selection
          if (selectedDate === workDate) {
            setSelectedDate(null)
            setExpandedDay(null)
          } else {
            setSelectedDate(workDate)
            setExpandedDay(workDate) // auto-expand punches for that day
          }
        }}
        onMarkDayOff={(workDate) => onMarkDayOff(workDate)}
      />
    </section>
  )
}
