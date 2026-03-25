import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Check, Zap, Star, Crown } from 'lucide-react'
import { siteConfig } from '@/config/landing.config'
import api from '@/lib/api'

interface Plan {
  plan_id: string
  name: string
  description: string
  monthly_price: number
  yearly_price: number
  features: string[]
  limits: { users: number; bills_per_month: number; storage_gb: number }
  is_popular: boolean
}

const planIcons: Record<string, any> = {
  Starter: Zap,
  Professional: Star,
  Enterprise: Crown,
}

// Static fallback so pricing is always visible even when the API is unreachable
const fallbackPlans: Plan[] = [
  {
    plan_id: 'starter',
    name: 'Starter',
    description: 'Perfect for small businesses just getting started',
    monthly_price: 99900,
    yearly_price: 999900,
    features: ['Basic invoicing', 'Customer management', 'Email support', 'Basic reports'],
    limits: { users: 3, bills_per_month: 100, storage_gb: 5 },
    is_popular: false,
  },
  {
    plan_id: 'professional',
    name: 'Professional',
    description: 'For growing businesses with advanced needs',
    monthly_price: 249900,
    yearly_price: 2499900,
    features: ['Everything in Starter', 'GST billing', 'Inventory management', 'Priority support', 'Advanced reports', 'Multi-user access'],
    limits: { users: 10, bills_per_month: 500, storage_gb: 25 },
    is_popular: true,
  },
  {
    plan_id: 'enterprise',
    name: 'Enterprise',
    description: 'For large organizations with custom requirements',
    monthly_price: 799900,
    yearly_price: 7999900,
    features: ['Everything in Professional', 'Unlimited users', 'Custom integrations', '24/7 phone support', 'Dedicated account manager', 'SLA guarantee', 'White-label options'],
    limits: { users: -1, bills_per_month: -1, storage_gb: 100 },
    is_popular: false,
  },
]

export default function PricingSection() {
  const [plans, setPlans] = useState<Plan[]>(fallbackPlans)
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly')

  useEffect(() => {
    api.get('/subscription/plans')
      .then(res => {
        const live = res.data.plans
        if (Array.isArray(live) && live.length > 0) setPlans(live)
      })
      .catch(() => {}) // keep fallback plans on failure
  }, [])

  function formatPrice(paise: number) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(paise / 100)
  }

  function getYearlySavings(plan: Plan) {
    const monthlyTotal = plan.monthly_price * 12
    if (monthlyTotal <= plan.yearly_price) return 0
    return Math.round(((monthlyTotal - plan.yearly_price) / monthlyTotal) * 100)
  }

  function formatLimit(value: number) {
    return value === -1 ? 'Unlimited' : value.toString()
  }

  if (plans.length === 0) return null

  return (
    <section id="pricing" className="py-20 lg:py-28 bg-gray-50 dark:bg-gray-900/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Start with a 14-day free trial. No credit card required. Upgrade anytime.
          </p>
        </motion.div>

        {/* Toggle */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <span className={`text-sm font-medium ${billingCycle === 'monthly' ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}>
            Monthly
          </span>
          <button
            onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
            className={`relative w-14 h-7 rounded-full transition-colors ${
              billingCycle === 'yearly' ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                billingCycle === 'yearly' ? 'translate-x-7' : ''
              }`}
            />
          </button>
          <span className={`text-sm font-medium ${billingCycle === 'yearly' ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}>
            Yearly
          </span>
          {billingCycle === 'yearly' && (
            <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">
              Save up to {Math.max(...plans.map(getYearlySavings))}%
            </span>
          )}
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {plans.map((plan, index) => {
            const Icon = planIcons[plan.name] || Zap
            const price = billingCycle === 'yearly' ? plan.yearly_price : plan.monthly_price
            const savings = getYearlySavings(plan)

            return (
              <motion.div
                key={plan.plan_id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className={`relative rounded-2xl border-2 p-6 bg-white dark:bg-gray-800 flex flex-col ${
                  plan.is_popular
                    ? 'border-primary-600 shadow-xl shadow-primary-100 dark:shadow-primary-900/20 scale-105'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                {plan.is_popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                    Most Popular
                  </div>
                )}

                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`w-5 h-5 ${plan.is_popular ? 'text-primary-600' : 'text-gray-500'}`} />
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">{plan.name}</h3>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{plan.description}</p>

                <div className="mb-4">
                  <span className="text-3xl font-bold text-gray-900 dark:text-white">
                    {formatPrice(price)}
                  </span>
                  <span className="text-gray-500 text-sm">
                    /{billingCycle === 'yearly' ? 'year' : 'month'}
                  </span>
                  {billingCycle === 'yearly' && savings > 0 && (
                    <div className="text-green-600 text-xs font-medium mt-1">Save {savings}%</div>
                  )}
                </div>

                <div className="flex gap-2 mb-4 text-xs">
                  <span className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                    {formatLimit(plan.limits.users)} users
                  </span>
                  <span className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                    {formatLimit(plan.limits.bills_per_month)} bills/mo
                  </span>
                </div>

                <ul className="space-y-2 mb-6 flex-1">
                  {plan.features.slice(0, 5).map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                      <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <a
                  href={siteConfig.routes.register}
                  className={`block text-center py-3 px-4 rounded-lg font-semibold transition ${
                    plan.is_popular
                      ? 'bg-primary-600 hover:bg-primary-700 text-white'
                      : 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  Start Free Trial
                </a>
              </motion.div>
            )
          })}
        </div>

        {/* View full pricing link */}
        <div className="text-center mt-8">
          <a
            href={siteConfig.routes.register}
            className="text-primary-600 hover:text-primary-700 font-medium text-sm"
          >
            All plans include a 14-day free trial &rarr;
          </a>
        </div>
      </div>
    </section>
  )
}
