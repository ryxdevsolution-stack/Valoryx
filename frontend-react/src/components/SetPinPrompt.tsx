/**
 * SetPinPrompt — after a password login, staff / managers without a PIN are asked once
 * to set their own 4-digit PIN. "Later" hides it for this user on this device; they can
 * still set it any time in My Profile → Account.
 *
 * Right after login the server accepts the PIN without the password again; if that
 * window has passed it answers PASSWORD_REQUIRED and we ask for the password.
 */
import { useState } from 'react'
import { KeyRound, Loader2 } from 'lucide-react'
import { useClient } from '@/contexts/ClientContext'
import pinService, { PIN_PATTERN, PASSWORD_REQUIRED, pinError } from '@/services/pinService'

const dismissKey = (userId: string) => `pin_prompt_dismissed:${userId}`

function wasDismissed(userId: string): boolean {
  try { return localStorage.getItem(dismissKey(userId)) === '1' } catch { return false }
}

const INPUT =
  'w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent'

export default function SetPinPrompt() {
  const { user, refreshUserData } = useClient()
  const [hidden, setHidden] = useState(false)
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [password, setPassword] = useState('')
  const [needPassword, setNeedPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!user?.pin_eligible || user.has_pin || hidden || wasDismissed(user.user_id)) return null

  const later = () => {
    try { localStorage.setItem(dismissKey(user.user_id), '1') } catch { /* private mode: just hide */ }
    setHidden(true)
  }
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 4)

  const save = async () => {
    setError('')
    if (!PIN_PATTERN.test(pin)) return setError('PIN must be exactly 4 digits')
    if (pin !== confirm) return setError('The two PINs do not match')
    setBusy(true)
    try {
      await pinService.setOwnPin(pin, needPassword ? password : undefined)
      await refreshUserData()
      setHidden(true)
    } catch (err) {
      const { message, code } = pinError(err)
      if (code === PASSWORD_REQUIRED) setNeedPassword(true)
      setError(code === PASSWORD_REQUIRED ? 'Please enter your password to set your PIN.' : message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="set-pin-title">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-800 shadow-xl p-6">
        <div className="flex items-center gap-3 mb-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-900/30">
            <KeyRound className="w-5 h-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
          </span>
          <h2 id="set-pin-title" className="text-lg font-semibold text-gray-900 dark:text-white">Set your login PIN</h2>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Next time, log in with your email and a 4-digit PIN instead of your password.
        </p>

        <form onSubmit={(e) => { e.preventDefault(); save() }} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="prompt-pin" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">PIN</label>
              <input id="prompt-pin" type="password" inputMode="numeric" autoComplete="off" maxLength={4} autoFocus
                value={pin} onChange={(e) => setPin(digits(e.target.value))} className={`${INPUT} tracking-[0.4em]`} placeholder="4 digits" />
            </div>
            <div>
              <label htmlFor="prompt-pin-confirm" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirm</label>
              <input id="prompt-pin-confirm" type="password" inputMode="numeric" autoComplete="off" maxLength={4}
                value={confirm} onChange={(e) => setConfirm(digits(e.target.value))} className={`${INPUT} tracking-[0.4em]`} placeholder="4 digits" />
            </div>
          </div>
          {needPassword && (
            <div>
              <label htmlFor="prompt-pin-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
              <input id="prompt-pin-password" type="password" autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)} className={INPUT} />
            </div>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400">Avoid obvious PINs like 1111 or 1234.</p>
          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={later}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg">
              Later
            </button>
            <button type="submit" disabled={busy || pin.length !== 4 || confirm.length !== 4 || (needPassword && !password)}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save PIN
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
