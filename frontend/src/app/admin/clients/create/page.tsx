'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
  AlertCircle,
  User,
  Lock,
  Key,
  Shield,
  RefreshCw,
  Check,
  Plus,
  Store,
  ShoppingCart,
  Utensils,
  Coffee,
  Apple,
  Pill,
  Smartphone,
  Hammer,
  Gem,
  Users,
  Eye
} from 'lucide-react';

interface ClientFormData {
  client_name: string;
  email: string;
  phone: string;
  address: string;
  gst_number: string;
  logo_url: string;
}

interface UserFormData {
  user_email: string;
  user_password: string;
  confirmPassword: string;
  full_name: string;
  phone_user: string;
  department: string;
  role: string;
  is_super_admin: boolean;
  is_active: boolean;
}

interface PermissionTemplate {
  name: string;
  description: string;
  permissions: string[];
}

interface PermissionTemplates {
  [key: string]: PermissionTemplate;
}

export default function CreateClient() {
  const { user, isLoading: authLoading, isSuperAdmin } = useClient();
  const router = useRouter();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

  const [clientData, setClientData] = useState<ClientFormData>({
    client_name: '',
    email: '',
    phone: '',
    address: '',
    gst_number: '',
    logo_url: ''
  });

  const [userData, setUserData] = useState<UserFormData>({
    user_email: '',
    user_password: '',
    confirmPassword: '',
    full_name: '',
    phone_user: '',
    department: '',
    role: 'staff',
    is_super_admin: false,
    is_active: true
  });

  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [availablePermissions, setAvailablePermissions] = useState<any[]>([]);
  const [permissionTemplates, setPermissionTemplates] = useState<PermissionTemplates>({});
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [errors, setErrors] = useState<any>({});
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
      const token = localStorage.getItem('token');
      const response = await axios.get(`${apiUrl}/permissions/all`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAvailablePermissions(response.data.permissions || []);
    } catch (error) {
      console.error('Error fetching permissions:', error);
    }
  };

  const fetchPermissionTemplates = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${apiUrl}/admin/permission-templates`, {
        headers: { Authorization: `Bearer ${token}` }
      });
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
    setUserData(prev => ({ ...prev, user_password: password, confirmPassword: password }));
    setShowPassword(true);
  };

  const validateForm = (): boolean => {
    const newErrors: any = {};

    // Client validation
    if (!clientData.client_name.trim()) {
      newErrors.client_name = 'Client name is required';
    }
    if (!clientData.email.trim()) {
      newErrors.client_email = 'Client email is required';
    } else if (!/\S+@\S+\.\S+/.test(clientData.email)) {
      newErrors.client_email = 'Invalid email format';
    }
    if (!clientData.phone.trim()) {
      newErrors.client_phone = 'Client phone is required';
    } else if (!/^\+?[\d\s-()]+$/.test(clientData.phone)) {
      newErrors.client_phone = 'Invalid phone format';
    }
    if (clientData.gst_number && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(clientData.gst_number)) {
      newErrors.gst_number = 'Invalid GST format (e.g., 22AAAAA0000A1Z5)';
    }
    if (clientData.logo_url && !/^https?:\/\/.+/.test(clientData.logo_url)) {
      newErrors.logo_url = 'Invalid URL format';
    }

    // User validation
    if (!userData.user_email.trim()) {
      newErrors.user_email = 'User email is required';
    } else if (!/\S+@\S+\.\S+/.test(userData.user_email)) {
      newErrors.user_email = 'Invalid email format';
    }
    if (!userData.user_password) {
      newErrors.user_password = 'Password is required';
    } else if (userData.user_password.length < 6) {
      newErrors.user_password = 'Password must be at least 6 characters';
    }
    if (userData.user_password !== userData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent, createAnother: boolean = false) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const requestData = {
        // Client data
        client_name: clientData.client_name,
        email: clientData.email,
        phone: clientData.phone,
        address: clientData.address,
        gst_number: clientData.gst_number,
        logo_url: clientData.logo_url,
        // User data
        user_email: userData.user_email,
        user_password: userData.user_password,
        full_name: userData.full_name,
        phone_user: userData.phone_user,
        department: userData.department,
        role: userData.role,
        is_super_admin: userData.is_super_admin,
        is_active: userData.is_active,
        permissions: selectedPermissions
      };

      const response = await axios.post(
        `${apiUrl}/admin/clients`,
        requestData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data) {
        setSuccess(true);

        if (createAnother) {
          // Reset form for another client
          setTimeout(() => {
            setClientData({
              client_name: '',
              email: '',
              phone: '',
              address: '',
              gst_number: '',
              logo_url: ''
            });
            setUserData({
              user_email: '',
              user_password: '',
              confirmPassword: '',
              full_name: '',
              phone_user: '',
              department: '',
              role: 'staff',
              is_super_admin: false,
              is_active: true
            });
            setSelectedPermissions([]);
            setSelectedTemplate('');
            setSuccess(false);
            setShowPassword(false);
          }, 2000);
        } else {
          // Redirect to clients list
          setTimeout(() => {
            router.push('/admin/clients');
          }, 2000);
        }
      }
    } catch (err: any) {
      console.error('Error creating client:', err);
      setError(err.response?.data?.error || 'Failed to create client and user');
    } finally {
      setLoading(false);
    }
  };

  const handleClientChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setClientData(prev => ({
      ...prev,
      [name]: value
    }));
    if (errors[name]) {
      setErrors((prev: any) => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handleUserChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    setUserData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    if (errors[name]) {
      setErrors((prev: any) => ({
        ...prev,
        [name]: ''
      }));
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
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => router.push('/admin/clients')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Clients
        </button>
        <h1 className="text-3xl font-bold text-gray-900">Create New Client</h1>
        <p className="text-gray-600 mt-1">Register a new client and create their admin user account</p>
      </div>

      {/* Success Message */}
      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
          <Check className="h-5 w-5 text-green-600" />
          <p className="text-green-800">Client and user created successfully!</p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Form */}
      <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-6">
        {/* Client Information Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Client Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Client Name */}
            <div className="col-span-1 md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Client Name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  name="client_name"
                  value={clientData.client_name}
                  onChange={handleClientChange}
                  className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    errors.client_name ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="Enter client/company name"
                />
              </div>
              {errors.client_name && (
                <p className="mt-1 text-sm text-red-600">{errors.client_name}</p>
              )}
            </div>

            {/* Client Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Client Email <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="email"
                  name="email"
                  value={clientData.email}
                  onChange={handleClientChange}
                  className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    errors.client_email ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="client@example.com"
                />
              </div>
              {errors.client_email && (
                <p className="mt-1 text-sm text-red-600">{errors.client_email}</p>
              )}
            </div>

            {/* Client Phone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Client Phone <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="tel"
                  name="phone"
                  value={clientData.phone}
                  onChange={handleClientChange}
                  className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    errors.client_phone ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="+91 98765 43210"
                />
              </div>
              {errors.client_phone && (
                <p className="mt-1 text-sm text-red-600">{errors.client_phone}</p>
              )}
            </div>

            {/* GST Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                GST Number
              </label>
              <div className="relative">
                <FileText className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  name="gst_number"
                  value={clientData.gst_number}
                  onChange={handleClientChange}
                  className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    errors.gst_number ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="22AAAAA0000A1Z5"
                />
              </div>
              {errors.gst_number && (
                <p className="mt-1 text-sm text-red-600">{errors.gst_number}</p>
              )}
            </div>

            {/* Logo URL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Logo URL
              </label>
              <div className="relative">
                <Image className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="url"
                  name="logo_url"
                  value={clientData.logo_url}
                  onChange={handleClientChange}
                  className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    errors.logo_url ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="https://example.com/logo.png"
                />
              </div>
              {errors.logo_url && (
                <p className="mt-1 text-sm text-red-600">{errors.logo_url}</p>
              )}
            </div>

            {/* Address */}
            <div className="col-span-1 md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Address
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <textarea
                  name="address"
                  value={clientData.address}
                  onChange={handleClientChange}
                  rows={3}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter client address"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Admin User Registration Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <User className="h-5 w-5" />
            Admin User Registration
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* User Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                User Email <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="email"
                  name="user_email"
                  value={userData.user_email}
                  onChange={handleUserChange}
                  className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    errors.user_email ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="admin@example.com"
                />
              </div>
              {errors.user_email && (
                <p className="mt-1 text-sm text-red-600">{errors.user_email}</p>
              )}
            </div>

            {/* Full Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Full Name
              </label>
              <input
                type="text"
                name="full_name"
                value={userData.full_name}
                onChange={handleUserChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="John Doe"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="user_password"
                  value={userData.user_password}
                  onChange={handleUserChange}
                  className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    errors.user_password ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="Min 6 characters"
                />
              </div>
              {errors.user_password && (
                <p className="mt-1 text-sm text-red-600">{errors.user_password}</p>
              )}
              <button
                type="button"
                onClick={generateRandomPassword}
                className="mt-2 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
              >
                <RefreshCw className="h-4 w-4" />
                Generate Random Password
              </button>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confirm Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="confirmPassword"
                  value={userData.confirmPassword}
                  onChange={handleUserChange}
                  className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    errors.confirmPassword ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="Re-enter password"
                />
              </div>
              {errors.confirmPassword && (
                <p className="mt-1 text-sm text-red-600">{errors.confirmPassword}</p>
              )}
            </div>

            {/* User Phone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="tel"
                  name="phone_user"
                  value={userData.phone_user}
                  onChange={handleUserChange}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="+91 98765 43210"
                />
              </div>
            </div>

            {/* Department */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Department
              </label>
              <input
                type="text"
                name="department"
                value={userData.department}
                onChange={handleUserChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., Administration"
              />
            </div>
          </div>
        </div>

        {/* Access Control Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Access Control
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Role Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Role
              </label>
              <select
                name="role"
                value={userData.role}
                onChange={handleUserChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="staff">Staff</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            {/* Status Toggles */}
            <div className="space-y-3">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  name="is_super_admin"
                  checked={userData.is_super_admin}
                  onChange={handleUserChange}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Make Super Admin</span>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  name="is_active"
                  checked={userData.is_active}
                  onChange={handleUserChange}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Account Active</span>
              </label>
            </div>
          </div>

          {/* Business Type Selection */}
          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Select Business Type & Permissions
            </label>
            <p className="text-xs text-gray-500 mb-4">
              Choose a business template that matches your client's industry. This will automatically assign appropriate permissions.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(permissionTemplates).map(([key, template]) => {
                const getIcon = () => {
                  if (key === 'dress_shop') return Store;
                  if (key === 'supermarket') return ShoppingCart;
                  if (key === 'general_store') return Store;
                  if (key === 'food_store') return Coffee;
                  if (key === 'restaurant_hotel') return Utensils;
                  if (key === 'fruit_vegetable_stall') return Apple;
                  if (key === 'medical_pharmacy') return Pill;
                  if (key === 'electronics_store') return Smartphone;
                  if (key === 'hardware_store') return Hammer;
                  if (key === 'jewelry_store') return Gem;
                  if (key === 'staff_cashier') return Users;
                  if (key === 'view_only') return Eye;
                  return Shield;
                };
                const Icon = getIcon();
                const isSelected = selectedTemplate === key;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleTemplateChange(key)}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50 shadow-md'
                        : 'border-gray-200 hover:border-blue-300 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${
                        isSelected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                      }`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className={`text-sm font-semibold ${
                          isSelected ? 'text-blue-900' : 'text-gray-900'
                        }`}>
                          {template.name}
                        </h4>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                          {template.description}
                        </p>
                        {isSelected && (
                          <div className="mt-2 flex items-center gap-1 text-xs text-blue-600">
                            <Check className="w-3 h-3" />
                            <span>{template.permissions.length} permissions</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedTemplate && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-blue-900">
                      Selected: {permissionTemplates[selectedTemplate]?.name}
                    </p>
                    <p className="text-xs text-blue-700 mt-1">
                      {permissionTemplates[selectedTemplate]?.permissions.length} permissions will be assigned to the admin user
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Individual Permissions - Advanced */}
          {Object.keys(groupedPermissions).length > 0 && (
            <details className="mt-6">
              <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-blue-600 flex items-center gap-2">
                <span>Advanced: Customize Individual Permissions</span>
                <span className="text-xs text-gray-500">(Optional - for fine-tuning)</span>
              </summary>
              <div className="mt-4 space-y-4">
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-xs text-yellow-800">
                    <strong>Note:</strong> Selecting a business type template is recommended. Only customize individual permissions if you need specific control beyond the template.
                  </p>
                </div>
                {Object.entries(groupedPermissions).map(([category, permissions]) => (
                  <div key={category} className="border border-gray-200 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-2 capitalize">{category}</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {(permissions as any[]).map((perm: any) => (
                        <label key={perm.permission_name} className="flex items-center gap-2 hover:bg-gray-50 p-1 rounded">
                          <input
                            type="checkbox"
                            checked={selectedPermissions.includes(perm.permission_name)}
                            onChange={() => handlePermissionToggle(perm.permission_name)}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">{perm.description}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        {/* Form Actions */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push('/admin/clients')}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={(e) => handleSubmit(e, true)}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition disabled:opacity-50"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Creating...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Create & Add Another
              </>
            )}
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Creating...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Create Client
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
