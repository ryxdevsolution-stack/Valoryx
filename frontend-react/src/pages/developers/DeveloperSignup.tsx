import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Mail } from 'lucide-react'
import api from '@/lib/api'
import LightPillar from '@/components/LightPillar'

export default function DeveloperSignup() {
  const [formData, setFormData] = useState({ name: '', email: '', company: '', phone: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const inputClass = "w-full px-4 py-3 bg-white/5 border border-white/15 rounded-lg focus:ring-2 focus:ring-[#5227FF] focus:border-transparent outline-none transition-all duration-200 text-white placeholder-slate-500"

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/external/developers/register', {
        name: formData.name,
        email: formData.email,
        company: formData.company || undefined,
        phone: formData.phone || undefined,
      })
      setSubmitted(true)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#271E37] relative overflow-hidden">
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

      <div className="w-full max-w-md relative z-10">
        <div className="backdrop-blur-md rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] border border-white/10 p-8 sm:p-10 bg-white/5">
          {submitted ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-5">
                <Mail className="w-7 h-7 text-emerald-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Registration received</h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                We'll review your application and email your API key to <span className="text-white font-medium">{formData.email}</span> once approved.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-8 text-center">
                <h2 className="text-3xl font-bold text-white mb-2">Ryx Developer API</h2>
                <p className="text-slate-400">Register to get access to the stock management API</p>
              </div>

              {error && (
                <div className="bg-red-900/40 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg mb-6 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-semibold text-slate-300 mb-2">Your Name</label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    required
                    value={formData.name}
                    onChange={handleChange}
                    className={inputClass}
                    placeholder="Gokul"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-semibold text-slate-300 mb-2">Email Address</label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    className={inputClass}
                    placeholder="you@example.com"
                  />
                  <p className="text-xs text-slate-500 mt-1.5">Your API key will be sent here once approved.</p>
                </div>

                <div>
                  <label htmlFor="company" className="block text-sm font-semibold text-slate-300 mb-2">
                    Company <span className="text-slate-500 font-normal">(optional)</span>
                  </label>
                  <input
                    id="company"
                    name="company"
                    type="text"
                    value={formData.company}
                    onChange={handleChange}
                    className={inputClass}
                    placeholder="Your agency / freelance name"
                  />
                </div>

                <div>
                  <label htmlFor="phone" className="block text-sm font-semibold text-slate-300 mb-2">
                    Phone <span className="text-slate-500 font-normal">(optional)</span>
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handleChange}
                    className={inputClass}
                    placeholder="+91 98765 43210"
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
                      Submitting...
                    </span>
                  ) : (
                    'Register for API Access'
                  )}
                </button>
              </form>

              <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-slate-500">
                {['Manual review', 'Scoped to stock management only', 'Revocable anytime'].map((item) => (
                  <span key={item} className="flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#5227FF]" />
                    {item}
                  </span>
                ))}
              </div>

              <p className="text-center mt-5 text-sm text-slate-400">
                Already registered?{' '}
                <Link to="/" className="font-semibold text-white hover:text-[#a98bff] transition-colors">
                  Back to home
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
