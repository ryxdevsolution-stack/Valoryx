import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useClient } from '@/contexts/ClientContext';
import api from '@/lib/api';
import {
  Building2,
  Mail,
  Phone,
  MapPin,
  FileText,
  Image,
  ArrowLeft,
  Save,
  Edit2,
  X,
  AlertCircle,
  Users,
  UserCheck,
  Shield,
  Clock,
  Activity,
  Plus,
  Trash2,
  Key,
  CheckCircle,
  XCircle
} from 'lucide-react';

interface Permission {
  permission_id: string;
  permission_name: string;
  description: string;
  category: string;
}

interface UserWithPermissions {
  user_id: string;
  email: string;
  full_name: string;
  phone: string;
  department: string;
  role: string;
  is_super_admin: boolean;
  is_active: boolean;
  permissions: string[];
  created_at: string;
  last_login: string | null;
}

interface RoleQuotas {
  admin: number | '';
  manager: number | '';
  staff: number | '';
  cashier: number | '';
}

interface ClientDetails {
  client_id: string;
  client_name: string;
  email: string;
  phone: string;
  address: string | null;
  gst_number: string | null;
  logo_url: string | null;
  is_active: boolean;
  created_at: string;
  role_quotas?: Record<string, number> | null;
  statistics?: {
    total_users: number;
    active_users: number;
    super_admins: number;
  };
  users?: Array<{
    user_id: string;
    email: string;
    full_name: string;
    role: string;
    is_super_admin: boolean;
    is_active: boolean;
  }>;
  recent_activity?: Array<{
    action: string;
    user_id: string;
    created_at: string;
  }>;
}

