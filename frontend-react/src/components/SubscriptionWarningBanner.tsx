import { useState, useEffect } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useClient } from '@/contexts/ClientContext'

const WARN_THRESHOLD_DAYS = 3
const DISMISS_KEY = 'valoryx.subWarnDismissedAt'

/**
 * Soft warning banner shown when trial OR active subscription is within
 * WARN_THRESHOLD_DAYS of expiring. Dismissible per-session (resets next day).
 * Hard-block enforcement is on the backend; this is purely UX.
 */
export default function SubscriptionWarningBanner() {
  const { client, user } = useClient()
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(DISMISS_KEY)
      if (!raw) return false
      // Dismissal expires at the start of the next day
      const dismissedDate = new Date(raw).toDateString()
      const todayDate = new Date().toDateString()
      return dismissedDate === todayDate
    } catch {
      return false
    }
  })

  // If client/user change, re-check dismissal
  useEffect(() => { setDismissed(prev => prev) }, [client?.client_id])

  if (!client || dismissed) return null

  const trialDays = client.trial_days_remaining
  const subDays = client.subscription_days_remaining

  let days: number | null = null
  let kind: 'trial' | 'subscription' | null = null
  if (typeof trialDays === 'number' && trialDays >= 0 && trialDays <= WARN_THRESHOLD_DAYS) {
    days = trialDays
    kind = 'trial'
  } else if (typeof subDays === 'number' && subDays >= 0 && subDays <= WARN_THRESHOLD_DAYS) {
    days = subDays
    kind = 'subscription'
  }

  if (days === null || kind === null) return null

  const canPay = user?.role === 'owner' || user?.role === 'manager'

  const handleDismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, new Date().toISOString()) } catch {}
    setDismissed(true)
  }

  const label = kind === 'trial' ? 'Your free trial' : 'Your subscription'
  const daysLabel = days === 0 ? 'today' : days === 1 ? 'in 1 day' : `in ${days} days`

  return (
    <div className="sticky top-0 z-30 bg-amber-50 dark:bg-amber-900/40 border-b border-amber-300 dark:border-amber-700">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            <strong>{label} expires {daysLabel}.</strong>{' '}
            {canPay
              ? 'Renew now to avoid losing access.'
              : 'Ask your owner or manager to renew.'}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {canPay && (
            <button
              type="button"
              onClick={() => navigate('/upgrade')}
              className="text-xs font-medium px-3 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white"
            >
              Renew
            </button>
          )}
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss"
            className="p-1 rounded hover:bg-amber-100 dark:hover:bg-amber-800/50 text-amber-700 dark:text-amber-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
