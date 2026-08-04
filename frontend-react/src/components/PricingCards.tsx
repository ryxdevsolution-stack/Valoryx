import { useState, useEffect } from 'react'
import { Check, Star, Zap, Crown, Loader2, Clock } from 'lucide-react'
import { useClient } from '@/contexts/ClientContext'
import api from '@/lib/api'

/**
 * Every field is optional because the backend emits `self.limits or {}` — a
 * plan with a NULL limits column yields `{}`, not the full shape. Declaring
 * these required let `plan.limits.users` type-check while being undefined at
 * runtime, which is exactly how the blank-screen crash got shipped.
 */
interface PlanLimits {
  users?: number
  bills_per_month?: number
  storage_gb?: number
}

interface Plan {
  plan_id: string
  name: string
  description: string
  monthly_price: number
  yearly_price: number
  currency?: string
  features?: string[]
  limits?: PlanLimits
  is_popular: boolean
}

interface PricingCardsProps {
  onSubscribed?: () => void
  showTrialCTA?: boolean
}

declare global {
  interface Window {
    Razorpay: any
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

const planIcons: Record<string, any> = {
  Starter: Zap,
  Professional: Star,
  Enterprise: Crown,
}

// Grid track count + container width keyed by how many plans the API returned,
// so one plan renders as one centred card rather than a third of an empty row.
const GRID_BY_PLAN_COUNT: Record<number, string> = {
  1: 'grid-cols-1 max-w-sm',
  2: 'grid-cols-1 md:grid-cols-2 max-w-3xl',
  3: 'grid-cols-1 md:grid-cols-3 max-w-5xl',
}

export default function PricingCards({ onSubscribed, showTrialCTA = false }: PricingCardsProps) {
  const { token, client, updateSubscriptionStatus, refreshClientData } = useClient()
  const [plans, setPlans] = useState<Plan[]>([])
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly')
  const [loading, setLoading] = useState(true)
  const [payingPlanId, setPayingPlanId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [pendingMsg, setPendingMsg] = useState('')
  const [pollingActive, setPollingActive] = useState(false)

  // Region-based pricing: show plans in the client's currency (AED for UAE
  // clients, etc.); the backend falls back to INR when no regional plan exists.
  const clientCurrency = (client?.currency_code || 'INR').toUpperCase()

  useEffect(() => {
    fetchPlans()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientCurrency])

  async function fetchPlans() {
    try {
      const res = await api.get(`/subscription/plans?currency=${encodeURIComponent(clientCurrency)}`)
      setPlans(res.data.plans || [])
    } catch {
      setError('Failed to load pricing plans')
    } finally {
      setLoading(false)
    }
  }

  function formatPrice(subunits: number, currency?: string) {
    const code = currency || 'INR'
    return new Intl.NumberFormat(code === 'INR' ? 'en-IN' : 'en', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 0,
    }).format(subunits / 100)
  }

  function getYearlySavings(plan: Plan) {
    const monthlyTotal = plan.monthly_price * 12
    const yearlyTotal = plan.yearly_price
    if (monthlyTotal <= yearlyTotal) return 0
    return Math.round(((monthlyTotal - yearlyTotal) / monthlyTotal) * 100)
  }

  /**
   * The backend serialises `'limits': self.limits or {}`, so a plan row with a
   * NULL limits column arrives as `{}` and every field reads back `undefined`.
   * Calling .toString() on that threw mid-render and — with no ErrorBoundary
   * wired in at the time — unmounted the whole app to a blank screen.
   * Treat missing as unknown rather than crashing the page over a label.
   */
  function formatLimit(value: number | undefined | null) {
    if (value === -1) return 'Unlimited'
    if (value == null || Number.isNaN(value)) return '—'
    return String(value)
  }

  function redirectToDashboard() {
    const isElectron = !!(window as any).electronAPI?.isElectron
    if (onSubscribed) {
      onSubscribed()
    } else {
      window.location.href = isElectron ? '#/dashboard' : '/dashboard'
    }
  }

  // Poll the client status until the subscription flips to active. Returns true
  // if activation was detected (and redirects), false if it's still pending.
  async function pollForActivation(maxAttempts: number, intervalMs: number): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, intervalMs))
      const fresh = await refreshClientData()
      if (fresh?.subscription_status === 'active') {
        updateSubscriptionStatus('active', fresh.subscription_end_date, fresh.plan_id)
        redirectToDashboard()
        return true
      }
    }
    return false
  }

  async function handleSubscribe(plan: Plan) {
    if (!token) {
      const isElectron = !!(window as any).electronAPI?.isElectron
      window.location.href = isElectron ? '#/auth/register' : '/auth/register'
      return
    }

    setPayingPlanId(plan.plan_id)
    setError('')

    try {
      // Create Razorpay Subscription (auto-renewal)
      const subRes = await api.post('/subscription/create-subscription', {
        plan_id: plan.plan_id,
        billing_cycle: billingCycle,
      })

      const { subscription_id, razorpay_key_id, plan_name } = subRes.data

      // Load Razorpay script
      const loaded = await loadRazorpayScript()
      if (!loaded) {
        setError('Failed to load payment gateway. Please try again.')
        setPayingPlanId(null)
        return
      }

      // Open Razorpay checkout with subscription_id (no amount field for subscriptions)
      const options = {
        key: razorpay_key_id,
        subscription_id: subscription_id,
        name: client?.client_name || 'Valoryx',
        // Brand the Razorpay checkout modal with the tenant's logo when available.
        image: client?.logo_url || undefined,
        description: `${plan_name} Plan - ${billingCycle === 'yearly' ? 'Yearly' : 'Monthly'}`,
        handler: async function (response: any) {
          try {
            setPendingMsg('')
            const verifyRes = await api.post('/subscription/verify-payment', {
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_subscription_id: response.razorpay_subscription_id,
              razorpay_signature: response.razorpay_signature,
            })

            if (verifyRes.data?.subscription_status === 'active') {
              // Verified & activated synchronously — update context and redirect
              updateSubscriptionStatus(
                verifyRes.data.subscription_status,
                verifyRes.data.subscription_end_date,
                verifyRes.data.plan_id,
              )
              redirectToDashboard()
            } else {
              // Auto-pay mandate (UPI Autopay / eMandate) still confirming.
              // Show a clear pending message and poll a few times before giving up.
              setPendingMsg(
                verifyRes.data?.message ||
                  'Payment received. Your auto-pay mandate is being confirmed — this can take a little while. We\'ll email you the moment it\'s active.',
              )
              // pollForActivation redirects on success; otherwise stop the spinner
              // and leave the (now static) pending message visible.
              setPollingActive(true)
              const activated = await pollForActivation(5, 4000)
              setPollingActive(false)
              if (!activated) setPayingPlanId(null)
            }
          } catch {
            setPendingMsg('')
            setPollingActive(false)
            setError('We could not confirm your payment. If any money was debited, it is not captured and Razorpay will release it back automatically. Please retry, or contact support with your payment ID.')
            setPayingPlanId(null)
          }
        },
        prefill: {
          email: client?.email || '',
          contact: client?.phone || '',
        },
        theme: {
          color: '#2563eb',
        },
        modal: {
          ondismiss: function () {
            setPayingPlanId(null)
          },
        },
      }

      const rzp = new window.Razorpay(options)
      rzp.on('payment.failed', function () {
        setError('Payment failed. Please try again.')
        setPayingPlanId(null)
      })
      rzp.open()
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.response?.data?.error || 'Failed to initiate payment'
      setError(msg)
      setPayingPlanId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (plans.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No plans available at the moment.
      </div>
    )
  }

  const maxSavings = plans.length ? Math.max(0, ...plans.map(getYearlySavings)) : 0

  // The catalogue is admin-controlled — a shop may be offered one plan or five.
  // Hard-coding md:grid-cols-3 strands a single plan in the left third of the
  // row, so the track count and max width follow how many plans came back.
  const gridClass = GRID_BY_PLAN_COUNT[Math.min(plans.length, 3)] ?? GRID_BY_PLAN_COUNT[3]
  const isSinglePlan = plans.length === 1

  return (
    <div>
      {/* Monthly / Yearly segmented toggle */}
      <div className="flex flex-col items-center gap-2 mb-8">
        <div className="inline-flex items-center p-1 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          {(['monthly', 'yearly'] as const).map((cycle) => (
            <button
              key={cycle}
              type="button"
              onClick={() => setBillingCycle(cycle)}
              aria-pressed={billingCycle === cycle}
              className={`relative px-5 py-2 rounded-full text-sm font-semibold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                billingCycle === cycle
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {cycle === 'monthly' ? 'Monthly' : 'Yearly'}
              {cycle === 'yearly' && maxSavings > 0 && (
                <span className="ml-1.5 inline-block bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full align-middle">
                  −{maxSavings}%
                </span>
              )}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {billingCycle === 'yearly'
            ? `Billed annually${maxSavings > 0 ? ` · save up to ${maxSavings}%` : ''}`
            : 'Billed monthly · switch to yearly to save'}
        </p>
      </div>

      {error && (
        <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-center text-sm">
          {error}
        </div>
      )}

      {pendingMsg && (
        <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 rounded-lg flex items-start gap-3 text-sm">
          {pollingActive ? (
            <Loader2 className="w-5 h-5 animate-spin flex-shrink-0 mt-0.5" aria-hidden="true" />
          ) : (
            <Clock className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
          )}
          <div>
            <p className="font-semibold mb-0.5">
              {pollingActive ? 'Confirming your auto-pay mandate' : 'Auto-pay mandate pending'}
            </p>
            <p>{pendingMsg}</p>
            {!pollingActive && (
              <p className="mt-1">You can safely close this — we'll email you once it's active.</p>
            )}
          </div>
        </div>
      )}

      {/* Plan Cards */}
      <div className={`grid ${gridClass} gap-6 md:gap-5 mx-auto items-stretch`}>
        {plans.map((plan) => {
          const Icon = planIcons[plan.name] || Zap
          const price = billingCycle === 'yearly' ? plan.yearly_price : plan.monthly_price
          const savings = getYearlySavings(plan)
          const isPaying = payingPlanId === plan.plan_id
          const isCurrentPlan = client?.subscription_status === 'active' && client?.plan_id === plan.plan_id
          // "Most Popular" is a comparison claim — meaningless when it's the only
          // plan on the page, so the lone card gets no badge and no scale-up.
          const highlight = plan.is_popular && !isCurrentPlan && !isSinglePlan
          // The badge goes away for a lone plan, but its CTA is still the only
          // way to pay — keep it a solid primary button, not a ghost outline.
          const primaryCta = highlight || isSinglePlan

          return (
            <div
              key={plan.plan_id}
              className={`relative flex flex-col rounded-2xl bg-white dark:bg-gray-800 p-6 pt-7 transition-all duration-200 hover:-translate-y-1 motion-reduce:transform-none ${
                highlight
                  ? 'border-2 border-blue-600 shadow-xl shadow-blue-200/50 dark:shadow-blue-900/30 md:scale-[1.04] md:z-10'
                  : 'border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              {/* top accent bar on the highlighted plan */}
              {highlight && (
                <span className="absolute inset-x-0 top-0 h-1.5 rounded-t-2xl bg-gradient-to-r from-blue-500 to-blue-600" aria-hidden="true" />
              )}

              {isCurrentPlan && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[11px] font-bold uppercase tracking-wide px-3 py-1 rounded-full shadow-sm">
                  Current Plan
                </div>
              )}
              {highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[11px] font-bold uppercase tracking-wide px-3 py-1 rounded-full shadow-sm">
                  Most Popular
                </div>
              )}

              {/* Header */}
              <div className="flex items-center gap-3 mb-1">
                <span className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${
                  highlight
                    ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                }`}>
                  <Icon className="w-5 h-5" aria-hidden="true" />
                </span>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{plan.name}</h3>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-5 min-h-[2.5rem]">{plan.description}</p>

              {/* Price */}
              <div className="mb-5">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white tabular-nums">
                    {formatPrice(price, plan.currency)}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400 text-sm font-medium">
                    /{billingCycle === 'yearly' ? 'yr' : 'mo'}
                  </span>
                </div>
                <div className="h-4 mt-1">
                  {billingCycle === 'yearly' && savings > 0 && (
                    <span className="text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                      Save {savings}% vs monthly
                    </span>
                  )}
                </div>
              </div>

              {/* Limits — a plan that sets no caps shows no badges at all,
                  rather than a row of "—" placeholders. */}
              {(plan.limits?.users != null || plan.limits?.bills_per_month != null) && (
                <div className="flex flex-wrap gap-2 mb-5">
                  {plan.limits?.users != null && (
                    <span className="inline-flex items-center gap-1 bg-gray-50 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-xs font-medium px-2.5 py-1 rounded-lg tabular-nums">
                      {formatLimit(plan.limits.users)} users
                    </span>
                  )}
                  {plan.limits?.bills_per_month != null && (
                    <span className="inline-flex items-center gap-1 bg-gray-50 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-xs font-medium px-2.5 py-1 rounded-lg tabular-nums">
                      {formatLimit(plan.limits.bills_per_month)} bills/mo
                    </span>
                  )}
                </div>
              )}

              {/* Features */}
              <ul className="space-y-2.5 mb-6 flex-1">
                {(plan.features ?? []).map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm text-gray-600 dark:text-gray-300">
                    <span className="mt-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex-shrink-0">
                      <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" strokeWidth={3} />
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              {showTrialCTA ? (
                <a
                  href={(window as any).electronAPI?.isElectron ? '#/auth/register' : '/auth/register'}
                  className={`block text-center py-3 px-4 rounded-xl font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 dark:focus-visible:ring-offset-gray-800 ${
                    primaryCta
                      ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-600/20'
                      : 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  Start Free Trial
                </a>
              ) : isCurrentPlan ? (
                <button
                  type="button"
                  disabled
                  className="w-full py-3 px-4 rounded-xl font-semibold bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 cursor-default"
                >
                  Current Plan
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSubscribe(plan)}
                  disabled={isPaying}
                  className={`w-full py-3 px-4 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 dark:focus-visible:ring-offset-gray-800 disabled:cursor-not-allowed ${
                    primaryCta
                      ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-600/20 disabled:bg-blue-400'
                      : 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50'
                  }`}
                >
                  {isPaying ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      Processing…
                    </>
                  ) : client?.subscription_status === 'active' ? (
                    'Switch to This Plan'
                  ) : (
                    'Subscribe Now'
                  )}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Trust line */}
      <p className="mt-8 text-center text-xs text-gray-500 dark:text-gray-400">
        14-day free trial · Cancel anytime · Payments secured by Razorpay
      </p>
    </div>
  )
}
