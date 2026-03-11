import React, { useEffect, useState } from 'react'
import api from '@/lib/api'

interface Session {
  id: string
  session_id: string
  ip_address: string
  device: string
  user_agent: string
  created_at: string
  last_seen: string
  expires_at: string
  is_active: boolean
  is_current: boolean
}

export default function SessionsTab() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadSessions = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/sessions')
      setSessions(res.data.data)
    } catch {
      setError('Failed to load sessions.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSessions()
  }, [])

  const revokeSession = async (sessionId: string) => {
    setRevoking(sessionId)
    setError('')
    setSuccess('')
    try {
      await api.post(`/sessions/${sessionId}/revoke`)
      setSuccess('Session revoked successfully.')
      setSessions(prev => prev.filter(s => s.session_id !== sessionId))
    } catch {
      setError('Failed to revoke session.')
    } finally {
      setRevoking(null)
    }
  }

  const revokeAll = async () => {
    if (!confirm('Sign out all other devices? You will stay logged in on this device.')) return
    setError('')
    setSuccess('')
    try {
      const res = await api.post('/sessions/revoke-all')
      setSuccess(res.data.message)
      await loadSessions()
    } catch {
      setError('Failed to revoke sessions.')
    }
  }

  const formatDate = (iso: string) => new Date(iso).toLocaleString()

  const deviceIcon = (device: string) => {
    if (device === 'Mobile') return '📱'
    if (device === 'Tablet') return '📟'
    return '🖥️'
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-lg font-semibold text-white">Active Sessions</h3>
          <p className="text-slate-400 text-sm">Devices currently signed into your account.</p>
        </div>
        {sessions.filter(s => !s.is_current).length > 0 && (
          <button
            type="button"
            onClick={revokeAll}
            className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30 transition-colors"
          >
            Sign Out All Others
          </button>
        )}
      </div>

      {error && (
        <p className="text-red-400 text-sm mb-4 bg-red-400/10 px-3 py-2 rounded-lg">{error}</p>
      )}
      {success && (
        <p className="text-green-400 text-sm mb-4 bg-green-400/10 px-3 py-2 rounded-lg">{success}</p>
      )}

      {loading ? (
        <p className="text-slate-400 text-sm">Loading sessions...</p>
      ) : sessions.length === 0 ? (
        <p className="text-slate-400 text-sm">No active sessions found.</p>
      ) : (
        <div className="space-y-3">
          {sessions.map(s => (
            <div
              key={s.id}
              className={`flex items-center justify-between p-4 rounded-xl border ${
                s.is_current
                  ? 'border-violet-500/50 bg-violet-500/5'
                  : 'border-white/10 bg-white/5'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-2xl shrink-0">{deviceIcon(s.device)}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-medium text-sm">{s.device || 'Unknown Device'}</span>
                    {s.is_current && (
                      <span className="text-xs bg-violet-500/30 text-violet-300 px-2 py-0.5 rounded-full">
                        This device
                      </span>
                    )}
                  </div>
                  <div className="text-slate-400 text-xs mt-0.5">
                    {s.ip_address} · Last active {formatDate(s.last_seen)}
                  </div>
                  <div className="text-slate-600 text-xs mt-0.5 truncate max-w-xs">
                    {s.user_agent}
                  </div>
                </div>
              </div>
              {!s.is_current && (
                <button
                  type="button"
                  onClick={() => revokeSession(s.session_id)}
                  disabled={revoking === s.session_id}
                  className="ml-4 shrink-0 px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-xs hover:bg-red-500/30 disabled:opacity-50 transition-colors"
                >
                  {revoking === s.session_id ? 'Signing out...' : 'Sign out'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
