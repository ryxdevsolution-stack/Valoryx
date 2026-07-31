import { useState } from 'react'
import api from '@/lib/api'
import { useDesktopGoogleHandoff } from '@/hooks/useDesktopGoogleHandoff'

/**
 * First-run screen for the desktop app: pulls this account's data from the
 * cloud into the local SQLite database so the app can run offline.
 *
 * Two ways to prove you own the account. Password is the original; Google is
 * required because accounts created with Google sign-in hold a random password
 * hash their owner can never type, which used to make this screen a dead end
 * for them — no way forward, no way past it.
 *
 * This screen only syncs data. Signing in happens afterwards on the normal
 * login screen, which works once the local user record exists.
 */

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', padding: '10px 14px', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8, color: '#f1f5f9', fontSize: 14, outline: 'none',
}

const LABEL_STYLE: React.CSSProperties = {
  display: 'block', color: '#94a3b8', fontSize: 13, marginBottom: 6,
}

function describeSetupError(err: any): string {
  // The backend picks its own wording per failure (bad credentials, expired
  // sign-in, unknown account…) — prefer it over anything guessed here.
  const fromServer = err?.response?.data?.error
  if (fromServer) return fromServer
  // No response at all: a timeout, or the local backend went away mid-sync.
  // Must not blame credentials — the Google path doesn't have any.
  return 'Setup could not be completed. Check your connection and try again.'
}

export default function ElectronSetup({
  onComplete,
  googleEnabled = false,
}: {
  onComplete: () => void
  /** Whether this build's backend can verify Google sign-in assertions. */
  googleEnabled?: boolean
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<'form' | 'syncing'>('form')

  // Both identity paths end in the same request; only the proof differs.
  async function runSetup(body: Record<string, unknown>) {
    setError('')
    setLoading(true)
    setStep('syncing')
    try {
      await api.post('/electron/setup', body)
      onComplete()
    } catch (err: any) {
      setError(describeSetupError(err))
      setStep('form')
    } finally {
      setLoading(false)
    }
  }

  const google = useDesktopGoogleHandoff(handoff =>
    runSetup({ assertion: handoff.assertion, verifier: handoff.verifier }),
  )

  const showGoogle = googleEnabled && google.available

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    runSetup({ email, password })
  }

  async function submitPastedCode() {
    setError('')
    const message = await google.submitCode()
    if (message) setError(message)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <div style={{
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 16, padding: 40, width: 380,
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src="./valoryx-logo.svg" alt="Valoryx"
            style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 12, marginBottom: 12 }} />
          <h1 style={{ color: '#f1f5f9', fontSize: 22, fontWeight: 700, margin: 0 }}>
            Connect Your Account
          </h1>
          <p style={{ color: '#64748b', fontSize: 13, marginTop: 6 }}>
            Sign in with your Valoryx account to sync your data
          </p>
        </div>

        {step === 'syncing' ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{
              width: 40, height: 40,
              border: '3px solid rgba(255,255,255,0.1)',
              borderTopColor: '#60a5fa',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 16px',
            }} />
            <p style={{ color: '#94a3b8', fontSize: 14 }}>Syncing your data…</p>
            <p style={{ color: '#475569', fontSize: 12 }}>This may take a moment</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : (
          <>
            {showGoogle && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setError('')
                    if (!google.start()) setError('Google sign-in is not available right now.')
                  }}
                  disabled={google.waiting || loading}
                  style={{
                    width: '100%', padding: '12px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                    background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 8, color: '#f1f5f9', fontSize: 14, fontWeight: 600,
                    cursor: google.waiting || loading ? 'not-allowed' : 'pointer',
                    opacity: google.waiting || loading ? 0.6 : 1,
                  }}
                >
                  <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, flexShrink: 0 }} xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  {google.waiting ? 'Waiting for browser…' : 'Continue with Google'}
                </button>

                {google.waiting && (
                  <div style={{ marginTop: 12 }}>
                    <p style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center' }}>
                      Complete sign-in in your browser, then return to this window.
                    </p>
                    {/* The browser hands this app its assertion over the valoryx://
                        scheme, which silently fails when the OS has no handler for
                        it — a real risk on a machine that has never run Valoryx.
                        Pasting the code performs the same exchange; the PKCE
                        verifier still never leaves this process. */}
                    {!google.showCodeEntry ? (
                      <button
                        type="button"
                        onClick={() => google.setShowCodeEntry(true)}
                        style={{
                          width: '100%', marginTop: 8, background: 'none', border: 'none',
                          color: '#94a3b8', fontSize: 12, textDecoration: 'underline',
                          cursor: 'pointer', padding: 4,
                        }}
                      >
                        App didn't open? Paste the sign-in code instead
                      </button>
                    ) : (
                      <div style={{ marginTop: 8 }}>
                        <label htmlFor="setup-oauth-code" style={LABEL_STYLE}>
                          Sign-in code from the browser
                        </label>
                        <textarea
                          id="setup-oauth-code"
                          value={google.pastedCode}
                          onChange={e => google.setPastedCode(e.target.value)}
                          rows={3}
                          placeholder="Paste the code shown in your browser…"
                          style={{ ...INPUT_STYLE, fontSize: 11, fontFamily: 'monospace', resize: 'none' }}
                        />
                        <button
                          type="button"
                          onClick={submitPastedCode}
                          disabled={!google.pastedCode.trim() || google.redeeming}
                          style={{
                            width: '100%', marginTop: 8, padding: '10px',
                            background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                            border: 'none', borderRadius: 8, color: '#fff',
                            fontSize: 14, fontWeight: 600,
                            cursor: !google.pastedCode.trim() || google.redeeming ? 'not-allowed' : 'pointer',
                            opacity: !google.pastedCode.trim() || google.redeeming ? 0.5 : 1,
                          }}
                        >
                          {google.redeeming ? 'Connecting…' : 'Continue with this code'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0',
                  color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1,
                }}>
                  <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
                  or
                  <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
                </div>
              </>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label htmlFor="setup-email" style={LABEL_STYLE}>Email</label>
                <input
                  id="setup-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  style={INPUT_STYLE}
                />
              </div>

              <div style={{ marginBottom: 24 }}>
                <label htmlFor="setup-password" style={LABEL_STYLE}>Password</label>
                <input
                  id="setup-password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  style={INPUT_STYLE}
                />
              </div>

              {error && (
                <div style={{
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 8, padding: '10px 14px', marginBottom: 16,
                  color: '#f87171', fontSize: 13,
                }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%', padding: '12px',
                  background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                  border: 'none', borderRadius: 8,
                  color: '#fff', fontSize: 15, fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                }}
              >
                Connect &amp; Sync
              </button>

              <p style={{ color: '#475569', fontSize: 12, textAlign: 'center', marginTop: 16 }}>
                Requires internet on first launch only
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
