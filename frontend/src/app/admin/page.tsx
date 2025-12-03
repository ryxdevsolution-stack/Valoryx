'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useClient } from '@/contexts/ClientContext';
import axios from 'axios';
import {
  Users,
  Building2,
  FileText,
  Activity,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Server,
  Database,
  Zap,
  Shield,
  UserCheck,
  Bell
} from 'lucide-react';
import {
  DashboardStats,
  formatCurrency,
  formatNumber,
  formatTimeAgo,
  Card,
  LoadingState,
  ProgressBar,
  Button
} from '@/lib/admin';

interface RecentActivity {
  id: string;
  type: 'client_created' | 'user_login' | 'bill_created' | 'settings_changed' | 'backup_completed';
  description: string;
  user: string;
  timestamp: string;
  client?: string;
}

interface QuickStat {
  label: string;
  value: string | number;
  change?: number;
  changeType?: 'increase' | 'decrease' | 'neutral';
  icon: React.ElementType;
  color: string;
  bgColor: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

// Default stats for when API is not available
const getDefaultStats = (): DashboardStats => ({
  clients: { total: 12, active: 10, inactive: 2, new_this_month: 3, growth_percentage: 15 },
  users: { total: 156, active: 142, inactive: 14, super_admins: 2, new_this_week: 8, active_today: 45 },
  billing: {
    total_bills: 15420,
    bills_today: 234,
    bills_this_month: 4521,
    total_revenue: 4250000,
    revenue_this_month: 425000,
    revenue_growth: 12.5,
    average_bill_value: 2850
  },
  system: {
    database_size: '2.4 GB',
    storage_used: '45%',
    api_requests_today: 12450,
    uptime_percentage: 99.9,
    last_backup: new Date().toISOString(),
    pending_alerts: 3
  }
});

export default function AdminDashboard() {
  const { user, isLoading: authLoading, isSuperAdmin } = useClient();
  const router = useRouter();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchDashboardData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const token = localStorage.getItem('token');

      const [statsResponse, activityResponse] = await Promise.all([
        axios.get(`${API_URL}/admin/stats/overview`, {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => ({ data: null })),
        axios.get(`${API_URL}/admin/activity/recent`, {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => ({ data: { activities: [] } }))
      ]);

      setStats(statsResponse.data || getDefaultStats());
      setRecentActivity(activityResponse.data?.activities || []);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setStats(getDefaultStats());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login');
      return;
    }

    if (!authLoading && user && !isSuperAdmin()) {
      router.push('/dashboard');
      return;
    }

    if (user && isSuperAdmin()) {
      fetchDashboardData();
    }
  }, [user, authLoading, isSuperAdmin, router, fetchDashboardData]);

