/**
 * ImpersonationBanner
 *
 * Shown at the top of every page when the current JWT is an impersonation
 * (read-only) session.  Parses the token directly on the client side to detect
 * the `is_impersonation` claim — no extra API call needed.
 *
 * On "Exit impersonation", discards the impersonation token, restores the
 * admin's real token from sessionStorage, calls POST /admin/impersonate/end
 * to log the event, and navigates back to the admin clients page.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useClient } from '@/contexts/ClientContext'
import api from '@/lib/api'

function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const base64 = token.split('.')[1]
    const json = atob(base64.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json)
  } catch {
    return null
  }
}

const ADMIN_TOKEN_KEY = 'impersonation_admin_token'

export function useImpersonation() {
  const { token } = useClient()
  const [isImpersonating, setIsImpersonating] = useState(false)
  const [targetClientName, setTargetClientName] = useState('')

  useEffect(() => {
    if (!token) {
      setIsImpersonating(false)
      return
    }
    const payload = decodeJwtPayload(token)
    if (payload?.is_impersonation) {
      setIsImpersonating(true)
      setTargetClientName(payload.client_name ?? '')
    } else {
      setIsImpersonating(false)
    }
  }, [token])

  return { isImpersonating, targetClientName }
}

export function startImpersonation(impersonationToken: string, adminToken: string) {
  // Stash the real admin token so we can restore it on exit
  sessionStorage.setItem(ADMIN_TOKEN_KEY, adminToken)
  localStorage.setItem('token', impersonationToken)
}

export default function ImpersonationBanner() {
  const navigate = useNavigate()
  const { token, setClientData, logout } = useClient()
  const { isImpersonating } = useImpersonation()
  const [exiting, setExiting] = useState(false)

  if (!isImpersonating) return null

  const handleExit = async () => {
    setExiting(true)
    try {
      // Log the end of the session (best-effort)
      await api.post('/admin/impersonate/end').catch(() => {})
    } finally {
      // Restore admin token
      const adminToken = sessionStorage.getItem(ADMIN_TOKEN_KEY)
      sessionStorage.removeItem(ADMIN_TOKEN_KEY)

      if (adminToken) {
        localStorage.setItem('token', adminToken)
        // Force a full reload so ClientContext re-reads the token from storage
        window.location.href = '/admin/clients'
      } else {
        logout()
        navigate('/auth/login', { replace: true })
      }
    }
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-between text-sm font-medium shadow-lg">
      <span className="flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
        Impersonation session — <strong className="ml-1">read-only</strong>. Changes are disabled.
      </span>
      <button
        type="button"
        onClick={handleExit}
        disabled={exiting}
        className="flex items-center gap-1.5 px-3 py-1 bg-amber-950/20 hover:bg-amber-950/30 rounded-md transition-colors disabled:opacity-50 text-xs font-semibold"
      >
        {exiting ? (
          <div className="w-3.5 h-3.5 border-2 border-amber-950 border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
          </svg>
        )}
        Exit impersonation
      </button>
    </div>
  )
}