export default function ClientDetailsPage() {
  const { user, isLoading: authLoading, isSuperAdmin } = useClient();
  const navigate = useNavigate();
  const { clientId } = useParams();
  const [client, setClient] = useState<ClientDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState<Partial<ClientDetails>>({});
  const [errors, setErrors] = useState<Partial<ClientDetails>>({});
  const [saving, setSaving] = useState(false);

  // Role quota state (separate from formData for cleaner number/empty handling)
  const [roleQuotas, setRoleQuotas] = useState<RoleQuotas>({ admin: '', manager: '', staff: '', cashier: '' });

  // User management states
  const [clientUsers, setClientUsers] = useState<UserWithPermissions[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithPermissions | null>(null);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);

  // Delete user modal states
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserWithPermissions | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [permissionsByCategory, setPermissionsByCategory] = useState<Record<string, Permission[]>>({});

  const fetchClientUsers = useCallback(async () => {
    try {
      setLoadingUsers(true);
      const response = await api.get(`/admin/clients/${clientId}/users`);
      setClientUsers(response.data.users || []);
    } catch (err: any) {
      console.error('Error fetching client users:', err);
    } finally {
      setLoadingUsers(false);
    }
  }, [clientId]);

  const fetchAllPermissions = useCallback(async () => {
    try {
      const response = await api.get('/permissions/all');
      console.log('Permissions response:', response.data);
      setAllPermissions(response.data.permissions || []);
      setPermissionsByCategory(response.data.categorized || {});
    } catch (err: any) {
      console.error('Error fetching permissions:', err);
      console.error('Error details:', err.response?.data);
    }
  }, []);

  const fetchClientDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await api.get<ClientDetails>(`/admin/clients/${clientId}`);

      setClient(response.data);
      setFormData(response.data);
      // Populate quota inputs from saved values (empty string = unlimited)
      const q = response.data.role_quotas || {};
      setRoleQuotas({
        admin:   q.admin   != null ? q.admin   : '',
        manager: q.manager != null ? q.manager : '',
        staff:   q.staff   != null ? q.staff   : '',
        cashier: q.cashier != null ? q.cashier : '',
      });
      fetchClientUsers();
      fetchAllPermissions();
    } catch (err: any) {
      console.error('Error fetching client details:', err);
      setError(err.response?.data?.error || 'Failed to load client details');
    } finally {
      setLoading(false);
    }
  }, [clientId, fetchClientUsers, fetchAllPermissions]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth/login');
      return;
    }

    if (!authLoading && user && !isSuperAdmin()) {
      navigate('/dashboard');
      return;
    }

    if (user && isSuperAdmin() && clientId) {
      fetchClientDetails();
    }
  }, [user, authLoading, isSuperAdmin, navigate, clientId, fetchClientDetails]);

  const validateForm = (): boolean => {
    const newErrors: Partial<ClientDetails> = {};

    if (!formData.client_name?.trim()) {
      newErrors.client_name = 'Client name is required';
    }

    if (!formData.email?.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }

    if (!formData.phone?.trim()) {
      newErrors.phone = 'Phone number is required';
    }

    if (formData.gst_number && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(formData.gst_number)) {
      newErrors.gst_number = 'Invalid GST format';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Build role_quotas payload — only include roles with numeric values (empty string = unlimited = omit)
      const quotasPayload: Record<string, number> = {};
      (Object.keys(roleQuotas) as Array<keyof RoleQuotas>).forEach((role) => {
        const val = roleQuotas[role];
        if (val !== '' && val !== null) quotasPayload[role] = Number(val);
      });

      await api.put(`/admin/clients/${clientId}`, {
        client_name: formData.client_name,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        gst_number: formData.gst_number,
        logo_url: formData.logo_url,
        role_quotas: Object.keys(quotasPayload).length > 0 ? quotasPayload : null,
      });

      setEditMode(false);
      fetchClientDetails();
    } catch (err: any) {
      console.error('Error updating client:', err);
      setError(err.response?.data?.error || 'Failed to update client');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async () => {
    try {
      await api.post(`/admin/clients/${clientId}/toggle-status`, {});
      fetchClientDetails();
    } catch (err) {
      console.error('Error toggling client status:', err);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    if (errors[name as keyof ClientDetails]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handleToggleUserStatus = async (userId: string) => {
    try {
      await api.post(`/admin/users/${userId}/toggle-status`, {});
      fetchClientUsers();
    } catch (err) {
      console.error('Error toggling user status:', err);
    }
  };

  const openDeleteModal = (user: UserWithPermissions) => {
    setUserToDelete(user);
    setShowDeleteModal(true);
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    setDeleting(true);
    setError(null);
    try {
      await api.delete(`/admin/users/${userToDelete.user_id}`);
      setShowDeleteModal(false);
      setUserToDelete(null);
      fetchClientUsers();
      fetchClientDetails();
    } catch (err: any) {
      console.error('Error deleting user:', err);
      setShowDeleteModal(false);
      setUserToDelete(null);
      setError(err.response?.data?.error || 'Failed to delete user');
    } finally {
      setDeleting(false);
    }
  };

  const openPermissionsModal = (user: UserWithPermissions) => {
    setSelectedUser(user);
    setShowPermissionsModal(true);
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400"></div>
      </div>
    );
  }

  if (error && !client) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
          <button
            onClick={fetchClientDetails}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!client) return null;

  return (
    <div className="p-6 max-w-7xl mx-auto text-slate-900 dark:text-slate-100">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/admin/clients')}
          className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Clients
        </button>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            {client.logo_url ? (
              <img
                src={client.logo_url}
                alt={client.client_name}
                width={64}
                height={64}
                className="h-16 w-16 rounded-full object-cover"
              />
            ) : (
              <div className="h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Building2 className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              </div>
            )}
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{client.client_name}</h1>
              <div className="flex items-center gap-4 mt-1">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  client.is_active
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
                }`}>
                  {client.is_active ? 'Active' : 'Inactive'}
                </span>
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  Created on {new Date(client.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            {!editMode ? (
              <>
                <button
                  onClick={() => setEditMode(true)}
                  className="flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition text-slate-700 dark:text-slate-300"
                >
                  <Edit2 className="h-4 w-4" />
                  Edit
                </button>
                <button
                  onClick={handleToggleStatus}
                  className={`px-4 py-2 rounded-lg transition ${
                    client.is_active
                      ? 'bg-yellow-600 text-white hover:bg-yellow-700'
                      : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
                >
                  {client.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setEditMode(false);
                    setFormData(client);
                    setErrors({});
                    // Reset quota inputs back to saved values
                    const q = client.role_quotas || {};
                    setRoleQuotas({
                      admin:   q.admin   != null ? q.admin   : '',
                      manager: q.manager != null ? q.manager : '',
                      staff:   q.staff   != null ? q.staff   : '',
                      cashier: q.cashier != null ? q.cashier : '',
                    });
                  }}
                  className="flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition text-slate-700 dark:text-slate-300"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
          <p className="text-red-800 dark:text-red-300">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Client Information */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow dark:shadow-slate-900/20 p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Client Information</h2>

            {editMode ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Editable fields */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Client Name *
                  </label>
                  <input
                    type="text"
                    name="client_name"
                    value={formData.client_name}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 ${
                      errors.client_name ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'
                    }`}
                  />
                  {errors.client_name && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.client_name}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 ${
                      errors.email ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'
                    }`}
                  />
                  {errors.email && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.email}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Phone *
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 ${
                      errors.phone ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'
                    }`}
                  />
                  {errors.phone && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.phone}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    GST Number
                  </label>
                  <input
                    type="text"
                    name="gst_number"
                    value={formData.gst_number || ''}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 ${
                      errors.gst_number ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'
                    }`}
                  />
                  {errors.gst_number && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.gst_number}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Logo URL
                  </label>
                  <input
                    type="url"
                    name="logo_url"
                    value={formData.logo_url || ''}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Address
                  </label>
                  <textarea
                    name="address"
                    value={formData.address || ''}
                    onChange={handleChange}
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  />
                </div>

                {/* Role Quotas */}
                <div className="md:col-span-2">
                  <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Shield className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Team Member Quotas</h3>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                      Set the maximum number of users allowed per role. Leave blank for unlimited.
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {(['admin', 'manager', 'staff', 'cashier'] as const).map((role) => {
                        const used = clientUsers.filter(u => u.role === role && u.is_active).length;
                        return (
                          <div key={role}>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 capitalize">
                              {role}
                              <span className="ml-1 text-slate-400 dark:text-slate-500 font-normal">({used} active)</span>
                            </label>
                            <input
                              type="number"
                              min="0"
                              placeholder="Unlimited"
                              value={roleQuotas[role] === '' ? '' : roleQuotas[role]}
                              onChange={(e) => setRoleQuotas(prev => ({
                                ...prev,
                                [role]: e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0),
                              }))}
                              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-slate-400 dark:text-slate-500 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Email</p>
                    <p className="text-sm text-slate-900 dark:text-white">{client.email}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Phone className="h-5 w-5 text-slate-400 dark:text-slate-500 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Phone</p>
                    <p className="text-sm text-slate-900 dark:text-white">{client.phone}</p>
                  </div>
                </div>

                {client.address && (
                  <div className="flex items-start gap-3">
                    <MapPin className="h-5 w-5 text-slate-400 dark:text-slate-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Address</p>
                      <p className="text-sm text-slate-900 dark:text-white">{client.address}</p>
                    </div>
                  </div>
                )}

                {client.gst_number && (
                  <div className="flex items-start gap-3">
                    <FileText className="h-5 w-5 text-slate-400 dark:text-slate-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">GST Number</p>
                      <p className="text-sm text-slate-900 dark:text-white">{client.gst_number}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Users & Permissions Management */}
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow dark:shadow-slate-900/20 p-6 mt-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Users & Permissions</h2>
              <button
                onClick={() => setShowCreateUserModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                <Plus className="h-4 w-4" />
                Add User
              </button>
            </div>

            {loadingUsers ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400"></div>
              </div>
            ) : clientUsers.length === 0 ? (
              <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                <Users className="h-12 w-12 mx-auto mb-3 text-slate-400 dark:text-slate-500" />
                <p>No users yet. Add the first user to get started.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {clientUsers.map((user) => (
                  <div key={user.user_id} className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {user.full_name || user.email}
                        </p>
                        {user.is_super_admin && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-400">
                            <Shield className="h-3 w-3 mr-1" />
                            Super Admin
                          </span>
                        )}
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          user.is_active
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                            : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
                        }`}>
                          {user.is_active ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                          {user.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded capitalize">
                          {user.role}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {user.permissions.length} permissions
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openPermissionsModal(user)}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm border border-blue-600 dark:border-blue-500 text-blue-600 dark:text-blue-400 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition"
                        title="Manage Permissions"
                      >
                        <Key className="h-4 w-4" />
                        Permissions
                      </button>
                      <button
                        onClick={() => handleToggleUserStatus(user.user_id)}
                        className={`px-3 py-1.5 text-sm rounded transition ${
                          user.is_active
                            ? 'border border-yellow-600 dark:border-yellow-500 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-900/20'
                            : 'border border-green-600 dark:border-green-500 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20'
                        }`}
                        title={user.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {user.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => openDeleteModal(user)}
                        className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition"
                        title="Delete User"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Statistics and Activity */}
        <div className="space-y-6">
          {/* Statistics */}
          {client.statistics && (
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow dark:shadow-slate-900/20 p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Statistics</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm text-slate-700 dark:text-slate-300">Total Users</span>
                  </div>
                  <span className="text-2xl font-semibold text-slate-900 dark:text-white">{client.statistics.total_users}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <span className="text-sm text-slate-700 dark:text-slate-300">Active Users</span>
                  </div>
                  <span className="text-2xl font-semibold text-slate-900 dark:text-white">{client.statistics.active_users}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    <span className="text-sm text-slate-700 dark:text-slate-300">Super Admins</span>
                  </div>
                  <span className="text-2xl font-semibold text-slate-900 dark:text-white">{client.statistics.super_admins}</span>
                </div>
              </div>
            </div>
          )}

          {/* Recent Activity */}
          {client.recent_activity && client.recent_activity.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow dark:shadow-slate-900/20 p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Recent Activity</h2>
              <div className="space-y-3">
                {client.recent_activity.map((activity, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <Activity className="h-4 w-4 text-slate-400 dark:text-slate-500 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm text-slate-900 dark:text-white">{activity.action}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        <Clock className="h-3 w-3 inline mr-1" />
                        {new Date(activity.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create User Modal */}
      {showCreateUserModal && (
        <CreateUserModal
          clientId={clientId!}
          allPermissions={allPermissions}
          permissionsByCategory={permissionsByCategory}
          onClose={() => setShowCreateUserModal(false)}
          onSuccess={() => {
            setShowCreateUserModal(false);
            fetchClientUsers();
          }}
        />
      )}

      {/* Edit Permissions Modal */}
      {showPermissionsModal && selectedUser && (
        <EditPermissionsModal
          user={selectedUser}
          allPermissions={allPermissions}
          permissionsByCategory={permissionsByCategory}
          onClose={() => {
            setShowPermissionsModal(false);
            setSelectedUser(null);
          }}
          onSuccess={() => {
            setShowPermissionsModal(false);
            setSelectedUser(null);
            fetchClientUsers();
          }}
        />
      )}

      {/* Delete User Confirmation Modal */}
      {showDeleteModal && userToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg max-w-md w-full shadow-xl dark:shadow-slate-900/30">
            <div className="p-6">
              <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30">
                <Trash2 className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-center text-slate-900 dark:text-white mb-2">
                Delete User
              </h3>
              <p className="text-center text-slate-600 dark:text-slate-400 mb-6">
                Are you sure you want to delete <span className="font-medium text-slate-900 dark:text-white">{userToDelete.full_name || userToDelete.email}</span>? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setUserToDelete(null);
                  }}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition disabled:opacity-50 text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteUser}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deleting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Deleting...
                    </>
                  ) : (
                    'Delete'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Create User Modal Component
interface CreateUserModalProps {
  clientId: string;
  allPermissions: Permission[];
  permissionsByCategory: Record<string, Permission[]>;
  onClose: () => void;
  onSuccess: () => void;
}

function CreateUserModal({ clientId, allPermissions, permissionsByCategory, onClose, onSuccess }: CreateUserModalProps) {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    phone: '',
    department: '',
    role: 'staff',
    is_super_admin: false,
    permissions: [] as string[]
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await api.post('/admin/users', { ...formData, client_id: clientId });
      onSuccess();
    } catch (err: any) {
      console.error('Error creating user:', err);
      setError(err.response?.data?.error || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  const togglePermission = (permName: string) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permName)
        ? prev.permissions.filter(p => p !== permName)
        : [...prev.permissions, permName]
    }));
  };

  const selectAllInCategory = (category: string) => {
    const categoryPerms = permissionsByCategory[category]?.map(p => p.permission_name) || [];
    const allSelected = categoryPerms.every(p => formData.permissions.includes(p));

    if (allSelected) {
      setFormData(prev => ({
        ...prev,
        permissions: prev.permissions.filter(p => !categoryPerms.includes(p))
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        permissions: [...new Set([...prev.permissions, ...categoryPerms])]
      }));
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Add New User</h2>
          <button onClick={onClose} className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              <p className="text-red-800 dark:text-red-300">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Email *</label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Password *</label>
              <input
                type="password"
                required
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Full Name</label>
              <input
                type="text"
                value={formData.full_name}
                onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Department</label>
              <input
                type="text"
                value={formData.department}
                onChange={(e) => setFormData({...formData, department: e.target.value})}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Role</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({...formData, role: e.target.value})}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              >
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
              </select>
            </div>
          </div>

          <div className="mb-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_super_admin}
                onChange={(e) => setFormData({...formData, is_super_admin: e.target.checked})}
                className="w-4 h-4 text-blue-600 dark:bg-slate-700"
              />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Make Super Admin (grants all permissions)</span>
            </label>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Permissions</h3>
            <div className="space-y-4">
              {Object.entries(permissionsByCategory).map(([category, perms]) => (
                <div key={category} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-slate-900 dark:text-white capitalize">{category}</h4>
                    <button
                      type="button"
                      onClick={() => selectAllInCategory(category)}
                      className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                    >
                      {perms.every(p => formData.permissions.includes(p.permission_name)) ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {perms.map((perm) => (
                      <label key={perm.permission_id} className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.permissions.includes(perm.permission_name)}
                          onChange={() => togglePermission(perm.permission_name)}
                          className="mt-1 w-4 h-4 text-blue-600 dark:bg-slate-700"
                        />
                        <div>
                          <div className="text-sm font-medium text-slate-900 dark:text-white">{perm.permission_name.replace(/_/g, ' ')}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">{perm.description}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-slate-700 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Edit Permissions Modal Component
interface EditPermissionsModalProps {
  user: UserWithPermissions;
  allPermissions: Permission[];
  permissionsByCategory: Record<string, Permission[]>;
  onClose: () => void;
  onSuccess: () => void;
}

function EditPermissionsModal({ user, allPermissions, permissionsByCategory, onClose, onSuccess }: EditPermissionsModalProps) {
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(user.permissions);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setLoading(true);
    setError('');

    try {
      await api.post('/permissions/bulk-update', {
        user_id: user.user_id,
        permissions: selectedPermissions
      });
      onSuccess();
    } catch (err: any) {
      console.error('Error updating permissions:', err);
      setError(err.response?.data?.error || 'Failed to update permissions');
    } finally {
      setLoading(false);
    }
  };

  const togglePermission = (permName: string) => {
    setSelectedPermissions(prev =>
      prev.includes(permName)
        ? prev.filter(p => p !== permName)
        : [...prev, permName]
    );
  };

  const selectAllInCategory = (category: string) => {
    const categoryPerms = permissionsByCategory[category]?.map(p => p.permission_name) || [];
    const allSelected = categoryPerms.every(p => selectedPermissions.includes(p));

    if (allSelected) {
      setSelectedPermissions(prev => prev.filter(p => !categoryPerms.includes(p)));
    } else {
      setSelectedPermissions(prev => [...new Set([...prev, ...categoryPerms])]);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Manage Permissions</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">{user.email}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              <p className="text-red-800 dark:text-red-300">{error}</p>
            </div>
          )}

          {user.is_super_admin && (
            <div className="mb-4 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
              <div className="flex items-center gap-3">
                <Shield className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                <div>
                  <p className="text-purple-800 dark:text-purple-300 font-medium">Super Administrator</p>
                  <p className="text-purple-600 dark:text-purple-400 text-sm">This user has all permissions by default and cannot be modified.</p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {Object.entries(permissionsByCategory).map(([category, perms]) => (
              <div key={category} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-slate-900 dark:text-white capitalize">{category}</h4>
                  <button
                    type="button"
                    onClick={() => selectAllInCategory(category)}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                  >
                    {perms.every(p => selectedPermissions.includes(p.permission_name)) ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {perms.map((perm) => (
                    <label key={perm.permission_id} className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedPermissions.includes(perm.permission_name)}
                        onChange={() => togglePermission(perm.permission_name)}
                        className="mt-1 w-4 h-4 text-blue-600 dark:bg-slate-700"
                      />
                      <div>
                        <div className="text-sm font-medium text-slate-900 dark:text-white">{perm.permission_name.replace(/_/g, ' ')}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{perm.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-slate-700 pt-4 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
