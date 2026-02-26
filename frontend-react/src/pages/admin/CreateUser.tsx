import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClient } from '@/contexts/ClientContext';
import api from '@/lib/api';
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
  AlertCircle,
  GitBranch,
  Receipt
} from 'lucide-react';

interface Branch {
  branch_id: string;
  name: string;
  location: string | null;
}

export default function CreateUser() {
  const { user, isLoading: authLoading } = useClient();
  const isSuperAdminUser = user?.is_super_admin ?? false;
  const navigate = useNavigate();

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
    send_welcome_email: false,
    branch_id: '',
    billing_type: 'both' as 'gst' | 'non_gst' | 'both' | 'none',
  });

  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [availablePermissions, setAvailablePermissions] = useState<any[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Fetch permissions and branches for the super admin's own client
  const fetchData = useCallback(async () => {
    try {
      const [permsRes, branchesRes] = await Promise.all([
        api.get('/permissions/all'),
        user?.client_id ? api.get(`/admin/clients/${user.client_id}/branches`) : Promise.resolve({ data: { branches: [] } })
      ]);
      setAvailablePermissions(permsRes.data.permissions || []);
      setBranches(branchesRes.data.branches || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  }, [user?.client_id]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate('/auth/login'); return; }
    if (!isSuperAdminUser) { navigate('/dashboard'); return; }
    fetchData();
  }, [authLoading, user, isSuperAdminUser, navigate, fetchData]);

  // When billing_type changes, keep gst_billing / non_gst_billing permissions in sync
  const handleBillingTypeChange = (billing_type: 'gst' | 'non_gst' | 'both' | 'none') => {
    setFormData(prev => ({ ...prev, billing_type }));
    setSelectedPermissions(prev => {
      let perms = prev.filter(p => p !== 'gst_billing' && p !== 'non_gst_billing');
      if (billing_type === 'gst') perms = [...perms, 'gst_billing'];
      else if (billing_type === 'non_gst') perms = [...perms, 'non_gst_billing'];
      else if (billing_type === 'both') perms = [...perms, 'gst_billing', 'non_gst_billing'];
      return perms;
    });
  };

  const handlePermissionToggle = (permission: string) => {
    setSelectedPermissions(prev => {
      const next = prev.includes(permission)
        ? prev.filter(p => p !== permission)
        : [...prev, permission];
      // Keep billing_type in sync when manually toggling billing permissions
      if (permission === 'gst_billing' || permission === 'non_gst_billing') {
        const hasGst = next.includes('gst_billing');
        const hasNonGst = next.includes('non_gst_billing');
        const bt = hasGst && hasNonGst ? 'both' : hasGst ? 'gst' : hasNonGst ? 'non_gst' : 'none';
        setFormData(f => ({ ...f, billing_type: bt }));
      }
      return next;
    });
  };

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData(prev => ({ ...prev, password, confirmPassword: password }));
  };

  const submitUser = async () => {
    if (!formData.email || !formData.password) {
      setError('Email and password are required');
      return false;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return false;
    }

    setLoading(true);
    setError(null);
    try {
      await api.post('/admin/users', {
        email: formData.email,
        password: formData.password,
        full_name: formData.full_name,
        phone: formData.phone,
        department: formData.department,
        role: formData.role,
        is_super_admin: formData.is_super_admin,
        is_active: formData.is_active,
        branch_id: formData.branch_id || null,
        billing_type: formData.billing_type,
        permissions: selectedPermissions,
        send_welcome_email: formData.send_welcome_email
      });
      return true;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create user');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await submitUser();
    if (ok) {
      setSuccess(true);
      setTimeout(() => navigate('/admin/users'), 2000);
    }
  };

  const handleCreateAnother = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await submitUser();
    if (ok) {
      setFormData({
        email: '', full_name: '', phone: '', department: '',
        role: 'staff', is_super_admin: false, is_active: true,
        password: '', confirmPassword: '', send_welcome_email: false,
        branch_id: '', billing_type: 'both',
      });
      setSelectedPermissions([]);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
  };

  // Group permissions by category, hide gst_billing / non_gst_billing (handled by billing_type)
  const groupedPermissions = availablePermissions
    .filter(p => p.permission_name !== 'gst_billing' && p.permission_name !== 'non_gst_billing')
    .reduce((acc, perm) => {
      const cat = perm.category || perm.section || 'Other';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(perm);
      return acc;
    }, {} as Record<string, any[]>);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm';
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1';

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button type="button" onClick={() => navigate('/admin/users')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 text-sm">
          <ArrowLeft className="h-4 w-4" />
          Back to Users
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Create New User</h1>
        <p className="text-gray-500 text-sm mt-1">Add a new user with branch and billing access configuration</p>
      </div>

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
          <Check className="h-4 w-4 text-green-600" />
          <span className="text-green-800 text-sm">User created successfully!</span>
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <span className="text-red-800 text-sm">{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Basic Information */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <User className="h-4 w-4 text-gray-400" />
            Basic Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Email <span className="text-red-500">*</span></label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input type="email" value={formData.email} required
                  onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                  className={`${inputCls} pl-9`} placeholder="user@example.com" />
              </div>
            </div>
            <div>
              <label className={labelCls}>Full Name</label>
              <input type="text" value={formData.full_name}
                onChange={e => setFormData(p => ({ ...p, full_name: e.target.value }))}
                className={inputCls} placeholder="John Doe" />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input type="tel" value={formData.phone}
                  onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))}
                  className={`${inputCls} pl-9`} placeholder="+91 98765 43210" />
              </div>
            </div>
            <div>
              <label className={labelCls}>Department</label>
              <div className="relative">
                <Building className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input type="text" value={formData.department}
                  onChange={e => setFormData(p => ({ ...p, department: e.target.value }))}
                  className={`${inputCls} pl-9`} placeholder="Sales, Accounts..." />
              </div>
            </div>
          </div>
        </div>

        {/* Access Control */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Shield className="h-4 w-4 text-gray-400" />
            Access Control
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Role <span className="text-red-500">*</span></label>
              <select value={formData.role}
                onChange={e => setFormData(p => ({ ...p, role: e.target.value }))}
                className={inputCls}>
                <option value="staff">Staff</option>
                <option value="cashier">Cashier</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="flex items-end gap-4 pb-0.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={formData.is_super_admin}
                  onChange={e => setFormData(p => ({ ...p, is_super_admin: e.target.checked }))}
                  className="rounded border-gray-300 text-purple-600" />
                <span className="text-sm text-gray-700">Super Admin</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={formData.is_active}
                  onChange={e => setFormData(p => ({ ...p, is_active: e.target.checked }))}
                  className="rounded border-gray-300 text-green-600" />
                <span className="text-sm text-gray-700">Active</span>
              </label>
            </div>
          </div>
        </div>

        {/* Branch & Billing Type */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-gray-400" />
            Branch & Billing Access
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Branch */}
            <div>
              <label className={labelCls}>Assigned Branch</label>
              <select value={formData.branch_id}
                onChange={e => setFormData(p => ({ ...p, branch_id: e.target.value }))}
                className={inputCls}>
                <option value="">— All Branches (no restriction)</option>
                {branches.map(b => (
                  <option key={b.branch_id} value={b.branch_id}>
                    {b.name}{b.location ? ` — ${b.location}` : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">Leave unset to allow access to all branches</p>
            </div>

            {/* Billing Type */}
            <div>
              <label className={labelCls}>
                <Receipt className="inline h-3.5 w-3.5 mr-1 text-gray-400" />
                Billing Type
              </label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {([
                  { value: 'both',    label: 'GST + Non-GST', desc: 'Can create both bill types' },
                  { value: 'gst',     label: 'GST Only',      desc: 'Only GST invoices' },
                  { value: 'non_gst', label: 'Non-GST Only',  desc: 'Only plain bills' },
                  { value: 'none',    label: 'No Billing',    desc: 'Cannot create bills' },
                ] as const).map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => handleBillingTypeChange(opt.value)}
                    className={`px-3 py-2 rounded-lg border text-left transition-colors ${
                      formData.billing_type === opt.value
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                    }`}>
                    <div className="text-xs font-semibold">{opt.label}</div>
                    <div className="text-xs opacity-70 mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Additional Permissions */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <Shield className="h-4 w-4 text-gray-400" />
            Additional Permissions
          </h2>
          <p className="text-xs text-gray-400 mb-4">Billing access is set above. Configure other permissions here.</p>
          <div className="border border-gray-100 rounded-lg p-3 max-h-72 overflow-y-auto space-y-4">
            {Object.entries(groupedPermissions).map(([category, perms]) => (
              <div key={category}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{category}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                  {(perms as any[]).map((perm: any) => (
                    <label key={perm.permission_name} className="flex items-start gap-2 cursor-pointer py-1">
                      <input type="checkbox"
                        checked={selectedPermissions.includes(perm.permission_name)}
                        onChange={() => handlePermissionToggle(perm.permission_name)}
                        className="mt-0.5 rounded border-gray-300 text-blue-600" />
                      <span className="text-sm text-gray-700">{perm.description || perm.permission_name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {Object.keys(groupedPermissions).length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No additional permissions available</p>
            )}
          </div>
        </div>

        {/* Password */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Lock className="h-4 w-4 text-gray-400" />
            Password
          </h2>
          <div className="flex items-center gap-3 mb-4">
            <button type="button" onClick={generateRandomPassword}
              className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">
              <Key className="h-3.5 w-3.5" />
              Generate Password
            </button>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={formData.send_welcome_email}
                onChange={e => setFormData(p => ({ ...p, send_welcome_email: e.target.checked }))}
                className="rounded border-gray-300 text-blue-600" />
              <span className="text-sm text-gray-700">Send welcome email</span>
            </label>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Password <span className="text-red-500">*</span></label>
              <input type="password" value={formData.password} required minLength={6}
                onChange={e => setFormData(p => ({ ...p, password: e.target.value }))}
                className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Confirm Password <span className="text-red-500">*</span></label>
              <input type="password" value={formData.confirmPassword} required minLength={6}
                onChange={e => setFormData(p => ({ ...p, confirmPassword: e.target.value }))}
                className={inputCls} />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => navigate('/admin/users')}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm">
            Cancel
          </button>
          <button type="button" onClick={handleCreateAnother} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 text-sm">
            <Save className="h-4 w-4" />
            Create & Add Another
          </button>
          <button type="submit" disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm">
            {loading ? <><RefreshCw className="h-4 w-4 animate-spin" />Creating...</>
              : <><Save className="h-4 w-4" />Create User</>}
          </button>
        </div>
      </form>
    </div>
  );
}
