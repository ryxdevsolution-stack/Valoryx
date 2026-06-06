import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, Zap, Star, Crown, LucideIcon } from 'lucide-react'
import { siteConfig } from '@/config/landing.config'
import { fadeInUp, staggerContainer, viewportWithMargin } from '@/lib/landing/animations'
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

const planIcons: Record<string, LucideIcon> = {
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
    api
      .get('/subscription/plans')
      .then((res) => {
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
    <section id="pricing" className="relative overflow-hidden bg-white py-20 sm:py-28">
      <div
        aria-hidden="true"
        className="blob-gradient pointer-events-none absolute left-1/2 top-0 h-72 w-[110%] max-w-[1200px] -translate-x-1/2 opacity-30"
      />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        {/* Header */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportWithMargin}
          className="mx-auto mb-10 max-w-2xl text-center"
        >
          <motion.span
            variants={fadeInUp}
            className="inline-flex items-center rounded-full border border-ink/10 bg-canvas px-4 py-1.5 font-body text-xs font-semibold uppercase tracking-wide text-ink-faint"
          >
            Pricing
          </motion.span>
          <motion.h2 variants={fadeInUp} className="heading-display mt-5 text-4xl sm:text-5xl">
            Explore <span className="text-gradient-accent">our plans</span>
          </motion.h2>
          <motion.p variants={fadeInUp} className="mx-auto mt-4 max-w-xl font-body text-base text-ink-soft">
            Start with a 14-day free trial. No credit card required. Upgrade anytime.
          </motion.p>
        </motion.div>

        {/* Billing toggle */}
        <div className="mb-12 flex items-center justify-center gap-3">
          <span className={`font-body text-sm font-medium ${billingCycle === 'monthly' ? 'text-ink' : 'text-ink-faint'}`}>
            Monthly
          </span>
          <button
            type="button"
            onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
            className={`relative h-7 w-14 rounded-full transition-colors ${
              billingCycle === 'yearly' ? 'bg-ink' : 'bg-ink/15'
            }`}
            aria-label="Toggle billing cycle"
          >
            <span
              className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                billingCycle === 'yearly' ? 'translate-x-7' : ''
              }`}
            />
          </button>
          <span className={`font-body text-sm font-medium ${billingCycle === 'yearly' ? 'text-ink' : 'text-ink-faint'}`}>
            Yearly
          </span>
          {billingCycle === 'yearly' && (
            <span className="rounded-full bg-accent-blue/12 px-2.5 py-0.5 font-body text-xs font-semibold text-accent-blue">
              Save up to {Math.max(...plans.map(getYearlySavings))}%
            </span>
          )}
        </div>

        {/* Cards */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportWithMargin}
          className="grid grid-cols-1 gap-6 md:grid-cols-3"
        >
          {plans.map((plan) => {
            const Icon = planIcons[plan.name] || Zap
            const price = billingCycle === 'yearly' ? plan.yearly_price : plan.monthly_price
            const savings = getYearlySavings(plan)

            return (
              <motion.div
                key={plan.plan_id}
                variants={fadeInUp}
                className={`relative flex flex-col rounded-[1.75rem] border bg-white p-7 transition-shadow ${
                  plan.is_popular
                    ? 'border-transparent shadow-card-hover ring-2 ring-ink'
                    : 'border-ink/8 shadow-card hover:shadow-card-hover'
                }`}
              >
                {plan.is_popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-ink px-3 py-1 font-body text-xs font-bold text-white shadow-pill">
                    Most Popular
                  </span>
                )}

                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${
                      plan.is_popular ? 'bg-gradient-to-br from-accent-blue to-accent-purple text-white' : 'bg-ink/5 text-ink-soft'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="font-heading text-lg font-bold text-ink">{plan.name}</h3>
                </div>
                <p className="mt-3 font-body text-sm text-ink-faint">{plan.description}</p>

                <div className="mt-5">
                  <span className="font-heading text-4xl font-bold tracking-tight text-ink">
                    {formatPrice(price)}
                  </span>
                  <span className="font-body text-sm text-ink-faint">
                    /{billingCycle === 'yearly' ? 'year' : 'month'}
                  </span>
                  {billingCycle === 'yearly' && savings > 0 && (
                    <div className="mt-1 font-body text-xs font-medium text-accent-blue">Save {savings}%</div>
                  )}
                </div>

                <div className="mt-4 flex gap-2 font-body text-xs">
                  <span className="rounded-full bg-ink/5 px-2.5 py-1 text-ink-soft">
                    {formatLimit(plan.limits.users)} users
                  </span>
                  <span className="rounded-full bg-ink/5 px-2.5 py-1 text-ink-soft">
                    {formatLimit(plan.limits.bills_per_month)} bills/mo
                  </span>
                </div>

                <ul className="mt-6 flex-1 space-y-2.5">
                  {plan.features.slice(0, 5).map((feature) => (
                    <li key={feature} className="flex items-start gap-2 font-body text-sm text-ink-soft">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-blue" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link
                  to={siteConfig.routes.register}
                  className={`mt-7 inline-flex items-center justify-center rounded-full px-5 py-3 font-body text-sm font-semibold transition-all hover:scale-[1.02] ${
                    plan.is_popular
                      ? 'bg-ink text-white shadow-pill hover:bg-[#3a4666]'
                      : 'border border-ink/15 text-ink hover:border-ink/30'
                  }`}
                >
                  Start Free Trial
                </Link>
              </motion.div>
            )
          })}
        </motion.div>

        <div className="mt-10 text-center">
          <Link
            to={siteConfig.routes.register}
            className="font-body text-sm font-medium text-accent-blue hover:text-accent-purple"
          >
            All plans include a 14-day free trial &rarr;
          </Link>
        </div>
      </div>
    </section>
  )
}
