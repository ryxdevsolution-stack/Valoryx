import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useClient } from '@/contexts/ClientContext';
import api from '@/lib/api';
import { PermissionHelpTooltip } from '@/components/admin/PermissionHelpTooltip';
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
  Key,
  Calendar,
  X,
  GitBranch,
  Receipt
} from 'lucide-react';

interface Branch {
  branch_id: string;
  name: string;
  location: string | null;
}

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
  billing_type: 'gst' | 'non_gst' | 'both' | 'none';
  branch_id: string | null;
  branch_name: string | null;
  client: {
    client_id: string;
    client_name: string;
    email: string;
  };
  recent_activity: Array<{
    action: string;
    details: any;
    timestamp: string;
  }>;
}

function getInitials(name: string, email: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(' ');
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

const inputCls =
  'w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 ' +
  'rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-transparent text-sm ' +
  'text-gray-900 dark:text-gray-100 placeholder-gray-400 transition-all';

const cardCls =
  'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl';

export default function UserDetailPage() {
  const { user: currentUser, isLoading: authLoading } = useClient();
  const isSuperAdminUser = currentUser?.is_super_admin ?? false;
  const navigate = useNavigate();
  const { id } = useParams();
  const userId = id as string;

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
    is_active: true,
    branch_id: '' as string,
  });

  const [billingType, setBillingType] = useState<'gst' | 'non_gst' | 'both' | 'none'>('both');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [availablePermissions, setAvailablePermissions] = useState<any[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  const fetchUserDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get<UserDetails>(`/admin/users/${userId}`);
      const data = response.data;
      setUser(data);
      setFormData({
        email: data.email,
        full_name: data.full_name || '',
        phone: data.phone || '',
        department: data.department || '',
        role: data.role,
        is_active: data.is_active,
        branch_id: data.branch_id || '',
      });
      setSelectedPermissions(data.permissions || []);
      setBillingType(data.billing_type || 'none');
      // Fetch branches for this user's client
      if (data.client?.client_id) {
        api.get(`/admin/clients/${data.client.client_id}/branches`)
          .then(r => setBranches(r.data.branches || []))
          .catch(() => {});
      }
    } catch (error) {
      console.error('Error fetching user details:', error);
      setError('Failed to load user details');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const fetchPermissions = useCallback(async (includeSuperAdmin: boolean = false) => {
    try {
      const url = includeSuperAdmin
        ? '/permissions/all?include_super_admin=true'
        : '/permissions/all';
      const response = await api.get(url);
      setAvailablePermissions(response.data.permissions || []);
    } catch (error) {
      console.error('Error fetching permissions:', error);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;

    if (!currentUser) {
      navigate('/auth/login');
      return;
    }

    if (!isSuperAdminUser) {
      navigate('/dashboard');
      return;
    }

    fetchUserDetails();
  }, [authLoading, currentUser, isSuperAdminUser, navigate, fetchUserDetails]);

  // Re-fetch permissions list whenever the target user's super_admin status is known
  // or changes. Pass include_super_admin only when the target IS a super admin —
  // otherwise the 4 super-admin-only perms shouldn't be assignable.
  useEffect(() => {
    if (user) {
      fetchPermissions(user.is_super_admin === true);
    }
  }, [user?.is_super_admin, fetchPermissions, user]);

  const handleBillingTypeChange = (bt: 'gst' | 'non_gst' | 'both' | 'none') => {
    setBillingType(bt);
    setSelectedPermissions(prev => {
      let perms = prev.filter(p => p !== 'gst_billing' && p !== 'non_gst_billing');
      if (bt === 'gst') perms = [...perms, 'gst_billing'];
      else if (bt === 'non_gst') perms = [...perms, 'non_gst_billing'];
      else if (bt === 'both') perms = [...perms, 'gst_billing', 'non_gst_billing'];
      return perms;
    });
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      await api.put(`/admin/users/${userId}`, {
        ...formData,
        branch_id: formData.branch_id || null,
        billing_type: billingType,
      });
      setSuccess('User updated successfully');
      setEditing(false);
      fetchUserDetails();
    } catch (error: any) {
      setError(error.response?.data?.error || 'Failed to update user');
    }
  };

  const handlePasswordReset = async () => {
    try {
      const response = await api.post(`/admin/users/${userId}/password`, {
        password: newPassword || undefined
      });
      if (response.data.generated_password) {
        setSuccess(`Password reset. New password: ${response.data.generated_password}`);
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
        await api.post(`/admin/users/${userId}/promote`);
        setSuccess('Super admin status updated');
        fetchUserDetails();
      } catch (error: any) {
        setError(error.response?.data?.error || 'Failed to update super admin status');
      }
    }
  };

  const handleToggleStatus = async () => {
    try {
      await api.post(`/admin/users/${userId}/toggle-status`);
      setSuccess('User status updated');
      fetchUserDetails();
    } catch (error: any) {
      setError(error.response?.data?.error || 'Failed to update user status');
    }
  };

  const handlePermissionUpdate = async () => {
    try {
      await api.post('/permissions/bulk-update', {
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

  const groupedPermissions = availablePermissions.reduce((acc, perm) => {
    if (!acc[perm.category]) acc[perm.category] = [];
    acc[perm.category].push(perm);
    return acc;
  }, {} as Record<string, any[]>);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 dark:border-gray-700 border-t-gray-600" />
      </div>
    );
  }

  if (error && !user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <AlertCircle className="h-10 w-10 text-gray-400 mx-auto" />
          <p className="text-gray-600 dark:text-gray-400">{error}</p>
          <button
            type="button"
            onClick={() => navigate('/admin/users')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg text-sm font-medium"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Users
          </button>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const initials = getInitials(user.full_name, user.email);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">

      {/* Back link */}
      <button
        type="button"
        onClick={() => navigate('/admin/users')}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Users
      </button>

      {/* Alerts */}
      {success && (
        <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300">
          <Check className="h-4 w-4 text-green-600 shrink-0" />
          <span className="flex-1">{success}</span>
          <button type="button" onClick={() => setSuccess(null)}>
            <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
          </button>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)}>
            <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
          </button>
        </div>
      )}

      {/* User header */}
      <div className={`${cardCls} p-5`}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Avatar */}
          <div className="shrink-0 w-14 h-14 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
            <span className="text-lg font-semibold text-gray-600 dark:text-gray-300">{initials}</span>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white truncate">
              {user.full_name || user.email}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{user.email}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${
                user.is_active
                  ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                  : 'bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${user.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
                {user.is_active ? 'Active' : 'Inactive'}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 capitalize">
                {user.role}
              </span>
              {user.is_super_admin && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300">
                  <Shield className="h-3 w-3" />
                  Super Admin
                </span>
              )}
              {user.client?.client_name && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400">
                  <Building className="h-3 w-3" />
                  {user.client.client_name}
                </span>
              )}
            </div>
          </div>

          {/* Edit button */}
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-gray-100 hover:bg-gray-700 dark:hover:bg-white text-white dark:text-gray-900 rounded-lg text-sm font-medium transition-colors"
            >
              <Edit2 className="h-4 w-4" />
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Main column */}
        <div className="lg:col-span-2 space-y-5">

          {/* User Information */}
          <div className={cardCls}>
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                <User className="h-4 w-4 text-gray-400" />
                User Information
              </h2>
            </div>

            <div className="p-5">
              {editing ? (
                <form onSubmit={handleUpdate} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Email</label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                        className={inputCls}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Full Name</label>
                      <input
                        type="text"
                        value={formData.full_name}
                        onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                        className={inputCls}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Phone</label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                        className={inputCls}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Department</label>
                      <input
                        type="text"
                        value={formData.department}
                        onChange={(e) => setFormData(prev => ({ ...prev, department: e.target.value }))}
                        className={inputCls}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Role</label>
                      <select
                        value={formData.role}
                        onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
                        className={inputCls}
                      >
                        <option value="staff">Staff</option>
                        <option value="manager">Manager</option>
                      </select>
                    </div>
                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={formData.is_active}
                          onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-gray-800 focus:ring-gray-400 cursor-pointer"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Account Active</span>
                      </label>
                    </div>
                  </div>

                  {/* Branch & Billing Type */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <GitBranch className="h-3 w-3" /> Assigned Branch
                      </label>
                      <select
                        value={formData.branch_id}
                        onChange={(e) => setFormData(prev => ({ ...prev, branch_id: e.target.value }))}
                        className={inputCls}
                      >
                        <option value="">— All Branches (no restriction)</option>
                        {branches.map(b => (
                          <option key={b.branch_id} value={b.branch_id}>
                            {b.name}{b.location ? ` — ${b.location}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <Receipt className="h-3 w-3" /> Billing Type
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {([
                          { value: 'both',    label: 'GST + Non-GST' },
                          { value: 'gst',     label: 'GST Only' },
                          { value: 'non_gst', label: 'Non-GST Only' },
                          { value: 'none',    label: 'No Billing' },
                        ] as const).map(opt => (
                          <button key={opt.value} type="button"
                            onClick={() => handleBillingTypeChange(opt.value)}
                            className={`px-2 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                              billingType === opt.value
                                ? 'border-gray-800 bg-gray-900 text-white dark:border-gray-200 dark:bg-gray-100 dark:text-gray-900'
                                : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                            }`}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-gray-100 dark:border-gray-700">
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
                          is_active: user.is_active,
                          branch_id: user.branch_id || '',
                        });
                        setBillingType(user.billing_type || 'none');
                      }}
                      className="px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-gray-100 hover:bg-gray-700 dark:hover:bg-white text-white dark:text-gray-900 rounded-lg text-sm font-medium transition-colors"
                    >
                      <Save className="h-4 w-4" />
                      Save Changes
                    </button>
                  </div>
                </form>
              ) : (
                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  {[
                    { label: 'Email', value: user.email },
                    { label: 'Full Name', value: user.full_name || '—' },
                    { label: 'Phone', value: user.phone || '—' },
                    { label: 'Department', value: user.department || '—' },
                    { label: 'Role', value: user.role, capitalize: true },
                    { label: 'Client', value: user.client?.client_name || '—' },
                  ].map(({ label, value, capitalize }) => (
                    <div key={label}>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">{label}</p>
                      <p className={`text-sm text-gray-800 dark:text-gray-200 font-medium ${capitalize ? 'capitalize' : ''}`}>
                        {value}
                      </p>
                    </div>
                  ))}
                  <div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5 flex items-center gap-1">
                      <GitBranch className="h-3 w-3" /> Branch
                    </p>
                    <p className="text-sm text-gray-800 dark:text-gray-200 font-medium">
                      {user.branch_name || <span className="text-gray-400">All branches</span>}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5 flex items-center gap-1">
                      <Receipt className="h-3 w-3" /> Billing Access
                    </p>
                    <p className="text-sm text-gray-800 dark:text-gray-200 font-medium">
                      {user.billing_type === 'both' ? 'GST + Non-GST'
                        : user.billing_type === 'gst' ? 'GST Only'
                        : user.billing_type === 'non_gst' ? 'Non-GST Only'
                        : 'No billing access'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Permissions */}
          <div className={cardCls}>
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                <Shield className="h-4 w-4 text-gray-400" />
                Permissions
              </h2>
              {!user.is_super_admin && (
                <button
                  type="button"
                  onClick={handlePermissionUpdate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 dark:bg-gray-100 hover:bg-gray-700 dark:hover:bg-white text-white dark:text-gray-900 rounded-lg text-xs font-medium transition-colors"
                >
                  <Save className="h-3 w-3" />
                  Save
                </button>
              )}
            </div>

            <div className="p-5">
              {user.is_super_admin ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Super admin has all permissions by default.
                </p>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {Object.entries(groupedPermissions).map(([category, perms]) => (
                    <div key={category}>
                      <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 capitalize">
                        {category}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {(perms as any[]).map((perm: any) => (
                          <label
                            key={perm.permission_name}
                            className="group flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={selectedPermissions.includes(perm.permission_name)}
                              onChange={() => togglePermission(perm.permission_name)}
                              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-gray-800 focus:ring-gray-400 cursor-pointer"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">
                              {perm.description}
                            </span>
                            <PermissionHelpTooltip permissionName={perm.permission_name} />
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">

          {/* Actions */}
          <div className={cardCls}>
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Actions</h2>
            </div>
            <div className="p-4 space-y-2">
              <button
                type="button"
                onClick={() => setShowPasswordReset(true)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-left transition-colors"
              >
                <Key className="h-4 w-4 text-gray-400 shrink-0" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Reset Password</span>
              </button>

              <button
                type="button"
                onClick={handleToggleStatus}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-left transition-colors"
              >
                <UserCheck className="h-4 w-4 text-gray-400 shrink-0" />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {user.is_active ? 'Deactivate User' : 'Activate User'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleToggleSuperAdmin}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-left transition-colors"
              >
                <Shield className="h-4 w-4 text-gray-400 shrink-0" />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {user.is_super_admin ? 'Remove Super Admin' : 'Make Super Admin'}
                </span>
              </button>
            </div>
          </div>

          {/* Account Details */}
          <div className={cardCls}>
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Account Details</h2>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Created</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-gray-400 shrink-0" />
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Last Login</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
                  </p>
                </div>
              </div>
              {user.updated_at && (
                <div className="flex items-center gap-3">
                  <RefreshCw className="h-4 w-4 text-gray-400 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400 dark:text-gray-500">Last Updated</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {new Date(user.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Recent Activity */}
          <div className={cardCls}>
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                <Activity className="h-4 w-4 text-gray-400" />
                Recent Activity
              </h2>
            </div>
            <div className="p-4">
              {user.recent_activity && user.recent_activity.length > 0 ? (
                <div className="space-y-3">
                  {user.recent_activity.map((activity, index) => (
                    <div key={index} className="flex gap-3">
                      <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600 shrink-0" />
                      <div>
                        <p className="text-sm text-gray-700 dark:text-gray-300">{activity.action}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          {activity.timestamp ? new Date(activity.timestamp).toLocaleString() : '—'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 dark:text-gray-500 py-2">No recent activity</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Password Reset Modal */}
      {showPasswordReset && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md border border-gray-200 dark:border-gray-700">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Reset Password</h3>
              </div>
              <button
                type="button"
                onClick={() => { setShowPasswordReset(false); setNewPassword(''); }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Leave blank to auto-generate a secure password.
              </p>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                  New Password <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={inputCls}
                  placeholder="Leave blank to auto-generate"
                />
              </div>
            </div>

            <div className="px-6 pb-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowPasswordReset(false); setNewPassword(''); }}
                className="px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePasswordReset}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-gray-100 hover:bg-gray-700 dark:hover:bg-white text-white dark:text-gray-900 rounded-lg text-sm font-medium transition-colors"
              >
                <Key className="h-4 w-4" />
                {newPassword ? 'Set Password' : 'Auto-Generate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
