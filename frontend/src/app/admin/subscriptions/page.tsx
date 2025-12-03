'use client';

import React, { useState } from 'react';
import { useClient } from '@/contexts/ClientContext';
import {
  CreditCard,
  Package,
  Users,
  Building2,
  Check,
  X,
  Edit,
  Trash2,
  Plus,
  TrendingUp,
  Calendar,
  Clock,
  AlertTriangle,
  Crown,
  Zap,
  Star,
  Shield,
  Infinity,
  ChevronRight,
  Settings,
  RefreshCw
} from 'lucide-react';

interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  billing_cycle: 'monthly' | 'yearly';
  features: string[];
  limits: {
    users: number | 'unlimited';
    bills_per_month: number | 'unlimited';
    storage_gb: number;
    support: 'email' | 'priority' | '24/7';
  };
  is_popular: boolean;
  is_active: boolean;
  subscribers_count: number;
}

interface Subscription {
  id: string;
  client_id: string;
  client_name: string;
  plan_id: string;
  plan_name: string;
  status: 'active' | 'trial' | 'expired' | 'cancelled';
  start_date: string;
  end_date: string;
  auto_renew: boolean;
  amount: number;
}

const mockPlans: Plan[] = [
  {
    id: '1',
    name: 'Starter',
    description: 'Perfect for small businesses just getting started',
    price: 999,
    billing_cycle: 'monthly',
    features: ['Basic invoicing', 'Customer management', 'Email support', 'Basic reports'],
    limits: { users: 3, bills_per_month: 100, storage_gb: 5, support: 'email' },
    is_popular: false,
    is_active: true,
    subscribers_count: 45,
  },
  {
    id: '2',
    name: 'Professional',
    description: 'For growing businesses with advanced needs',
    price: 2499,
    billing_cycle: 'monthly',
    features: ['Everything in Starter', 'GST billing', 'Inventory management', 'Priority support', 'Advanced reports', 'Multi-user access'],
    limits: { users: 10, bills_per_month: 500, storage_gb: 25, support: 'priority' },
    is_popular: true,
    is_active: true,
    subscribers_count: 120,
  },
  {
    id: '3',
    name: 'Enterprise',
    description: 'For large organizations with custom requirements',
    price: 7999,
    billing_cycle: 'monthly',
    features: ['Everything in Professional', 'Unlimited users', 'Custom integrations', '24/7 phone support', 'Dedicated account manager', 'SLA guarantee', 'White-label options'],
    limits: { users: 'unlimited', bills_per_month: 'unlimited', storage_gb: 100, support: '24/7' },
    is_popular: false,
    is_active: true,
    subscribers_count: 28,
  },
];

const mockSubscriptions: Subscription[] = [
  { id: '1', client_id: 'c1', client_name: 'ABC Corp', plan_id: '2', plan_name: 'Professional', status: 'active', start_date: '2024-01-15', end_date: '2025-01-15', auto_renew: true, amount: 29988 },
  { id: '2', client_id: 'c2', client_name: 'XYZ Ltd', plan_id: '1', plan_name: 'Starter', status: 'trial', start_date: '2024-11-20', end_date: '2024-12-20', auto_renew: false, amount: 0 },
  { id: '3', client_id: 'c3', client_name: 'Tech Solutions', plan_id: '3', plan_name: 'Enterprise', status: 'active', start_date: '2024-06-01', end_date: '2025-06-01', auto_renew: true, amount: 95988 },
  { id: '4', client_id: 'c4', client_name: 'Global Inc', plan_id: '2', plan_name: 'Professional', status: 'expired', start_date: '2023-12-01', end_date: '2024-12-01', auto_renew: false, amount: 29988 },
];

