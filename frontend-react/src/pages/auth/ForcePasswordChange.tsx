import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '@/lib/api'
import { useClient } from '@/contexts/ClientContext'
import LightPillar from '@/components/LightPillar'

export default function ForcePasswordChangePage() {
  const navigate = useNavigate()
  const { refreshUserData } = useClient()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (newPassword === currentPassword) {
      setError('New password must be different from current password')
      return
    }

    setLoading(true)
    try {
      // Endpoint: POST /profile/password — { current_password, new_password }
      await api.post('/profile/password', {
        current_password: currentPassword,
        new_password: newPassword,
      })
      // Clear the localStorage flag — backend already cleared must_change_password on the user record
      localStorage.removeItem('must_change_password')
      await refreshUserData()
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to change password.')
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'w-full px-4 py-3 bg-white/5 border border-white/15 rounded-lg focus:ring-2 focus:ring-[#5227FF] focus:border-transparent outline-none text-white placeholder-slate-500'

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
          <div className="text-center mb-6">
            <div className="text-amber-400 text-3xl mb-3">&#128274;</div>
            <h1 className="text-2xl font-bold text-white mb-1">Password Change Required</h1>
            <p className="text-slate-400 text-sm">
              Your account requires a password change before you can continue.
            </p>
          </div>

          {error && (
            <p className="text-red-400 text-sm mb-4 bg-red-400/10 px-3 py-2 rounded-lg">{error}</p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Current Password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="Your current password"
                className={inputClass}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Min 6 characters"
                className={inputClass}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className={inputClass}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-[#5227FF] to-[#9b4fa8] text-white font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 mt-2"
            >
              {loading ? 'Saving...' : 'Change Password & Continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
