import { useState, useEffect, useCallback, useRef, FormEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Download, ArrowRight, CheckCircle2, X, Eye, EyeOff } from 'lucide-react'
import api from '@/lib/api'
import { siteConfig } from '@/config/landing.config'
import { setPendingDownload, clearPendingDownload } from '@/lib/pendingDownload'

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

    if (!businessName.trim()) {
      setError('Please enter your business name.')
      return
    }
    if (!EMAIL_RE.test(email.trim())) {
      setError('Please enter a valid email address.')
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
      const field = err?.response?.data?.field
      const msg = err?.response?.data?.error || 'Could not create your account. Please try again.'
      if (field === 'email' || field === 'business_name') {
        setFieldErrors({ [field]: msg })
      } else {
        setError(msg)
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
              className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-ink/10 bg-white p-6 shadow-2xl sm:p-8"
            >
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-canvas hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>

              {done ? (
                <div className="py-2 text-center">
                  <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-blue/10 text-accent-blue">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <h3 className="font-heading text-xl font-bold text-ink">Account created — download starting</h3>
                  <p className="mt-2 font-body text-sm leading-relaxed text-ink-soft">
                    Your owner account and 14-day free trial are ready. We&apos;ve sent a
                    verification link to <strong className="text-ink">{email}</strong>. Install
                    Valoryx, verify your email, then sign in inside the app to continue.
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
                <form onSubmit={handleSubmit}>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-blue/12 to-accent-purple/12 text-accent-purple">
                    <Download className="h-6 w-6" />
                  </div>
                  <h3 className="font-heading text-xl font-bold text-ink">Create your account &amp; download</h3>
                  <p className="mt-2 font-body text-sm leading-relaxed text-ink-soft">
                    This sets up your shop and starts a 14-day free trial. Your download begins right
                    after.
                  </p>

                  {/* Google sign-up */}
                  <button
                    type="button"
                    onClick={handleGoogle}
                    disabled={loading}
                    className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-full border border-ink/15 bg-white font-body text-sm font-semibold text-ink transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <GoogleIcon />
                    Continue with Google
                  </button>

                  <div className="my-4 flex items-center gap-3">
                    <span className="h-px flex-1 bg-ink/10" />
                    <span className="font-body text-xs text-ink-faint">or sign up with email</span>
                    <span className="h-px flex-1 bg-ink/10" />
                  </div>

                  {error && (
                    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 font-body text-xs text-red-600">
                      {error}
                    </div>
                  )}

                  <div className="mt-4 space-y-3">
                    {/* Business name */}
                    <div>
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
                        className="h-11 w-full rounded-full border border-ink/15 bg-white px-4 font-body text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent-blue"
                      />
                      {fieldErrors.business_name && (
                        <p className="mt-1 px-1 font-body text-xs text-red-500">{fieldErrors.business_name}</p>
                      )}
                    </div>

                    {/* Email */}
                    <div>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value)
                          if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }))
                        }}
                        placeholder="you@business.com"
                        aria-label="Email address"
                        aria-invalid={!!fieldErrors.email}
                        className="h-11 w-full rounded-full border border-ink/15 bg-white px-4 font-body text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent-blue"
                      />
                      {fieldErrors.email && (
                        <p className="mt-1 px-1 font-body text-xs text-red-500">{fieldErrors.email}</p>
                      )}
                    </div>

                    {/* Password */}
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Create a password"
                        aria-label="Password"
                        className="h-11 w-full rounded-full border border-ink/15 bg-white px-4 pr-11 font-body text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent-blue"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>

                    {/* Password rules */}
                    {password.length > 0 && (
                      <ul className="grid grid-cols-2 gap-x-3 gap-y-1 px-1">
                        {passwordRules.map((rule) => (
                          <li
                            key={rule.label}
                            className={`flex items-center gap-1.5 font-body text-[11px] ${rule.met ? 'text-accent-blue' : 'text-ink-faint'}`}
                          >
                            <CheckCircle2 className="h-3 w-3 shrink-0" />
                            {rule.label}
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Phone (optional) */}
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Phone (optional)"
                      aria-label="Phone number"
                      className="h-11 w-full rounded-full border border-ink/15 bg-white px-4 font-body text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent-blue"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-ink font-body text-sm font-semibold text-white shadow-pill transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Creating account…
                      </>
                    ) : (
                      <>
                        Create account &amp; download
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>

                  <p className="mt-3 text-center font-body text-xs text-ink-faint">
                    Already have an account?{' '}
                    <Link to={siteConfig.routes.login} onClick={close} className="font-medium text-accent-blue hover:underline">
                      Sign in
                    </Link>
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
