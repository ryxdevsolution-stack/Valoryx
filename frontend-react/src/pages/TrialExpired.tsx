import { Clock, LogOut, MessageCircle, Mail, ArrowLeft, CreditCard, ShieldAlert } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useClient } from '@/contexts/ClientContext'
import PricingCards from '@/components/PricingCards'

export default function TrialExpiredPage() {
  const { logout, client, user } = useClient()
  const navigate = useNavigate()

  const canPay = user?.role === 'owner' || user?.role === 'manager'
  const expiredKind: 'trial' | 'subscription' =
    client?.subscription_status === 'expired' && client?.trial_end_date && !client?.subscription_end_date
      ? 'trial'
      : (client?.subscription_end_date ? 'subscription' : 'trial')

  function handleSubscribed() {
    const isElectron = !!(window as any).electronAPI?.isElectron
    window.location.href = isElectron ? '#/dashboard' : '/dashboard'
  }

  function handleBack() {
    if (window.history.length > 2) {
      navigate(-1)
    } else {
      const isElectron = !!(window as any).electronAPI?.isElectron
      window.location.href = isElectron ? '#/billing/create' : '/billing/create'
    }
  }

  const title = expiredKind === 'trial' ? 'Your Free Trial Has Ended' : 'Your Subscription Has Expired'
  const subtitle = expiredKind === 'trial'
    ? `The 14-day free trial${client?.client_name ? ` for ${client.client_name}` : ''} has expired.`
    : `The subscription${client?.client_name ? ` for ${client.client_name}` : ''} has expired.`

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="flex items-center px-4 pt-4">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 rounded-lg px-3 py-2 shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      </div>

      <div className="text-center pt-8 pb-6 px-4">
        <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${
          canPay ? 'bg-orange-100 dark:bg-orange-900/30' : 'bg-blue-100 dark:bg-blue-900/30'
        }`}>
          {canPay
            ? <Clock className="w-8 h-8 text-orange-600 dark:text-orange-400" />
            : <ShieldAlert className="w-8 h-8 text-blue-600 dark:text-blue-400" />}
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-2">{title}</h1>
        <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
          {subtitle}{' '}
          {canPay ? 'Choose a plan to continue using all features.' : 'Please contact your owner or manager to renew.'}
        </p>
      </div>

      {/* OWNER / MANAGER: pricing + Razorpay placeholder */}
      {canPay && (
        <>
          <div className="px-4 pb-4">
            <PricingCards onSubscribed={handleSubscribed} />
          </div>
          {/* Razorpay placeholder — wire real flow when integration lands */}
          <div className="max-w-2xl mx-auto px-4 pb-8">
            <div className="rounded-2xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-5 flex items-start gap-3">
              <CreditCard className="w-6 h-6 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-amber-900 dark:text-amber-200">Online payment coming soon</h3>
                <p className="text-sm text-amber-800 dark:text-amber-300 mt-1">
                  Razorpay checkout is being wired up. For now, contact us via WhatsApp or email to renew —
                  we'll process the payment manually and reactivate your account.
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* STAFF / others: read-only "ask your owner" view */}
      {!canPay && (
        <div className="max-w-xl mx-auto px-4 pb-8">
          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-2">What now?</h2>
            <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                <span>
                  Let your <strong>owner or manager</strong> know the subscription has expired.
                </span>
              </li>
              {client?.email && (
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                  <span>
                    Owner email on file: <a href={`mailto:${client.email}`} className="text-blue-600 dark:text-blue-400 underline">{client.email}</a>
                  </span>
                </li>
              )}
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                <span>Once renewed, log back in to regain access.</span>
              </li>
            </ul>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 py-8 px-4">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Need help?</h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
            Contact us {canPay ? 'for custom plans or assistance with your account' : 'if you cannot reach your owner'}.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="https://wa.me/919876543210?text=Hi%2C%20I%20need%20help%20with%20my%20Valoryx%20subscription"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 px-5 rounded-lg text-sm"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp Us
            </a>
            <a
              href="mailto:support@ryxbilling.com?subject=Subscription%20Renewal"
              className="inline-flex items-center justify-center gap-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium py-2.5 px-5 rounded-lg text-sm"
            >
              <Mail className="w-4 h-4" />
              Email Support
            </a>
          </div>
        </div>
      </div>

      <div className="text-center py-6">
        <button
          onClick={logout}
          className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-sm"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>
    </div>
  )
}
