import { useState, useEffect } from 'react'
import { Crown, X } from 'lucide-react'
import api from '@/lib/api'
import { Button } from '@/lib/admin'

interface Client {
  client_id: string
  client_name: string
  subscription_status: string | null
  subscription_end_date: string | null
  trial_end_date: string | null
  plan_id: string | null
}

interface Plan {
  plan_id: string
  name: string
}

interface Props {
  open: boolean
  client: Client | null
  onClose: () => void
  onSaved: (updatedClient: Record<string, unknown>) => void
}

const STATUS_OPTIONS = [
  { value: 'trial', label: 'Trial' },
  { value: 'active', label: 'Active' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'expired', label: 'Expired' },
]

function toDateInputValue(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

function addDays(baseISO: string, days: number): string {
  const d = baseISO ? new Date(baseISO) : new Date()
  if (isNaN(d.getTime())) d.setTime(Date.now())
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export default function ManageMembershipModal({ open, client, onClose, onSaved }: Props) {
  const [status, setStatus] = useState<string>('trial')
  const [endsOn, setEndsOn] = useState<string>('')
  const [planId, setPlanId] = useState<string>('')
  const [reason, setReason] = useState<string>('')
  const [plans, setPlans] = useState<Plan[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Seed form whenever a client opens
  useEffect(() => {
    if (!client) return
    setStatus(client.subscription_status || 'trial')
    const seedDate = client.subscription_status === 'trial' ? client.trial_end_date : client.subscription_end_date
    setEndsOn(toDateInputValue(seedDate))
    setPlanId(client.plan_id || '')
    setReason('')
    setError(null)
  }, [client])

  // Load plans once
  useEffect(() => {
    if (!open) return
    api.get('/subscription/plans').then(r => {
      // Be tolerant of shape — could be {plans: [...]}, an array, or {data: [...]}
      const arr = r.data?.plans || r.data?.data || (Array.isArray(r.data) ? r.data : [])
      setPlans(arr)
    }).catch(() => setPlans([]))
  }, [open])

  if (!open || !client) return null

  const dateLabel = status === 'trial' ? 'Trial Ends On' : 'Subscription Ends On'

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const resp = await api.post(`/admin/clients/${client.client_id}/subscription`, {
        subscription_status: status,
        ends_on: endsOn || null,
        plan_id: planId || null,
        reason: reason.trim() || null,
      })
      onSaved(resp.data?.client || {})
      onClose()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      setError(err?.response?.data?.error || err?.message || 'Failed to update subscription')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div role="dialog" aria-modal="true" className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-500" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Manage Membership
            </h2>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          For <span className="font-medium text-slate-900 dark:text-white">{client.client_name}</span>
        </p>

        <div className="mt-5 space-y-4">
          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Subscription Status</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
            >
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* End date */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{dateLabel}</label>
            <input
              type="date"
              value={endsOn}
              onChange={e => setEndsOn(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
            />
            <div className="mt-2 flex gap-2 flex-wrap">
              <button type="button" onClick={() => setEndsOn(addDays(endsOn, 30))} className="text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300">+30 days</button>
              <button type="button" onClick={() => setEndsOn(addDays(endsOn, 90))} className="text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300">+90 days</button>
              <button type="button" onClick={() => setEndsOn(addDays(endsOn, 365))} className="text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300">+1 year</button>
              <button type="button" onClick={() => setEndsOn('')} className="text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400">Clear</button>
            </div>
          </div>

          {/* Plan (optional) */}
          {plans.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Plan (optional)</label>
              <select
                value={planId}
                onChange={e => setPlanId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
              >
                <option value="">— No plan —</option>
                {plans.map(p => <option key={p.plan_id} value={p.plan_id}>{p.name}</option>)}
              </select>
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Reason (optional — saved in audit log)</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              placeholder="e.g., Goodwill extension after billing issue"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 px-3 py-2 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  )
}
