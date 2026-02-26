import React, { useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import api from '@/lib/api'
import LightPillar from '@/components/LightPillar'

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const navigate = useNavigate()

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const EyeIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )

  const EyeOffIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  )

  const inputClass = "w-full px-4 py-3 bg-white/5 border border-white/15 rounded-lg focus:ring-2 focus:ring-[#5227FF] focus:border-transparent outline-none transition-all duration-200 text-white placeholder-slate-500 [&:-webkit-autofill]:[-webkit-box-shadow:0_0_0_1000px_#2d2145_inset] [&:-webkit-autofill]:[-webkit-text-fill-color:#ffffff]"

  const Bg = () => (
    <>
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
    </>
  )

  // No token in URL
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#271E37] relative overflow-hidden">
        <Bg />
        <div className="w-full max-w-md relative z-10">
          <div className="backdrop-blur-md rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] border border-white/10 p-8 bg-white/5 text-center">
            <div className="w-16 h-16 bg-red-900/30 border border-red-500/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-red-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Invalid Reset Link</h2>
            <p className="text-slate-400 mb-6">This reset link is missing or invalid. Please request a new one.</p>
            <Link
              to="/auth/forgot-password"
              className="inline-block bg-[#5227FF] hover:bg-[#6340ff] text-white font-semibold py-2.5 px-6 rounded-lg transition-colors"
            >
              Request New Link
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!newPassword || !confirmPassword) {
      setError('Please fill in both fields')
      return
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/reset-password', { token, new_password: newPassword })
      setSuccess(true)
      setTimeout(() => navigate('/auth/login'), 3000)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Reset failed. The link may have expired.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#271E37] relative overflow-hidden">
      <Bg />

      <div className="w-full max-w-md relative z-10">
        <div className="backdrop-blur-md rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] border border-white/10 p-8 sm:p-10 bg-white/5">

          {success ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-[#5227FF]/20 border border-[#5227FF]/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-[#a98bff]">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Password Changed!</h2>
              <p className="text-slate-400 mb-1">Your password has been reset successfully.</p>
              <p className="text-slate-500 text-sm mb-6">Redirecting you to login...</p>
              <Link to="/auth/login" className="text-sm font-semibold text-white hover:text-[#a98bff] transition-colors">
                Go to login now →
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-8 text-center">
                <h2 className="text-3xl font-bold text-white mb-2">Set New Password</h2>
                <p className="text-slate-400">Choose a strong password for your account.</p>
              </div>

              {error && (
                <div className="bg-red-900/40 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg mb-6 text-sm">
                  {error}
                  {error.toLowerCase().includes('expired') && (
                    <span> <Link to="/auth/forgot-password" className="font-semibold underline">Request a new link.</Link></span>
                  )}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="newPassword" className="block text-sm font-semibold text-slate-300 mb-2">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      id="newPassword"
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className={`${inputClass} pr-12`}
                      placeholder="At least 8 characters"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors focus:outline-none"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-semibold text-slate-300 mb-2">
                    Confirm New Password
                  </label>
                  <input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={inputClass}
                    placeholder="Re-enter your password"
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
                      Resetting...
                    </span>
                  ) : (
                    'Reset Password'
                  )}
                </button>
              </form>

              <p className="text-center mt-6 text-sm text-slate-400">
                <Link to="/auth/login" className="font-semibold text-white hover:text-[#a98bff] transition-colors">
                  ← Back to login
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
