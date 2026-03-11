import { useState, useEffect, useCallback } from 'react'
import { useLocation, Link } from 'react-router-dom'
import api from '@/lib/api'
import LightPillar from '@/components/LightPillar'

const RESEND_COOLDOWN = 60 // seconds

export default function VerifyEmailPendingPage() {
  const location = useLocation()
  const email: string = (location.state as any)?.email ?? ''

  const [resendCooldown, setResendCooldown] = useState(0)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendMessage, setResendMessage] = useState('')
  const [resendError, setResendError] = useState('')

  // Countdown tick
  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  const handleResend = useCallback(async () => {
    if (!email || resendCooldown > 0 || resendLoading) return
    setResendLoading(true)
    setResendMessage('')
    setResendError('')
    try {
      await api.post('/auth/resend-verification', { email })
      setResendMessage('Verification email sent! Check your inbox.')
      setResendCooldown(RESEND_COOLDOWN)
    } catch {
      setResendError('Could not resend. Please try again in a moment.')
    } finally {
      setResendLoading(false)
    }
  }, [email, resendCooldown, resendLoading])

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#271E37] relative overflow-hidden">
      {/* Background */}
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

      {/* RYX Watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[1]">
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
        <div className="absolute w-[700px] h-[700px] rounded-full" style={{
          background: 'radial-gradient(circle, rgba(90,50,200,0.12) 0%, rgba(60,20,140,0.05) 50%, transparent 75%)',
        }} />
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

      {/* Card */}
      <div className="w-full max-w-md relative z-10">
        <div className="backdrop-blur-md rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] border border-white/10 p-8 sm:p-10 bg-white/5 text-center">
          {/* Email icon */}
          <div className="w-16 h-16 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center mx-auto mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-violet-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
          </div>

          <h2 className="text-2xl font-bold text-white mb-3">Check your email</h2>

          <p className="text-slate-400 text-sm leading-relaxed mb-2">
            We've sent a verification link to
          </p>
          {email ? (
            <p className="text-violet-300 font-semibold text-sm mb-6 break-all">{email}</p>
          ) : (
            <p className="text-slate-500 text-sm mb-6">your registered email address.</p>
          )}

          <p className="text-slate-500 text-xs mb-8">
            Click the link in the email to activate your account. The link expires in 24 hours.
          </p>

          {/* Feedback messages */}
          {resendMessage && (
            <div className="bg-emerald-900/40 border border-emerald-500/50 text-emerald-300 px-4 py-3 rounded-lg mb-4 text-sm">
              {resendMessage}
            </div>
          )}
          {resendError && (
            <div className="bg-red-900/40 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg mb-4 text-sm">
              {resendError}
            </div>
          )}

          {/* Resend button */}
          <button
            type="button"
            onClick={handleResend}
            disabled={resendCooldown > 0 || resendLoading || !email}
            className="w-full bg-[#5227FF] hover:bg-[#6340ff] text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
          >
            {resendLoading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Sending…
              </span>
            ) : resendCooldown > 0 ? (
              `Resend in ${resendCooldown}s`
            ) : (
              'Resend verification email'
            )}
          </button>

          <div className="mt-6 pt-6 border-t border-white/10">
            <p className="text-slate-500 text-xs">
              Wrong email?{' '}
              <Link to="/auth/register" className="text-violet-400 hover:text-violet-300 transition-colors">
                Start over
              </Link>
              {' · '}
              <Link to="/auth/login" className="text-violet-400 hover:text-violet-300 transition-colors">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
