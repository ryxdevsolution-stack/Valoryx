import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useClient } from '@/contexts/ClientContext'
import api from '@/lib/api'
import LightPillar from '@/components/LightPillar'

type VerifyState = 'verifying' | 'success' | 'error'

export default function VerifyEmailSuccessPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const navigate = useNavigate()
  const { setClientData } = useClient()

  const [state, setState] = useState<VerifyState>('verifying')
  const [errorMsg, setErrorMsg] = useState('')
  const calledRef = useRef(false)

  useEffect(() => {
    if (calledRef.current) return
    calledRef.current = true

    if (!token) {
      setState('error')
      setErrorMsg('No verification token found. Please use the link from your email.')
      return
    }

    api.get(`/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then((res) => {
        const data = res.data
        const { token: jwt, user, client_id, client_name, client_logo, client_address, client_phone, client_email, client_gstin } = data

        const userData = {
          user_id: user.user_id,
          email: user.email,
          role: user.role,
          is_super_admin: user.is_super_admin,
          permissions: user.permissions,
          full_name: user.full_name,
          phone: user.phone,
          department: user.department,
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
          subscription_status: data.subscription_status,
          trial_end_date: data.trial?.end_date,
          trial_days_remaining: data.trial?.days_remaining,
          plan_id: data.plan_id,
          subscription_end_date: data.subscription_end_date,
        }

        setClientData(userData, clientData, jwt)
        setState('success')

        // Auto-redirect after short delay so user sees success state
        setTimeout(() => navigate('/billing/create', { replace: true }), 2000)
      })
      .catch((err) => {
        setState('error')
        setErrorMsg(err.response?.data?.error || 'Verification failed. The link may have expired.')
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

          {state === 'verifying' && (
            <>
              <div className="w-16 h-16 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center mx-auto mb-6">
                <div className="w-8 h-8 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-3">Verifying your email…</h2>
              <p className="text-slate-400 text-sm">Please wait a moment.</p>
            </>
          )}

          {state === 'success' && (
            <>
              <div className="w-16 h-16 rounded-full bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8 text-emerald-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-3">Email verified!</h2>
              <p className="text-slate-400 text-sm">Your account is active. Redirecting you to the dashboard…</p>
              <div className="mt-5 flex justify-center">
                <div className="w-5 h-5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
              </div>
            </>
          )}

          {state === 'error' && (
            <>
              <div className="w-16 h-16 rounded-full bg-red-600/20 border border-red-500/30 flex items-center justify-center mx-auto mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8 text-red-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-3">Verification failed</h2>
              <p className="text-slate-400 text-sm mb-6">{errorMsg}</p>
              <a
                href="/auth/login"
                className="inline-block bg-[#5227FF] hover:bg-[#6340ff] text-white font-semibold py-3 px-8 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg text-sm"
              >
                Back to sign in
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
