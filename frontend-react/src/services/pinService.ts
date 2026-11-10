/** Your own quick-login PIN (staff / managers). Owners set others' PINs via teamService. */
import api from '@/lib/api'

export const PIN_PATTERN = /^\d{4}$/

/** Server says the current password is needed (not a fresh login, or changing an existing PIN). */
export const PASSWORD_REQUIRED = 'PASSWORD_REQUIRED'

const pinService = {
  /** currentPassword may be omitted only for a first PIN right after a password login. */
  setOwnPin: (pin: string, currentPassword?: string) =>
    api.put('/profile/pin', currentPassword ? { pin, current_password: currentPassword } : { pin }),

  removeOwnPin: (currentPassword: string) =>
    api.delete('/profile/pin', { data: { current_password: currentPassword } }),
}

export default pinService

/** Pull the server's message / code out of an axios error. */
export function pinError(err: unknown): { message: string; code?: string } {
  const data = (err as { response?: { data?: { error?: string; code?: string } } })?.response?.data
  return { message: data?.error || 'Something went wrong. Please try again.', code: data?.code }
}
