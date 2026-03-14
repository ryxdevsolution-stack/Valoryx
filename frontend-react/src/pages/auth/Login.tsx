import React, { useState, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useClient } from '@/contexts/ClientContext'
import api from '@/lib/api'
import LightPillar from '@/components/LightPillar'

const INPUT_CLASS =
  'w-full px-4 py-3 bg-white/5 border border-white/15 rounded-lg focus:ring-2 focus:ring-[#5227FF] focus:border-transparent outline-none transition-all duration-200 text-white placeholder-slate-500 [&:-webkit-autofill]:[-webkit-box-shadow:0_0_0_1000px_#2d2145_inset] [&:-webkit-autofill]:[-webkit-text-fill-color:#ffffff]'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // 2FA two-step state
  const [requiresTotp, setRequiresTotp] = useState(false)
  const [totpCode, setTotpCode] = useState('')
  // Store credentials between step 1 and step 2
  const pendingCredentials = useRef<{ email: string; password: string } | null>(null)

  const navigate = useNavigate()
  const { setClientData } = useClient()

  const processLoginResponse = (data: any) => {
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
        })

        if (response.data.requires_totp) {
          setError('Invalid 2FA code. Check your authenticator app and try again.')
          return
        }

        processLoginResponse(response.data)
      } catch (err: any) {
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
      const response = await api.post('/auth/login', { email, password })

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

  const handleBackToLogin = () => {
    setRequiresTotp(false)
    setTotpCode('')
    setError('')
    pendingCredentials.current = null
  }

  const handleGoogleLogin = async () => {
    try {
      const res = await api.get('/oauth/google/authorize')
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

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#271E37] relative overflow-hidden">
      {/* LightPillar Background */}
      <div className="absolute inset-0">
        <LightPillar
          topColor="#3a1acc"
          bottomColor="#9b4fa8"
          intensity={0.45}
          rotationSpeed={0.3}
          glowAmount={0.002}
          pillarWidth={3}
          pillarHeight={0.4}
          noiseIntensity={0.5}
          pillarRotation={25}
          interactive={false}
          mixBlendMode="screen"
          quality="high"
        />
      </div>

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
      <div className="w-full max-w-md relative z-10">
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
                  href="/frontend/2fa-recover"
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
                    onChange={(e) => setEmail(e.target.value)}
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
                className="w-full flex items-center justify-center gap-3 py-3 bg-white/5 border border-white/15 rounded-lg text-white hover:bg-white/10 transition-colors text-sm font-medium"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>

              <p className="text-center mt-6 text-sm text-slate-400">
                Don't have an account?{' '}
                <Link to="/auth/register" className="font-semibold text-white hover:text-[#a98bff] transition-colors">
                  Create account
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
