import { useState, useEffect, useCallback } from 'react'
import { webhookService, type WebhookEndpoint, type WebhookDelivery } from '@/services/webhookService'
import {
  Plus,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Loader2,
  Copy,
  Check,
  Eye,
  EyeOff,
  Zap,
} from 'lucide-react'

const EVENT_OPTIONS = [
  { value: '*', label: 'All events' },
  { value: 'user.created', label: 'user.created' },
  { value: 'user.updated', label: 'user.updated' },
  { value: 'user.activated', label: 'user.activated' },
  { value: 'user.deactivated', label: 'user.deactivated' },
  { value: 'bill.created', label: 'bill.created' },
]

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    retrying: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
      title="Copy"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

function DeliveriesPanel({ endpointId }: { endpointId: string }) {
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    webhookService.deliveries(endpointId)
      .then((d) => setDeliveries(d.deliveries))
      .finally(() => setLoading(false))
  }, [endpointId])

  if (loading) return <div className="py-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
  if (deliveries.length === 0) return <p className="py-4 text-center text-sm text-gray-400">No deliveries yet.</p>

  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-700">
      {deliveries.map((d) => (
        <div key={d.delivery_id} className="flex items-center gap-3 py-2.5 px-4 text-sm">
          <StatusBadge status={d.status} />
          <span className="text-gray-700 dark:text-gray-300 font-mono text-xs flex-1 truncate">{d.event_type}</span>
          {d.response_status && <span className="text-gray-400 text-xs">HTTP {d.response_status}</span>}
          <span className="text-gray-400 text-xs">{d.created_at ? new Date(d.created_at).toLocaleString() : ''}</span>
          {d.error && <span className="text-red-400 text-xs truncate max-w-[120px]" title={d.error}>{d.error}</span>}
        </div>
      ))}
    </div>
  )
}

interface EndpointCardProps {
  ep: WebhookEndpoint
  newSecret?: string
  onDelete: (id: string) => void
  onToggle: (id: string, active: boolean) => void
  onTest: (id: string) => void
}

