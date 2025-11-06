'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useClient } from '@/contexts/ClientContext';
import axios from 'axios';
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
  const router = useRouter();
  const params = useParams();
  const clientId = params.client_id as string;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

  const [client, setClient] = useState<ClientDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState<Partial<ClientDetails>>({});
  const [errors, setErrors] = useState<Partial<ClientDetails>>({});
  const [saving, setSaving] = useState(false);

  // User management states
  const [clientUsers, setClientUsers] = useState<UserWithPermissions[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithPermissions | null>(null);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [permissionsByCategory, setPermissionsByCategory] = useState<Record<string, Permission[]>>({});

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login');
      return;
    }

    if (!authLoading && user && !isSuperAdmin()) {
      router.push('/dashboard');
      return;
    }

    if (user && isSuperAdmin() && clientId) {
      fetchClientDetails();
    }
  }, [user, authLoading, isSuperAdmin, router, clientId]);

  const fetchClientDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem('token');
      const response = await axios.get<ClientDetails>(
        `${apiUrl}/admin/clients/${clientId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      setClient(response.data);
      setFormData(response.data);
      fetchClientUsers();
      fetchAllPermissions();
    } catch (err: any) {
      console.error('Error fetching client details:', err);
      setError(err.response?.data?.error || 'Failed to load client details');
    } finally {
      setLoading(false);
    }
  };

  const fetchClientUsers = async () => {
    try {
      setLoadingUsers(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${apiUrl}/admin/clients/${clientId}/users`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      setClientUsers(response.data.users || []);
    } catch (err: any) {
      console.error('Error fetching client users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchAllPermissions = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${apiUrl}/permissions/all`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      setAllPermissions(response.data.permissions || []);
      setPermissionsByCategory(response.data.categorized || {});
    } catch (err: any) {
      console.error('Error fetching permissions:', err);
    }
  };

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
      const token = localStorage.getItem('token');
      await axios.put(
        `${apiUrl}/admin/clients/${clientId}`,
        {
          client_name: formData.client_name,
          email: formData.email,
          phone: formData.phone,
          address: formData.address,
          gst_number: formData.gst_number,
          logo_url: formData.logo_url
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

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
      const token = localStorage.getItem('token');
      await axios.post(
        `${apiUrl}/admin/clients/${clientId}/toggle-status`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
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
      const token = localStorage.getItem('token');
      await axios.post(
        `${apiUrl}/admin/users/${userId}/toggle-status`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      fetchClientUsers();
    } catch (err) {
      console.error('Error toggling user status:', err);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${apiUrl}/admin/users/bulk`,
        {
          user_ids: [userId],
          operation: 'delete'
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      fetchClientUsers();
    } catch (err) {
      console.error('Error deleting user:', err);
    }
  };

  const openPermissionsModal = (user: UserWithPermissions) => {
    setSelectedUser(user);
    setShowPermissionsModal(true);
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error && !client) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
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
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => router.push('/admin/clients')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
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
                className="h-16 w-16 rounded-full"
              />
            ) : (
              <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center">
                <Building2 className="h-8 w-8 text-blue-600" />
              </div>
            )}
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{client.client_name}</h1>
              <div className="flex items-center gap-4 mt-1">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  client.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {client.is_active ? 'Active' : 'Inactive'}
                </span>
                <span className="text-sm text-gray-500">
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
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
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
                  }}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
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
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <p className="text-red-800">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Client Information */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Client Information</h2>

            {editMode ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Editable fields */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Client Name *
                  </label>
                  <input
                    type="text"
                    name="client_name"
                    value={formData.client_name}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg ${
                      errors.client_name ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors.client_name && (
                    <p className="mt-1 text-sm text-red-600">{errors.client_name}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg ${
                      errors.email ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors.email && (
                    <p className="mt-1 text-sm text-red-600">{errors.email}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone *
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg ${
                      errors.phone ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors.phone && (
                    <p className="mt-1 text-sm text-red-600">{errors.phone}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    GST Number
                  </label>
                  <input
                    type="text"
                    name="gst_number"
                    value={formData.gst_number || ''}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg ${
                      errors.gst_number ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors.gst_number && (
                    <p className="mt-1 text-sm text-red-600">{errors.gst_number}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Logo URL
                  </label>
                  <input
                    type="url"
                    name="logo_url"
                    value={formData.logo_url || ''}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Address
                  </label>
                  <textarea
                    name="address"
                    value={formData.address || ''}
                    onChange={handleChange}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Email</p>
                    <p className="text-sm text-gray-900">{client.email}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Phone className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Phone</p>
                    <p className="text-sm text-gray-900">{client.phone}</p>
                  </div>
                </div>

                {client.address && (
                  <div className="flex items-start gap-3">
                    <MapPin className="h-5 w-5 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-700">Address</p>
                      <p className="text-sm text-gray-900">{client.address}</p>
                    </div>
                  </div>
                )}

                {client.gst_number && (
                  <div className="flex items-start gap-3">
                    <FileText className="h-5 w-5 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-700">GST Number</p>
                      <p className="text-sm text-gray-900">{client.gst_number}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Users & Permissions Management */}
          <div className="bg-white rounded-lg shadow p-6 mt-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Users & Permissions</h2>
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
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : clientUsers.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Users className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                <p>No users yet. Add the first user to get started.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {clientUsers.map((user) => (
                  <div key={user.user_id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium text-gray-900">
                          {user.full_name || user.email}
                        </p>
                        {user.is_super_admin && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                            <Shield className="h-3 w-3 mr-1" />
                            Super Admin
                          </span>
                        )}
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {user.is_active ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                          {user.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">{user.email}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs px-2 py-0.5 bg-gray-100 rounded capitalize">
                          {user.role}
                        </span>
                        <span className="text-xs text-gray-500">
                          {user.permissions.length} permissions
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openPermissionsModal(user)}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm border border-blue-600 text-blue-600 rounded hover:bg-blue-50 transition"
                        title="Manage Permissions"
                      >
                        <Key className="h-4 w-4" />
                        Permissions
                      </button>
                      <button
                        onClick={() => handleToggleUserStatus(user.user_id)}
                        className={`px-3 py-1.5 text-sm rounded transition ${
                          user.is_active
                            ? 'border border-yellow-600 text-yellow-600 hover:bg-yellow-50'
                            : 'border border-green-600 text-green-600 hover:bg-green-50'
                        }`}
                        title={user.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {user.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user.user_id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded transition"
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
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Statistics</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-blue-600" />
                    <span className="text-sm text-gray-700">Total Users</span>
                  </div>
                  <span className="text-2xl font-semibold">{client.statistics.total_users}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-5 w-5 text-green-600" />
                    <span className="text-sm text-gray-700">Active Users</span>
                  </div>
                  <span className="text-2xl font-semibold">{client.statistics.active_users}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-purple-600" />
                    <span className="text-sm text-gray-700">Super Admins</span>
                  </div>
                  <span className="text-2xl font-semibold">{client.statistics.super_admins}</span>
                </div>
              </div>
            </div>
          )}

          {/* Recent Activity */}
          {client.recent_activity && client.recent_activity.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
              <div className="space-y-3">
                {client.recent_activity.map((activity, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <Activity className="h-4 w-4 text-gray-400 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm text-gray-900">{activity.action}</p>
                      <p className="text-xs text-gray-500">
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
          clientId={clientId}
          apiUrl={apiUrl}
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
          apiUrl={apiUrl}
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
    </div>
  );
}

// Create User Modal Component
interface CreateUserModalProps {
  clientId: string;
  apiUrl: string;
  allPermissions: Permission[];
  permissionsByCategory: Record<string, Permission[]>;
  onClose: () => void;
  onSuccess: () => void;
}

function CreateUserModal({ clientId, apiUrl, allPermissions, permissionsByCategory, onClose, onSuccess }: CreateUserModalProps) {
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
      const token = localStorage.getItem('token');
      await axios.post(
        `${apiUrl}/admin/users`,
        {
          ...formData,
          client_id: clientId
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
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
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-semibold">Add New User</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <p className="text-red-800">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email *</label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Password *</label>
              <input
                type="password"
                required
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
              <input
                type="text"
                value={formData.full_name}
                onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Department</label>
              <input
                type="text"
                value={formData.department}
                onChange={(e) => setFormData({...formData, department: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({...formData, role: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
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
                className="w-4 h-4 text-blue-600"
              />
              <span className="text-sm font-medium text-gray-700">Make Super Admin (grants all permissions)</span>
            </label>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">Permissions</h3>
            <div className="space-y-4">
              {Object.entries(permissionsByCategory).map(([category, perms]) => (
                <div key={category} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-900 capitalize">{category}</h4>
                    <button
                      type="button"
                      onClick={() => selectAllInCategory(category)}
                      className="text-sm text-blue-600 hover:text-blue-800"
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
                          className="mt-1 w-4 h-4 text-blue-600"
                        />
                        <div>
                          <div className="text-sm font-medium text-gray-900">{perm.permission_name.replace(/_/g, ' ')}</div>
                          <div className="text-xs text-gray-500">{perm.description}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
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
  apiUrl: string;
  allPermissions: Permission[];
  permissionsByCategory: Record<string, Permission[]>;
  onClose: () => void;
  onSuccess: () => void;
}

function EditPermissionsModal({ user, apiUrl, allPermissions, permissionsByCategory, onClose, onSuccess }: EditPermissionsModalProps) {
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(user.permissions);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${apiUrl}/permissions/bulk-update`,
        {
          user_id: user.user_id,
          permissions: selectedPermissions
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
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
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold">Manage Permissions</h2>
            <p className="text-sm text-gray-600">{user.email}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {user.is_super_admin && (
            <div className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-lg flex items-center gap-2">
              <Shield className="h-5 w-5 text-purple-600" />
              <p className="text-purple-800">This user is a Super Admin and has all permissions by default.</p>
            </div>
          )}

          <div className="space-y-4">
            {Object.entries(permissionsByCategory).map(([category, perms]) => (
              <div key={category} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-900 capitalize">{category}</h4>
                  <button
                    type="button"
                    onClick={() => selectAllInCategory(category)}
                    className="text-sm text-blue-600 hover:text-blue-800"
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
                        className="mt-1 w-4 h-4 text-blue-600"
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900">{perm.permission_name.replace(/_/g, ' ')}</div>
                        <div className="text-xs text-gray-500">{perm.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-3 border-t pt-4 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
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