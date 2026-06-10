import { Clock, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useClient } from '@/contexts/ClientContext'

export default function TrialBanner() {
  const { client, user } = useClient()

  // Super admins are exempt from expiry — no trial/upgrade nag for them.
  if (!client || client.subscription_status !== 'trial' || import.meta.env.VITE_ELECTRON || user?.is_super_admin) return null

  const daysLeft = client.trial_days_remaining ?? 0
  const isUrgent = daysLeft <= 3

  return (
    <div
      className={`w-full px-4 py-2 flex items-center justify-between text-sm ${
        isUrgent
          ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-b border-red-200 dark:border-red-800'
          : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-b border-blue-200 dark:border-blue-800'
      }`}
    >
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4" />
        <span>
          {daysLeft > 0
            ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left in your free trial`
            : 'Your free trial has expired'}
        </span>
      </div>
      <Link
        to="/upgrade"
        className={`flex items-center gap-1 px-3 py-1 rounded-lg font-medium transition-colors ${
          isUrgent
            ? 'bg-red-600 hover:bg-red-700 text-white'
            : 'bg-blue-600 hover:bg-blue-700 text-white'
        }`}
      >
        <Zap className="w-3 h-3" />
        Upgrade Now
      </Link>
    </div>
  )
}
