/**
 * Admin: Impersonate Client
 *
 * Lists all active clients. Clicking "Impersonate" on a row:
 *   1. Calls POST /api/admin/impersonate/<client_id>
 *   2. Stashes the admin token and replaces it with the impersonation token
 *   3. Reloads so ClientContext picks up the new token
 *   4. The ImpersonationBanner then appears on every page
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useClient } from '@/contexts/ClientContext'
import api from '@/lib/api'
import { Search, UserCheck, Loader2 } from 'lucide-react'
import { startImpersonation } from '@/components/ImpersonationBanner'

interface ClientRow {
  client_id: string
  client_name: string
  email: string
  is_active: boolean
  subscription_status: string | null
  created_at: string | null
}

export default function ImpersonateClientPage() {
  const { isSuperAdmin, token } = useClient()
  const navigate = useNavigate()

  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isSuperAdmin()) {
      navigate('/dashboard')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api.get('/admin/clients?limit=200')
      .then((res) => setClients(res.data.clients ?? []))
      .catch(() => setError('Failed to load clients'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = clients.filter((c) =>
    c.client_name.toLowerCase().includes(query.toLowerCase()) ||
    c.email.toLowerCase().includes(query.toLowerCase())
  )

  const handleImpersonate = async (clientId: string) => {
    if (!token) return
    setImpersonatingId(clientId)
    setError('')
    try {
      const res = await api.post(`/admin/impersonate/${clientId}`)
      const impersonationToken: string = res.data.token
      startImpersonation(impersonationToken, token)
      // Full reload — ClientContext re-reads token from localStorage
      window.location.href = '/billing/create'
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to start impersonation')
      setImpersonatingId(null)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Impersonate Client</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Select a client to open a read-only session in their account. All changes are disabled.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search clients by name or email…"
          className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none text-sm"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-gray-500 dark:text-gray-400 py-12 text-sm">No clients match your search.</p>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Client</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden sm:table-cell">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filtered.map((c) => (
                <tr key={c.client_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 dark:text-white">{c.client_name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{c.email}</p>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      c.subscription_status === 'active'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : c.subscription_status === 'trial'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                    }`}>
                      {c.subscription_status ?? 'unknown'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleImpersonate(c.client_id)}
                      disabled={impersonatingId !== null}
                      className="flex items-center gap-1.5 ml-auto px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {impersonatingId === c.client_id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <UserCheck className="w-3.5 h-3.5" />}
                      Impersonate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
