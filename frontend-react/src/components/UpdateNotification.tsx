import { useState, useEffect } from 'react'

interface UpdateInfo {
  status: UpdateEventStatus
  version: string | null
  percent: number
  errorMessage: string | null
}

/**
 * UpdateNotification — floating toast shown in Electron when a new version is available.
 * Non-intrusive: sits at bottom-right so it doesn't block POS operations.
 * Only renders in Electron when an update event has fired.
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

    api.onUpdateStatus((event: UpdateStatusEvent) => {
      const { status, data } = event

      setUpdate((prev) => ({
        ...prev,
        status,
        version: data?.version ?? prev.version,
        percent: data?.percent ?? prev.percent,
        errorMessage: data?.message ?? prev.errorMessage,
      }))

      // Show the notification for actionable states
      if (status === 'available' || status === 'downloading' || status === 'downloaded') {
        setVisible(true)
        setDismissed(false)
      }
    })

    return () => {
      api.removeUpdateStatus?.()
    }
  }, [])

  // Don't render if not visible or dismissed
  if (!visible || dismissed) return null

  // Don't show for non-actionable states
  if (update.status === 'checking' || update.status === 'not-available') return null

  const handleInstall = () => {
    const api = (window as any).electronAPI
    api?.installUpdate?.()
  }

  const handleDismiss = () => {
    setDismissed(true)
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 10000,
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: 12,
        padding: '16px 20px',
        minWidth: 300,
        maxWidth: 380,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: '#e2e8f0',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>
            {update.status === 'downloaded' ? '✅' : update.status === 'error' ? '⚠️' : '🔄'}
          </span>
          <span style={{ fontWeight: 600, fontSize: 14 }}>
            {update.status === 'available' && 'Update Available'}
            {update.status === 'downloading' && 'Downloading Update…'}
            {update.status === 'downloaded' && 'Update Ready'}
            {update.status === 'error' && 'Update Error'}
          </span>
        </div>
        <button
          onClick={handleDismiss}
          style={{
            background: 'none',
            border: 'none',
            color: '#64748b',
            cursor: 'pointer',
            fontSize: 18,
            padding: '0 4px',
            lineHeight: 1,
          }}
          title="Dismiss"
          type="button"
        >
          ×
        </button>
      </div>

      {/* Version info */}
      {update.version && (
        <p style={{ margin: '0 0 10px', fontSize: 13, color: '#94a3b8' }}>
          Version <strong style={{ color: '#60a5fa' }}>v{update.version}</strong> is{' '}
          {update.status === 'downloaded' ? 'ready to install' : 'available'}
        </p>
      )}

      {/* Download progress bar */}
      {update.status === 'downloading' && (
        <div style={{ marginBottom: 10 }}>
          <div
            style={{
              width: '100%',
              height: 4,
              background: 'rgba(255,255,255,0.1)',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${update.percent}%`,
                background: 'linear-gradient(90deg, #60a5fa, #a78bfa)',
                borderRadius: 2,
                transition: 'width 0.3s ease',
              }}
            />
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: '#64748b', textAlign: 'right' }}>
            {update.percent}%
          </p>
        </div>
      )}

      {/* Error message */}
      {update.status === 'error' && update.errorMessage && (
        <p style={{ margin: '0 0 10px', fontSize: 12, color: '#f87171' }}>
          {update.errorMessage}
        </p>
      )}

      {/* Action buttons */}
      {update.status === 'downloaded' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleInstall}
            type="button"
            style={{
              flex: 1,
              padding: '8px 16px',
              background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Restart & Update
          </button>
          <button
            onClick={handleDismiss}
            type="button"
            style={{
              padding: '8px 16px',
              background: 'rgba(255,255,255,0.05)',
              color: '#94a3b8',
              border: '1px solid #334155',
              borderRadius: 8,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Later
          </button>
        </div>
      )}
    </div>
  )
}
