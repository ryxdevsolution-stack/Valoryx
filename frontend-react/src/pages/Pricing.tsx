import { MessageCircle, Mail } from 'lucide-react'
import PricingCards from '@/components/PricingCards'
import { useClient } from '@/contexts/ClientContext'

export default function PricingPage() {
  const { token } = useClient()

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <div className="text-center pt-16 pb-8 px-4">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-3">
          Choose Your Plan
        </h1>
        <p className="text-gray-600 dark:text-gray-400 max-w-xl mx-auto">
          Simple, transparent pricing. Start with a 14-day free trial, upgrade anytime.
        </p>
      </div>

      {/* Pricing Cards */}
      <div className="px-4 pb-12">
        <PricingCards showTrialCTA={!token} />
      </div>

      {/* Contact Section */}
      <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 py-12 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            Need help choosing?
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Our team is here to help you find the right plan for your business.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://wa.me/919876543210?text=Hi%2C%20I%27m%20interested%20in%20RYX%20Billing%20plans"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg transition"
            >
              <MessageCircle className="w-5 h-5" />
              WhatsApp Us
            </a>
            <a
              href="mailto:support@ryxbilling.com?subject=Plan%20Inquiry"
              className="inline-flex items-center justify-center gap-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-semibold py-3 px-6 rounded-lg transition"
            >
              <Mail className="w-5 h-5" />
              Email Support
            </a>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div className="max-w-2xl mx-auto px-4 py-12">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6 text-center">
          Frequently Asked Questions
        </h2>
        <div className="space-y-4">
          {[
            {
              q: 'Can I switch plans later?',
              a: 'Yes, you can upgrade or downgrade at any time. Changes take effect at the start of your next billing cycle.',
            },
            {
              q: 'What happens after the free trial?',
              a: 'After 14 days, you\'ll need to subscribe to a plan to continue using the app. Your data is preserved.',
            },
            {
              q: 'Is there a setup fee?',
              a: 'No. All plans are pay-as-you-go with no setup or hidden fees.',
            },
            {
              q: 'Can I cancel anytime?',
              a: 'Yes, you can cancel your subscription at any time. You\'ll retain access until the end of your billing period.',
            },
          ].map((faq) => (
            <div key={faq.q} className="bg-white dark:bg-gray-800 rounded-lg p-5 border border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{faq.q}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
