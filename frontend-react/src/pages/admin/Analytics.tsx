
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  FileText,
  DollarSign,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  Percent,
  AlertCircle
} from 'lucide-react';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api';

interface AnalyticsData {
  revenue: { today: number; thisWeek: number; thisMonth: number; growth: number };
  bills: { totalGST: number; totalNonGST: number; todayCount: number; avgBillValue: number };
  products: {
    topSelling: { product_name: string; quantity_sold: number; revenue: number; category: string }[];
  };
  insights: {
    paymentPreferences: { method: string; count: number; amount: number }[];
    categoryPerformance: { category: string; revenue: number; items_sold: number }[];
    revenueTrend: { date: string; revenue: number; bills: number }[];
    profitMargin: number;
  };
}

const formatCurrency = (amount: number) => {
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
  return `₹${amount.toFixed(0)}`;
};

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month'>('month');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAnalytics = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/analytics/dashboard?range=${dateRange}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(response.data);
    } catch {
      setError('Failed to load analytics data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateRange]);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <p className="text-red-600 mb-4">{error || 'No data available'}</p>
          <button onClick={() => fetchAnalytics()} className="px-4 py-2 bg-violet-600 text-white rounded-xl hover:bg-violet-700">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const totalBills = data.bills.totalGST + data.bills.totalNonGST;

  return (
    <div className="p-6 lg:p-8 bg-slate-50 dark:bg-slate-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Analytics</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Real-time business insights</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as 'today' | 'week' | 'month')}
            className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-violet-500"
          >
            <option value="today">Today</option>
            <option value="week">Last 7 days</option>
            <option value="month">Last 30 days</option>
          </select>
          <button
            onClick={() => fetchAnalytics(true)}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
              <DollarSign className="w-5 h-5 text-emerald-600" />
            </div>
            <div className={`flex items-center gap-1 text-sm font-medium ${data.revenue.growth >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {data.revenue.growth >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              {Math.abs(data.revenue.growth).toFixed(1)}%
            </div>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">Revenue This Month</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{formatCurrency(data.revenue.thisMonth)}</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2.5 rounded-xl bg-blue-100 dark:bg-blue-900/30">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-sm font-medium text-slate-500">{data.bills.todayCount} today</span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">Total Bills</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{totalBills.toLocaleString()}</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2.5 rounded-xl bg-violet-100 dark:bg-violet-900/30">
              <Target className="w-5 h-5 text-violet-600" />
            </div>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">Avg. Bill Value</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{formatCurrency(data.bills.avgBillValue)}</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-900/30">
              <Percent className="w-5 h-5 text-amber-600" />
            </div>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">Profit Margin</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{data.insights.profitMargin.toFixed(1)}%</p>
        </div>
      </div>

      {/* Revenue Trend + Category */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Revenue Trend</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Daily revenue for selected period</p>
          {data.insights.revenueTrend.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-slate-400">No data for this period</div>
          ) : (
            <div className="h-48 flex items-end justify-between gap-1">
              {data.insights.revenueTrend.map((d) => {
                const max = Math.max(...data.insights.revenueTrend.map(x => x.revenue));
                const pct = max > 0 ? (d.revenue / max) * 100 : 0;
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1" title={`${d.date}: ${formatCurrency(d.revenue)} (${d.bills} bills)`}>
                    <div className="w-full bg-violet-500 rounded-t" style={{ height: `${Math.max(pct, 2)}%` }}></div>
                    <span className="text-xs text-slate-400 hidden lg:block">{d.date.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">By Category</h2>
          {data.insights.categoryPerformance.length === 0 ? (
            <p className="text-slate-400 text-sm">No category data</p>
          ) : (
            <div className="space-y-3">
              {data.insights.categoryPerformance.slice(0, 6).map((cat, i) => {
                const max = data.insights.categoryPerformance[0]?.revenue || 1;
                const pct = (cat.revenue / max) * 100;
                const colors = ['bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-red-500', 'bg-pink-500'];
                return (
                  <div key={cat.category}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-600 dark:text-slate-400 truncate">{cat.category}</span>
                      <span className="font-semibold text-slate-900 dark:text-white ml-2">{formatCurrency(cat.revenue)}</span>
                    </div>
                    <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full">
                      <div className={`h-2 ${colors[i % colors.length]} rounded-full`} style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bottom */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">Top Selling Products</h2>
          {data.products.topSelling.length === 0 ? (
            <p className="text-slate-400 text-sm">No sales data for this period</p>
          ) : (
            <div className="space-y-4">
              {data.products.topSelling.slice(0, 5).map((product, index) => (
                <div key={product.product_name} className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-600 dark:text-slate-400">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white truncate">{product.product_name}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{product.quantity_sold} units · {product.category}</p>
                  </div>
                  <p className="font-semibold text-slate-900 dark:text-white">{formatCurrency(product.revenue)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">Payment Methods</h2>
          {data.insights.paymentPreferences.length === 0 ? (
            <p className="text-slate-400 text-sm">No payment data</p>
          ) : (
            <div className="space-y-3">
              {data.insights.paymentPreferences.slice(0, 5).map((p) => {
                const total = data.insights.paymentPreferences.reduce((s, x) => s + x.amount, 0);
                const pct = total > 0 ? Math.round((p.amount / total) * 100) : 0;
                return (
                  <div key={p.method} className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-700 dark:text-slate-300">{p.method}</span>
                        <span className="text-slate-500">{pct}% · {p.count} bills</span>
                      </div>
                      <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full">
                        <div className="h-2 bg-violet-500 rounded-full" style={{ width: `${pct}%` }}></div>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-slate-900 dark:text-white w-16 text-right">{formatCurrency(p.amount)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
