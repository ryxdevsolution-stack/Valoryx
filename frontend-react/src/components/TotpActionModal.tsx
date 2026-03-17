import React, { useState, useEffect } from 'react'
import { ShieldCheck, X } from 'lucide-react'
import api from '@/lib/api'

interface Props {
  isOpen: boolean
  /** Short description shown to user, e.g. "delete your account" or "add a team member" */
  actionLabel: string
  /** Called with the action_token once the code is verified successfully */
  onVerified: (actionToken: string) => void
  onClose: () => void
}

/**
 * Reusable TOTP verification modal for sensitive in-app actions.
 *
 * Flow:
 *   1. User enters their 6-digit authenticator code (or 8-char backup code)
 *   2. Component calls POST /api/totp/verify-action
 *   3. On success, calls onVerified(action_token)
 *   4. Caller attaches action_token to the real action request body
 */
export default function TotpActionModal({ isOpen, actionLabel, onVerified, onClose }: Props) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Reset state whenever the modal opens
  useEffect(() => {
    if (isOpen) {
      setCode('')
      setError('')
      setLoading(false)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleVerify = async () => {
    const trimmed = code.trim()
    if (trimmed.length !== 6 && trimmed.length !== 8) {
      setError('Enter your 6-digit app code or 8-character backup code.')
      return
    }

    setLoading(true)
    setError('')
    try {
      const res = await api.post('/totp/verify-action', { code: trimmed })
      onVerified(res.data.action_token)
    } catch (e: any) {
      setError(e.response?.data?.error || 'Invalid code. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleVerify()
    if (e.key === 'Escape') onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="relative w-full sm:max-w-md mx-0 sm:mx-auto rounded-t-2xl sm:rounded-2xl max-h-[85vh] sm:max-h-none overflow-y-auto bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700 p-6">
        {/* Mobile drag handle */}
        <div className="flex justify-center pt-2 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        </div>
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icon + heading */}
        <div className="flex flex-col items-center text-center mb-5">
          <div className="w-12 h-12 rounded-full bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center mb-3">
            <ShieldCheck className="w-6 h-6 text-violet-600 dark:text-violet-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Verify your identity
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Enter your authenticator code to {actionLabel}.
          </p>
        </div>

        {/* Code input */}
        <input
          type="text"
          inputMode="numeric"
          value={code}
          onChange={e => setCode(e.target.value.replace(/\s/g, '').slice(0, 8))}
          onKeyDown={handleKeyDown}
          placeholder="000000"
          maxLength={8}
          autoFocus
          className="w-full px-4 py-3 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/15 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-600 outline-none focus:ring-2 focus:ring-violet-500 text-center text-2xl tracking-[0.5em] font-mono mb-2"
        />
        <p className="text-xs text-gray-400 dark:text-slate-500 text-center mb-4">
          6-digit app code or 8-character backup code
        </p>

        {error && (
          <p className="text-sm text-red-500 bg-red-50 dark:bg-red-400/10 border border-red-200 dark:border-red-400/20 rounded-lg px-3 py-2 mb-4 text-center">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 transition-colors font-medium text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleVerify}
            disabled={loading || (code.length !== 6 && code.length !== 8)}
            className="flex-1 py-2.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm"
          >
            {loading ? 'Verifying…' : 'Verify'}
          </button>
        </div>
      </div>
    </div>
  )
}
