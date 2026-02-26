import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import api from '@/lib/api'
import LightPillar from '@/components/LightPillar'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email.trim()) {
      setError('Please enter your email address')
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/forgot-password', { email: email.trim().toLowerCase() })
      setSubmitted(true)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
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

      <div className="w-full max-w-md relative z-10">
        <div className="backdrop-blur-md rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] border border-white/10 p-8 sm:p-10 bg-white/5">

          {submitted ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-[#5227FF]/20 border border-[#5227FF]/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-[#a98bff]">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Check your email</h2>
              <p className="text-slate-400 mb-1">
                If an account exists for <strong className="text-slate-300">{email}</strong>, a reset link has been sent.
              </p>
              <p className="text-slate-500 text-sm mb-6">The link expires in 1 hour.</p>
              <Link to="/auth/login" className="text-sm font-semibold text-white hover:text-[#a98bff] transition-colors">
                ← Back to login
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-8 text-center">
                <h2 className="text-3xl font-bold text-white mb-2">Forgot Password?</h2>
                <p className="text-slate-400">Enter your email and we'll send you a reset link.</p>
              </div>

              {error && (
                <div className="bg-red-900/40 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg mb-6 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="email" className="block text-sm font-semibold text-slate-300 mb-2">
                    Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-white/15 rounded-lg focus:ring-2 focus:ring-[#5227FF] focus:border-transparent outline-none transition-all duration-200 text-white placeholder-slate-500 [&:-webkit-autofill]:[-webkit-box-shadow:0_0_0_1000px_#2d2145_inset] [&:-webkit-autofill]:[-webkit-text-fill-color:#ffffff]"
                    placeholder="Enter your email"
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#5227FF] hover:bg-[#6340ff] text-white font-semibold py-3.5 px-6 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg mt-2"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Sending...
                    </span>
                  ) : (
                    'Send Reset Link'
                  )}
                </button>
              </form>

              <p className="text-center mt-6 text-sm text-slate-400">
                Remember your password?{' '}
                <Link to="/auth/login" className="font-semibold text-white hover:text-[#a98bff] transition-colors">
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
