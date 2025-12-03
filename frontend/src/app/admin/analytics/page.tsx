'use client';

import React, { useState } from 'react';
import { useClient } from '@/contexts/ClientContext';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Users,
  Building2,
  FileText,
  DollarSign,
  Calendar,
  Download,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
  PieChart,
  Activity,
  Target,
  Percent,
  Clock
} from 'lucide-react';

interface MetricCard {
  title: string;
  value: string;
  change: number;
  changeType: 'increase' | 'decrease';
  icon: React.ElementType;
  color: string;
}

export default function AnalyticsPage() {
  const { user } = useClient();
  const [dateRange, setDateRange] = useState('30d');
  const [refreshing, setRefreshing] = useState(false);

  const metrics: MetricCard[] = [
    { title: 'Total Revenue', value: '₹42.5L', change: 12.5, changeType: 'increase', icon: DollarSign, color: 'emerald' },
    { title: 'Total Bills', value: '15,420', change: 8.2, changeType: 'increase', icon: FileText, color: 'blue' },
    { title: 'Active Clients', value: '142', change: 15, changeType: 'increase', icon: Building2, color: 'violet' },
    { title: 'Active Users', value: '856', change: -2.3, changeType: 'decrease', icon: Users, color: 'amber' },
  ];

  const topClients = [
    { name: 'ABC Corporation', revenue: 524000, bills: 234, growth: 15 },
    { name: 'XYZ Industries', revenue: 412000, bills: 189, growth: 22 },
    { name: 'Tech Solutions', revenue: 385000, bills: 156, growth: -5 },
    { name: 'Global Enterprises', revenue: 298000, bills: 145, growth: 8 },
    { name: 'Smart Systems', revenue: 256000, bills: 112, growth: 12 },
  ];

  const revenueByCategory = [
    { category: 'GST Bills', amount: 2850000, percentage: 67 },
    { category: 'Non-GST Bills', amount: 980000, percentage: 23 },
    { category: 'Services', amount: 420000, percentage: 10 },
  ];

  const formatCurrency = (amount: number) => {
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
    return `₹${amount}`;
  };

  return (
    <div className="p-6 lg:p-8 bg-slate-50 dark:bg-slate-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Analytics</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Business intelligence and insights</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-violet-500"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="1y">Last year</option>
          </select>
          <button className="flex items-center gap-2 px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-colors">
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={() => setRefreshing(true)}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          return (
            <div key={index} className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-2.5 rounded-xl bg-${metric.color}-100 dark:bg-${metric.color}-900/30`}>
                  <Icon className={`w-5 h-5 text-${metric.color}-600`} />
                </div>
                <div className={`flex items-center gap-1 text-sm font-medium ${
                  metric.changeType === 'increase' ? 'text-emerald-600' : 'text-red-600'
                }`}>
                  {metric.changeType === 'increase' ? (
                    <ArrowUpRight className="w-4 h-4" />
                  ) : (
                    <ArrowDownRight className="w-4 h-4" />
                  )}
                  {Math.abs(metric.change)}%
                </div>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">{metric.title}</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{metric.value}</p>
            </div>
          );
        })}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Revenue Trend */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Revenue Trend</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Monthly revenue overview</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-violet-500"></div>
                <span className="text-sm text-slate-600 dark:text-slate-400">This Year</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-slate-300"></div>
                <span className="text-sm text-slate-600 dark:text-slate-400">Last Year</span>
              </div>
            </div>
          </div>

          {/* Placeholder Chart */}
          <div className="h-64 flex items-end justify-between gap-2 px-4">
            {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((month, i) => (
              <div key={month} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full flex gap-1 justify-center items-end h-48">
                  <div
                    className="w-3 bg-violet-500 rounded-t transition-all duration-500"
                    style={{ height: `${Math.random() * 100 + 20}%` }}
                  ></div>
                  <div
                    className="w-3 bg-slate-200 dark:bg-slate-600 rounded-t transition-all duration-500"
                    style={{ height: `${Math.random() * 80 + 10}%` }}
                  ></div>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400">{month}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Revenue by Category */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">Revenue by Category</h2>

          {/* Donut Chart Placeholder */}
          <div className="relative w-48 h-48 mx-auto mb-6">
            <svg viewBox="0 0 100 100" className="transform -rotate-90">
              <circle cx="50" cy="50" r="40" fill="none" stroke="#e2e8f0" strokeWidth="12" className="dark:stroke-slate-700" />
              <circle cx="50" cy="50" r="40" fill="none" stroke="#8b5cf6" strokeWidth="12" strokeDasharray="168 252" strokeLinecap="round" />
              <circle cx="50" cy="50" r="40" fill="none" stroke="#3b82f6" strokeWidth="12" strokeDasharray="58 252" strokeDashoffset="-168" strokeLinecap="round" />
              <circle cx="50" cy="50" r="40" fill="none" stroke="#10b981" strokeWidth="12" strokeDasharray="25 252" strokeDashoffset="-226" strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className="text-2xl font-bold text-slate-900 dark:text-white">₹42.5L</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Total</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {revenueByCategory.map((cat, i) => (
              <div key={cat.category} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${
                    i === 0 ? 'bg-violet-500' : i === 1 ? 'bg-blue-500' : 'bg-emerald-500'
                  }`}></div>
                  <span className="text-sm text-slate-600 dark:text-slate-400">{cat.category}</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{formatCurrency(cat.amount)}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-500">{cat.percentage}%</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Clients */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Top Clients</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">By revenue this period</p>
            </div>
            <button className="text-sm text-violet-600 hover:text-violet-700 font-medium">View All</button>
          </div>
          <div className="space-y-4">
            {topClients.map((client, index) => (
              <div key={client.name} className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-600 dark:text-slate-400">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 dark:text-white truncate">{client.name}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{client.bills} bills</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-900 dark:text-white">{formatCurrency(client.revenue)}</p>
                  <p className={`text-xs font-medium ${client.growth >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {client.growth >= 0 ? '+' : ''}{client.growth}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Key Metrics */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">Key Performance Indicators</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-violet-600" />
                <span className="text-sm text-slate-600 dark:text-slate-400">Avg. Bill Value</span>
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">₹2,850</p>
              <p className="text-xs text-emerald-600 mt-1">+8% from last month</p>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <Percent className="w-4 h-4 text-blue-600" />
                <span className="text-sm text-slate-600 dark:text-slate-400">GST Collection</span>
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">₹7.6L</p>
              <p className="text-xs text-emerald-600 mt-1">+12% from last month</p>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-amber-600" />
                <span className="text-sm text-slate-600 dark:text-slate-400">Avg. Bill Time</span>
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">2.5 min</p>
              <p className="text-xs text-emerald-600 mt-1">-15% from last month</p>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-emerald-600" />
                <span className="text-sm text-slate-600 dark:text-slate-400">Daily Active</span>
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">234</p>
              <p className="text-xs text-emerald-600 mt-1">+5% from last week</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
