import { useState } from 'react'
import axios from 'axios'

const API = 'http://127.0.0.1:5017/api'

export default function ElectronSetup({ onComplete }: { onComplete: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<'form' | 'syncing'>('form')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    setStep('syncing')

    try {
      await axios.post(`${API}/electron/setup`, {
        email,
        password,
        server_url: 'https://valoryx.ryxtech.in',
      })
      onComplete()
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Setup failed. Check your credentials.'
      setError(msg)
      setStep('form')
    } finally {
      setLoading(false)
    }
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
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: 13, marginBottom: 6 }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                style={{
                  width: '100%', padding: '10px 14px', boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 8, color: '#f1f5f9', fontSize: 14, outline: 'none',
                }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: 13, marginBottom: 6 }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={{
                  width: '100%', padding: '10px 14px', boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 8, color: '#f1f5f9', fontSize: 14, outline: 'none',
                }}
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
        )}
      </div>
    </div>
  )
}
