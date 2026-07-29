import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useClient } from '@/contexts/ClientContext'
import api from '@/lib/api'
import { mapOAuthLoginResponse } from '@/lib/oauthSession'

const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI

const INPUT_CLASS =
  'w-full px-4 py-3 bg-white/5 border border-white/15 rounded-lg focus:ring-2 focus:ring-[#5227FF] focus:border-transparent outline-none transition-all duration-200 text-white placeholder-slate-500 [&:-webkit-autofill]:[-webkit-box-shadow:0_0_0_1000px_#2d2145_inset] [&:-webkit-autofill]:[-webkit-text-fill-color:#ffffff]'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  // Desktop Google sign-in: true while the system browser is handling consent.
  const [googleWaiting, setGoogleWaiting] = useState(false)
  // Manual sign-in-code fallback, shown while waiting on the browser.
  const [showCodeEntry, setShowCodeEntry] = useState(false)
  const [pastedCode, setPastedCode] = useState('')
  const [redeeming, setRedeeming] = useState(false)

  // Single-session enforcement state
  const [sessionConflict, setSessionConflict] = useState<null | {
    device?: string; ip_address?: string; last_seen?: string;
  }>(null)
  const [forcedLogout, setForcedLogout] = useState(false)

  // 2FA two-step state
  const [requiresTotp, setRequiresTotp] = useState(false)
  const [totpCode, setTotpCode] = useState('')
  const [trustDevice, setTrustDevice] = useState(false)
  // Store credentials between step 1 and step 2
  const pendingCredentials = useRef<{ email: string; password: string } | null>(null)
  // Once the user confirms a takeover, force_login rides along on every subsequent
  // post (including the TOTP step) so the conflict surfaces once and is never re-asked.
  const forceLoginRef = useRef(false)

  // Retrieve stored trusted-device token for the given email (if any)
  const getStoredDeviceToken = (forEmail: string): string => {
    return localStorage.getItem(`totp_device_token:${forEmail}`) || ''
  }

  // Persist a newly-issued device token so future logins skip 2FA on this browser
  const saveDeviceToken = (forEmail: string, token: string) => {
    localStorage.setItem(`totp_device_token:${forEmail}`, token)
  }

  const navigate = useNavigate()
  const { setClientData } = useClient()

  const processLoginResponse = (data: any) => {
    // Login succeeded — clear the takeover flag so a later attempt starts clean.
    forceLoginRef.current = false
    const { token, user, client_id, client_name, client_logo, client_address, client_phone, client_email, client_gstin } = data

    const userData = {
      user_id: user.user_id,
      email: user.email,
      role: user.role,
      is_super_admin: user.is_super_admin,
      permissions: user.permissions,
      totp_enabled: user.totp_enabled ?? false,
      must_change_password: user.must_change_password ?? false,
    }

    const clientData = {
      client_id,
      client_name,
      logo_url: client_logo,
      address: client_address,
      phone: client_phone,
      email: client_email,
      gstin: client_gstin,
      // Regional customization — drives currency/tax rendering across the app
      country: data.country,
      currency_code: data.currency_code,
      currency_symbol: data.currency_symbol,
      locale: data.locale,
      tax_config: data.tax_config,
      setup_completed: data.setup_completed,
    }

    setClientData(userData, clientData, token)

    const mustChange = data.must_change_password ?? user.must_change_password ?? false
    if (mustChange) {
      localStorage.setItem('must_change_password', 'true')
      navigate('/change-password', { replace: true })
    } else {
      localStorage.removeItem('must_change_password')
      navigate('/billing/create')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // ── Step 2: TOTP verification ──────────────────────────────
    if (requiresTotp) {
      if (totpCode.length !== 6 && totpCode.length !== 8) {
        setError('Please enter your 6-digit app code or 8-character backup code.')
        return
      }
      if (!pendingCredentials.current) {
        // Shouldn't happen, but guard against stale state
        setRequiresTotp(false)
        return
      }

      setLoading(true)
      try {
        const response = await api.post('/auth/login', {
          email: pendingCredentials.current.email,
          password: pendingCredentials.current.password,
          totp_code: totpCode,
          trust_device: trustDevice,
          force_login: forceLoginRef.current,
        })

        if (response.data.requires_totp) {
          setError('Invalid 2FA code. Check your authenticator app and try again.')
          return
        }

        // Save the trusted-device token so this device skips 2FA next time
        if (response.data.device_token && pendingCredentials.current) {
          saveDeviceToken(pendingCredentials.current.email, response.data.device_token)
        }

        processLoginResponse(response.data)
      } catch (err: any) {
        if (err.response?.status === 409 && err.response?.data?.code === 'SESSION_EXISTS') {
          setSessionConflict(err.response.data.active_session || {})
          return
        }
        setError(err.response?.data?.error || 'Login failed')
      } finally {
        setLoading(false)
      }
      return
    }

    // ── Step 1: Email + password ───────────────────────────────
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password')
      return
    }

    setLoading(true)
    try {
      // Include any stored device token so trusted devices skip 2FA automatically
      const response = await api.post('/auth/login', {
        email,
        password,
        device_token: getStoredDeviceToken(email),
        force_login: forceLoginRef.current,
      })

      if (response.data.requires_totp) {
        // Password was valid — backend wants a TOTP code next
        pendingCredentials.current = { email, password }
        setRequiresTotp(true)
        setTotpCode('')
        setError('')
        setLoading(false)
        return
      }

      processLoginResponse(response.data)
    } catch (err: any) {
      const data = err.response?.data ?? {}

      // Account already logged in elsewhere — offer confirm-before-takeover
      if (err.response?.status === 409 && data.code === 'SESSION_EXISTS') {
        setSessionConflict(data.active_session || {})
        setLoading(false)
        return
      }

      // Email not yet verified — soft redirect to the pending page
      if (data.email_unverified) {
        navigate('/verify-email-pending', { state: { email: data.email ?? email } })
        setLoading(false)
        return
      }

      // Account scheduled for deletion — redirect to dedicated page
      if (data.account_pending_deletion) {
        navigate('/account-pending-deletion', {
          state: {
            deletion_date: data.deletion_date,
            email,
          },
        })
        setLoading(false)
        return
      }

      setError(data.error || 'Login failed')
      setLoading(false)
    }
  }

  // User chose to take over the other session. The conflict surfaces at the
  // password step (before 2FA), so we re-run the password post with force_login.
  // If the account uses 2FA, the backend then asks for the TOTP code as usual —
  // force_login rides along on that step too (forceLoginRef), so the one-time
  // code is entered exactly once and never re-consumed.
  const confirmTakeover = async () => {
    setSessionConflict(null)
    setError('')
    forceLoginRef.current = true
    setLoading(true)
    try {
      const response = await api.post('/auth/login', {
        email,
        password,
        device_token: getStoredDeviceToken(email),
        force_login: true,
      })

      if (response.data.requires_totp) {
        // 2FA account: proceed to the TOTP step (forceLoginRef keeps the takeover).
        pendingCredentials.current = { email, password }
        setRequiresTotp(true)
        setTotpCode('')
        return
      }

      processLoginResponse(response.data)
    } catch (e: any) {
      // Takeover failed — clear the flag so a later attempt re-asks for confirmation
      // (never silently take over a different account the user types next).
      forceLoginRef.current = false
      setError(e.response?.data?.error || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  // Surface the forced-logout flag set by the api.ts interceptor on a revoked session
  useEffect(() => {
    if (localStorage.getItem('logout_reason') === 'session_revoked') {
      setForcedLogout(true)
    }
  }, [])

  const dismissForcedLogout = () => {
    localStorage.removeItem('logout_reason')
    setForcedLogout(false)
    const electronAPI = (window as any).electronAPI
    if (electronAPI?.isElectron && typeof electronAPI.quitApp === 'function') {
      electronAPI.quitApp()
    }
  }

  // Render a human-friendly "last active" string from an ISO/date-like value
  const formatLastSeen = (value?: string): string => {
    if (!value) return ''
    const parsed = new Date(value)
    if (isNaN(parsed.getTime())) return value
    return parsed.toLocaleString()
  }

  const handleBackToLogin = () => {
    setRequiresTotp(false)
    setTotpCode('')
    setError('')
    pendingCredentials.current = null
    forceLoginRef.current = false
  }

  const handleGoogleLogin = async () => {
    setError('')
    // Desktop: Google blocks OAuth inside the Electron window, so open the
    // system browser to the web login. It bounces a signed assertion back via
    // the valoryx:// deep link, received by the effect below.
    if (isElectron) {
      const electronAPI = (window as any).electronAPI
      if (electronAPI?.loginWithGoogle) {
        setGoogleWaiting(true)
        electronAPI.loginWithGoogle()
        return
      }
      setError('Google sign-in is not available right now.')
      return
    }
    try {
      // Carry the desktop flag + PKCE challenge through when this web page was
      // opened by the desktop app, so the callback returns a bound assertion.
      const params = new URLSearchParams(window.location.search)
      const desktop = params.get('desktop')
      const challenge = params.get('challenge')
      let authorizeUrl = '/oauth/google/authorize'
      if (desktop) {
        const q = new URLSearchParams({ desktop })
        if (challenge) q.set('challenge', challenge)
        authorizeUrl += `?${q.toString()}`
      }
      const res = await api.get(authorizeUrl)
      const authUrl: string = res.data.auth_url
      // Validate the URL points to Google before following it
      if (!authUrl?.startsWith('https://accounts.google.com/')) {
        setError('Google sign-in is not available right now.')
        return
      }
      window.location.href = authUrl
    } catch {
      setError('Google sign-in is not available right now.')
    }
  }

  // When the desktop app opens THIS page in the system browser (?desktop=…),
  // start the Google redirect immediately so the user lands on Google's account
  // chooser directly, instead of seeing the Valoryx login page and having to
  // click "Continue with Google" a second time.
  const autoStartedRef = useRef(false)
  useEffect(() => {
    if (isElectron || autoStartedRef.current) return
    if (new URLSearchParams(window.location.search).get('desktop')) {
      autoStartedRef.current = true
      handleGoogleLogin()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Exchange a desktop handoff for a LOCAL session. Shared by the valoryx://
  // deep link and the manual paste-the-code fallback, so both paths behave
  // identically — same PKCE check, same navigation, same error surface.
  const processAssertion = useCallback(
    async (handoff: { assertion: string; verifier: string | null } | null) => {
      if (!handoff?.assertion) return
      try {
        const res = await api.post('/oauth/desktop-login', {
          assertion: handoff.assertion,
          verifier: handoff.verifier,
        })
        const { token, user, client, userData, clientData } = mapOAuthLoginResponse(res.data)
        setClientData(userData, clientData, token)
        setGoogleWaiting(false)
        if (user.must_change_password) {
          localStorage.setItem('must_change_password', 'true')
          navigate('/change-password', { replace: true })
        } else if (client.setup_completed === false) {
          navigate('/setup', { replace: true })
        } else {
          navigate('/billing/create', { replace: true })
        }
      } catch (err: any) {
        setGoogleWaiting(false)
        setError(err?.response?.data?.error || 'Google sign-in failed. Please try again.')
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // Manual fallback: hand the pasted code to the main process, which pairs it
  // with the PKCE verifier it still holds, then run the normal exchange.
  async function submitPastedCode() {
    const code = pastedCode.trim()
    if (!code) return
    setRedeeming(true)
    setError('')
    try {
      const electronAPI = (window as any).electronAPI
      const handoff = await electronAPI?.redeemOAuthCode?.(code)
      if (!handoff?.assertion) {
        setError('That code could not be read. Copy it again from the browser.')
        return
      }
      await processAssertion(handoff)
    } finally {
      setRedeeming(false)
    }
  }

  // Desktop only: receive the handoff assertion from the valoryx:// deep link,
  // exchange it with the LOCAL backend for a local session, then sign in.
  useEffect(() => {
    if (!isElectron) return
    const electronAPI = (window as any).electronAPI
    if (!electronAPI?.onDesktopOAuth) return

    electronAPI.onDesktopOAuth(processAssertion)
    // Cold start: a handoff may have arrived before this listener attached.
    electronAPI.getPendingOAuth?.().then((h: DesktopOAuthHandoff | null) => { if (h) processAssertion(h) })

    return () => { electronAPI.removeDesktopOAuth?.() }
  }, [processAssertion]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#271E37] relative overflow-hidden">
      {/* RYX Elegant Centerpiece */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[1]">
        {/* Radiating lines */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.08]" xmlns="http://www.w3.org/2000/svg">
          <line x1="50%" y1="50%" x2="0%" y2="20%" stroke="#a78bfa" strokeWidth="0.5"/>
          <line x1="50%" y1="50%" x2="100%" y2="10%" stroke="#a78bfa" strokeWidth="0.5"/>
          <line x1="50%" y1="50%" x2="100%" y2="50%" stroke="#a78bfa" strokeWidth="0.5"/>
          <line x1="50%" y1="50%" x2="100%" y2="90%" stroke="#a78bfa" strokeWidth="0.5"/>
          <line x1="50%" y1="50%" x2="0%" y2="80%" stroke="#a78bfa" strokeWidth="0.5"/>
          <line x1="50%" y1="50%" x2="0%" y2="50%" stroke="#a78bfa" strokeWidth="0.5"/>
          <line x1="50%" y1="50%" x2="30%" y2="0%" stroke="#a78bfa" strokeWidth="0.5"/>
          <line x1="50%" y1="50%" x2="70%" y2="100%" stroke="#a78bfa" strokeWidth="0.5"/>
          <line x1="50%" y1="50%" x2="20%" y2="100%" stroke="#a78bfa" strokeWidth="0.5"/>
          <line x1="50%" y1="50%" x2="80%" y2="0%" stroke="#a78bfa" strokeWidth="0.5"/>
        </svg>

        {/* Glow bloom */}
        <div className="absolute w-[700px] h-[700px] rounded-full" style={{
          background: 'radial-gradient(circle, rgba(90,50,200,0.12) 0%, rgba(60,20,140,0.05) 50%, transparent 75%)',
        }} />

        {/* The letters — truly centered, compensating for letter-spacing offset */}
        <span
          aria-hidden="true"
          className="select-none leading-none whitespace-nowrap"
          style={{
            fontFamily: '"Lavishly Yours", cursive',
            fontSize: 'clamp(200px, 28vw, 420px)',
            fontWeight: '400',
            letterSpacing: '0.1em',
            marginRight: '-0.1em',
            color: 'rgba(160, 155, 170, 0.32)',
          }}
        >
          RYX
        </span>
      </div>

      {/* Card Container */}
      <div className="w-full max-w-md px-4 relative z-10">
        <div className="backdrop-blur-md rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] border border-white/10 p-8 sm:p-10 bg-white/5">

          {/* ── TOTP Step ─────────────────────────────────────── */}
          {requiresTotp ? (
            <>
              <div className="mb-8 text-center">
                <div className="w-14 h-14 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center mx-auto mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7 text-violet-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Two-Factor Authentication</h2>
                <p className="text-slate-400 text-sm">
                  Open your authenticator app and enter the 6-digit code for <strong className="text-slate-300">Valoryx</strong>.
                </p>
              </div>

              {error && (
                <div className="bg-red-900/40 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg mb-6">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">
                    Authenticator Code or Backup Code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={totpCode}
                    onChange={e => setTotpCode(e.target.value.replace(/\s/g, '').slice(0, 8))}
                    placeholder="000000"
                    maxLength={8}
                    autoFocus
                    className="w-full px-4 py-3 bg-white/5 border border-white/15 rounded-lg focus:ring-2 focus:ring-[#5227FF] focus:border-transparent outline-none transition-all duration-200 text-white placeholder-slate-600 text-center text-2xl tracking-[0.5em] font-mono"
                  />
                  <p className="text-slate-500 text-xs mt-1.5 text-center">
                    Enter your 6-digit app code, or an 8-character backup code.
                  </p>
                </div>

                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={trustDevice}
                    onChange={e => setTrustDevice(e.target.checked)}
                    className="w-4 h-4 rounded border border-white/20 accent-[#5227FF] cursor-pointer"
                  />
                  <span className="text-sm text-slate-400">Trust this device for 30 days</span>
                </label>

                <button
                  type="submit"
                  disabled={loading || (totpCode.length !== 6 && totpCode.length !== 8)}
                  className="w-full bg-[#5227FF] hover:bg-[#6340ff] text-white font-semibold py-3.5 px-6 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Verifying...
                    </span>
                  ) : (
                    'Verify & Sign In'
                  )}
                </button>
              </form>

              <div className="mt-4 flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={handleBackToLogin}
                  className="text-slate-500 hover:text-slate-300 text-sm transition-colors"
                >
                  Back to login
                </button>
                <a
                  href="/2fa-recover"
                  className="text-slate-600 hover:text-slate-400 text-xs transition-colors"
                >
                  Lost access to your authenticator app?
                </a>
              </div>
            </>
          ) : (
            <>
              {/* ── Email + Password Step ──────────────────────── */}
              <div className="mb-8 text-center">
                <h2 className="text-3xl font-bold text-white mb-2">Welcome Back</h2>
                <p className="text-slate-400">Sign in to access your billing dashboard</p>
              </div>

              {error && (
                <div className="bg-red-900/40 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg mb-6">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="relative">
                  <label htmlFor="email" className="block text-sm font-semibold text-slate-300 mb-2">
                    Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); forceLoginRef.current = false }}
                    className={INPUT_CLASS}
                    placeholder="Enter your email"
                  />
                </div>

                <div className="relative">
                  <label htmlFor="password" className="block text-sm font-semibold text-slate-300 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`${INPUT_CLASS} pr-12`}
                      placeholder="Enter your password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors focus:outline-none"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end -mt-1">
                  <Link
                    to="/auth/forgot-password"
                    className="text-sm text-slate-400 hover:text-white font-medium transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#5227FF] hover:bg-[#6340ff] text-white font-semibold py-3.5 px-6 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg mt-2"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Signing in...
                    </span>
                  ) : (
                    'Sign In'
                  )}
                </button>
              </form>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-[#0f0a1e] text-slate-500 uppercase tracking-wider">or</span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={googleWaiting}
                className="w-full flex items-center justify-center gap-3 py-3 bg-white/5 border border-white/15 rounded-lg text-white hover:bg-white/10 transition-colors text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                {googleWaiting ? 'Waiting for browser…' : 'Continue with Google'}
              </button>
              {googleWaiting && (
                <div className="mt-3 space-y-2">
                  <p className="text-center text-xs text-slate-400">
                    Complete sign-in in your browser, then return to this window.
                  </p>
                  {/* Manual fallback: the browser hands the app its assertion over
                      the valoryx:// scheme, which silently fails when the OS has
                      no handler registered for it. Pasting the code does the same
                      exchange — the PKCE verifier still never leaves this app. */}
                  {!showCodeEntry ? (
                    <button
                      type="button"
                      onClick={() => setShowCodeEntry(true)}
                      className="w-full text-center text-xs text-slate-400 hover:text-white underline underline-offset-2 transition-colors"
                    >
                      App didn't open? Paste the sign-in code instead
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <label htmlFor="oauth-code" className="block text-xs font-medium text-slate-300">
                        Sign-in code from the browser
                      </label>
                      <textarea
                        id="oauth-code"
                        value={pastedCode}
                        onChange={e => setPastedCode(e.target.value)}
                        rows={3}
                        placeholder="Paste the code shown in your browser…"
                        className="w-full px-3 py-2 bg-white/5 border border-white/15 rounded-lg text-[11px] font-mono text-white placeholder-slate-600 resize-none outline-none focus:ring-2 focus:ring-[#5227FF]"
                      />
                      <button
                        type="button"
                        onClick={submitPastedCode}
                        disabled={!pastedCode.trim() || redeeming}
                        className="w-full py-2.5 rounded-lg bg-[#5227FF] hover:bg-[#4520d8] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
                      >
                        {redeeming ? 'Signing in…' : 'Sign in with this code'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Desktop app is login-only: the account is already created on
                  the web before the installer can be downloaded, so no signup. */}
              {!isElectron && (
                <p className="text-center mt-6 text-sm text-slate-400">
                  Don't have an account?{' '}
                  <Link to="/auth/register" className="font-semibold text-white hover:text-[#a98bff] transition-colors">
                    Create account
                  </Link>
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Already-signed-in: confirm before takeover ─────────── */}
      {sessionConflict && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="session-conflict-title"
        >
          <div className="w-full max-w-md backdrop-blur-md rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] border border-white/10 p-8 bg-[#2d2145]">
            <h2 id="session-conflict-title" className="text-2xl font-bold text-white mb-2">
              Already signed in
            </h2>
            <p className="text-slate-400 text-sm mb-4">
              This account is already logged in on another system.
            </p>

            {(sessionConflict.device || sessionConflict.last_seen) && (
              <div className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 mb-6 text-sm space-y-1">
                {sessionConflict.device && (
                  <p className="text-slate-300">
                    <span className="text-slate-500">Device: </span>
                    {sessionConflict.device}
                  </p>
                )}
                {sessionConflict.last_seen && (
                  <p className="text-slate-300">
                    <span className="text-slate-500">Last active: </span>
                    {formatLastSeen(sessionConflict.last_seen)}
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={confirmTakeover}
                disabled={loading}
                className="w-full bg-[#5227FF] hover:bg-[#6340ff] text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
              >
                {loading ? 'Signing in…' : 'Continue & log them out'}
              </button>
              <button
                type="button"
                onClick={() => setSessionConflict(null)}
                className="w-full bg-white/5 border border-white/15 text-white font-medium py-3 px-6 rounded-lg hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Forced logout: session revoked elsewhere ───────────── */}
      {forcedLogout && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="forced-logout-title"
        >
          <div className="w-full max-w-md backdrop-blur-md rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] border border-white/10 p-8 bg-[#2d2145]">
            <h2 id="forced-logout-title" className="text-2xl font-bold text-white mb-2">
              Signed out
            </h2>
            <p className="text-slate-400 text-sm mb-6">
              You have been logged out because this account signed in on another system.
            </p>
            <button
              type="button"
              onClick={dismissForcedLogout}
              className="w-full bg-[#5227FF] hover:bg-[#6340ff] text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
