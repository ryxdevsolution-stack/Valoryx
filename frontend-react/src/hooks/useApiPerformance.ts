/**
 * useApiPerformance — React hook for subscribing to real-time API timing data.
 *
 * Returns the live list of ApiTimingEntry records (newest first, max 50).
 * Automatically updates whenever a new API call completes.
 *
 * Usage:
 *   const timings = useApiPerformance()
 *   const last = timings[0]  // most recent call
 */
import { useState, useEffect } from 'react'
import { getApiTimings, subscribeToApiTimings, type ApiTimingEntry } from '@/lib/api'

export type { ApiTimingEntry }

export function useApiPerformance(): readonly ApiTimingEntry[] {
  const [timings, setTimings] = useState<readonly ApiTimingEntry[]>(() => getApiTimings())

  useEffect(() => {
    // Sync on mount (in case entries were recorded before component mounted)
    setTimings(getApiTimings())

    const unsubscribe = subscribeToApiTimings(() => {
      setTimings([...getApiTimings()])
    })

    return unsubscribe
  }, [])

  return timings
}

/**
 * Returns just the last N timings — useful for lightweight indicators.
 */
export function useLastApiTiming(count = 1): readonly ApiTimingEntry[] {
  const timings = useApiPerformance()
  return timings.slice(0, count)
}

/**
 * Returns average response time over the last N calls (browser-measured ms).
 */
export function useAvgApiTiming(last = 10): number | null {
  const timings = useApiPerformance()
  const recent = timings.slice(0, last).filter(t => !t.fromCache)
  if (recent.length === 0) return null
  return Math.round(recent.reduce((sum, t) => sum + t.durationMs, 0) / recent.length)
}
