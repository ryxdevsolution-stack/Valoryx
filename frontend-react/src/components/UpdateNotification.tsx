import { useState, useEffect } from 'react'

interface UpdateInfo {
  status: UpdateEventStatus
  version: string | null
  percent: number
  errorMessage: string | null
}

/** Per-state accent colour + copy. Keeps the render body declarative. */
const STATE_CONFIG: Record<
  'available' | 'downloading' | 'downloaded' | 'error',
  { accent: string; title: string }
> = {
  available: { accent: '#3b82f6', title: 'Update available' },
  downloading: { accent: '#3b82f6', title: 'Downloading update' },
  downloaded: { accent: '#22c55e', title: 'Update ready' },
  error: { accent: '#ef4444', title: "Couldn't update" },
}

/* Inline SVG icons (no emoji — they render inconsistently across machines). */
function DownloadIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}
function SpinnerIcon({ color }: { color: string }) {
  return (
    <svg className="vx-upd-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}
function CheckIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}
function AlertIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

/**
 * UpdateNotification — floating toast shown in Electron when a new version is
 * available. Non-intrusive: bottom-right so it never blocks POS operations.
 * Asks before downloading (Download → progress → Restart & Update).
 *
 * Styling note: a scoped <style> block (class prefix `vx-upd-`) is used instead
 * of pure inline styles so we get real hover/focus-visible states, the spinner
 * keyframe, the progress shimmer, and prefers-reduced-motion support — none of
 * which inline styles can express.
 */
export default function UpdateNotification() {
  const [update, setUpdate] = useState<UpdateInfo>({
    status: 'checking',
    version: null,
    percent: 0,
    errorMessage: null,
  })
  const [dismissed, setDismissed] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const api = (window as any).electronAPI
    if (!api?.onUpdateStatus) return

    const applyStatus = (status: UpdateEventStatus, data: UpdateStatusEvent['data']) => {
      setUpdate((prev) => {
        // Don't let a periodic re-check ('available') downgrade a download that
        // is already in flight or finished — that would revert the progress bar
        // or the "Restart & Update" CTA back to the "Download" prompt.
        if (status === 'available' && (prev.status === 'downloading' || prev.status === 'downloaded')) {
          return prev
        }
        return {
          status,
          version: data?.version ?? prev.version,
          percent: data?.percent ?? prev.percent,
          errorMessage: data?.message ?? prev.errorMessage,
        }
      })

      // Surface the toast for actionable states only.
      if (status === 'available' || status === 'downloading' || status === 'downloaded' || status === 'error') {
        setVisible(true)
        setDismissed(false)
      }
    }

    // Replay any event that fired before this listener attached.
    api.getUpdateStatus?.().then((last: UpdateStatusEvent | null) => {
      if (last?.status) applyStatus(last.status, last.data)
    })

    api.onUpdateStatus((event: UpdateStatusEvent) => applyStatus(event.status, event.data))

    return () => {
      api.removeUpdateStatus?.()
    }
  }, [])

  if (!visible || dismissed) return null
  if (update.status === 'checking' || update.status === 'not-available') return null

  const config = STATE_CONFIG[update.status as keyof typeof STATE_CONFIG]
  if (!config) return null
  const { accent, title } = config

  const handleDownload = () => {
    const api = (window as any).electronAPI
    // Optimistically flip to downloading so the buttons swap to the progress
    // bar instantly; real percentages then arrive via IPC events.
    setUpdate((prev) => ({ ...prev, status: 'downloading', percent: 0 }))
    api?.downloadUpdate?.()
  }
  const handleInstall = () => {
    const api = (window as any).electronAPI
    api?.installUpdate?.()
  }
  const handleDismiss = () => setDismissed(true)

  const icon =
    update.status === 'downloaded' ? <CheckIcon color={accent} /> :
    update.status === 'error' ? <AlertIcon color={accent} /> :
    update.status === 'downloading' ? <SpinnerIcon color={accent} /> :
    <DownloadIcon color={accent} />

  const subtitle =
    update.status === 'available' ? (update.version ? `Version ${update.version} is ready to download` : 'A new version is ready to download') :
    update.status === 'downloading' ? 'Getting the latest version…' :
    update.status === 'downloaded' ? (update.version ? `Version ${update.version} is ready to install` : 'The new version is ready to install') :
    null

  return (
    <div className="vx-upd" role="status" aria-live="polite" style={{ ['--vx-accent' as any]: accent }}>
      <style>{CSS}</style>

      {/* Accent rail */}
      <span className="vx-upd-rail" aria-hidden="true" />

      <div className="vx-upd-head">
        <span className="vx-upd-badge" aria-hidden="true">{icon}</span>
        <div className="vx-upd-titles">
          <p className="vx-upd-title">{title}</p>
          {subtitle && <p className="vx-upd-sub">{subtitle}</p>}
        </div>
        <button className="vx-upd-close" onClick={handleDismiss} type="button" aria-label="Dismiss update notification">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {update.status === 'downloading' && (
        <div className="vx-upd-progress-row">
          <div className="vx-upd-track" role="progressbar" aria-valuenow={update.percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="vx-upd-fill" style={{ width: `${update.percent}%` }} />
          </div>
          <span className="vx-upd-pct">{update.percent}%</span>
        </div>
      )}

      {update.status === 'error' && update.errorMessage && (
        <p className="vx-upd-error">{update.errorMessage}</p>
      )}

      {update.status === 'available' && (
        <div className="vx-upd-actions">
          <button className="vx-upd-btn vx-upd-btn--primary" onClick={handleDownload} type="button">Download</button>
          <button className="vx-upd-btn vx-upd-btn--ghost" onClick={handleDismiss} type="button">Later</button>
        </div>
      )}

      {update.status === 'downloaded' && (
        <div className="vx-upd-actions">
          <button className="vx-upd-btn vx-upd-btn--primary" onClick={handleInstall} type="button">Restart &amp; Update</button>
          <button className="vx-upd-btn vx-upd-btn--ghost" onClick={handleDismiss} type="button">Later</button>
        </div>
      )}

      {update.status === 'error' && (
        <div className="vx-upd-actions">
          <button className="vx-upd-btn vx-upd-btn--ghost" onClick={handleDismiss} type="button">Dismiss</button>
        </div>
      )}
    </div>
  )
}