function EndpointCard({ ep, newSecret, onDelete, onToggle, onTest }: EndpointCardProps) {
  const [expanded, setExpanded] = useState(!!newSecret)
  const [showSecret, setShowSecret] = useState(!!newSecret)
  const [testing, setTesting] = useState(false)
  const [toggling, setToggling] = useState(false)

  const handleTest = async () => {
    setTesting(true)
    await onTest(ep.endpoint_id)
    setTesting(false)
  }

  const handleToggle = async () => {
    setToggling(true)
    await onToggle(ep.endpoint_id, !ep.is_active)
    setToggling(false)
  }

  const displaySecret = newSecret ?? ep.secret

  return (
    <div className={`rounded-xl border ${ep.is_active ? 'border-gray-200 dark:border-gray-700' : 'border-gray-100 dark:border-gray-800 opacity-60'} bg-white dark:bg-gray-800 overflow-hidden`}>
      {/* Header */}
      <div className="flex items-center gap-3 p-4">
        <div className="flex-1 min-w-0">
          <p className="font-mono text-sm text-gray-800 dark:text-gray-200 truncate">{ep.url}</p>
          {ep.description && <p className="text-xs text-gray-400 mt-0.5">{ep.description}</p>}
          <p className="text-xs text-gray-400 mt-0.5">Events: {ep.events}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Status toggle */}
          <button
            type="button"
            onClick={handleToggle}
            disabled={toggling}
            title={ep.is_active ? 'Disable' : 'Enable'}
            className={`w-8 h-4 rounded-full transition-colors ${ep.is_active ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'} relative flex-shrink-0`}
          >
            <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all ${ep.is_active ? 'left-[18px]' : 'left-0.5'}`} />
          </button>
          {/* Test */}
          <button type="button" onClick={handleTest} disabled={testing || !ep.is_active} title="Send test ping"
            className="p-1.5 text-gray-400 hover:text-violet-500 transition-colors disabled:opacity-40">
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          </button>
          {/* Delete */}
          <button type="button" onClick={() => onDelete(ep.endpoint_id)} title="Delete"
            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
          {/* Expand */}
          <button type="button" onClick={() => setExpanded(!expanded)}
            className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-700">
          {/* Secret */}
          {displaySecret && (
            <div className="px-4 py-3 bg-amber-50 dark:bg-amber-900/10 border-b border-amber-100 dark:border-amber-800/30">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">
                {newSecret ? 'Signing secret — save now, shown once' : 'Signing secret'}
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono text-xs text-amber-900 dark:text-amber-300 break-all">
                  {showSecret ? displaySecret : '•'.repeat(displaySecret.length)}
                </code>
                <button type="button" onClick={() => setShowSecret(!showSecret)}
                  className="p-1 text-amber-400 hover:text-amber-600">
                  {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <CopyButton text={displaySecret} />
              </div>
            </div>
          )}
          {/* Delivery history */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 px-4 pt-3 pb-1">Recent deliveries</p>
            <DeliveriesPanel endpointId={ep.endpoint_id} />
          </div>
        </div>
      )}
    </div>
  )
}

interface CreateForm {
  url: string
  events: string
  description: string
}

export default function WebhooksTab() {
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([])
  const [newSecrets, setNewSecrets] = useState<Record<string, string>>({}) // endpointId → one-time secret
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<CreateForm>({ url: '', events: '*', description: '' })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const eps = await webhookService.list()
      setEndpoints(eps)
    } catch {
      setError('Failed to load webhooks')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    const url = form.url.trim()
    if (!url.startsWith('http')) { setError('A valid URL is required'); return }
    setCreating(true)
    setError('')
    try {
      const ep = await webhookService.create({ url, events: form.events, description: form.description.trim() || undefined })
      if (ep.secret) setNewSecrets((prev) => ({ ...prev, [ep.endpoint_id]: ep.secret! }))
      setEndpoints((prev) => [ep, ...prev])
      setShowForm(false)
      setForm({ url: '', events: '*', description: '' })
      setSuccessMsg('Webhook endpoint created.')
      setTimeout(() => setSuccessMsg(''), 5000)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create endpoint')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this webhook endpoint?')) return
    try {
      await webhookService.remove(id)
      setEndpoints((prev) => prev.filter((e) => e.endpoint_id !== id))
    } catch {
      setError('Failed to delete endpoint')
    }
  }

  const handleToggle = async (id: string, active: boolean) => {
    try {
      const updated = await webhookService.update(id, { is_active: active })
      setEndpoints((prev) => prev.map((e) => e.endpoint_id === id ? updated : e))
    } catch {
      setError('Failed to update endpoint')
    }
  }

  const handleTest = async (id: string) => {
    try {
      await webhookService.test(id)
      setSuccessMsg('Test ping sent. Check deliveries in a moment.')
      setTimeout(() => setSuccessMsg(''), 4000)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Test failed')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">Webhook Endpoints</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Receive real-time events in your systems via HTTP POST.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={load} title="Refresh" className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" /> Add endpoint
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 px-4 py-3 rounded-xl text-sm">
          {successMsg}
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">New endpoint</h4>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">URL *</label>
            <input
              type="url"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://your-server.example.com/webhook"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Events</label>
            <select
              value={form.events}
              onChange={(e) => setForm({ ...form, events: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 outline-none"
            >
              {EVENT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Or enter comma-separated event names, e.g. <code className="font-mono">user.created,bill.created</code>
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Description (optional)</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Slack notifications, CRM sync…"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
            />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={() => setShowForm(false)}
              className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
              Cancel
            </button>
            <button type="button" onClick={handleCreate} disabled={creating}
              className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
              {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Create
            </button>
          </div>
        </div>
      )}

      {/* Endpoint list */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-7 h-7 animate-spin text-gray-400" /></div>
      ) : endpoints.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">
          <p>No webhook endpoints yet.</p>
          <p className="text-xs mt-1">Add one above to start receiving events.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {endpoints.map((ep) => (
            <EndpointCard
              key={ep.endpoint_id}
              ep={ep}
              newSecret={newSecrets[ep.endpoint_id]}
              onDelete={handleDelete}
              onToggle={handleToggle}
              onTest={handleTest}
            />
          ))}
        </div>
      )}

      {/* Docs hint */}
      <div className="mt-4 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30 text-sm text-blue-700 dark:text-blue-300">
        <strong>Payload signing</strong> — Every delivery includes an{' '}
        <code className="font-mono text-xs bg-blue-100 dark:bg-blue-800/30 px-1 rounded">X-Valoryx-Signature</code>{' '}
        header (<code className="font-mono text-xs">sha256=HMAC(secret, body)</code>). Verify it on your server to reject unauthorized requests.
        Failed deliveries retry up to 3 times with exponential backoff.
      </div>
    </div>
  )
}
