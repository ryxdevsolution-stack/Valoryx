
import React, { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import {
  CreditCard,
  Package,
  Users,
  Building2,
  Check,
  X,
  TrendingUp,
  Clock,
  AlertTriangle,
  Crown,
  Star,
  Infinity,
  RefreshCw,
  AlertCircle,
  Plus,
  Loader2
} from 'lucide-react';

interface PlanLimits {
  users?: number;
  bills_per_month?: number;
  storage_gb?: number;
}

interface Plan {
  plan_id: string;
  name: string;
  description: string;
  monthly_price: number;   // currency subunits (paise / fils)
  yearly_price: number;
  currency?: string;
  features: string[];
  limits: PlanLimits;
  is_popular: boolean;
  is_active: boolean;
}

interface NewPlanForm {
  name: string;
  description: string;
  currency: string;
  monthly_price: string;   // major units as typed; converted to subunits on submit
  yearly_price: string;
  features: string;        // one per line
  users: string;
  bills_per_month: string;
  is_popular: boolean;
}

const EMPTY_PLAN_FORM: NewPlanForm = {
  name: '', description: '', currency: 'INR', monthly_price: '', yearly_price: '',
  features: '', users: '', bills_per_month: '', is_popular: false,
};

const CURRENCY_OPTIONS = ['INR', 'AED', 'USD'];

interface SubscriptionHistory {
  id: string;
  plan_name: string;
  status: string;
  start_date: string;
  end_date: string;
  amount: number;
  billing_cycle: string;
  auto_renew: boolean;
}

const formatCurrency = (amount: number, currency: string = 'INR') =>
  new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en', {
    style: 'currency', currency, maximumFractionDigits: 0,
  }).format(amount);

// Plan prices are stored in currency subunits (paise / fils)
const formatPlanPrice = (subunits: number, currency?: string) =>
  formatCurrency(subunits / 100, currency || 'INR');

const getStatusColor = (status: string) => {
  switch (status) {
    case 'active': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
    case 'trial': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    case 'expired': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    case 'cancelled': return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-400';
    default: return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-400';
  }
};

const getPlanIcon = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes('enterprise')) return <Crown className="w-6 h-6" />;
  if (n.includes('pro')) return <Star className="w-6 h-6" />;
  return <Package className="w-6 h-6" />;
};

