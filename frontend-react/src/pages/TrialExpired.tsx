import { Clock, LogOut, MessageCircle, Mail } from 'lucide-react'
import { useClient } from '@/contexts/ClientContext'
import PricingCards from '@/components/PricingCards'

export default function TrialExpiredPage() {
  const { logout, client } = useClient()

  function handleSubscribed() {
    const isElectron = !!(window as any).electronAPI?.isElectron
    window.location.href = isElectron ? '#/dashboard' : '/frontend/dashboard'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <div className="text-center pt-12 pb-6 px-4">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
          <Clock className="w-8 h-8 text-orange-600 dark:text-orange-400" />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Your Free Trial Has Ended
        </h1>
        <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
          {client?.client_name
            ? `The 14-day free trial for ${client.client_name} has expired.`
            : 'Your 14-day free trial has expired.'}{' '}
          Choose a plan to continue using all features.
        </p>
      </div>

      {/* Pricing Cards */}
      <div className="px-4 pb-8">
        <PricingCards onSubscribed={handleSubscribed} />
      </div>

      {/* Contact Section */}
      <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 py-8 px-4">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
            Need help?
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
            Contact us for custom plans or assistance with your account.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="https://wa.me/919876543210?text=Hi%2C%20I%20need%20help%20upgrading%20my%20RYX%20Billing%20account"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 px-5 rounded-lg transition text-sm"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp Us
            </a>
            <a
              href="mailto:support@ryxbilling.com?subject=Upgrade%20Request"
              className="inline-flex items-center justify-center gap-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium py-2.5 px-5 rounded-lg transition text-sm"
            >
              <Mail className="w-4 h-4" />
              Email Support
            </a>
          </div>
        </div>
      </div>

      {/* Logout */}
      <div className="text-center py-6">
        <button
          onClick={logout}
          className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-sm transition"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>
    </div>
  )
}
