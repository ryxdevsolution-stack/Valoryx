import { useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import api from '@/lib/api'
import { useClient } from '@/contexts/ClientContext'
import { consumePendingDownload } from '@/lib/pendingDownload'

export default function OAuthCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { setClientData } = useClient()
  const hasRun = useRef(false)

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    if (error || !code) {
      navigate('/auth/login?error=oauth_cancelled', { replace: true })
      return
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    api.post('/oauth/google/callback', { code, state }, { signal: controller.signal })
      .then(res => {
        clearTimeout(timeoutId)
        const { token, user, client } = res.data
        const userData = {
          user_id: user.user_id,
          email: user.email,
          full_name: user.full_name || user.email.split('@')[0],
          phone: user.phone || '',
          department: user.department || '',
          role: user.role,
          is_super_admin: user.is_super_admin || false,
          permissions: user.permissions || [],
          totp_enabled: user.totp_enabled ?? false,
          must_change_password: user.must_change_password ?? false,
          avatar_url: user.avatar_url || null,
        }
        const clientData = {
          client_id: client.client_id,
          client_name: client.client_name,
          logo_url: client.logo_url || null,
          address: client.address || '',
          phone: client.phone || '',
          email: client.email || '',
          gstin: client.gstin || '',
          subscription_status: client.subscription_status,
          trial_end_date: client.trial_end_date || null,
          trial_days_remaining: client.trial_days_remaining || null,
          subscription_end_date: client.subscription_end_date || null,
        }
        setClientData(userData, clientData, token)
        // If the user came from the landing "Continue with Google → download"
        // flow, trigger the deferred installer download now.
        consumePendingDownload()
        if (user.must_change_password) {
          localStorage.setItem('must_change_password', 'true')
          navigate('/change-password', { replace: true })
        } else {
          navigate('/billing/create', { replace: true })
        }
      })
      .catch(err => {
        clearTimeout(timeoutId)
        if (err.name === 'CanceledError' || err.name === 'AbortError') {
          navigate('/auth/login?error=oauth_timeout', { replace: true })
        } else {
          navigate('/auth/login?error=oauth_failed', { replace: true })
        }
      })

    return () => {
      clearTimeout(timeoutId)
      controller.abort()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-[#0f0a1e] flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-slate-400 text-sm">Signing you in with Google...</p>
      </div>
    </div>
  )
}
