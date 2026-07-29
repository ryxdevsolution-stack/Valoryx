import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import api from '@/lib/api'
import { useClient } from '@/contexts/ClientContext'
import { consumePendingDownload } from '@/lib/pendingDownload'
import { mapOAuthLoginResponse } from '@/lib/oauthSession'
import AuthBackdrop from '@/components/AuthBackdrop'

export default function OAuthCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { setClientData } = useClient()
  const hasRun = useRef(false)
  const [desktopHandoff, setDesktopHandoff] = useState(false)
  // The raw assertion, shown as a copyable code. The valoryx:// deep link is
  // best-effort: it silently does nothing when the OS has no handler registered
  // for the scheme (common on Linux, and on Windows before the installer has
  // run once). Without a manual path the user is stranded on a page that says
  // "returning you to the app" while the app waits forever.
  const [handoffCode, setHandoffCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [showCode, setShowCode] = useState(false)

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(handoffCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Clipboard API can be blocked; the textarea below is selectable as a fallback.
      setCopied(false)
    }
  }

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
          setHandoffCode(res.data.assertion)
          window.location.href = `valoryx://auth?assertion=${encodeURIComponent(res.data.assertion)}`
          // If the deep link had worked, focus would have left this tab. Still
          // here a few seconds later means no handler fired — surface the
          // manual code rather than leaving the user on a dead "returning…".
          setTimeout(() => setShowCode(true), 4000)
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
    <AuthBackdrop>
      <div className="w-full max-w-md mx-auto backdrop-blur-md rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] border border-white/10 p-8 bg-white/5 text-center space-y-4">
        {desktopHandoff ? (
          <>
            <div className="w-12 h-12 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-violet-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <h2 className="text-white text-lg font-bold">Signed in with Google</h2>

            {!showCode ? (
              <p className="text-slate-400 text-xs">
                Returning you to the Valoryx app… You can close this tab once it opens.
              </p>
            ) : (
              <div className="space-y-3 text-left">
                <p className="text-slate-300 text-xs">
                  The app didn't open automatically. Copy this sign-in code and paste it
                  into the Valoryx window to finish signing in.
                </p>
                <textarea
                  readOnly
                  value={handoffCode}
                  onFocus={e => e.currentTarget.select()}
                  rows={3}
                  aria-label="Sign-in code"
                  className="w-full px-3 py-2 bg-black/30 border border-white/15 rounded-lg text-[10px] font-mono text-slate-300 break-all resize-none outline-none focus:ring-2 focus:ring-[#5227FF]"
                />
                <button
                  type="button"
                  onClick={copyCode}
                  className="w-full py-2.5 rounded-lg bg-[#5227FF] hover:bg-[#4520d8] text-white text-sm font-semibold transition-colors"
                >
                  {copied ? 'Copied — now paste it in the app' : 'Copy sign-in code'}
                </button>
                <p className="text-slate-500 text-[11px]">
                  This code expires in a few minutes and can only be used once.
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="w-8 h-8 border-2 border-violet-400 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-slate-300 text-sm">Signing you in with Google…</p>
          </>
        )}
      </div>
    </AuthBackdrop>
  )
}
