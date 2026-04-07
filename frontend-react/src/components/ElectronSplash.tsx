interface StartupStatus {
  message: string
  progress: number  // -1 = error, 0-100 = percent
}

interface ElectronSplashProps {
  status: StartupStatus
}

/**
 * ElectronSplash — shown only in Electron during backend startup.
 * Receives status as a prop from App.tsx (single IPC listener there).
 * Uses only inline styles — renders before Tailwind or fonts are parsed.
 */
export default function ElectronSplash({ status }: ElectronSplashProps) {
  const isError = status.progress === -1

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 320, width: '100%', padding: '0 24px' }}>
        {/* App logo */}
        <img
          src="./valoryx-logo.svg"
          alt="Valoryx"
          style={{ width: 90, height: 90, objectFit: 'contain', marginBottom: 24, borderRadius: 18, display: 'block', margin: '0 auto 24px' }}
        />

        {/* Progress bar — only when loading */}
        {!isError && (
          <div
            style={{
              width: '100%',
              height: 3,
              background: 'rgba(255,255,255,0.1)',
              borderRadius: 2,
              marginBottom: 20,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.max(0, status.progress)}%`,
                background: 'linear-gradient(90deg, #60a5fa, #a78bfa)',
                borderRadius: 2,
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        )}

        {/* Spinner — only when loading */}
        {!isError && (
          <div
            style={{
              width: 32,
              height: 32,
              border: '3px solid rgba(255,255,255,0.1)',
              borderTopColor: '#60a5fa',
              borderRadius: '50%',
              animation: 'ryx-spin 0.8s linear infinite',
              margin: '0 auto 16px',
            }}
          />
        )}

        {/* Error icon */}
        {isError && (
          <div style={{ fontSize: 36, marginBottom: 16 }}>⚠️</div>
        )}

        {/* Status message */}
        <p style={{ color: isError ? '#f87171' : '#94a3b8', fontSize: 13, margin: 0 }}>
          {status.message}
        </p>

        {/* Restart hint on error */}
        {isError && (
          <p style={{ color: '#64748b', fontSize: 12, marginTop: 8 }}>
            Close and reopen the app to try again.
          </p>
        )}
      </div>

      <style>{`@keyframes ryx-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