  const quickStats: QuickStat[] = stats ? [
    {
      label: 'Total Clients',
      value: stats.clients.total,
      change: stats.clients.growth_percentage,
      changeType: stats.clients.growth_percentage >= 0 ? 'increase' : 'decrease',
      icon: Building2,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30'
    },
    {
      label: 'Active Users',
      value: stats.users.active,
      change: Math.round((stats.users.active / stats.users.total) * 100),
      changeType: 'neutral',
      icon: Users,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-100 dark:bg-emerald-900/30'
    },
    {
      label: 'Revenue This Month',
      value: formatCurrency(stats.billing.revenue_this_month, { compact: true }),
      change: stats.billing.revenue_growth,
      changeType: stats.billing.revenue_growth >= 0 ? 'increase' : 'decrease',
      icon: DollarSign,
      color: 'text-violet-600',
      bgColor: 'bg-violet-100 dark:bg-violet-900/30'
    },
    {
      label: 'Bills Today',
      value: stats.billing.bills_today,
      icon: FileText,
      color: 'text-amber-600',
      bgColor: 'bg-amber-100 dark:bg-amber-900/30'
    },
    {
      label: 'System Uptime',
      value: `${stats.system.uptime_percentage}%`,
      changeType: 'increase',
      icon: Server,
      color: 'text-teal-600',
      bgColor: 'bg-teal-100 dark:bg-teal-900/30'
    },
    {
      label: 'Pending Alerts',
      value: stats.system.pending_alerts,
      changeType: stats.system.pending_alerts > 0 ? 'decrease' : 'increase',
      icon: Bell,
      color: stats.system.pending_alerts > 0 ? 'text-red-600' : 'text-green-600',
      bgColor: stats.system.pending_alerts > 0 ? 'bg-red-100 dark:bg-red-900/30' : 'bg-green-100 dark:bg-green-900/30'
    }
  ] : [];

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingState message="Loading Dashboard..." size="lg" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 bg-slate-50 dark:bg-slate-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Admin Dashboard
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Welcome back, {user?.full_name || 'Admin'}. Here&apos;s what&apos;s happening.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden lg:flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
            <Clock className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="text-xs text-slate-400">
              {currentTime.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
          </div>
          <Button
            onClick={() => fetchDashboardData(true)}
            loading={refreshing}
            icon={RefreshCw}
          >
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {quickStats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={index}
              className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className={`p-2.5 rounded-xl ${stat.bgColor}`}>
                  <Icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                {stat.change !== undefined && (
                  <div className={`flex items-center gap-0.5 text-xs font-medium ${
                    stat.changeType === 'increase' ? 'text-emerald-600' :
                    stat.changeType === 'decrease' ? 'text-red-600' :
                    'text-slate-500'
                  }`}>
                    {stat.changeType === 'increase' && <ArrowUpRight className="w-3 h-3" />}
                    {stat.changeType === 'decrease' && <ArrowDownRight className="w-3 h-3" />}
                    {stat.change}%
                  </div>
                )}
              </div>
              <div className="mt-3">
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{stat.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Charts & Stats */}
        <div className="lg:col-span-2 space-y-6">
          {/* Revenue Overview Card */}
          <Card title="Revenue Overview" description="Monthly billing performance">
            <div className="flex items-center justify-between mb-6">
              <span className="text-2xl font-bold text-slate-900 dark:text-white">
                {stats && formatCurrency(stats.billing.total_revenue, { compact: true })}
              </span>
              <span className="text-xs font-medium text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 px-2 py-1 rounded-full">
                +{stats?.billing.revenue_growth}%
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                <p className="text-sm text-slate-500 dark:text-slate-400">Total Bills</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                  {stats && formatNumber(stats.billing.total_bills)}
                </p>
              </div>
              <div className="text-center p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                <p className="text-sm text-slate-500 dark:text-slate-400">This Month</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                  {stats && formatNumber(stats.billing.bills_this_month)}
                </p>
              </div>
              <div className="text-center p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                <p className="text-sm text-slate-500 dark:text-slate-400">Avg. Value</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                  {stats && formatCurrency(stats.billing.average_bill_value, { compact: true })}
                </p>
              </div>
            </div>
          </Card>

          {/* Client & User Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Clients Card */}
            <Card>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 rounded-xl bg-blue-100 dark:bg-blue-900/30">
                  <Building2 className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">Clients</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Organization accounts</p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Total Clients</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{stats?.clients.total}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-emerald-500" /> Active
                  </span>
                  <span className="font-semibold text-emerald-600">{stats?.clients.active}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-1">
                    <XCircle className="w-3 h-3 text-red-500" /> Inactive
                  </span>
                  <span className="font-semibold text-red-600">{stats?.clients.inactive}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
                  <span className="text-sm text-slate-600 dark:text-slate-400">New This Month</span>
                  <span className="font-semibold text-blue-600">+{stats?.clients.new_this_month}</span>
                </div>
              </div>
              <button
                onClick={() => router.push('/admin/clients')}
                className="w-full mt-4 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-colors"
              >
                View All Clients →
              </button>
            </Card>

            {/* Users Card */}
            <Card>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
                  <Users className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">Users</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">System users</p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Total Users</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{stats?.users.total}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-1">
                    <UserCheck className="w-3 h-3 text-emerald-500" /> Active
                  </span>
                  <span className="font-semibold text-emerald-600">{stats?.users.active}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-1">
                    <Shield className="w-3 h-3 text-violet-500" /> Super Admins
                  </span>
                  <span className="font-semibold text-violet-600">{stats?.users.super_admins}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Active Today</span>
                  <span className="font-semibold text-emerald-600">{stats?.users.active_today}</span>
                </div>
              </div>
              <button
                onClick={() => router.push('/admin/users')}
                className="w-full mt-4 px-4 py-2 text-sm font-medium text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-xl transition-colors"
              >
                View All Users →
              </button>
            </Card>
          </div>
        </div>

        {/* Right Column - Activity & System Status */}
        <div className="space-y-6">
          {/* System Status Card */}
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-violet-100 dark:bg-violet-900/30">
                <Server className="w-5 h-5 text-violet-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white">System Status</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Infrastructure health</p>
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                <span className="text-xs font-medium text-emerald-600">Online</span>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Uptime</span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">{stats?.system.uptime_percentage}%</span>
                </div>
                <ProgressBar value={stats?.system.uptime_percentage || 0} color="emerald" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Storage Used</span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">{stats?.system.storage_used}</span>
                </div>
                <ProgressBar value={parseFloat(stats?.system.storage_used || '0')} color="amber" />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                <div className="text-center p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                  <Database className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                  <p className="text-xs text-slate-500 dark:text-slate-400">Database</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{stats?.system.database_size}</p>
                </div>
                <div className="text-center p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                  <Zap className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                  <p className="text-xs text-slate-500 dark:text-slate-400">API Calls</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{stats && formatNumber(stats.system.api_requests_today)}</p>
                </div>
              </div>
            </div>
            <button
              onClick={() => router.push('/admin/health')}
              className="w-full mt-4 px-4 py-2 text-sm font-medium text-violet-600 hover:text-violet-700 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-xl transition-colors"
            >
              View System Health →
            </button>
          </Card>

          {/* Quick Actions Card */}
          <Card title="Quick Actions">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => router.push('/admin/clients/create')}
                className="flex flex-col items-center gap-2 p-4 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
              >
                <Building2 className="w-5 h-5 text-blue-600" />
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">New Client</span>
              </button>
              <button
                onClick={() => router.push('/admin/users/create')}
                className="flex flex-col items-center gap-2 p-4 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
              >
                <Users className="w-5 h-5 text-emerald-600" />
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">New User</span>
              </button>
              <button
                onClick={() => router.push('/admin/backup')}
                className="flex flex-col items-center gap-2 p-4 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
              >
                <Database className="w-5 h-5 text-violet-600" />
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Backup</span>
              </button>
              <button
                onClick={() => router.push('/admin/settings')}
                className="flex flex-col items-center gap-2 p-4 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
              >
                <Activity className="w-5 h-5 text-amber-600" />
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Settings</span>
              </button>
            </div>
          </Card>

          {/* Recent Activity Card */}
          <Card
            title="Recent Activity"
            actions={
              <button
                onClick={() => router.push('/admin/audit')}
                className="text-xs font-medium text-violet-600 hover:text-violet-700"
              >
                View All
              </button>
            }
          >
            <div className="space-y-3">
              {recentActivity.length > 0 ? (
                recentActivity.slice(0, 5).map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3 pb-3 border-b border-slate-100 dark:border-slate-700 last:border-0 last:pb-0">
                    <div className={`w-2 h-2 rounded-full mt-2 ${
                      activity.type === 'client_created' ? 'bg-blue-500' :
                      activity.type === 'user_login' ? 'bg-emerald-500' :
                      activity.type === 'bill_created' ? 'bg-amber-500' :
                      'bg-slate-400'
                    }`}></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 dark:text-slate-300 truncate">{activity.description}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {activity.user} • {formatTimeAgo(activity.timestamp)}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-4">
                  <Activity className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">No recent activity</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
