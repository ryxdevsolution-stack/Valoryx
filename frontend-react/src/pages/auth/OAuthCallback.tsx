import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import api from '@/lib/api'
import { useClient } from '@/contexts/ClientContext'
import { consumePendingDownload } from '@/lib/pendingDownload'
import { mapOAuthLoginResponse } from '@/lib/oauthSession'

export default function OAuthCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { setClientData } = useClient()
  const hasRun = useRef(false)
  const [desktopHandoff, setDesktopHandoff] = useState(false)

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    if (error || !code) {
      navigate('/auth/login?error=oauth_cancelled', { replace: true })
      return
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    api.post('/oauth/google/callback', { code, state }, { signal: controller.signal })
      .then(res => {
        clearTimeout(timeoutId)
        // Desktop handoff: the cloud verified the Google identity and returned a
        // short-lived assertion instead of a web session. Bounce it back into
        // the Electron app via the custom protocol; the desktop app exchanges it
        // with its LOCAL backend for a local session.
        if (res.data?.desktop && res.data?.assertion) {
          setDesktopHandoff(true)
          window.location.href = `valoryx://auth?assertion=${encodeURIComponent(res.data.assertion)}`
          return
        }
        const { token, user, client, userData, clientData } = mapOAuthLoginResponse(res.data)
        setClientData(userData, clientData, token)
        // If the user came from the landing "Continue with Google → download"
        // flow, trigger the deferred installer download now.
        consumePendingDownload()
        if (user.must_change_password) {
          localStorage.setItem('must_change_password', 'true')
          navigate('/change-password', { replace: true })
        } else if (client.setup_completed === false) {
          navigate('/setup', { replace: true })
        } else {
          navigate('/billing/create', { replace: true })
        }
      })
      .catch(err => {
        clearTimeout(timeoutId)
        if (err.name === 'CanceledError' || err.name === 'AbortError') {
          navigate('/auth/login?error=oauth_timeout', { replace: true })
        } else {
          navigate('/auth/login?error=oauth_failed', { replace: true })
        }
      })

    return () => {
      clearTimeout(timeoutId)
      controller.abort()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-[#0f0a1e] flex items-center justify-center">
      <div className="text-center space-y-3">
        {desktopHandoff ? (
          <>
            <div className="w-12 h-12 rounded-full bg-violet-500/20 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <p className="text-slate-200 text-sm font-medium">Signed in with Google</p>
            <p className="text-slate-400 text-xs max-w-xs">Returning you to the Valoryx app… If it doesn't open automatically, switch back to the app window. You can close this tab.</p>
          </>
        ) : (
          <>
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-slate-400 text-sm">Signing you in with Google...</p>
          </>
        )}
      </div>
    </div>
  )
}
