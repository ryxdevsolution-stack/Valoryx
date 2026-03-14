import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '@/lib/api'
import { ShieldOff, Loader2 } from 'lucide-react'

export default function TwoFactorRecover() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token')

  // Token confirmation mode (came from email link)
  const [confirming, setConfirming] = useState(false)
  const [confirmResult, setConfirmResult] = useState<'success' | 'error' | null>(null)
  const [confirmMessage, setConfirmMessage] = useState('')

  // Request mode (fill in email + password)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  // If a token is in the URL, confirm it immediately
  useEffect(() => {
    if (!token) return
    setConfirming(true)
    api.post('/totp/recover/confirm', { token })
      .then(() => {
        setConfirmResult('success')
        setConfirmMessage('2FA has been disabled. You can now log in with your password.')
      })
      .catch((e) => {
        setConfirmResult('error')
        setConfirmMessage(e.response?.data?.error || 'Invalid or expired recovery link.')
      })
      .finally(() => setConfirming(false))
  }, [token])

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) return
    setLoading(true)
    setError('')
    try {
      await api.post('/totp/recover', { email, password })
      setSent(true)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Confirming token from email ──
  if (token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 w-full max-w-md text-center space-y-4">
          <ShieldOff className="w-10 h-10 mx-auto text-violet-600" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">2FA Recovery</h1>

          {confirming && (
            <div className="flex items-center justify-center gap-2 text-gray-500 dark:text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Processing recovery link…</span>
            </div>
          )}

          {confirmResult === 'success' && (
            <>
              <p className="text-green-600 dark:text-green-400 text-sm">{confirmMessage}</p>
              <button type="button" onClick={() => navigate('/auth/login')}
                className="w-full py-2.5 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700 transition-colors">
                Go to Login
              </button>
            </>
          )}

          {confirmResult === 'error' && (
            <>
              <p className="text-red-500 text-sm">{confirmMessage}</p>
              <button type="button" onClick={() => navigate('/2fa-recover')}
                className="w-full py-2.5 bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-slate-300 rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-white/10 transition-colors">
                Request New Recovery Link
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── Request recovery email ──
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 w-full max-w-md space-y-5">
        <div className="text-center">
          <ShieldOff className="w-10 h-10 mx-auto text-violet-600 mb-3" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Lost Access to 2FA?</h1>
          <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
            Enter your email and password. We'll send a one-time recovery link to your email
            to disable two-factor authentication.
          </p>
        </div>

        {sent ? (
          <div className="text-center space-y-4">
            <div className="bg-green-50 dark:bg-green-400/10 border border-green-200 dark:border-green-400/20 rounded-xl px-4 py-3">
              <p className="text-green-700 dark:text-green-300 text-sm font-medium">Recovery email sent</p>
              <p className="text-green-600 dark:text-green-400 text-xs mt-1">
                If your email and password matched an account with 2FA enabled, a recovery link has been sent.
                Check your inbox (and spam folder).
              </p>
            </div>
            <button type="button" onClick={() => navigate('/auth/login')}
              className="w-full py-2.5 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700 transition-colors">
              Back to Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleRequest} className="space-y-4">
            {error && (
              <p className="text-red-500 text-sm bg-red-50 dark:bg-red-400/10 border border-red-200 dark:border-red-400/20 px-3 py-2 rounded-lg">
                {error}
              </p>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Email Address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com" required
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/15 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-600 outline-none focus:ring-2 focus:ring-violet-500 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Your account password" required
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/15 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-600 outline-none focus:ring-2 focus:ring-violet-500 text-sm" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700 disabled:opacity-60 transition-colors">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Sending…' : 'Send Recovery Email'}
            </button>
            <button type="button" onClick={() => navigate('/auth/login')}
              className="w-full py-2 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 transition-colors">
              Back to Login
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
