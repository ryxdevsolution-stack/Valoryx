import React, { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { useClient } from '@/contexts/ClientContext'
import { ShieldCheck, ShieldOff, Copy, RefreshCw, AlertTriangle, Eye, EyeOff } from 'lucide-react'

export default function TwoFactorTab() {
  const { user, refreshUserData } = useClient()
  const [step, setStep] = useState<'idle' | 'setup' | 'backup_codes' | 'disable' | 'regen'>('idle')
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [codesRemaining, setCodesRemaining] = useState<number | null>(null)
  const [showSecret, setShowSecret] = useState(false)
  const [copiedAll, setCopiedAll] = useState(false)

  const isEnabled = user?.totp_enabled ?? false

  const fetchCodesRemaining = useCallback(async () => {
    if (!isEnabled) return
    try {
      const res = await api.get('/totp/backup-codes')
      setCodesRemaining(res.data.remaining)
    } catch {
      // silent
    }
  }, [isEnabled])

  useEffect(() => {
    fetchCodesRemaining()
  }, [fetchCodesRemaining])

  const resetState = () => {
    setStep('idle')
    setCode('')
    setError('')
    setBackupCodes([])
    setShowSecret(false)
  }

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
      const res = await api.post('/totp/enable', { code })
      setBackupCodes(res.data.backup_codes || [])
      setStep('backup_codes')
      setCode('')
      await refreshUserData()
      await fetchCodesRemaining()
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
      resetState()
      setCodesRemaining(null)
      await refreshUserData()
    } catch (e: any) {
      setError(e.response?.data?.error || 'Invalid code. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const confirmRegen = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.post('/totp/regenerate-backup-codes', { code })
      setBackupCodes(res.data.backup_codes || [])
      setStep('backup_codes')
      setCode('')
      await fetchCodesRemaining()
    } catch (e: any) {
      setError(e.response?.data?.error || 'Invalid code. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const copyAllCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n'))
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 2000)
  }

  const codeInput = (placeholder = '000000', numeric = true) => (
    <input
      type="text"
      inputMode={numeric ? 'numeric' : 'text'}
      value={code}
      onChange={e => setCode(
        numeric
          ? e.target.value.replace(/\D/g, '').slice(0, 6)
          : e.target.value.toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 8)
      )}
      placeholder={placeholder}
      maxLength={numeric ? 6 : 8}
      autoFocus
      className="w-full px-4 py-3 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/15 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-600 outline-none focus:ring-2 focus:ring-violet-500 text-center text-2xl tracking-[0.4em] font-mono"
    />
  )

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Two-Factor Authentication</h3>
        <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
          Add an extra layer of security. After enabling, you will need a 6-digit code from your
          authenticator app every time you log in.
        </p>
      </div>

      {error && (
        <p className="text-red-500 text-sm bg-red-50 dark:bg-red-400/10 border border-red-200 dark:border-red-400/20 px-3 py-2 rounded-lg">
          {error}
        </p>
      )}
      {success && (
        <p className="text-green-600 text-sm bg-green-50 dark:bg-green-400/10 border border-green-200 dark:border-green-400/20 px-3 py-2 rounded-lg">
          {success}
        </p>
      )}

      {/* ── IDLE: status card ── */}
      {step === 'idle' && (
        <div className="space-y-4">
          {/* Status row */}
          <div className="flex items-center justify-between bg-gray-50 dark:bg-white/5 rounded-xl p-4 border border-gray-200 dark:border-white/10">
            <div className="flex items-center gap-3">
              {isEnabled
                ? <ShieldCheck className="w-5 h-5 text-green-500" />
                : <ShieldOff className="w-5 h-5 text-gray-400" />}
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
            </div>
            {isEnabled ? (
              <button type="button" onClick={() => { setStep('disable'); setCode(''); setError('') }}
                className="px-4 py-2 bg-red-50 dark:bg-red-500/20 text-red-600 dark:text-red-400 rounded-lg text-sm font-medium hover:bg-red-100 dark:hover:bg-red-500/30 transition-colors">
                Disable
              </button>
            ) : (
              <button type="button" onClick={startSetup} disabled={loading}
                className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors">
                {loading ? 'Loading...' : 'Enable 2FA'}
              </button>
            )}
          </div>

          {/* Backup codes section (only when enabled) */}
          {isEnabled && (
            <div className="rounded-xl border border-gray-200 dark:border-white/10 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Backup Codes</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                    Use these if you lose access to your authenticator app.
                    {codesRemaining !== null && (
                      <span className={`ml-1 font-medium ${codesRemaining <= 2 ? 'text-red-500' : 'text-gray-600 dark:text-slate-300'}`}>
                        {codesRemaining} remaining.
                      </span>
                    )}
                  </p>
                </div>
                <button type="button" onClick={() => { setStep('regen'); setCode(''); setError('') }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-500/20 transition-colors">
                  <RefreshCw className="w-3.5 h-3.5" />
                  Regenerate
                </button>
              </div>
              {codesRemaining !== null && codesRemaining <= 2 && (
                <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-400/10 border border-amber-200 dark:border-amber-400/20 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    You're running low on backup codes. Regenerate them before you run out.
                  </p>
                </div>
              )}
              <p className="text-xs text-gray-400 dark:text-slate-500">
                Lost your device? <a href="/frontend/2fa-recover" className="text-violet-600 dark:text-violet-400 underline hover:no-underline">Request recovery by email</a>
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── SETUP: QR + manual secret ── */}
      {step === 'setup' && (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-slate-300 text-sm">
            Scan this QR code with Google Authenticator, Authy, or any TOTP app, then enter the
            6-digit code below to confirm.
          </p>

          <div className="flex justify-center bg-white p-4 rounded-xl border border-gray-200 dark:border-white/10">
            <img src={qrCode} alt="2FA QR Code" className="w-48 h-48" />
          </div>

          <div className="bg-gray-50 dark:bg-white/5 rounded-lg p-3 border border-gray-200 dark:border-white/10">
            <div className="flex items-center justify-between mb-1">
              <p className="text-gray-500 dark:text-slate-500 text-xs">Can't scan? Enter this key manually:</p>
              <button type="button" onClick={() => setShowSecret(v => !v)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300">
                {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            {showSecret
              ? <code className="text-violet-600 dark:text-violet-300 text-sm font-mono break-all select-all block text-center">{secret}</code>
              : <div className="text-center text-sm text-gray-400 dark:text-slate-500 tracking-widest">••••••••••••••••</div>
            }
          </div>

          {codeInput()}

          <div className="flex gap-3">
            <button type="button" onClick={resetState}
              className="flex-1 py-2.5 bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 transition-colors font-medium">
              Cancel
            </button>
            <button type="button" onClick={confirmEnable} disabled={loading || code.length < 6}
              className="flex-1 py-2.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors font-medium">
              {loading ? 'Verifying...' : 'Confirm & Enable'}
            </button>
          </div>
        </div>
      )}

      {/* ── BACKUP CODES: shown once after enable or regenerate ── */}
      {step === 'backup_codes' && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-400/10 border border-amber-200 dark:border-amber-400/20 rounded-xl px-4 py-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Save these backup codes now</p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                These are shown <strong>only once</strong>. Store them somewhere safe. Each code can be used once
                to log in if you lose your authenticator app.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {backupCodes.map((c, i) => (
              <div key={i} className="flex items-center justify-between bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2">
                <code className="text-sm font-mono text-gray-800 dark:text-slate-200 tracking-widest">{c}</code>
              </div>
            ))}
          </div>

          <button type="button" onClick={copyAllCodes}
            className="w-full flex items-center justify-center gap-2 py-2.5 border border-gray-200 dark:border-white/15 rounded-lg text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
            <Copy className="w-4 h-4" />
            {copiedAll ? 'Copied!' : 'Copy all codes'}
          </button>

          <button type="button" onClick={() => { setStep('idle'); setBackupCodes([]); setSuccess('2FA is now active. Keep your backup codes safe.') }}
            className="w-full py-2.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors font-medium">
            I've saved my backup codes
          </button>
        </div>
      )}

      {/* ── DISABLE ── */}
      {step === 'disable' && (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-slate-300 text-sm">
            Enter your current 6-digit 2FA code to confirm disabling two-factor authentication.
          </p>
          {codeInput()}
          <div className="flex gap-3">
            <button type="button" onClick={resetState}
              className="flex-1 py-2.5 bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 transition-colors font-medium">
              Cancel
            </button>
            <button type="button" onClick={confirmDisable} disabled={loading || code.length < 6}
              className="flex-1 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors font-medium">
              {loading ? 'Disabling...' : 'Disable 2FA'}
            </button>
          </div>
        </div>
      )}

      {/* ── REGENERATE BACKUP CODES ── */}
      {step === 'regen' && (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-slate-300 text-sm">
            Enter your current 6-digit 2FA code to regenerate backup codes. Your old backup codes will
            be permanently invalidated.
          </p>
          {codeInput()}
          <div className="flex gap-3">
            <button type="button" onClick={resetState}
              className="flex-1 py-2.5 bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 transition-colors font-medium">
              Cancel
            </button>
            <button type="button" onClick={confirmRegen} disabled={loading || code.length < 6}
              className="flex-1 py-2.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors font-medium">
              {loading ? 'Generating...' : 'Regenerate Codes'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
