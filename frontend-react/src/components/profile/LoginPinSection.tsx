/**
 * LoginPinSection — owner sets / removes a staff or manager's 4-digit login PIN.
 *
 * With a PIN the team member can log in with email + PIN instead of their password.
 * The PIN is sent once and stored hashed; it is never shown again. 5 wrong PINs lock
 * PIN login for 15 minutes — setting a new PIN here clears the lock.
 */
import { useState } from 'react'
import { KeyRound, Loader2 } from 'lucide-react'
import teamService from '@/services/teamService'

interface LoginPinSectionProps {
  userId: string
  userName: string
  hasPin: boolean
  onMessage: (msg: { type: 'success' | 'error'; text: string }) => void
  onChanged: (hasPin: boolean) => void
}

const PIN_RE = /^\d{4}$/

export default function LoginPinSection({ userId, userName, hasPin, onMessage, onChanged }: LoginPinSectionProps) {
  const [editing, setEditing] = useState(false)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)

  const errorText = (err: unknown, fallback: string) =>
    (err as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback

  const save = async () => {
    if (!PIN_RE.test(pin)) {
      onMessage({ type: 'error', text: 'PIN must be exactly 4 digits' })
      return
    }
    setBusy(true)
    try {
      await teamService.setPin(userId, pin)
      onMessage({ type: 'success', text: `PIN set for ${userName}. They can now log in with their email and this PIN.` })
      setPin('')
      setEditing(false)
      onChanged(true)
    } catch (err) {
      onMessage({ type: 'error', text: errorText(err, 'Failed to set PIN') })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await teamService.removePin(userId)
      onMessage({ type: 'success', text: `PIN removed for ${userName}. They will need their password to log in.` })
      onChanged(false)
    } catch (err) {
      onMessage({ type: 'error', text: errorText(err, 'Failed to remove PIN') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <label htmlFor={`pin-${userId}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Login PIN
      </label>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
        {hasPin ? 'PIN is set — they can log in with email + PIN.' : 'No PIN — they log in with email + password.'}
      </p>
      {editing ? (
        <div className="flex gap-2">
          <input
            id={`pin-${userId}`}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save() } }}
            placeholder="4 digits"
            aria-describedby={`pin-help-${userId}`}
            className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-transparent text-sm tracking-[0.4em]"
          />
          <button
            type="button"
            onClick={save}
            disabled={busy || !PIN_RE.test(pin)}
            className="px-3 py-2 text-sm font-medium text-white bg-gray-900 dark:bg-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save PIN'}
          </button>
          <button
            type="button"
            onClick={() => { setEditing(false); setPin('') }}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline underline-offset-2"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={busy}
            className="flex items-center gap-2 px-3 py-2 text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50"
          >
            <KeyRound className="w-4 h-4" aria-hidden="true" />
            {hasPin ? 'Change PIN' : 'Set PIN'}
          </button>
          {hasPin && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="text-xs text-red-600 dark:text-red-400 hover:underline underline-offset-2 disabled:opacity-50"
            >
              Remove PIN
            </button>
          )}
        </div>
      )}
      <p id={`pin-help-${userId}`} className="sr-only">
        Avoid obvious PINs like 1111 or 1234. Five wrong tries lock PIN login for 15 minutes.
      </p>
    </div>
  )
}
