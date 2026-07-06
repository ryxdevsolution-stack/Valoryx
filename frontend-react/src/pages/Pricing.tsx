import { MessageCircle, Mail, Sparkles } from 'lucide-react'
import PricingCards from '@/components/PricingCards'
import { useClient } from '@/contexts/ClientContext'
import { APP_CONFIG } from '@/config'

const FAQS = [
  {
    q: 'Can I switch plans later?',
    a: 'Yes — upgrade or downgrade anytime. Changes take effect at the start of your next billing cycle.',
  },
  {
    q: 'What happens after the free trial?',
    a: `After ${APP_CONFIG.trialDays} days you'll subscribe to a plan to keep using the app. Your data is always preserved.`,
  },
  {
    q: 'Is there a setup fee?',
    a: 'No. All plans are pay-as-you-go with no setup or hidden fees.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel whenever you like — you keep access until the end of your billing period.',
  },
]

export default function PricingPage() {
  const { token } = useClient()
  const waHref = `https://wa.me/${APP_CONFIG.supportWhatsapp}?text=${encodeURIComponent(`Hi, I'm interested in ${APP_CONFIG.name} plans`)}`
  const mailHref = `mailto:${APP_CONFIG.supportEmail}?subject=${encodeURIComponent('Plan Inquiry')}`

  return (
    <div className="min-h-dvh bg-gradient-to-b from-gray-50 via-white to-gray-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      {/* Hero */}
      <div className="text-center pt-16 pb-10 px-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 px-3 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300 mb-4">
          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
          {APP_CONFIG.trialDays}-day free trial · no card required
        </span>
        <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-gray-900 dark:text-white mb-3">
          Simple, transparent pricing
        </h1>
        <p className="text-gray-600 dark:text-gray-400 max-w-xl mx-auto text-base md:text-lg">
          Start free, upgrade when you're ready. Every plan scales with your business.
        </p>
      </div>

      {/* Pricing Cards */}
      <div className="px-4 pb-16">
        <PricingCards showTrialCTA={!token} />
      </div>

      {/* FAQ */}
      <div className="max-w-3xl mx-auto px-4 py-14">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-8 text-center">
          Frequently asked questions
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {FAQS.map((faq) => (
            <div
              key={faq.q}
              className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm"
            >
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1.5">{faq.q}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Contact */}
      <div className="border-t border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-900/40 py-14 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Need help choosing?</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Our team will help you find the right plan for your business.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-500 dark:focus-visible:ring-offset-gray-900"
            >
              <MessageCircle className="w-5 h-5" aria-hidden="true" />
              WhatsApp us
            </a>
            <a
              href={mailHref}
              className="inline-flex items-center justify-center gap-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 font-semibold py-3 px-6 rounded-xl transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 dark:focus-visible:ring-offset-gray-900"
            >
              <Mail className="w-5 h-5" aria-hidden="true" />
              Email support
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
