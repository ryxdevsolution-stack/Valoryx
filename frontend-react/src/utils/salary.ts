// Shared salary/attendance helpers. These were previously duplicated (bit-for-bit)
// across SalaryPanel, AttendancePanel and EmployeeHistory — consolidated here so
// formatting and cycle-coverage logic have a single source of truth.

/** Format a minute count as "Xh Ym", omitting zero parts. 90 → "1h 30m", 60 → "1h", 45 → "45m". */
export function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

/** Format an ISO date or "YYYY-MM-DD HH:MM:SS" timestamp as "1 Jun 2026" (en-IN). Falls back to the raw string. */
export function formatSalaryDate(d: string): string {
  try {
    // Normalise a space-separated timestamp to ISO so Safari parses it too.
    const s = d.includes('T') ? d : d.replace(' ', 'T')
    const parsed = new Date(s)
    if (isNaN(parsed.getTime())) return d
    return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return d
  }
}

interface CycleRange {
  start_date: string
  end_date: string
  status: string
}

/**
 * Whether a YYYY-MM-DD date falls inside any cycle's [start_date, end_date] range
 * (inclusive). `sealed` is true when the covering cycle is not open (already paid),
 * which blocks new attendance.
 */
export function isDateCovered(
  dateStr: string,
  cycles: CycleRange[],
): { covered: boolean; sealed: boolean } {
  for (const c of cycles) {
    if (c.start_date <= dateStr && c.end_date >= dateStr) {
      return { covered: true, sealed: c.status !== 'open' }
    }
  }
  return { covered: false, sealed: false }
}

/** First and last day (YYYY-MM-DD) of the month containing `ref` (defaults to today). */
export function currentMonthRange(ref: Date = new Date()): { start: string; end: string } {
  const y = ref.getFullYear()
  const m = ref.getMonth() // 0-based
  const ym = `${y}-${String(m + 1).padStart(2, '0')}`
  const lastDay = String(new Date(y, m + 1, 0).getDate()).padStart(2, '0')
  return { start: `${ym}-01`, end: `${ym}-${lastDay}` }
}
