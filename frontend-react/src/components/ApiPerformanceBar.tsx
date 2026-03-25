/**
 * ApiPerformanceBar — Dev-mode overlay showing real-time API call timings.
 *
 * Only renders in development (import.meta.env.DEV).
 * Shows last 8 API calls with color-coded ms badges.
 * Toggle with Ctrl+Shift+P.
 *
 * Color scale:
 *   green  → < 100ms   (fast)
 *   yellow → 100–500ms (moderate)
 *   orange → 500–1000ms (slow)
 *   red    → > 1000ms  (very slow)
 *
 * Usage — drop anywhere in your app layout (e.g. App.tsx):
 *   import { ApiPerformanceBar } from '@/components/ApiPerformanceBar'
 *   <ApiPerformanceBar />
 */
import { useState, useEffect, useCallback, memo } from 'react'
import { useApiPerformance, type ApiTimingEntry } from '@/hooks/useApiPerformance'

// ─── helpers ────────────────────────────────────────────────────────────────

function getTimingColor(ms: number, fromCache: boolean): string {
  if (fromCache) return '#a78bfa' // purple — cache hit
  if (ms < 100) return '#4ade80'  // green
  if (ms < 500) return '#facc15'  // yellow
  if (ms < 1000) return '#fb923c' // orange
  return '#f87171'                // red
}

function getStatusColor(status: number): string {
  if (status >= 500) return '#f87171'
  if (status >= 400) return '#fb923c'
  if (status >= 300) return '#facc15'
  return '#4ade80'
}

function shortUrl(url: string): string {
  // Strip base URL prefix, keep path only
  return url.replace(/^https?:\/\/[^/]+/, '').replace(/^\/api/, '/api') || url
}

// ─── TimingRow ───────────────────────────────────────────────────────────────

const TimingRow = memo(({ entry }: { entry: ApiTimingEntry }) => {
  const color = getTimingColor(entry.durationMs, entry.fromCache)
  const statusColor = getStatusColor(entry.status)
  const label = entry.fromCache ? '0ms ⚡cache' : `${entry.durationMs}ms`
  const serverLabel = entry.serverMs !== null ? ` srv:${entry.serverMs}ms` : ''
  const time = new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false })

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '2px 0',
      fontSize: '10px',
      fontFamily: 'monospace',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      minWidth: 0,
    }}>
      <span style={{ color: '#94a3b8', flexShrink: 0, width: '56px' }}>{time}</span>
      <span style={{
        color: '#94a3b8',
        fontWeight: 600,
        flexShrink: 0,
        width: '36px',
      }}>
        {entry.method}
      </span>
      <span style={{ color: statusColor, flexShrink: 0, width: '28px' }}>{entry.status || '—'}</span>
      <span style={{
        color,
        fontWeight: 700,
        flexShrink: 0,
        width: '80px',
        whiteSpace: 'nowrap',
      }}>
        {label}{serverLabel}
      </span>
      <span style={{
        color: '#64748b',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        flex: 1,
      }} title={entry.url}>
        {shortUrl(entry.url)}
      </span>
    </div>
  )
})
TimingRow.displayName = 'TimingRow'

// ─── ApiPerformanceBar ───────────────────────────────────────────────────────

export const ApiPerformanceBar = memo(() => {
  // Only render in dev mode
  if (!import.meta.env.DEV) return null

  return <ApiPerformanceBarInner />
})
ApiPerformanceBar.displayName = 'ApiPerformanceBar'

function ApiPerformanceBarInner() {
  const [visible, setVisible] = useState(false)
  const timings = useApiPerformance()
  const recent = timings.slice(0, 8)
  const lastEntry = timings[0]

  // Ctrl+Shift+P toggles the panel
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'P') {
      e.preventDefault()
      setVisible(v => !v)
    }
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Compact indicator pill (always visible in dev when there are timings)
  if (!lastEntry) return null

  const pillColor = getTimingColor(lastEntry.durationMs, lastEntry.fromCache)

  return (
    <>
      {/* Floating pill — bottom-right corner */}
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        title="Toggle API Performance Panel (Ctrl+Shift+P)"
        style={{
          position: 'fixed',
          bottom: '12px',
          right: '12px',
          zIndex: 9999,
          background: 'rgba(15,23,42,0.92)',
          border: `1px solid ${pillColor}`,
          borderRadius: '9999px',
          padding: '3px 10px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          backdropFilter: 'blur(6px)',
        }}
      >
        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: pillColor, flexShrink: 0 }} />
        <span style={{ color: pillColor, fontSize: '11px', fontFamily: 'monospace', fontWeight: 700 }}>
          {lastEntry.fromCache ? '0ms ⚡' : `${lastEntry.durationMs}ms`}
        </span>
        <span style={{ color: '#64748b', fontSize: '10px', fontFamily: 'monospace' }}>
          {(lastEntry.method)} {shortUrl(lastEntry.url).slice(0, 20)}
        </span>
      </button>

      {/* Full panel */}
      {visible && (
        <div style={{
          position: 'fixed',
          bottom: '44px',
          right: '12px',
          zIndex: 9998,
          background: 'rgba(10,15,28,0.97)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '8px',
          padding: '10px 12px',
          width: '520px',
          maxWidth: 'calc(100vw - 24px)',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px',
          }}>
            <span style={{ color: '#94a3b8', fontSize: '11px', fontFamily: 'monospace', fontWeight: 600 }}>
              API PERFORMANCE — last {recent.length} calls
            </span>
            <button
              type="button"
              onClick={() => setVisible(false)}
              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '14px', padding: 0 }}
            >
              ✕
            </button>
          </div>

          {/* Column headers */}
          <div style={{
            display: 'flex',
            gap: '6px',
            padding: '2px 0 4px',
            fontSize: '9px',
            fontFamily: 'monospace',
            color: '#475569',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            marginBottom: '4px',
          }}>
            <span style={{ width: '56px' }}>TIME</span>
            <span style={{ width: '36px' }}>METHOD</span>
            <span style={{ width: '28px' }}>ST</span>
            <span style={{ width: '80px' }}>DURATION</span>
            <span style={{ flex: 1 }}>URL</span>
          </div>

          {recent.length === 0 ? (
            <span style={{ color: '#475569', fontSize: '10px', fontFamily: 'monospace' }}>
              No API calls recorded yet.
            </span>
          ) : (
            recent.map((entry, i) => <TimingRow key={`${entry.timestamp}-${i}`} entry={entry} />)
          )}

          <div style={{
            marginTop: '6px',
            fontSize: '9px',
            color: '#334155',
            fontFamily: 'monospace',
          }}>
            ⚡ cache  🟢 &lt;100ms  🟡 &lt;500ms  🟠 &lt;1s  🔴 &gt;1s — Ctrl+Shift+P to toggle
          </div>
        </div>
      )}
    </>
  )
}
