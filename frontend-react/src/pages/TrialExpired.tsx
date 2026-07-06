import { Clock, LogOut, MessageCircle, Mail, ArrowLeft, ShieldAlert } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useClient } from '@/contexts/ClientContext'
import PricingCards from '@/components/PricingCards'
import { APP_CONFIG } from '@/config'

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

  const title = expiredKind === 'trial' ? 'Your free trial has ended' : 'Your subscription has expired'
  const subtitle = expiredKind === 'trial'
    ? `The ${APP_CONFIG.trialDays}-day free trial${client?.client_name ? ` for ${client.client_name}` : ''} has expired.`
    : `The subscription${client?.client_name ? ` for ${client.client_name}` : ''} has expired.`

  const waHref = `https://wa.me/${APP_CONFIG.supportWhatsapp}?text=${encodeURIComponent(`Hi, I need help with my ${APP_CONFIG.name} subscription`)}`
  const mailHref = `mailto:${APP_CONFIG.supportEmail}?subject=${encodeURIComponent('Subscription Renewal')}`

  return (
    <div className="min-h-dvh bg-gradient-to-b from-gray-50 via-white to-gray-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      {/* Back */}
      <div className="flex items-center px-4 pt-4">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 rounded-lg px-3 py-2 shadow-sm transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Back
        </button>
      </div>

      {/* Header */}
      <div className="text-center pt-8 pb-8 px-4">
        <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center ${
          canPay ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-blue-100 dark:bg-blue-900/30'
        }`}>
          {canPay
            ? <Clock className="w-8 h-8 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            : <ShieldAlert className="w-8 h-8 text-blue-600 dark:text-blue-400" aria-hidden="true" />}
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white mb-2">{title}</h1>
        <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
          {subtitle}{' '}
          {canPay ? 'Choose a plan below to continue using all features.' : 'Please contact your owner or manager to renew.'}
        </p>
      </div>

      {/* OWNER / MANAGER: real pricing + checkout */}
      {canPay && (
        <div className="px-4 pb-10">
          <PricingCards onSubscribed={handleSubscribed} />
        </div>
      )}

      {/* STAFF / others: read-only "ask your owner" view */}
      {!canPay && (
        <div className="max-w-xl mx-auto px-4 pb-8">
          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm p-6">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-3">What now?</h2>
            <ul className="space-y-2.5 text-sm text-gray-600 dark:text-gray-400">
              <li className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" aria-hidden="true" />
                <span>Let your <strong className="text-gray-800 dark:text-gray-200">owner or manager</strong> know the subscription has expired.</span>
              </li>
              {client?.email && (
                <li className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" aria-hidden="true" />
                  <span>Owner email on file: <a href={`mailto:${client.email}`} className="text-blue-600 dark:text-blue-400 underline">{client.email}</a></span>
                </li>
              )}
              <li className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" aria-hidden="true" />
                <span>Once renewed, log back in to regain access.</span>
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* Help */}
      <div className="border-t border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-900/40 py-10 px-4">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Need help?</h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm mb-5">
            Contact us {canPay ? 'for custom plans or account assistance' : 'if you cannot reach your owner'}.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2.5 px-5 rounded-xl text-sm transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-500 dark:focus-visible:ring-offset-gray-900"
            >
              <MessageCircle className="w-4 h-4" aria-hidden="true" />
              WhatsApp us
            </a>
            <a
              href={mailHref}
              className="inline-flex items-center justify-center gap-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium py-2.5 px-5 rounded-xl text-sm transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 dark:focus-visible:ring-offset-gray-900"
            >
              <Mail className="w-4 h-4" aria-hidden="true" />
              Email support
            </a>
          </div>
        </div>
      </div>

      {/* Logout */}
      <div className="text-center py-6">
        <button
          type="button"
          onClick={logout}
          className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-sm cursor-pointer transition-colors"
        >
          <LogOut className="w-4 h-4" aria-hidden="true" />
          Logout
        </button>
      </div>
    </div>
  )
}
