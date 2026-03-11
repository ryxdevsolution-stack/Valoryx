import React, { useState } from 'react'
import api from '@/lib/api'
import { useClient } from '@/contexts/ClientContext'

export default function TwoFactorTab() {
  const { user, refreshUserData } = useClient()
  const [step, setStep] = useState<'idle' | 'setup' | 'disable'>('idle')
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const isEnabled = user?.totp_enabled ?? false

  const startSetup = async () => {
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const res = await api.post('/totp/setup')
      setQrCode(res.data.data.qr_code)
      setSecret(res.data.data.secret)
      setStep('setup')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Setup failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const confirmEnable = async () => {
    setLoading(true)
    setError('')
    try {
      await api.post('/totp/enable', { code })
      setSuccess('2FA enabled successfully.')
      setStep('idle')
      setCode('')
      await refreshUserData()
    } catch (e: any) {
      setError(e.response?.data?.error || 'Invalid code. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const confirmDisable = async () => {
    setLoading(true)
    setError('')
    try {
      await api.post('/totp/disable', { code })
      setSuccess('2FA disabled.')
      setStep('idle')
      setCode('')
      await refreshUserData()
    } catch (e: any) {
      setError(e.response?.data?.error || 'Invalid code. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleCancelStep = () => {
    setStep('idle')
    setCode('')
    setError('')
  }

  const codeInput = (
    <input
      type="text"
      inputMode="numeric"
      value={code}
      onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
      placeholder="000000"
      maxLength={6}
      autoFocus
      className="w-full px-4 py-3 bg-white/5 border border-white/15 rounded-lg text-white placeholder-slate-600 outline-none focus:ring-2 focus:ring-violet-500 text-center text-2xl tracking-[0.5em] font-mono"
    />
  )

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
        Two-Factor Authentication
      </h3>
      <p className="text-gray-500 dark:text-slate-400 text-sm mb-6">
        Add an extra layer of security. After enabling, you will need a 6-digit code from Google
        Authenticator (or any TOTP app) every time you log in.
      </p>

      {error && (
        <p className="text-red-400 text-sm mb-4 bg-red-400/10 border border-red-400/20 px-3 py-2 rounded-lg">
          {error}
        </p>
      )}
      {success && (
        <p className="text-green-400 text-sm mb-4 bg-green-400/10 border border-green-400/20 px-3 py-2 rounded-lg">
          {success}
        </p>
      )}

      {step === 'idle' && (
        <div className="flex items-center justify-between bg-gray-50 dark:bg-white/5 rounded-xl p-4 border border-gray-200 dark:border-white/10">
          <div>
            <div className="text-gray-900 dark:text-white font-medium">
              {isEnabled ? '2FA Enabled' : '2FA Disabled'}
            </div>
            <div className="text-gray-500 dark:text-slate-400 text-sm mt-0.5">
              {isEnabled
                ? 'Your account is protected by an authenticator app.'
                : 'Enable to add a second verification step on login.'}
            </div>
          </div>
          {isEnabled ? (
            <button
              type="button"
              onClick={() => { setStep('disable'); setCode(''); setError('') }}
              className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg text-sm font-medium hover:bg-red-500/30 transition-colors"
            >
              Disable
            </button>
          ) : (
            <button
              type="button"
              onClick={startSetup}
              disabled={loading}
              className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Loading...' : 'Enable 2FA'}
            </button>
          )}
        </div>
      )}

      {step === 'setup' && (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-slate-300 text-sm">
            Scan this QR code with Google Authenticator, Authy, or any TOTP app, then enter the
            6-digit code below to confirm.
          </p>

          {/* QR Code */}
          <div className="flex justify-center bg-white p-4 rounded-xl border border-gray-200 dark:border-white/10">
            <img src={qrCode} alt="2FA QR Code" className="w-48 h-48" />
          </div>

          {/* Manual entry fallback */}
          <div className="bg-gray-50 dark:bg-white/5 rounded-lg p-3 text-center border border-gray-200 dark:border-white/10">
            <p className="text-gray-500 dark:text-slate-500 text-xs mb-1">
              Can't scan? Enter this key manually in your app:
            </p>
            <code className="text-violet-600 dark:text-violet-300 text-sm font-mono break-all select-all">
              {secret}
            </code>
          </div>

          {/* Code input */}
          {codeInput}

          {error && (
            <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleCancelStep}
              className="flex-1 py-2.5 bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmEnable}
              disabled={loading || code.length < 6}
              className="flex-1 py-2.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors font-medium"
            >
              {loading ? 'Verifying...' : 'Confirm & Enable'}
            </button>
          </div>
        </div>
      )}

      {step === 'disable' && (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-slate-300 text-sm">
            Enter your current 2FA code from your authenticator app to confirm disabling
            two-factor authentication.
          </p>

          {/* Code input */}
          {codeInput}

          {error && (
            <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleCancelStep}
              className="flex-1 py-2.5 bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDisable}
              disabled={loading || code.length < 6}
              className="flex-1 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors font-medium"
            >
              {loading ? 'Disabling...' : 'Disable 2FA'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
