import { useState, useEffect } from 'react'
import { Check, Star, Zap, Crown, Loader2 } from 'lucide-react'
import { useClient } from '@/contexts/ClientContext'
import api from '@/lib/api'

interface PlanLimits {
  users: number
  bills_per_month: number
  storage_gb: number
}

interface Plan {
  plan_id: string
  name: string
  description: string
  monthly_price: number
  yearly_price: number
  features: string[]
  limits: PlanLimits
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

export default function PricingCards({ onSubscribed, showTrialCTA = false }: PricingCardsProps) {
  const { token, client, updateSubscriptionStatus, refreshClientData } = useClient()
  const [plans, setPlans] = useState<Plan[]>([])
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly')
  const [loading, setLoading] = useState(true)
  const [payingPlanId, setPayingPlanId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchPlans()
  }, [])

  async function fetchPlans() {
    try {
      const res = await api.get('/subscription/plans')
      setPlans(res.data.plans || [])
    } catch {
      setError('Failed to load pricing plans')
    } finally {
      setLoading(false)
    }
  }

  function formatPrice(paise: number) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(paise / 100)
  }

  function getYearlySavings(plan: Plan) {
    const monthlyTotal = plan.monthly_price * 12
    const yearlyTotal = plan.yearly_price
    if (monthlyTotal <= yearlyTotal) return 0
    return Math.round(((monthlyTotal - yearlyTotal) / monthlyTotal) * 100)
  }

  function formatLimit(value: number) {
    return value === -1 ? 'Unlimited' : value.toString()
  }

  function redirectToDashboard() {
    const isElectron = !!(window as any).electronAPI?.isElectron
    if (onSubscribed) {
      onSubscribed()
    } else {
      window.location.href = isElectron ? '#/dashboard' : '/dashboard'
    }
  }

  async function pollForActivation(maxAttempts: number, intervalMs: number) {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, intervalMs))
      await refreshClientData()
    }
    // Redirect regardless — webhook will have caught up by now
    redirectToDashboard()
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
        name: 'RYX Billing',
        description: `${plan_name} Plan - ${billingCycle === 'yearly' ? 'Yearly' : 'Monthly'}`,
        handler: async function (response: any) {
          try {
            const verifyRes = await api.post('/subscription/verify-payment', {
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_subscription_id: response.razorpay_subscription_id,
              razorpay_signature: response.razorpay_signature,
            })

            if (verifyRes.data?.subscription_status === 'active') {
              // Webhook already fired and activated — update context and redirect
              updateSubscriptionStatus(
                verifyRes.data.subscription_status,
                verifyRes.data.subscription_end_date,
                verifyRes.data.plan_id,
              )
              redirectToDashboard()
            } else {
              // Webhook hasn't fired yet — poll up to 3 times (3s apart), then redirect
              await pollForActivation(3, 3000)
            }
          } catch {
            setError('Payment verification failed. Please contact support.')
          } finally {
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

  return (
    <div>
      {/* Monthly/Yearly Toggle */}
      <div className="flex items-center justify-center gap-3 mb-8">
        <span className={`text-sm font-medium ${billingCycle === 'monthly' ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}>
          Monthly
        </span>
        <button
          onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
          className={`relative w-14 h-7 rounded-full transition-colors ${
            billingCycle === 'yearly' ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
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

      {error && (
        <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-center text-sm">
          {error}
        </div>
      )}

      {/* Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {plans.map((plan) => {
          const Icon = planIcons[plan.name] || Zap
          const price = billingCycle === 'yearly' ? plan.yearly_price : plan.monthly_price
          const savings = getYearlySavings(plan)
          const isPaying = payingPlanId === plan.plan_id
          const isCurrentPlan = client?.subscription_status === 'active' && client?.plan_id === plan.plan_id

          return (
            <div
              key={plan.plan_id}
              className={`relative rounded-2xl border-2 p-6 flex flex-col ${
                plan.is_popular
                  ? 'border-blue-600 shadow-xl shadow-blue-100 dark:shadow-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              {isCurrentPlan && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                  Current Plan
                </div>
              )}
              {plan.is_popular && !isCurrentPlan && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                  Most Popular
                </div>
              )}

              <div className="flex items-center gap-2 mb-2">
                <Icon className={`w-5 h-5 ${plan.is_popular ? 'text-blue-600' : 'text-gray-600 dark:text-gray-400'}`} />
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{plan.name}</h3>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{plan.description}</p>

              <div className="mb-6">
                <span className="text-3xl font-bold text-gray-900 dark:text-white">
                  {formatPrice(price)}
                </span>
                <span className="text-gray-500 dark:text-gray-400 text-sm">
                  /{billingCycle === 'yearly' ? 'year' : 'month'}
                </span>
                {billingCycle === 'yearly' && savings > 0 && (
                  <div className="text-green-600 text-xs font-medium mt-1">
                    Save {savings}% vs monthly
                  </div>
                )}
              </div>

              {/* Limits */}
              <div className="flex gap-3 mb-4 text-xs">
                <span className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                  {formatLimit(plan.limits.users)} users
                </span>
                <span className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                  {formatLimit(plan.limits.bills_per_month)} bills/mo
                </span>
              </div>

              {/* Features */}
              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    {feature}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              {showTrialCTA ? (
                <a
                  href={
                    (window as any).electronAPI?.isElectron
                      ? '#/auth/register'
                      : '/auth/register'
                  }
                  className={`block text-center py-3 px-4 rounded-lg font-semibold transition ${
                    plan.is_popular
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  Start Free Trial
                </a>
              ) : isCurrentPlan ? (
                <button
                  disabled
                  className="w-full py-3 px-4 rounded-lg font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 cursor-default"
                >
                  Current Plan
                </button>
              ) : (
                <button
                  onClick={() => handleSubscribe(plan)}
                  disabled={isPaying}
                  className={`w-full py-3 px-4 rounded-lg font-semibold transition flex items-center justify-center gap-2 ${
                    plan.is_popular
                      ? 'bg-blue-600 hover:bg-blue-700 text-white disabled:bg-blue-400'
                      : 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50'
                  }`}
                >
                  {isPaying ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing...
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
    </div>
  )
}