const CSS = `
.vx-upd {
  position: fixed; bottom: 24px; right: 24px; z-index: 10000;
  width: 360px; max-width: calc(100vw - 32px);
  padding: 16px 18px 16px 22px;
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 16px;
  box-shadow: 0 1px 2px rgba(0,0,0,.3), 0 12px 32px -8px rgba(0,0,0,.55);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #e2e8f0; overflow: hidden;
  animation: vx-upd-in .26s cubic-bezier(.16,1,.3,1);
}
.vx-upd-rail {
  position: absolute; left: 0; top: 0; bottom: 0; width: 4px;
  background: var(--vx-accent); opacity: .9;
}
.vx-upd-head { display: flex; align-items: flex-start; gap: 12px; }
.vx-upd-badge {
  flex: 0 0 auto; width: 36px; height: 36px; border-radius: 10px;
  display: grid; place-items: center;
  background: color-mix(in srgb, var(--vx-accent) 16%, transparent);
}
.vx-upd-titles { flex: 1 1 auto; min-width: 0; padding-top: 1px; }
.vx-upd-title { margin: 0; font-size: 14.5px; font-weight: 600; letter-spacing: -.01em; color: #f1f5f9; }
.vx-upd-sub { margin: 3px 0 0; font-size: 12.5px; line-height: 1.45; color: #94a3b8; }
.vx-upd-close {
  flex: 0 0 auto; margin: -4px -6px 0 0; width: 28px; height: 28px;
  display: grid; place-items: center; border-radius: 8px;
  background: transparent; border: none; color: #64748b; cursor: pointer;
  transition: background .15s ease, color .15s ease;
}
.vx-upd-close:hover { background: rgba(148,163,184,.12); color: #cbd5e1; }
.vx-upd-close:focus-visible { outline: 2px solid var(--vx-accent); outline-offset: 1px; }

.vx-upd-progress-row { display: flex; align-items: center; gap: 10px; margin-top: 14px; }
.vx-upd-track {
  position: relative; flex: 1 1 auto; height: 6px; border-radius: 999px;
  background: rgba(148,163,184,.16); overflow: hidden;
}
.vx-upd-fill {
  position: relative; height: 100%; border-radius: 999px;
  background: linear-gradient(90deg, var(--vx-accent), #818cf8);
  transition: width .3s ease;
}
.vx-upd-fill::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.35), transparent);
  animation: vx-upd-shimmer 1.3s infinite;
}
.vx-upd-pct {
  flex: 0 0 auto; font-size: 12px; font-weight: 600; color: #cbd5e1;
  font-variant-numeric: tabular-nums; min-width: 34px; text-align: right;
}

.vx-upd-error {
  margin: 12px 0 0; padding: 9px 11px; font-size: 12px; line-height: 1.5;
  color: #fca5a5; background: rgba(239,68,68,.1);
  border: 1px solid rgba(239,68,68,.25); border-radius: 9px;
  word-break: break-word;
}

.vx-upd-actions { display: flex; gap: 8px; margin-top: 14px; }
.vx-upd-btn {
  height: 36px; padding: 0 16px; border-radius: 9px;
  font-size: 13px; font-weight: 600; cursor: pointer;
  transition: background .15s ease, border-color .15s ease, transform .08s ease;
}
.vx-upd-btn:active { transform: scale(.97); }
.vx-upd-btn:focus-visible { outline: 2px solid var(--vx-accent); outline-offset: 2px; }
.vx-upd-btn--primary {
  flex: 1 1 auto; border: none; color: #fff;
  background: linear-gradient(135deg, var(--vx-accent), #6366f1);
  box-shadow: 0 4px 12px -4px color-mix(in srgb, var(--vx-accent) 70%, transparent);
}
.vx-upd-btn--primary:hover { filter: brightness(1.08); }
.vx-upd-btn--ghost {
  border: 1px solid #334155; background: rgba(148,163,184,.06); color: #cbd5e1;
}
.vx-upd-btn--ghost:hover { background: rgba(148,163,184,.14); border-color: #475569; }

.vx-upd-spin { animation: vx-upd-rotate .9s linear infinite; transform-origin: center; }

@keyframes vx-upd-in { from { opacity: 0; transform: translateY(12px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes vx-upd-rotate { to { transform: rotate(360deg); } }
@keyframes vx-upd-shimmer { from { transform: translateX(-100%); } to { transform: translateX(100%); } }

@media (prefers-reduced-motion: reduce) {
  .vx-upd { animation: none; }
  .vx-upd-spin { animation-duration: 1.6s; }
  .vx-upd-fill::after { animation: none; }
  .vx-upd-fill, .vx-upd-btn { transition: none; }
}
`
