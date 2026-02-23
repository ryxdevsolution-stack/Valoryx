import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useClient } from '@/contexts/ClientContext'
import api from '@/lib/api'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const navigate = useNavigate()
  const { setClientData } = useClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password')
      return
    }

    setLoading(true)

    try {
      const response = await api.post('/auth/login', { email, password })
      const { token, user, client_id, client_name, client_logo, client_address, client_phone, client_email, client_gstin } = response.data

      const userData = {
        user_id: user.user_id,
        email: user.email,
        role: user.role,
        is_super_admin: user.is_super_admin,
        permissions: user.permissions
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
      navigate('/billing/create')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-amber-50 via-yellow-50/50 to-slate-100 relative overflow-hidden">
      {/* Rich Gradient Overlays Matching Logo */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-amber-200/30 via-yellow-100/20 to-transparent"></div>
        <div className="absolute bottom-0 right-0 w-full h-full bg-gradient-to-tl from-slate-300/20 via-gray-200/15 to-transparent"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-amber-300/20 via-transparent to-amber-200/15"></div>
      </div>

      {/* Gradient Orbs (static, no animation) */}
      <div className="absolute inset-0 pointer-events-none opacity-60">
        <div className="absolute top-0 -left-1/4 w-[600px] h-[600px] bg-gradient-to-br from-amber-300/40 via-yellow-200/30 to-transparent rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 -right-1/4 w-[500px] h-[500px] bg-gradient-to-tl from-amber-400/25 via-orange-200/20 to-transparent rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-gradient-to-r from-yellow-200/25 via-transparent to-amber-300/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 left-1/3 w-[400px] h-[400px] bg-gradient-to-bl from-amber-200/30 to-transparent rounded-full blur-2xl"></div>
      </div>

      {/* Subtle Elegant Pattern */}
      <div className="absolute inset-0 pointer-events-none opacity-8">
        <div className="absolute top-0 left-0 w-full h-full" style={{
          backgroundImage: `radial-gradient(circle at 25% 25%, rgba(251, 191, 36, 0.2) 1px, transparent 1px),
                           radial-gradient(circle at 75% 75%, rgba(217, 119, 6, 0.15) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }}></div>
      </div>

      {/* Background Logo */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none -mt-8 sm:-mt-12 md:-mt-16">
        <div className="relative w-[200%] h-[100%] sm:w-[180%] sm:h-[95%] md:w-[160%] md:h-[90%]">
          <img
            src="/RYX_Logo.png"
            alt="RYX"
            className="object-contain scale-[2] sm:scale-[1.75] md:scale-[1.5] opacity-95"
            style={{ position: 'absolute', width: '100%', height: '100%' }}
          />
        </div>
      </div>

      {/* Card Container */}
      <div className="w-full max-w-md relative z-10">
        <div className="backdrop-blur-[2px] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.3)] border border-white/70 p-8 sm:p-10 bg-white/25">
          {/* Header */}
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-bold text-slate-900 mb-2">Welcome Back</h2>
            <p className="text-slate-600">Sign in to access your billing dashboard</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="relative">
              <label htmlFor="email" className="block text-sm font-semibold text-slate-700 mb-2">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all duration-200 text-slate-900 placeholder-slate-400"
                placeholder="Enter your email"
              />
            </div>

            <div className="relative">
              <label htmlFor="password" className="block text-sm font-semibold text-slate-700 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-12 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all duration-200 text-slate-900 placeholder-slate-400"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 transition-colors focus:outline-none"
                  aria-label={showPassword ? "Hide password" : "Show password"}
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

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3.5 px-6 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg mt-6"
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
        </div>
      </div>
    </div>
  )
}