export default function SubscriptionManagementPage() {
  const [activeTab, setActiveTab] = useState<'plans' | 'history'>('plans');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [history, setHistory] = useState<SubscriptionHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [planForm, setPlanForm] = useState<NewPlanForm>(EMPTY_PLAN_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [plansRes, historyRes] = await Promise.allSettled([
        // 'all' so the admin sees every region's plans, not just INR
        api.get('/subscription/plans?currency=all'),
        api.get('/subscription/history')
      ]);

      if (plansRes.status === 'fulfilled') {
        setPlans(plansRes.value.data.plans || []);
      }
      if (historyRes.status === 'fulfilled') {
        setHistory(historyRes.value.data.history || []);
      }
    } catch {
      setError('Failed to load subscription data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const setFormField = (field: keyof NewPlanForm, value: string | boolean) =>
    setPlanForm(prev => ({ ...prev, [field]: value }));

  async function handleCreatePlan(e: React.FormEvent) {
    e.preventDefault();
    setCreateError('');

    const monthly = Number(planForm.monthly_price);
    const yearly = Number(planForm.yearly_price);
    if (!planForm.name.trim()) { setCreateError('Plan name is required'); return; }
    if (!monthly || monthly <= 0 || !yearly || yearly <= 0) {
      setCreateError('Monthly and yearly prices must be positive numbers');
      return;
    }

    const limits: PlanLimits = {};
    if (planForm.users.trim()) limits.users = Number(planForm.users);
    if (planForm.bills_per_month.trim()) limits.bills_per_month = Number(planForm.bills_per_month);

    setCreating(true);
    try {
      await api.post('/subscription/admin/plans', {
        name: planForm.name.trim(),
        description: planForm.description.trim(),
        currency: planForm.currency,
        // UI takes major units (₹999 / AED 99); API expects subunits
        monthly_price: Math.round(monthly * 100),
        yearly_price: Math.round(yearly * 100),
        features: planForm.features.split('\n').map(f => f.trim()).filter(Boolean),
        limits,
        is_popular: planForm.is_popular,
      });
      setShowCreateModal(false);
      setPlanForm(EMPTY_PLAN_FORM);
      await fetchData();
    } catch (err: any) {
      setCreateError(err?.response?.data?.message || err?.response?.data?.error || 'Failed to create plan');
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <p className="text-red-600 mb-4">{error}</p>
          <button onClick={fetchData} className="px-4 py-2 bg-violet-600 text-white rounded-xl hover:bg-violet-700">Retry</button>
        </div>
      </div>
    );
  }

  const activeCount = history.filter(s => s.status === 'active').length;
  const trialCount = history.filter(s => s.status === 'trial').length;
  const expiringCount = history.filter(s => {
    if (!s.end_date) return false;
    const end = new Date(s.end_date);
    const now = new Date();
    return end.getMonth() === now.getMonth() && end.getFullYear() === now.getFullYear() && s.status === 'active';
  }).length;
  const totalRevenue = history.filter(s => s.status === 'active').reduce((sum, s) => sum + (s.amount || 0), 0);

  return (
    <div className="p-6 lg:p-8 bg-slate-50 dark:bg-slate-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Subscription Management</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Manage plans and client subscriptions</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => { setCreateError(''); setShowCreateModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-colors shadow-sm">
            <Plus className="w-4 h-4" />
            Create Plan
          </button>
          <button onClick={fetchData} className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl transition-colors shadow-sm">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Total Revenue</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{formatCurrency(totalRevenue)}</p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
              <TrendingUp className="w-6 h-6 text-emerald-600" />
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Active Subscriptions</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{activeCount}</p>
            </div>
            <div className="p-3 rounded-xl bg-violet-100 dark:bg-violet-900/30">
              <CreditCard className="w-6 h-6 text-violet-600" />
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Trial Users</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{trialCount}</p>
            </div>
            <div className="p-3 rounded-xl bg-blue-100 dark:bg-blue-900/30">
              <Clock className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Expiring This Month</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{expiringCount}</p>
            </div>
            <div className="p-3 rounded-xl bg-amber-100 dark:bg-amber-900/30">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('plans')}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${activeTab === 'plans' ? 'bg-white dark:bg-slate-800 text-violet-600 shadow-sm border border-slate-200 dark:border-slate-700' : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800'}`}
        >
          <Package className="w-5 h-5" />
          Plans ({plans.length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${activeTab === 'history' ? 'bg-white dark:bg-slate-800 text-violet-600 shadow-sm border border-slate-200 dark:border-slate-700' : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800'}`}
        >
          <Users className="w-5 h-5" />
          History ({history.length})
        </button>
      </div>

      {/* Plans */}
      {activeTab === 'plans' && (
        plans.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>No subscription plans found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <div key={plan.plan_id} className={`relative bg-white dark:bg-slate-800 rounded-2xl shadow-sm border-2 transition-all hover:shadow-lg ${plan.is_popular ? 'border-violet-500 dark:border-violet-400' : 'border-slate-200 dark:border-slate-700'}`}>
                {plan.is_popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-4 py-1 bg-violet-600 text-white text-xs font-semibold rounded-full">Most Popular</span>
                  </div>
                )}
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className={`p-3 rounded-xl ${plan.name.toLowerCase().includes('enterprise') ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600' : plan.name.toLowerCase().includes('pro') ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-600' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600'}`}>
                      {getPlanIcon(plan.name)}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                        {plan.currency || 'INR'}
                      </span>
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${plan.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {plan.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">{plan.name}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{plan.description}</p>
                  <div className="mt-4">
                    <span className="text-3xl font-bold text-slate-900 dark:text-white">{formatPlanPrice(plan.monthly_price, plan.currency)}</span>
                    <span className="text-slate-500 dark:text-slate-400">/mo</span>
                    <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                      {formatPlanPrice(plan.yearly_price, plan.currency)}/yr
                    </div>
                  </div>
                  <div className="mt-6 space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-400">Users</span>
                      <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-1">
                        {plan.limits?.users == null || plan.limits.users === -1 ? <><Infinity className="w-4 h-4" /> Unlimited</> : `Up to ${plan.limits.users}`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-400">Bills/Month</span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {plan.limits?.bills_per_month == null || plan.limits.bills_per_month === -1 ? 'Unlimited' : plan.limits.bills_per_month}
                      </span>
                    </div>
                  </div>
                  {plan.features && plan.features.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                      <ul className="space-y-2">
                        {plan.features.slice(0, 4).map((feature, i) => (
                          <li key={i} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                            <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                            {feature}
                          </li>
                        ))}
                        {plan.features.length > 4 && (
                          <li className="text-sm text-violet-600 dark:text-violet-400 font-medium">+{plan.features.length - 4} more</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* History */}
      {activeTab === 'history' && (
        history.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>No subscription history found</p>
          </div>
        ) : (
          <>
          <div className="hidden md:block bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-700/50">
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Plan</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Period</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Amount</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Auto-Renew</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {history.map((sub) => (
                    <tr key={sub.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                            <Building2 className="w-5 h-5 text-slate-500" />
                          </div>
                          <span className="font-medium text-slate-900 dark:text-white">{sub.plan_name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 text-xs font-medium rounded-full capitalize ${getStatusColor(sub.status)}`}>
                          {sub.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                        {sub.start_date ? new Date(sub.start_date).toLocaleDateString('en-IN') : '-'}
                        {sub.end_date ? ` - ${new Date(sub.end_date).toLocaleDateString('en-IN')}` : ''}
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                        {sub.amount > 0 ? formatCurrency(sub.amount) : 'Trial'}
                      </td>
                      <td className="px-6 py-4">
                        {sub.auto_renew ? (
                          <span className="flex items-center gap-1 text-emerald-600"><Check className="w-4 h-4" /> Yes</span>
                        ) : (
                          <span className="flex items-center gap-1 text-slate-400"><X className="w-4 h-4" /> No</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Cards for history - visible only on small screens */}
          <div className="md:hidden space-y-3">
            {history.map((sub) => (
              <div key={sub.id} className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                      <Building2 className="w-4 h-4 text-slate-500" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">{sub.plan_name}</div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${getStatusColor(sub.status)}`}>{sub.status}</span>
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    {sub.amount > 0 ? formatCurrency(sub.amount) : 'Trial'}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Cycle: </span>
                    <span className="text-slate-700 dark:text-slate-300 capitalize">{sub.billing_cycle || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Auto-Renew: </span>
                    {sub.auto_renew ? (
                      <span className="text-emerald-600">Yes</span>
                    ) : (
                      <span className="text-slate-400">No</span>
                    )}
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Period: </span>
                    <span className="text-slate-700 dark:text-slate-300">
                      {sub.start_date ? new Date(sub.start_date).toLocaleDateString('en-IN') : '-'}
                      {sub.end_date ? ` – ${new Date(sub.end_date).toLocaleDateString('en-IN')}` : ''}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          </>
        )
      )}

      {/* Create Plan Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !creating && setShowCreateModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleCreatePlan} className="p-6">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Create Plan</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
                Creates the plan here and in Razorpay (monthly + yearly) for the selected currency.
              </p>

              {createError && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
                  {createError}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label htmlFor="plan-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Plan Name *</label>
                  <input id="plan-name" type="text" value={planForm.name} onChange={(e) => setFormField('name', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
                    placeholder="e.g. Professional" required />
                </div>

                <div>
                  <label htmlFor="plan-desc" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
                  <input id="plan-desc" type="text" value={planForm.description} onChange={(e) => setFormField('description', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
                    placeholder="Short description shown on the pricing card" />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="plan-currency" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Currency *</label>
                    <select id="plan-currency" value={planForm.currency} onChange={(e) => setFormField('currency', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-violet-500 outline-none">
                      {CURRENCY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="plan-monthly" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Monthly *</label>
                    <input id="plan-monthly" type="number" min="1" step="0.01" value={planForm.monthly_price} onChange={(e) => setFormField('monthly_price', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-violet-500 outline-none"
                      placeholder="999" required />
                  </div>
                  <div>
                    <label htmlFor="plan-yearly" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Yearly *</label>
                    <input id="plan-yearly" type="number" min="1" step="0.01" value={planForm.yearly_price} onChange={(e) => setFormField('yearly_price', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-violet-500 outline-none"
                      placeholder="9990" required />
                  </div>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 -mt-2">
                  Prices in major units ({planForm.currency} 999, not subunits) — converted automatically.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="plan-users" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Max Users</label>
                    <input id="plan-users" type="number" value={planForm.users} onChange={(e) => setFormField('users', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-violet-500 outline-none"
                      placeholder="-1 = unlimited" />
                  </div>
                  <div>
                    <label htmlFor="plan-bills" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Bills / Month</label>
                    <input id="plan-bills" type="number" value={planForm.bills_per_month} onChange={(e) => setFormField('bills_per_month', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-violet-500 outline-none"
                      placeholder="-1 = unlimited" />
                  </div>
                </div>

                <div>
                  <label htmlFor="plan-features" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Features (one per line)</label>
                  <textarea id="plan-features" value={planForm.features} onChange={(e) => setFormField('features', e.target.value)} rows={4}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-violet-500 outline-none resize-none"
                    placeholder={'Unlimited billing\nInventory management\nPriority support'} />
                </div>

                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={planForm.is_popular} onChange={(e) => setFormField('is_popular', e.target.checked)}
                    className="rounded border-slate-300 text-violet-600 focus:ring-violet-500" />
                  Mark as "Most Popular"
                </label>
              </div>

              <div className="flex gap-3 mt-6">
                <button type="button" onClick={() => setShowCreateModal(false)} disabled={creating}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50">
                  Cancel
                </button>
                <button type="submit" disabled={creating}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition-colors disabled:opacity-50">
                  {creating ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : 'Create Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
