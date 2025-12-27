'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useClient } from '@/contexts/ClientContext'
import LogoAnimation from '@/components/LogoAnimation'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import api from '@/lib/api'

// Dynamic import with SSR disabled for Three.js components
const ParticleRing = dynamic(() => import('@/components/ParticleRing'), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-transparent" />
})

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSplash, setShowSplash] = useState(false)
  const [clientLogoUrl, setClientLogoUrl] = useState<string | undefined>()
  const [isFlipped, setIsFlipped] = useState(false)
  const [funnyMessage, setFunnyMessage] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter()
  const { setClientData } = useClient()

  const funnyMessages = [
    "Oops! Did you forget something? 🤔 Maybe... like, EVERYTHING?",
    "Nice try! But you need to actually type something first! 😅",
    "Empty fields? Really? Even my grandma fills forms better! 👵",
    "Hello? Is anyone there? Your email and password are missing! 📧🔐",
    "Pro tip: Login requires actual credentials, not just good vibes! ✨",
    "Error 404: Email and Password not found! 🔍",
    "I see you like living dangerously... without credentials! 😎",
    "Did you think I wouldn't notice? Fill in the blanks! 📝"
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Check if fields are empty
    if (!email.trim() || !password.trim()) {
      const randomMessage = funnyMessages[Math.floor(Math.random() * funnyMessages.length)]
      setFunnyMessage(randomMessage)
      setIsFlipped(true)

      // Flip back after 3 seconds
      setTimeout(() => {
        setIsFlipped(false)
      }, 3000)

      return
    }

    setLoading(true)

    try {
      // Perform login API call directly (without auto-redirect)
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

      // Update ClientContext (this also updates localStorage and axios headers)
      setClientData(userData, clientData, token)

      // Show splash screen with client logo
      setClientLogoUrl(client_logo)
      setShowSplash(true)
      setLoading(false)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed')
      setLoading(false)
    }
  }

  const handleSplashComplete = () => {
    // Navigate to billing after splash animation completes
    router.push('/billing/create')
  }

  // Show splash screen overlay
  if (showSplash) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <LogoAnimation
          onComplete={handleSplashComplete}
          logoUrl={clientLogoUrl}
          duration={5000}
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-amber-50 via-yellow-50/50 to-slate-100 relative overflow-hidden">
      {/* 3D Particle Ring Background */}
      <ParticleRing />

      {/* Rich Gradient Overlays Matching Logo */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-amber-200/30 via-yellow-100/20 to-transparent"></div>
        <div className="absolute bottom-0 right-0 w-full h-full bg-gradient-to-tl from-slate-300/20 via-gray-200/15 to-transparent"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-amber-300/20 via-transparent to-amber-200/15"></div>
      </div>

      {/* Animated Gradient Orbs */}
      <div className="absolute inset-0 pointer-events-none opacity-60">
        <div className="absolute top-0 -left-1/4 w-[600px] h-[600px] bg-gradient-to-br from-amber-300/40 via-yellow-200/30 to-transparent rounded-full blur-3xl animate-pulse-slow"></div>
        <div className="absolute bottom-0 -right-1/4 w-[500px] h-[500px] bg-gradient-to-tl from-amber-400/25 via-orange-200/20 to-transparent rounded-full blur-3xl animate-pulse-slower"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-gradient-to-r from-yellow-200/25 via-transparent to-amber-300/20 rounded-full blur-3xl animate-rotate-slow"></div>
        <div className="absolute top-1/3 left-1/3 w-[400px] h-[400px] bg-gradient-to-bl from-amber-200/30 to-transparent rounded-full blur-2xl animate-float"></div>
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
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none -mt-8 sm:-mt-12 md:-mt-16 animate-logo-breathe">
        <div className="relative w-[200%] h-[100%] sm:w-[180%] sm:h-[95%] md:w-[160%] md:h-[90%]">
          <Image
            src="/RYX_Logo.png"
            alt="RYX"
            fill
            className="object-contain scale-[2] sm:scale-[1.75] md:scale-[1.5] opacity-95"
            priority
            sizes="200vw"
          />
        </div>
      </div>

      {/* Card Container */}
      <div className="w-full max-w-md relative z-10 animate-float">
        {/* Card Flip Container */}
        <div className={`relative w-full transition-all duration-700 transform-style-3d ${isFlipped ? 'rotate-y-180' : ''}`}>
          {/* Front of Card - Login Form */}
          <div className={`backdrop-blur-[2px] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.3)] border border-white/70 p-8 sm:p-10 bg-white/25 backface-hidden ${isFlipped ? 'invisible' : 'visible'}`}>
            {/* Header */}
            <div className="mb-8 text-center">
              <h2 className="text-3xl font-bold text-slate-900 mb-2">Welcome Back</h2>
              <p className="text-slate-600">Sign in to access your billing dashboard</p>
            </div>

          {error && (
            <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg mb-6 animate-shake">
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

          {/* Back of Card - Funny Message */}
          <div className={`absolute inset-0 backdrop-blur-md rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.3)] border border-white/70 p-8 sm:p-10 bg-gradient-to-br from-red-50/80 to-orange-50/80 flex items-center justify-center transform rotate-y-180 backface-hidden ${isFlipped ? 'visible' : 'invisible'}`}>
            <div className="text-center animate-bounce-in">
              <div className="mb-6">
                <div className="text-8xl font-black text-red-600 animate-shake-intense mb-4">!</div>
              </div>
              <p className="text-4xl font-black text-slate-900 mb-6 animate-fade-in-delay">OOPS!</p>
              <p className="text-xl font-semibold text-slate-800 leading-relaxed px-4 animate-fade-in-delay-2">
                {funnyMessage}
              </p>
              <div className="mt-8 text-sm font-medium text-slate-600 animate-pulse">
                Flipping back in 3 seconds...
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        @keyframes shake-intense {
          0%, 100% { transform: rotate(0deg) scale(1); }
          10% { transform: rotate(-8deg) scale(1.1); }
          20% { transform: rotate(8deg) scale(1.2); }
          30% { transform: rotate(-10deg) scale(1.1); }
          40% { transform: rotate(10deg) scale(1.2); }
          50% { transform: rotate(-8deg) scale(1.15); }
          60% { transform: rotate(8deg) scale(1.1); }
          70% { transform: rotate(-6deg) scale(1.05); }
          80% { transform: rotate(6deg) scale(1.1); }
          90% { transform: rotate(-4deg) scale(1.05); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        @keyframes pulse-slow {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.1); }
        }
        @keyframes pulse-slower {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.15); }
        }
        @keyframes rotate-slow {
          0% { transform: translate(-50%, -50%) rotate(0deg); }
          100% { transform: translate(-50%, -50%) rotate(360deg); }
        }
        @keyframes logo-breathe {
          0%, 100% { transform: scale(1); opacity: 0.95; }
          50% { transform: scale(1.02); opacity: 1; }
        }
        @keyframes bounce-in {
          0% { transform: scale(0.3); opacity: 0; }
          50% { transform: scale(1.05); }
          70% { transform: scale(0.9); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes emoji-wiggle {
          0% { transform: rotate(0deg) scale(1) translateY(0); }
          10% { transform: rotate(-20deg) scale(1.3) translateY(-20px); }
          20% { transform: rotate(20deg) scale(0.8) translateY(10px); }
          30% { transform: rotate(-25deg) scale(1.4) translateY(-15px); }
          40% { transform: rotate(25deg) scale(0.9) translateY(5px); }
          50% { transform: rotate(-20deg) scale(1.3) translateY(-25px); }
          60% { transform: rotate(15deg) scale(1.1) translateY(0); }
          70% { transform: rotate(-15deg) scale(1.2) translateY(-10px); }
          80% { transform: rotate(10deg) scale(0.95) translateY(5px); }
          90% { transform: rotate(-5deg) scale(1.05) translateY(-5px); }
          100% { transform: rotate(0deg) scale(1) translateY(0); }
        }
        @keyframes fade-in-delay {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes fade-in-delay-2 {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
        .animate-shake-intense {
          animation: shake-intense 0.8s ease-in-out infinite;
          display: inline-block;
        }
        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
        .animate-emoji-wiggle {
          animation: emoji-wiggle 1.5s ease-in-out infinite;
          display: inline-block;
        }
        .animate-fade-in-delay {
          animation: fade-in-delay 0.5s ease-out 0.3s both;
        }
        .animate-fade-in-delay-2 {
          animation: fade-in-delay-2 0.5s ease-out 0.5s both;
        }
        .animate-pulse-slow {
          animation: pulse-slow 4s ease-in-out infinite;
        }
        .animate-pulse-slower {
          animation: pulse-slower 6s ease-in-out infinite;
        }
        .animate-rotate-slow {
          animation: rotate-slow 20s linear infinite;
        }
        .animate-logo-breathe {
          animation: logo-breathe 4s ease-in-out infinite;
        }
        .animate-bounce-in {
          animation: bounce-in 0.6s ease-out;
        }
        .transform-style-3d {
          transform-style: preserve-3d;
        }
        .backface-hidden {
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        .rotate-y-180 {
          transform: rotateY(180deg);
        }
      `}</style>
    </div>
  )
}
