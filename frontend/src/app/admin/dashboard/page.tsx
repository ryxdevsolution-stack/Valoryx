'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useClient } from '@/contexts/ClientContext';
import axios from 'axios';
import {
  Users,
  UserCheck,
  UserX,
  Shield,
  Clock,
  Activity,
  UserPlus,
  Settings,
  TrendingUp,
  RefreshCw
} from 'lucide-react';

interface DashboardStats {
  statistics: {
    total_users: number;
    active_users: number;
    inactive_users: number;
    super_admins: number;
    recent_users: number;
    active_today: number;
    role_distribution: {
      admin?: number;
      manager?: number;
      staff?: number;
    };
  };
  recent_actions: Array<{
    action: string;
    user_id: string;
    entity_id: string;
    details: any;
    created_at: string;
  }>;
}

export default function AdminDashboard() {
  const { user, loading: authLoading, isSuperAdmin } = useClient();
  const router = useRouter();
  const [dashboardData, setDashboardData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  }, [user, authLoading, isSuperAdmin, router]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get('/api/admin/dashboard');
      setDashboardData(response.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const formatActionName = (action: string) => {
    return action.split('_').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
  };

  const getActionColor = (action: string) => {
    if (action.includes('CREATE')) return 'text-green-600';
    if (action.includes('DELETE')) return 'text-red-600';
    if (action.includes('UPDATE')) return 'text-blue-600';
    if (action.includes('STATUS')) return 'text-yellow-600';
    return 'text-gray-600';
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={fetchDashboardData}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-gray-600 mt-1">System overview and user management</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => router.push('/admin/users/create')}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              <UserPlus className="h-5 w-5" />
              Create User
            </button>
            <button
              onClick={() => router.push('/admin/users')}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
            >
              <Settings className="h-5 w-5" />
              Manage Users
            </button>
            <button
              onClick={fetchDashboardData}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              <RefreshCw className="h-5 w-5" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Statistics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Total Users */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Users</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {dashboardData?.statistics.total_users || 0}
              </p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        {/* Active Users */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Users</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {dashboardData?.statistics.active_users || 0}
              </p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <UserCheck className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>

        {/* Inactive Users */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Inactive Users</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {dashboardData?.statistics.inactive_users || 0}
              </p>
            </div>
            <div className="p-3 bg-red-100 rounded-lg">
              <UserX className="h-6 w-6 text-red-600" />
            </div>
          </div>
        </div>

        {/* Super Admins */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Super Admins</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {dashboardData?.statistics.super_admins || 0}
              </p>
            </div>
            <div className="p-3 bg-purple-100 rounded-lg">
              <Shield className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Recent Users */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">New Users (7 days)</p>
              <p className="text-xl font-bold text-gray-900 mt-1">
                {dashboardData?.statistics.recent_users || 0}
              </p>
            </div>
            <TrendingUp className="h-5 w-5 text-green-600" />
          </div>
        </div>

        {/* Active Today */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Today</p>
              <p className="text-xl font-bold text-gray-900 mt-1">
                {dashboardData?.statistics.active_today || 0}
              </p>
            </div>
            <Clock className="h-5 w-5 text-blue-600" />
          </div>
        </div>

        {/* Role Distribution */}
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600 mb-3">Role Distribution</p>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Admins</span>
              <span className="text-sm font-semibold">
                {dashboardData?.statistics.role_distribution.admin || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Managers</span>
              <span className="text-sm font-semibold">
                {dashboardData?.statistics.role_distribution.manager || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Staff</span>
              <span className="text-sm font-semibold">
                {dashboardData?.statistics.role_distribution.staff || 0}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Admin Actions */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Recent Admin Actions</h2>
          </div>
        </div>
        <div className="p-6">
          {dashboardData?.recent_actions && dashboardData.recent_actions.length > 0 ? (
            <div className="space-y-3">
              {dashboardData.recent_actions.map((action, index) => (
                <div key={index} className="flex items-start gap-3 pb-3 border-b last:border-0">
                  <div className="mt-1">
                    <div className={`w-2 h-2 rounded-full ${
                      action.action.includes('CREATE') ? 'bg-green-500' :
                      action.action.includes('DELETE') ? 'bg-red-500' :
                      action.action.includes('UPDATE') ? 'bg-blue-500' :
                      'bg-gray-500'
                    }`}></div>
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${getActionColor(action.action)}`}>
                      {formatActionName(action.action)}
                    </p>
                    {action.details && Object.keys(action.details).length > 0 && (
                      <p className="text-xs text-gray-600 mt-1">
                        {JSON.stringify(action.details).substring(0, 100)}...
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(action.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">No recent actions</p>
          )}
        </div>
      </div>

      {/* Quick Links */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={() => router.push('/admin/users')}
          className="p-4 bg-white rounded-lg shadow hover:shadow-md transition text-left"
        >
          <Users className="h-6 w-6 text-blue-600 mb-2" />
          <h3 className="font-semibold text-gray-900">Manage Users</h3>
          <p className="text-sm text-gray-600 mt-1">View and edit all users</p>
        </button>

        <button
          onClick={() => router.push('/admin/permissions')}
          className="p-4 bg-white rounded-lg shadow hover:shadow-md transition text-left"
        >
          <Shield className="h-6 w-6 text-purple-600 mb-2" />
          <h3 className="font-semibold text-gray-900">Permissions</h3>
          <p className="text-sm text-gray-600 mt-1">Manage user permissions</p>
        </button>

        <button
          onClick={() => router.push('/admin/audit')}
          className="p-4 bg-white rounded-lg shadow hover:shadow-md transition text-left"
        >
          <Activity className="h-6 w-6 text-green-600 mb-2" />
          <h3 className="font-semibold text-gray-900">Audit Logs</h3>
          <p className="text-sm text-gray-600 mt-1">View system activity</p>
        </button>
      </div>
    </div>
  );
}