export default function SubscriptionManagementPage() {
  const { user } = useClient();
  const [activeTab, setActiveTab] = useState<'plans' | 'subscriptions'>('plans');
  const [plans] = useState<Plan[]>(mockPlans);
  const [subscriptions] = useState<Subscription[]>(mockSubscriptions);

  const stats = {
    totalRevenue: subscriptions.filter(s => s.status === 'active').reduce((sum, s) => sum + s.amount, 0),
    activeSubscriptions: subscriptions.filter(s => s.status === 'active').length,
    trialUsers: subscriptions.filter(s => s.status === 'trial').length,
    expiringThisMonth: subscriptions.filter(s => {
      const endDate = new Date(s.end_date);
      const now = new Date();
      return endDate.getMonth() === now.getMonth() && endDate.getFullYear() === now.getFullYear();
    }).length,
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
  };

  const getStatusColor = (status: Subscription['status']) => {
    switch (status) {
      case 'active': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'trial': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'expired': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      case 'cancelled': return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-400';
      default: return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-400';
    }
  };

  const getPlanIcon = (name: string) => {
    switch (name.toLowerCase()) {
      case 'starter': return <Package className="w-6 h-6" />;
      case 'professional': return <Star className="w-6 h-6" />;
      case 'enterprise': return <Crown className="w-6 h-6" />;
      default: return <Package className="w-6 h-6" />;
    }
  };

  return (
    <div className="p-6 lg:p-8 bg-slate-50 dark:bg-slate-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Subscription Management</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Manage plans and client subscriptions</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl transition-colors shadow-sm">
          <Plus className="w-4 h-4" />
          Create Plan
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Annual Revenue</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{formatCurrency(stats.totalRevenue)}</p>
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
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{stats.activeSubscriptions}</p>
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
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{stats.trialUsers}</p>
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
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{stats.expiringThisMonth}</p>
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
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
            activeTab === 'plans'
              ? 'bg-white dark:bg-slate-800 text-violet-600 shadow-sm border border-slate-200 dark:border-slate-700'
              : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800'
          }`}
        >
          <Package className="w-5 h-5" />
          Plans
        </button>
        <button
          onClick={() => setActiveTab('subscriptions')}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
            activeTab === 'subscriptions'
              ? 'bg-white dark:bg-slate-800 text-violet-600 shadow-sm border border-slate-200 dark:border-slate-700'
              : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800'
          }`}
        >
          <Users className="w-5 h-5" />
          Subscriptions
        </button>
      </div>

      {activeTab === 'plans' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative bg-white dark:bg-slate-800 rounded-2xl shadow-sm border-2 transition-all hover:shadow-lg ${
                plan.is_popular
                  ? 'border-violet-500 dark:border-violet-400'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              {plan.is_popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-4 py-1 bg-violet-600 text-white text-xs font-semibold rounded-full">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-xl ${
                    plan.name === 'Enterprise' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600' :
                    plan.name === 'Professional' ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-600' :
                    'bg-blue-100 dark:bg-blue-900/30 text-blue-600'
                  }`}>
                    {getPlanIcon(plan.name)}
                  </div>
                  <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    {plan.subscribers_count} subscribers
                  </span>
                </div>

                <h3 className="text-xl font-bold text-slate-900 dark:text-white">{plan.name}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{plan.description}</p>

                <div className="mt-4">
                  <span className="text-3xl font-bold text-slate-900 dark:text-white">{formatCurrency(plan.price)}</span>
                  <span className="text-slate-500 dark:text-slate-400">/{plan.billing_cycle === 'monthly' ? 'mo' : 'yr'}</span>
                </div>

                <div className="mt-6 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-400">Users</span>
                    <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-1">
                      {plan.limits.users === 'unlimited' ? (
                        <><Infinity className="w-4 h-4" /> Unlimited</>
                      ) : (
                        `Up to ${plan.limits.users}`
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-400">Bills/Month</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {plan.limits.bills_per_month === 'unlimited' ? 'Unlimited' : plan.limits.bills_per_month}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-400">Storage</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{plan.limits.storage_gb} GB</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-400">Support</span>
                    <span className="font-semibold text-slate-900 dark:text-white capitalize">{plan.limits.support}</span>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Features</p>
                  <ul className="space-y-2">
                    {plan.features.slice(0, 4).map((feature, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        {feature}
                      </li>
                    ))}
                    {plan.features.length > 4 && (
                      <li className="text-sm text-violet-600 dark:text-violet-400 font-medium">
                        +{plan.features.length - 4} more features
                      </li>
                    )}
                  </ul>
                </div>

                <div className="mt-6 flex gap-2">
                  <button className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-xl font-medium transition-colors">
                    <Edit className="w-4 h-4 inline mr-2" />
                    Edit
                  </button>
                  <button className="p-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors">
                    <Settings className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'subscriptions' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-700/50">
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Client</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Plan</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Period</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Amount</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Auto-Renew</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {subscriptions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-slate-500" />
                        </div>
                        <span className="font-medium text-slate-900 dark:text-white">{sub.client_name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-medium text-slate-700 dark:text-slate-300">{sub.plan_name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 text-xs font-medium rounded-full capitalize ${getStatusColor(sub.status)}`}>
                        {sub.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                      {new Date(sub.start_date).toLocaleDateString('en-IN')} - {new Date(sub.end_date).toLocaleDateString('en-IN')}
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                      {sub.amount > 0 ? formatCurrency(sub.amount) : 'Trial'}
                    </td>
                    <td className="px-6 py-4">
                      {sub.auto_renew ? (
                        <span className="flex items-center gap-1 text-emerald-600">
                          <Check className="w-4 h-4" /> Yes
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-slate-400">
                          <X className="w-4 h-4" /> No
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button className="p-2 text-slate-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-lg transition-colors">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors">
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
