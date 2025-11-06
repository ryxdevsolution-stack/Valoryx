'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  Key,
  Save,
  RefreshCw,
  Check,
  AlertCircle
} from 'lucide-react';

interface PermissionTemplate {
  name: string;
  description: string;
  permissions: string[];
}

interface PermissionTemplates {
  [key: string]: PermissionTemplate;
}

export default function CreateUser() {
  const { user, isLoading: authLoading, isSuperAdmin } = useClient();
  const router = useRouter();

  // Form state
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    phone: '',
    department: '',
    role: 'staff',
    is_super_admin: false,
    is_active: true,
    password: '',
    confirmPassword: '',
    send_welcome_email: false
  });

  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [availablePermissions, setAvailablePermissions] = useState<any[]>([]);
  const [permissionTemplates, setPermissionTemplates] = useState<PermissionTemplates>({});
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [generatePassword, setGeneratePassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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
      fetchPermissions();
      fetchPermissionTemplates();
    }
  }, [user, authLoading, isSuperAdmin, router]);

  const fetchPermissions = async () => {
    try {
      const response = await axios.get('/api/permissions/all');
      setAvailablePermissions(response.data.permissions || []);
    } catch (error) {
      console.error('Error fetching permissions:', error);
    }
  };

  const fetchPermissionTemplates = async () => {
    try {
      const response = await axios.get('/api/admin/permission-templates');
      setPermissionTemplates(response.data.templates || {});
    } catch (error) {
      console.error('Error fetching permission templates:', error);
    }
  };

  const handleTemplateChange = (templateKey: string) => {
    setSelectedTemplate(templateKey);
    if (templateKey && permissionTemplates[templateKey]) {
      setSelectedPermissions(permissionTemplates[templateKey].permissions);
    } else {
      setSelectedPermissions([]);
    }
  };

  const handlePermissionToggle = (permission: string) => {
    setSelectedPermissions(prev =>
      prev.includes(permission)
        ? prev.filter(p => p !== permission)
        : [...prev, permission]
    );
    setSelectedTemplate(''); // Clear template selection on manual change
  };

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData(prev => ({ ...prev, password, confirmPassword: password }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    // Validation
    if (!formData.email || !formData.password) {
      setError('Email and password are required');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    try {
      setLoading(true);

      const userData = {
        email: formData.email,
        password: formData.password,
        full_name: formData.full_name,
        phone: formData.phone,
        department: formData.department,
        role: formData.role,
        is_super_admin: formData.is_super_admin,
        is_active: formData.is_active,
        permissions: selectedPermissions,
        send_welcome_email: formData.send_welcome_email
      };

      await axios.post('/api/admin/users', userData);
      setSuccess(true);

      // Reset form after successful creation
      setTimeout(() => {
        router.push('/admin/users');
      }, 2000);
    } catch (error: any) {
      console.error('Error creating user:', error);
      setError(error.response?.data?.error || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAnother = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleSubmit(e);
    if (!error) {
      // Reset form for another user
      setFormData({
        email: '',
        full_name: '',
        phone: '',
        department: '',
        role: 'staff',
        is_super_admin: false,
        is_active: true,
        password: '',
        confirmPassword: '',
        send_welcome_email: false
      });
      setSelectedPermissions([]);
      setSelectedTemplate('');
      setSuccess(false);
    }
  };

  // Group permissions by category
  const groupedPermissions = availablePermissions.reduce((acc, perm) => {
    if (!acc[perm.category]) {
      acc[perm.category] = [];
    }
    acc[perm.category].push(perm);
    return acc;
  }, {} as Record<string, any[]>);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.push('/admin/users')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Users
        </button>
        <h1 className="text-3xl font-bold text-gray-900">Create New User</h1>
        <p className="text-gray-600 mt-1">Add a new user to the system with full configuration options</p>
      </div>

      {/* Success Message */}
      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
          <Check className="h-5 w-5 text-green-600" />
          <span className="text-green-800">User created successfully! Redirecting...</span>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <span className="text-red-800">{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <User className="h-5 w-5" />
            Basic Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={formData.full_name}
                onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Department
              </label>
              <div className="relative">
                <Building className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={formData.department}
                  onChange={(e) => setFormData(prev => ({ ...prev, department: e.target.value }))}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Access Control */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Access Control
          </h2>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="staff">Staff</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex items-center gap-4 pt-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_super_admin}
                    onChange={(e) => setFormData(prev => ({ ...prev, is_super_admin: e.target.checked }))}
                    className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Make Super Admin</span>
                </label>
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

            {/* Permission Templates */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Permission Preset
              </label>
              <select
                value={selectedTemplate}
                onChange={(e) => handleTemplateChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Custom Permissions</option>
                {Object.entries(permissionTemplates).map(([key, template]) => (
                  <option key={key} value={key}>
                    {template.name} - {template.description}
                  </option>
                ))}
              </select>
            </div>

            {/* Individual Permissions */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Individual Permissions
              </label>
              <div className="border border-gray-200 rounded-lg p-4 max-h-64 overflow-y-auto">
                {Object.entries(groupedPermissions).map(([category, perms]) => (
                  <div key={category} className="mb-4">
                    <h4 className="text-sm font-medium text-gray-900 capitalize mb-2">
                      {category}
                    </h4>
                    <div className="space-y-1">
                      {(perms as any[]).map((perm: any) => (
                        <label key={perm.permission_name} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedPermissions.includes(perm.permission_name)}
                            onChange={() => handlePermissionToggle(perm.permission_name)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">
                            {perm.description || perm.permission_name}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Password Settings */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Password Settings
          </h2>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={generateRandomPassword}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <Key className="h-4 w-4" />
                Generate Random Password
              </button>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.send_welcome_email}
                  onChange={(e) => setFormData(prev => ({ ...prev, send_welcome_email: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Send Welcome Email</span>
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                  minLength={6}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm Password <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                  minLength={6}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push('/admin/users')}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreateAnother}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="h-4 w-4" />
            Create & Add Another
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Create User
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}