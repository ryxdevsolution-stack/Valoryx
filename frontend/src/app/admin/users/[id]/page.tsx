'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useClient } from '@/contexts/ClientContext';
import axios from 'axios';
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  Building,
  Shield,
  Lock,
  Save,
  RefreshCw,
  Check,
  AlertCircle,
  Clock,
  UserCheck,
  Activity,
  Edit2,
  Key
} from 'lucide-react';

interface UserDetails {
  user_id: string;
  email: string;
  full_name: string;
  phone: string;
  department: string;
  role: string;
  is_super_admin: boolean;
  is_active: boolean;
  created_at: string;
  last_login: string | null;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  permissions: string[];
  client: {
    client_id: string;
    client_name: string;
    email: string;
  };
  recent_activity: Array<{
    action: string;
    details: any;
    created_at: string;
  }>;
}

export default function UserDetailPage() {
  const { user: currentUser, loading: authLoading, isSuperAdmin } = useClient();
  const router = useRouter();
  const params = useParams();
  const userId = params.id as string;

  const [user, setUser] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    phone: '',
    department: '',
    role: 'staff',
    is_active: true
  });

  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [availablePermissions, setAvailablePermissions] = useState<any[]>([]);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    if (!authLoading && !currentUser) {
      router.push('/auth/login');
      return;
    }

    if (!authLoading && currentUser && !isSuperAdmin()) {
      router.push('/dashboard');
      return;
    }

    if (currentUser && isSuperAdmin()) {
      fetchUserDetails();
      fetchPermissions();
    }
  }, [currentUser, authLoading, isSuperAdmin, router, userId]);

  const fetchUserDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get<UserDetails>(`/api/admin/users/${userId}`);
      setUser(response.data);
      setFormData({
        email: response.data.email,
        full_name: response.data.full_name || '',
        phone: response.data.phone || '',
        department: response.data.department || '',
        role: response.data.role,
        is_active: response.data.is_active
      });
      setSelectedPermissions(response.data.permissions || []);
    } catch (error) {
      console.error('Error fetching user details:', error);
      setError('Failed to load user details');
    } finally {
      setLoading(false);
    }
  };

  const fetchPermissions = async () => {
    try {
      const response = await axios.get('/api/permissions/all');
      setAvailablePermissions(response.data.permissions || []);
    } catch (error) {
      console.error('Error fetching permissions:', error);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      await axios.put(`/api/admin/users/${userId}`, formData);
      setSuccess('User updated successfully');
      setEditing(false);
      fetchUserDetails();
    } catch (error: any) {
      setError(error.response?.data?.error || 'Failed to update user');
    }
  };

  const handlePasswordReset = async () => {
    try {
      const response = await axios.post(`/api/admin/users/${userId}/password`, {
        password: newPassword || undefined
      });

      if (response.data.generated_password) {
        setSuccess(`Password reset successfully. New password: ${response.data.generated_password}`);
      } else {
        setSuccess('Password reset successfully');
      }
      setShowPasswordReset(false);
      setNewPassword('');
    } catch (error: any) {
      setError(error.response?.data?.error || 'Failed to reset password');
    }
  };

  const handleToggleSuperAdmin = async () => {
    if (confirm('Are you sure you want to change super admin status?')) {
      try {
        await axios.post(`/api/admin/users/${userId}/promote`);
        setSuccess('Super admin status updated');
        fetchUserDetails();
      } catch (error: any) {
        setError(error.response?.data?.error || 'Failed to update super admin status');
      }
    }
  };

  const handleToggleStatus = async () => {
    try {
      await axios.post(`/api/admin/users/${userId}/toggle-status`);
      setSuccess('User status updated');
      fetchUserDetails();
    } catch (error: any) {
      setError(error.response?.data?.error || 'Failed to update user status');
    }
  };

  const handlePermissionUpdate = async () => {
    try {
      await axios.post('/api/permissions/bulk-update', {
        user_id: userId,
        permissions: selectedPermissions
      });
      setSuccess('Permissions updated successfully');
      fetchUserDetails();
    } catch (error: any) {
      setError(error.response?.data?.error || 'Failed to update permissions');
    }
  };

  const togglePermission = (permission: string) => {
    setSelectedPermissions(prev =>
      prev.includes(permission)
        ? prev.filter(p => p !== permission)
        : [...prev, permission]
    );
  };

  // Group permissions by category
  const groupedPermissions = availablePermissions.reduce((acc, perm) => {
    if (!acc[perm.category]) {
      acc[perm.category] = [];
    }
    acc[perm.category].push(perm);
    return acc;
  }, {} as Record<string, any[]>);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => router.push('/admin/users')}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Back to Users
          </button>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => router.push('/admin/users')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Users
        </button>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {user.full_name || user.email}
            </h1>
            <p className="text-gray-600 mt-1">{user.email}</p>
            <div className="flex items-center gap-4 mt-2">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {user.is_active ? 'Active' : 'Inactive'}
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                {user.role}
              </span>
              {user.is_super_admin && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                  <Shield className="h-3 w-3" />
                  Super Admin
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Edit2 className="h-4 w-4" />
                Edit User
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
          <Check className="h-5 w-5 text-green-600" />
          <span className="text-green-800">{success}</span>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <span className="text-red-800">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* User Information */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <User className="h-5 w-5" />
              User Information
            </h2>
            {editing ? (
              <form onSubmit={handleUpdate} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                    <input
                      type="text"
                      value={formData.full_name}
                      onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                    <input
                      type="text"
                      value={formData.department}
                      onChange={(e) => setFormData(prev => ({ ...prev, department: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                    <select
                      value={formData.role}
                      onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="staff">Staff</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.is_active}
                        onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                        className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                      />
                      <span className="text-sm font-medium text-gray-700">Account Active</span>
                    </label>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setFormData({
                        email: user.email,
                        full_name: user.full_name || '',
                        phone: user.phone || '',
                        department: user.department || '',
                        role: user.role,
                        is_active: user.is_active
                      });
                    }}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    <Save className="h-4 w-4" />
                    Save Changes
                  </button>
                </div>
              </form>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Email</p>
                  <p className="font-medium">{user.email}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Full Name</p>
                  <p className="font-medium">{user.full_name || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Phone</p>
                  <p className="font-medium">{user.phone || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Department</p>
                  <p className="font-medium">{user.department || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Role</p>
                  <p className="font-medium capitalize">{user.role}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Client</p>
                  <p className="font-medium">{user.client?.client_name || '-'}</p>
                </div>
              </div>
            )}
          </div>

          {/* Permissions */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Permissions
              </h2>
              <button
                onClick={handlePermissionUpdate}
                className="text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Save Permissions
              </button>
            </div>
            {user.is_super_admin ? (
              <p className="text-gray-600 italic">Super admin has all permissions by default</p>
            ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {Object.entries(groupedPermissions).map(([category, perms]) => (
                  <div key={category}>
                    <h3 className="text-sm font-medium text-gray-900 capitalize mb-2">{category}</h3>
                    <div className="space-y-1">
                      {perms.map((perm: any) => (
                        <label key={perm.permission_name} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedPermissions.includes(perm.permission_name)}
                            onChange={() => togglePermission(perm.permission_name)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">{perm.description}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
            <div className="space-y-2">
              <button
                onClick={() => setShowPasswordReset(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left border border-gray-300 rounded hover:bg-gray-50"
              >
                <Key className="h-4 w-4" />
                Reset Password
              </button>
              <button
                onClick={handleToggleStatus}
                className="w-full flex items-center gap-2 px-3 py-2 text-left border border-gray-300 rounded hover:bg-gray-50"
              >
                <UserCheck className="h-4 w-4" />
                {user.is_active ? 'Deactivate' : 'Activate'} User
              </button>
              <button
                onClick={handleToggleSuperAdmin}
                className="w-full flex items-center gap-2 px-3 py-2 text-left border border-gray-300 rounded hover:bg-gray-50"
              >
                <Shield className="h-4 w-4" />
                {user.is_super_admin ? 'Remove' : 'Make'} Super Admin
              </button>
            </div>
          </div>

          {/* Account Details */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Account Details</h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500">Created</p>
                <p className="text-sm font-medium">
                  {user.created_at ? new Date(user.created_at).toLocaleString() : '-'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Last Login</p>
                <p className="text-sm font-medium">
                  {user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}
                </p>
              </div>
              {user.updated_at && (
                <div>
                  <p className="text-sm text-gray-500">Last Updated</p>
                  <p className="text-sm font-medium">
                    {new Date(user.updated_at).toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Recent Activity
            </h2>
            {user.recent_activity && user.recent_activity.length > 0 ? (
              <div className="space-y-2">
                {user.recent_activity.map((activity, index) => (
                  <div key={index} className="text-sm">
                    <p className="font-medium text-gray-900">{activity.action}</p>
                    <p className="text-gray-500 text-xs">
                      {new Date(activity.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No recent activity</p>
            )}
          </div>
        </div>
      </div>

      {/* Password Reset Modal */}
      {showPasswordReset && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Reset Password</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Password (leave blank to auto-generate)
                </label>
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter new password or leave blank"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowPasswordReset(false);
                    setNewPassword('');
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePasswordReset}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Reset Password
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}