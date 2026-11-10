/**
 * MyPinCard — My Profile → Account: a staff member / manager sets, changes or removes
 * their own 4-digit login PIN. Always asks for the current password, so nobody at an
 * unattended counter can change it.
 */
import { useState } from 'react'
import { KeyRound, Loader2 } from 'lucide-react'
import { useClient } from '@/contexts/ClientContext'
import pinService, { PIN_PATTERN, pinError } from '@/services/pinService'

const INPUT =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-transparent'

export default function MyPinCard({ onMessage }: { onMessage: (m: { type: 'success' | 'error'; text: string }) => void }) {
  const { user, refreshUserData } = useClient()
  const [open, setOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  if (!user?.pin_eligible) return null
  const hasPin = !!user.has_pin
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 4)
  const reset = () => { setOpen(false); setPin(''); setConfirm(''); setPassword('') }

  const save = async () => {
    if (!PIN_PATTERN.test(pin)) return onMessage({ type: 'error', text: 'PIN must be exactly 4 digits' })
    if (pin !== confirm) return onMessage({ type: 'error', text: 'The two PINs do not match' })
    setBusy(true)
    try {
      await pinService.setOwnPin(pin, password)
      await refreshUserData()
      onMessage({ type: 'success', text: 'PIN saved. You can now log in with your email and PIN.' })
      reset()
    } catch (err) {
      onMessage({ type: 'error', text: pinError(err).message })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!password) return onMessage({ type: 'error', text: 'Enter your current password to remove your PIN' })
    setBusy(true)
    try {
      await pinService.removeOwnPin(password)
      await refreshUserData()
      onMessage({ type: 'success', text: 'PIN removed. Use your password to log in.' })
      reset()
    } catch (err) {
      onMessage({ type: 'error', text: pinError(err).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
        <KeyRound className="w-4 h-4" aria-hidden="true" /> Login PIN
      </h4>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-3">
        {hasPin ? 'You can log in with your email and 4-digit PIN.' : 'Set a 4-digit PIN to log in faster than with your password.'}
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
        >
          <KeyRound className="w-4 h-4" aria-hidden="true" />
          {hasPin ? 'Change PIN' : 'Set PIN'}
        </button>
      ) : (
        <div className="space-y-3 max-w-sm">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="my-pin" className="text-sm font-medium text-gray-700 dark:text-gray-300">New PIN</label>
              <input id="my-pin" type="password" inputMode="numeric" autoComplete="off" maxLength={4}
                value={pin} onChange={(e) => setPin(digits(e.target.value))} className={`${INPUT} tracking-[0.4em]`} placeholder="4 digits" />
            </div>
            <div className="space-y-1">
              <label htmlFor="my-pin-confirm" className="text-sm font-medium text-gray-700 dark:text-gray-300">Confirm PIN</label>
              <input id="my-pin-confirm" type="password" inputMode="numeric" autoComplete="off" maxLength={4}
                value={confirm} onChange={(e) => setConfirm(digits(e.target.value))} className={`${INPUT} tracking-[0.4em]`} placeholder="4 digits" />
            </div>
          </div>
          <div className="space-y-1">
            <label htmlFor="my-pin-password" className="text-sm font-medium text-gray-700 dark:text-gray-300">Current password</label>
            <input id="my-pin-password" type="password" autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} className={INPUT} placeholder="To confirm it's you" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={reset}
              className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
              Cancel
            </button>
            <button type="button" onClick={save} disabled={busy || pin.length !== 4 || confirm.length !== 4 || !password}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-900 dark:bg-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              Save PIN
            </button>
            {hasPin && (
              <button type="button" onClick={remove} disabled={busy || !password}
                className="text-sm text-red-600 dark:text-red-400 hover:underline underline-offset-2 disabled:opacity-50">
                Remove PIN
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
