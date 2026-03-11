import React, { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import api from '@/lib/api'
import LightPillar from '@/components/LightPillar'
import { useClient } from '@/contexts/ClientContext'

interface InviteData {
  email: string
  role: string
  full_name: string
  business_name: string
}

export default function AcceptInvitePage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const navigate = useNavigate()
  const { setClientData } = useClient()

  const [inviteData, setInviteData] = useState<InviteData | null>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [tokenError, setTokenError] = useState('')

  useEffect(() => {
    if (!token) {
      setTokenError('Invalid invite link. Please ask your admin to resend.')
      setLoading(false)
      return
    }
    api.post('/invite/validate', { token })
      .then(res => {
        setInviteData(res.data.data)
        setLoading(false)
      })
      .catch((err: any) => {
        setTokenError(err.response?.data?.error || 'Invalid or expired invite link.')
        setLoading(false)
      })
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setSubmitting(true)
    try {
      const res = await api.post('/invite/accept', { token, password })
      const { token: jwt, user, client_id, client_name } = res.data
      setClientData(user, { client_id, client_name }, jwt)
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to activate account. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass =
    'w-full px-4 py-3 bg-white/5 border border-white/15 rounded-lg focus:ring-2 focus:ring-[#5227FF] focus:border-transparent outline-none transition-all duration-200 text-white placeholder-slate-500'

  return (
    <div className="min-h-screen bg-[#0f0a1e] flex items-center justify-center px-4 relative overflow-hidden">
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

      <div className="relative z-10 w-full max-w-md">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
          {loading ? (
            <div className="text-center text-slate-400 py-8">Validating invite...</div>
          ) : tokenError ? (
            <div className="text-center">
              <div className="text-red-400 text-lg font-semibold mb-2">Invalid Invite</div>
              <p className="text-slate-400 text-sm">{tokenError}</p>
            </div>
          ) : inviteData ? (
            <>
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-white mb-1">
                  Welcome to {inviteData.business_name}
                </h1>
                <p className="text-slate-400 text-sm">
                  You&apos;ve been invited as{' '}
                  <span className="text-violet-400 font-medium">{inviteData.role}</span>.
                  Set your password to activate your account.
                </p>
              </div>
              <div className="bg-white/5 rounded-lg px-4 py-3 mb-6 text-sm text-slate-300">
                <span className="text-slate-500">Signing in as: </span>
                {inviteData.email}
              </div>
              {error && (
                <p className="text-red-400 text-sm mb-4 bg-red-400/10 px-3 py-2 rounded-lg">
                  {error}
                </p>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className={inputClass}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className={inputClass}
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 bg-gradient-to-r from-[#5227FF] to-[#9b4fa8] text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 mt-2"
                >
                  {submitting ? 'Activating...' : 'Activate Account'}
                </button>
              </form>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
