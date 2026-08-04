import { useMemo } from 'react'
import { Clock } from 'lucide-react'

interface DurationPickerProps {
  /** Duration in decimal hours — the wire format the API expects (e.g. 8.5). */
  value: number
  onChange: (hours: number) => void
  /** Upper bound in hours. A work day cannot exceed 24. */
  max?: number
  disabled?: boolean
  autoFocus?: boolean
}

/** Minute granularity. 5 keeps the list short enough to scan while still
 *  expressing the quarter/half hours shop floors actually use. */
const MINUTE_STEP = 5

/**
 * DurationPicker — pick a worked duration as hours + minutes.
 *
 * Deliberately built from two <select> elements rather than <input type="time">
 * or a native date/time widget:
 *
 *  - `type="time"` means a CLOCK TIME (14:30), not a DURATION (14h 30m). Using
 *    it here is a category error, and it silently caps at 23:59.
 *  - Native pickers render through the OS/Chromium and look and behave
 *    differently between the packaged Electron app and a browser. A plain
 *    <select> is the same control everywhere, needs no polyfill, and keeps
 *    full keyboard and screen-reader support for free.
 *
 * The value stays decimal hours on the wire (8.5), so no API change is needed —
 * only the way the cashier enters it changes.
 */
export function DurationPicker({ value, onChange, max = 24, disabled, autoFocus }: DurationPickerProps) {
  const safe = Number.isFinite(value) && value >= 0 ? value : 0
  const hours = Math.floor(safe)
  // Round to the nearest step so a value typed elsewhere (or an 8.5 loaded from
  // a saved record) always lands on a selectable option instead of vanishing.
  const minutes = Math.min(55, Math.round(((safe - hours) * 60) / MINUTE_STEP) * MINUTE_STEP)

  const hourOptions = useMemo(
    () => Array.from({ length: Math.floor(max) + 1 }, (_, i) => i),
    [max],
  )
  const minuteOptions = useMemo(
    () => Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP),
    [],
  )

  const emit = (h: number, m: number) => {
    const total = h + m / 60
    onChange(Math.min(total, max))
  }

  const selectClass =
    'w-full h-11 px-3 text-sm rounded-lg border border-gray-300 dark:border-gray-600 ' +
    'bg-white dark:bg-gray-800 text-gray-900 dark:text-white tabular-nums ' +
    'focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-transparent ' +
    'disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer'

  return (
    <div className="flex items-end gap-2">
      <div className="flex-1">
        <label htmlFor="dur-hours" className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">
          Hours
        </label>
        <select
          id="dur-hours"
          value={hours}
          disabled={disabled}
          autoFocus={autoFocus}
          onChange={e => emit(Number(e.target.value), minutes)}
          className={selectClass}
        >
          {hourOptions.map(h => (
            <option key={h} value={h}>{String(h).padStart(2, '0')}</option>
          ))}
        </select>
      </div>

      <span className="pb-3 text-lg font-semibold text-gray-400 dark:text-gray-500 select-none" aria-hidden="true">:</span>

      <div className="flex-1">
        <label htmlFor="dur-minutes" className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">
          Minutes
        </label>
        <select
          id="dur-minutes"
          value={minutes}
          // At the ceiling (24h) minutes must stay 00 or the total would exceed max.
          disabled={disabled || hours >= max}
          onChange={e => emit(hours, Number(e.target.value))}
          className={selectClass}
        >
          {minuteOptions.map(m => (
            <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1.5 pb-3 pl-1 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap tabular-nums">
        <Clock className="w-3.5 h-3.5" aria-hidden="true" />
        <span>{safe.toFixed(2)}h</span>
      </div>
    </div>
  )
}

export default DurationPicker
