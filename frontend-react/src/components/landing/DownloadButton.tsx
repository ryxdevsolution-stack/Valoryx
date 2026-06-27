import { useState, useEffect, useCallback, useRef, FormEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import {
  Download,
  ArrowRight,
  CheckCircle2,
  X,
  Eye,
  EyeOff,
  Building2,
  Mail,
  Lock,
  Phone,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'
import axios from 'axios'
import api from '@/lib/api'
import { siteConfig } from '@/config/landing.config'
import { setPendingDownload, clearPendingDownload } from '@/lib/pendingDownload'

// Bare axios base for the "existing user" credential check. We deliberately do
// NOT route this through the shared `api` instance: its global 401 interceptor
// clears auth storage and redirects the whole page to /auth/login, which would
// rip a visitor off the landing page on a wrong-password attempt.
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5017/api'

/** Multicolor Google "G" mark. */
function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  )
}

/**
 * Download CTA that creates the owner account before starting the installer
 * download. On submit it calls `/auth/signup` (new client + owner user, 14-day
 * trial, email verification required), then triggers the download and tells the
 * user to verify their email and sign in inside the installed app.
 *
 * The trigger is style-able via `className`/`children` so the same component
 * serves the navbar (desktop + mobile) and the CTA section.
 */
interface DownloadButtonProps {
  className?: string
  children?: ReactNode
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function startDownload(): void {
  const a = document.createElement('a')
  a.href = siteConfig.downloadUrl
  a.download = ''
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

// Shared field styling so every input reads as one system: a soft `canvas`
// fill that lifts to white with an accent ring on focus, room for a leading
// icon (pl-11), and a clear red treatment when the field is in error.
const fieldIconCls = 'pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint'
function fieldInputCls(hasError = false): string {
  return [
    'h-12 w-full rounded-2xl border bg-canvas pl-11 pr-4 font-body text-sm text-ink',
    'outline-none transition-all duration-200 placeholder:text-ink-faint',
    'focus:bg-white focus:border-accent-blue focus:ring-4 focus:ring-accent-blue/15',
    hasError ? 'border-red-300 ring-4 ring-red-100' : 'border-ink/10',
  ].join(' ')
}

export default function DownloadButton({ className, children }: DownloadButtonProps) {
  const [open, setOpen] = useState(false)
  const [businessName, setBusinessName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; business_name?: string }>({})
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  // True once the download was unlocked for an already-existing account, so the
  // success screen greets them back instead of claiming a new account was made.
  const [existingUser, setExistingUser] = useState(false)
  // 'signup' = new account form; 'login' = existing user signs in and downloads.
  const [mode, setMode] = useState<'signup' | 'login'>('signup')

  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Mirror the app's signup password rules so behaviour is consistent.
  const passwordRules = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'One uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'One number', met: /[0-9]/.test(password) },
    { label: 'One special character', met: /[^A-Za-z0-9]/.test(password) },
  ]
  const passwordStrong = passwordRules.every((r) => r.met)

  const reset = useCallback(() => {
    setBusinessName('')
    setEmail('')
    setPassword('')
    setPhone('')
    setShowPassword(false)
    setError('')
    setFieldErrors({})
    setLoading(false)
    setDone(false)
    setExistingUser(false)
    setMode('signup')
  }, [])

  // Switch between sign-up and sign-in views, clearing any stale errors.
  const switchMode = useCallback((next: 'signup' | 'login') => {
    setMode(next)
    setError('')
    setFieldErrors({})
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    window.setTimeout(reset, 200)
    // Restore focus to the trigger that opened the dialog (WCAG 2.4.3).
    triggerRef.current?.focus()
  }, [reset])

  // Close on Escape, trap Tab focus within the dialog, and lock body scroll.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close()
        return
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, close])

  const handleGoogle = async () => {
    setError('')
    // Stash the installer URL so the download fires after Google redirects back.
    setPendingDownload(siteConfig.downloadUrl)
    try {
      const res = await api.get('/oauth/google/authorize')
      const authUrl: string = res.data?.auth_url
      if (!authUrl?.startsWith('https://accounts.google.com/')) {
        clearPendingDownload()
        setError('Google sign-in is not available right now.')
        return
      }
      window.location.href = authUrl
    } catch {
      clearPendingDownload()
      setError('Google sign-in is not available right now.')
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setFieldErrors({})

    // Existing user → log in and the download starts automatically.
    if (mode === 'login') {
      await handleLogin()
      return
    }

    // New account → full signup validation.
    if (!businessName.trim()) {
      setFieldErrors({ business_name: 'Please enter your business name.' })
      return
    }
    if (!EMAIL_RE.test(email.trim())) {
      setFieldErrors({ email: 'Please enter a valid email address.' })
      return
    }
    if (!passwordStrong) {
      setError('Password does not meet all the requirements below.')
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/signup', {
        business_name: businessName.trim(),
        email: email.trim(),
        password,
        phone: phone.trim() || undefined,
      })
      // Account created (owner + 14-day trial). Email verification required.
      startDownload()
      setDone(true)
    } catch (err: any) {
      const status = err?.response?.status
      const field = err?.response?.data?.field
      const msg = err?.response?.data?.error || 'Could not create your account. Please try again.'

      // Already a customer — flip to the sign-in view (keeping what they typed)
      // so they just confirm their password and the download starts.
      if (status === 409 && field === 'email') {
        setMode('login')
        setError('You already have an account — sign in and your download will start.')
        return
      }

      if (field === 'email' || field === 'business_name') {
        setFieldErrors({ [field]: msg })
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  /**
   * Existing-user path: log in with the entered credentials and, once they're
   * confirmed, start the installer download. We call `/auth/login` with a bare
   * axios instance (not the shared `api`) so its global 401 handler can't
   * redirect the visitor off the landing page on a wrong password.
   */
  const handleLogin = async () => {
    if (!EMAIL_RE.test(email.trim())) {
      setFieldErrors({ email: 'Please enter a valid email address.' })
      return
    }
    if (!password) {
      setError('Please enter your password.')
      return
    }

    setLoading(true)
    try {
      const res = await axios.post(
        `${API_BASE}/auth/login`,
        { email: email.trim(), password },
        { timeout: 15000 },
      )
      // 2xx → credentials valid (full login, or a flow step like 2FA pending).
      startDownload()
      // A full login created a tracked session. Release it so the user's next
      // real sign-in inside the app doesn't trip the single-device guard.
      const token = res.data?.token
      if (token) {
        try {
          await axios.post(
            `${API_BASE}/auth/logout`,
            {},
            { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 },
          )
        } catch (cleanupErr) {
          if (import.meta.env.DEV) {
            console.warn('[DownloadButton] download session cleanup failed', cleanupErr)
          }
        }
      }
      setExistingUser(true)
      setDone(true)
    } catch (loginErr: any) {
      const ls = loginErr?.response?.status
      // 403 (email unverified / pending deletion) and 409 (already signed in on
      // another device) both prove the password was correct — let them download.
      if (ls === 403 || ls === 409) {
        startDownload()
        setExistingUser(true)
        setDone(true)
      } else if (ls === 429) {
        setError(
          loginErr?.response?.data?.error ||
            'Too many attempts. Please wait a moment and try again.',
        )
      } else {
        setError('Incorrect email or password. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Create your account and download Valoryx"
          >
            <div
              className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
              onClick={close}
              aria-hidden="true"
            />
            <div
              ref={dialogRef}
              className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-white/60 bg-white/95 p-6 shadow-soft ring-1 ring-ink/5 backdrop-blur-xl sm:p-8"
            >
              {/* Soft brand glow for depth — clipped to the card, non-interactive. */}
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
                <div className="absolute -right-16 -top-24 h-52 w-52 rounded-full bg-blob-blue/40 blur-3xl" />
                <div className="absolute -bottom-24 -left-16 h-52 w-52 rounded-full bg-blob-purple/30 blur-3xl" />
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="absolute right-4 top-4 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-canvas hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>

              {done ? (
                <div className="relative z-10 py-2 text-center">
                  <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-blue to-accent-purple text-white shadow-pill">
                    <CheckCircle2 className="h-7 w-7" />
                  </div>
                  <h3 className="font-heading text-xl font-bold text-ink">
                    {existingUser ? 'Welcome back — download starting' : 'Account created — download starting'}
                  </h3>
                  <p className="mt-2 font-body text-sm leading-relaxed text-ink-soft">
                    {existingUser ? (
                      <>
                        We found your existing Valoryx account for{' '}
                        <strong className="text-ink">{email}</strong>. Your download is starting now —
                        install Valoryx and sign in with your usual credentials to continue.
                      </>
                    ) : (
                      <>
                        Your owner account and 14-day free trial are ready. We&apos;ve sent a
                        verification link to <strong className="text-ink">{email}</strong>. Install
                        Valoryx, verify your email, then sign in inside the app to continue.
                      </>
                    )}
                  </p>
                  <Link
                    to={siteConfig.routes.login}
                    onClick={close}
                    className="mt-5 inline-flex items-center gap-1.5 font-body text-sm font-semibold text-accent-blue hover:underline"
                  >
                    Go to sign in
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <p className="mt-4 font-body text-xs text-ink-faint">
                    Download didn&apos;t start?{' '}
                    <a
                      href={siteConfig.downloadUrl}
                      download
                      rel="noopener noreferrer"
                      className="font-medium text-accent-blue hover:underline"
                    >
                      Click here
                    </a>
                    .
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} noValidate className="relative z-10">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-blue to-accent-purple text-white shadow-pill">
                      <Download className="h-6 w-6" />
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-blue/20 bg-accent-blue/10 px-3 py-1 font-body text-[11px] font-semibold text-accent-blue">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {mode === 'login' ? 'Existing account' : '14-day free trial'}
                    </span>
                  </div>
                  <h3 className="mt-4 font-heading text-2xl font-bold tracking-tight text-ink">
                    {mode === 'login' ? 'Sign in & download' : 'Create your account & download'}
                  </h3>
                  <p className="mt-1.5 font-body text-sm leading-relaxed text-ink-soft">
                    {mode === 'login'
                      ? 'Log in to your Valoryx account and your download starts right away.'
                      : 'This sets up your shop and starts your free trial — your download begins right after. No card required.'}
                  </p>

                  {/* Google sign-up */}
                  <button
                    type="button"
                    onClick={handleGoogle}
                    disabled={loading}
                    className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-2xl border border-ink/10 bg-white font-body text-sm font-semibold text-ink shadow-sm transition-all duration-200 hover:border-ink/20 hover:bg-canvas hover:shadow disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <GoogleIcon />
                    Continue with Google
                  </button>

                  <div className="my-5 flex items-center gap-3">
                    <span className="h-px flex-1 bg-ink/10" />
                    <span className="font-body text-xs text-ink-faint">
                      {mode === 'login' ? 'or sign in with email' : 'or sign up with email'}
                    </span>
                    <span className="h-px flex-1 bg-ink/10" />
                  </div>

                  {error && (
                    <div
                      role="alert"
                      className="mb-4 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 font-body text-xs leading-relaxed text-red-600"
                    >
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="space-y-3">
                    {/* Business name — new accounts only */}
                    {mode === 'signup' && (
                      <div>
                        <div className="relative">
                          <Building2 className={fieldIconCls} />
                          <input
                            type="text"
                            required
                            autoFocus
                            value={businessName}
                            onChange={(e) => {
                              setBusinessName(e.target.value)
                              if (fieldErrors.business_name) setFieldErrors((p) => ({ ...p, business_name: undefined }))
                            }}
                            placeholder="Business / shop name"
                            aria-label="Business name"
                            aria-invalid={!!fieldErrors.business_name}
                            autoComplete="organization"
                            className={fieldInputCls(!!fieldErrors.business_name)}
                          />
                        </div>
                        {fieldErrors.business_name && (
                          <p className="mt-1 px-1 font-body text-xs text-red-500">{fieldErrors.business_name}</p>
                        )}
                      </div>
                    )}

                    {/* Email */}
                    <div>
                      <div className="relative">
                        <Mail className={fieldIconCls} />
                        <input
                          type="email"
                          required
                          autoFocus={mode === 'login'}
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value)
                            if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }))
                          }}
                          placeholder="you@business.com"
                          aria-label="Email address"
                          aria-invalid={!!fieldErrors.email}
                          autoComplete="email"
                          className={fieldInputCls(!!fieldErrors.email)}
                        />
                      </div>
                      {fieldErrors.email && (
                        <p className="mt-1 px-1 font-body text-xs text-red-500">{fieldErrors.email}</p>
                      )}
                    </div>

                    {/* Password */}
                    <div className="relative">
                      <Lock className={fieldIconCls} />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={mode === 'login' ? 'Enter your password' : 'Create a password'}
                        aria-label="Password"
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        className={`${fieldInputCls(false)} pr-11`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-faint transition-colors hover:text-ink"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>

                    {/* Password rules — new accounts only */}
                    {mode === 'signup' && password.length > 0 && (
                      <ul className="grid grid-cols-2 gap-1.5">
                        {passwordRules.map((rule) => (
                          <li
                            key={rule.label}
                            className={`flex items-center gap-1.5 rounded-lg px-2 py-1 font-body text-[11px] transition-colors ${rule.met ? 'bg-accent-blue/10 text-accent-blue' : 'bg-canvas text-ink-faint'}`}
                          >
                            <CheckCircle2 className={`h-3 w-3 shrink-0 ${rule.met ? 'opacity-100' : 'opacity-40'}`} />
                            {rule.label}
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Phone (optional) — new accounts only */}
                    {mode === 'signup' && (
                      <div className="relative">
                        <Phone className={fieldIconCls} />
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="Phone (optional)"
                          aria-label="Phone number"
                          autoComplete="tel"
                          className={fieldInputCls(false)}
                        />
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-accent-blue to-accent-purple font-body text-sm font-semibold text-white shadow-pill transition-all duration-200 hover:shadow-lg hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        {mode === 'login' ? 'Signing in…' : 'Creating account…'}
                      </>
                    ) : (
                      <>
                        {mode === 'login' ? 'Sign in & download' : 'Create account & download'}
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>

                  <p className="mt-3 text-center font-body text-xs text-ink-faint">
                    {mode === 'login' ? (
                      <>
                        New to Valoryx?{' '}
                        <button
                          type="button"
                          onClick={() => switchMode('signup')}
                          className="font-semibold text-accent-blue hover:underline"
                        >
                          Create an account
                        </button>
                      </>
                    ) : (
                      <>
                        Already have an account?{' '}
                        <button
                          type="button"
                          onClick={() => switchMode('login')}
                          className="font-semibold text-accent-blue hover:underline"
                        >
                          Sign in to download
                        </button>
                      </>
                    )}
                  </p>
                </form>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
