

import { useState, useEffect } from 'react'
import { useClient } from '@/contexts/ClientContext'
import DashboardLayout from '@/components/DashboardLayout'
import api from '@/lib/api'
import {
  User,
  Mail,
  Phone,
  Building,
  Calendar,
  Clock,
  Save,
  X,
  Edit3,
  Key,
  Activity,
  AlertCircle,
  CheckCircle,
  Loader2,
  Crown,
  CreditCard,
  ExternalLink,
  XCircle,
  RefreshCw,
  ArrowRightLeft,
} from 'lucide-react'

interface ProfileData {
  user_id: string
  email: string
  full_name: string
  phone: string
  department: string
  role: string
  is_super_admin: boolean
  is_active: boolean
  created_at: string | null
  last_login: string | null
  client: {
    client_id: string
    client_name: string
    email: string
    logo_url?: string
  } | null
}

interface Transaction {
  transaction_id: string
  plan_id: string
  razorpay_order_id: string
  razorpay_payment_id: string
  amount: number
  currency: string
  billing_cycle: string
  status: string
  notes: string | null
  created_at: string | null
  paid_at: string | null
}

interface ActivityItem {
  log_id: string
  action_type: string
  table_name: string
  record_id: string
  timestamp: string | null
  ip_address: string | null
}

export default function ProfilePage() {
  const { user, client, refreshUserData, updateSubscriptionStatus } = useClient()
  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    full_name: user?.full_name || '',
    phone: user?.phone || '',
    department: user?.department || '',
  })
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Password change state
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '', confirm_password: '' })
  const [changingPassword, setChangingPassword] = useState(false)

  // Payment history state
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loadingPayments, setLoadingPayments] = useState(false)

  // Cancel subscription state
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelReasonOther, setCancelReasonOther] = useState('')

  // Activity history state
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [activityPage, setActivityPage] = useState(1)
  const [activityTotal, setActivityTotal] = useState(0)
  const [loadingActivity, setLoadingActivity] = useState(false)

  // Single mount effect — profile data comes from ClientContext (already fetched on app init)
  useEffect(() => {
    fetchActivity()
    fetchPaymentHistory()
  }, [])

  // Sync editForm when user data arrives from ClientContext
  useEffect(() => {
    if (user) {
      setEditForm({
        full_name: user.full_name || '',
        phone: user.phone || '',
        department: user.department || '',
      })
    }
  }, [user])

  // Derive profile from ClientContext — no API call needed
  const profile = user ? {
    user_id: user.user_id,
    email: user.email,
    full_name: user.full_name || '',
    phone: user.phone || '',
    department: user.department || '',
    role: user.role,
    is_super_admin: user.is_super_admin || false,
    is_active: true,
    created_at: null,
    last_login: null,
    client: client ? {
      client_id: client.client_id,
      client_name: client.client_name,
      email: client.email || '',
      logo_url: client.logo_url,
    } : null,
  } : null

  const fetchActivity = async (page = 1) => {
    try {
      setLoadingActivity(true)
      const response = await api.get(`/profile/activity?page=${page}&limit=10`)
      setActivity(response.data.activity)
      setActivityTotal(response.data.pagination.total)
      setActivityPage(page)
    } catch (error) {
      console.error('Failed to fetch activity:', error)
    } finally {
      setLoadingActivity(false)
    }
  }

  const fetchPaymentHistory = async () => {
    try {
      setLoadingPayments(true)
      const response = await api.get('/subscription/history')
      setTransactions(response.data.transactions || [])
    } catch {
      // silent - payment history is optional
    } finally {
      setLoadingPayments(false)
    }
  }

  const handleCancelSubscription = async () => {
    const reason = cancelReason === 'Other' ? cancelReasonOther.trim() : cancelReason
    try {
      setCancelling(true)
      const res = await api.post('/subscription/cancel', { reason })
      if (res.data?.subscription_status) {
        updateSubscriptionStatus(res.data.subscription_status, res.data.subscription_end_date)
      }
      setMessage({ type: 'success', text: 'Subscription cancelled. You can continue using the app until your billing period ends.' })
      setShowCancelConfirm(false)
      setCancelReason('')
      setCancelReasonOther('')
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.error || 'Failed to cancel subscription' })
    } finally {
      setCancelling(false)
    }
  }

  const getUpgradeUrl = () => {
    return (window as any).electronAPI?.isElectron ? '#/upgrade' : '/frontend/upgrade'
  }

  const formatPrice = (paise: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(paise / 100)
  }

  const handleSaveProfile = async () => {
    try {
      setSaving(true)
      await api.put('/profile', editForm)
      setMessage({ type: 'success', text: 'Profile updated successfully' })
      setIsEditing(false)
      await refreshUserData()
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.error || 'Failed to update profile' })
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordChange = async () => {
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setMessage({ type: 'error', text: 'New passwords do not match' })
      return
    }
    if (passwordForm.new_password.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters' })
      return
    }

    try {
      setChangingPassword(true)
      await api.post('/profile/password', {
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password
      })
      setMessage({ type: 'success', text: 'Password changed successfully' })
      setShowPasswordForm(false)
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' })
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.error || 'Failed to change password' })
    } finally {
      setChangingPassword(false)
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getActionIcon = (action: string) => {
    switch (action.toUpperCase()) {
      case 'LOGIN': return '🔓'
      case 'LOGOUT': return '🔒'
      case 'CREATE': return '➕'
      case 'UPDATE': return '✏️'
      case 'DELETE': return '🗑️'
      default: return '📋'
    }
  }

  if (!user || !profile) {
    return (
      <DashboardLayout>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
    <div className="h-[calc(100vh-80px)] md:h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 flex-shrink-0">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Profile</h1>
      </div>

      {/* Message Alert */}
      {message && (
        <div className={`flex items-center gap-3 p-4 rounded-xl mx-4 mb-4 flex-shrink-0 ${
          message.type === 'success'
            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
            : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
        }`}>
          {message.type === 'success'
            ? <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
            : <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
          }
          <p className={message.type === 'success' ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}>
            {message.text}
          </p>
          <button onClick={() => setMessage(null)} className="ml-auto">
            <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
          </button>
        </div>
      )}

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 px-4 pb-4 flex-1 min-h-0 overflow-hidden">
        {/* Left Column - Profile & Security */}
        <div className="lg:col-span-2 space-y-6 overflow-y-auto pr-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {/* Profile Card */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            {/* Header Section */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-6">
                {/* Client Logo or User Icon */}
                <div className="w-20 h-20 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                  {profile.client?.logo_url ? (
                    <img
                      src={profile.client.logo_url}
                      alt={profile.client.client_name}
                      width={80}
                      height={80}
                      className="w-full h-full object-contain p-2"
                    />
                  ) : (
                    <User className="w-10 h-10 text-gray-400" />
                  )}
                </div>

                {/* Basic Info */}
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    {profile.full_name || profile.email.split('@')[0]}
                  </h2>
                  <p className="text-gray-500 dark:text-gray-400">{profile.email}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${
                      profile.is_super_admin
                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                    }`}>
                      {profile.is_super_admin ? 'Super Admin' : profile.role}
                    </span>
                    {profile.client && (
                      <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                        {profile.client.client_name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Profile Details */}
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Profile Information</h3>
                {!isEditing ? (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <Edit3 className="w-4 h-4" />
                    Edit
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setIsEditing(false)
                        setEditForm({
                          full_name: profile.full_name || '',
                          phone: profile.phone || '',
                          department: profile.department || ''
                        })
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      <X className="w-4 h-4" />
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveProfile}
                      disabled={saving}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-gray-900 dark:bg-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Save
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Full Name */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                    <User className="w-4 h-4" /> Full Name
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editForm.full_name}
                      onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-transparent"
                      placeholder="Enter your full name"
                    />
                  ) : (
                    <p className="text-gray-900 dark:text-white">{profile.full_name || 'Not set'}</p>
                  )}
                </div>

                {/* Email */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                    <Mail className="w-4 h-4" /> Email
                  </label>
                  <p className="text-gray-900 dark:text-white">{profile.email}</p>
                </div>

                {/* Phone */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                    <Phone className="w-4 h-4" /> Phone
                  </label>
                  {isEditing ? (
                    <input
                      type="tel"
                      value={editForm.phone}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-transparent"
                      placeholder="Enter your phone number"
                    />
                  ) : (
                    <p className="text-gray-900 dark:text-white">{profile.phone || 'Not set'}</p>
                  )}
                </div>

                {/* Department */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                    <Building className="w-4 h-4" /> Department
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editForm.department}
                      onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-transparent"
                      placeholder="Enter your department"
                    />
                  ) : (
                    <p className="text-gray-900 dark:text-white">{profile.department || 'Not set'}</p>
                  )}
                </div>

                {/* Role */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                    <User className="w-4 h-4" /> Role
                  </label>
                  <p className="text-gray-900 dark:text-white capitalize">{profile.role}</p>
                </div>

                {/* Last Login */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                    <Clock className="w-4 h-4" /> Last Login
                  </label>
                  <p className="text-gray-900 dark:text-white">{formatDate(profile.last_login)}</p>
                </div>

                {/* Created At */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                    <Calendar className="w-4 h-4" /> Member Since
                  </label>
                  <p className="text-gray-900 dark:text-white">{formatDate(profile.created_at)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Subscription & Payments */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
              <CreditCard className="w-5 h-5" /> Subscription & Payments
            </h3>

            {/* Current Plan Status */}
            <div className="flex items-center gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 mb-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                client?.subscription_status === 'active'
                  ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400'
                  : client?.subscription_status === 'trial'
                  ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400'
                  : client?.subscription_status === 'cancelled'
                  ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400'
                  : 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
              }`}>
                <Crown className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {client?.subscription_status === 'active' ? 'Active Subscription' :
                   client?.subscription_status === 'trial' ? 'Free Trial' :
                   client?.subscription_status === 'cancelled' ? 'Cancelled' :
                   'Expired'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {client?.subscription_status === 'active' ? 'Your subscription is active' :
                   client?.subscription_status === 'trial'
                     ? `${client.trial_days_remaining ?? 0} days remaining`
                     : client?.subscription_status === 'cancelled'
                     ? `Cancelled — access until ${client.subscription_end_date ? formatDate(client.subscription_end_date) : 'end of period'}`
                     : 'Please upgrade to continue'}
                </p>
              </div>
            </div>

            {/* Subscription Action Buttons */}
            <div className="flex flex-wrap gap-2 mb-4">
              {client?.subscription_status === 'active' && (
                <>
                  <a
                    href={getUpgradeUrl()}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" /> Switch Plan
                  </a>
                  <button
                    onClick={() => setShowCancelConfirm(true)}
                    className="flex items-center gap-1.5 px-4 py-2 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-medium rounded-lg transition-colors"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Cancel Subscription
                  </button>
                </>
              )}
              {(client?.subscription_status === 'cancelled' || client?.subscription_status === 'expired') && (
                <a
                  href={getUpgradeUrl()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Reactivate Plan
                </a>
              )}
              {client?.subscription_status === 'trial' && (
                <a
                  href={getUpgradeUrl()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Upgrade <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>

            {/* Cancel Confirmation Dialog */}
            {showCancelConfirm && (
              <div className="p-4 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 mb-4">
                <p className="text-sm font-semibold text-red-700 dark:text-red-400 mb-2">Cancel Subscription?</p>
                <p className="text-xs text-red-600 dark:text-red-300 mb-3">
                  You will lose access to premium features after your current billing period ends. You can reactivate anytime.
                </p>

                {/* Cancellation Reason */}
                <div className="mb-3">
                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">Why are you cancelling?</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {['Too expensive', 'Not using it enough', 'Missing features', 'Switching to another product', 'Other'].map((r) => (
                      <button
                        key={r}
                        onClick={() => setCancelReason(r)}
                        className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                          cancelReason === r
                            ? 'bg-red-600 text-white border-red-600'
                            : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  {cancelReason === 'Other' && (
                    <input
                      type="text"
                      value={cancelReasonOther}
                      onChange={(e) => setCancelReasonOther(e.target.value)}
                      placeholder="Please tell us why..."
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    />
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowCancelConfirm(false); setCancelReason(''); setCancelReasonOther('') }}
                    className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    Keep Subscription
                  </button>
                  <button
                    onClick={handleCancelSubscription}
                    disabled={cancelling || !cancelReason || (cancelReason === 'Other' && !cancelReasonOther.trim())}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    {cancelling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                    Yes, Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Payment History */}
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Payment History</h4>
            {loadingPayments ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : transactions.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No payments yet</p>
            ) : (
              <div className="space-y-2">
                {transactions.map((txn) => (
                  <div key={txn.transaction_id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      txn.status === 'paid' ? 'bg-emerald-500' :
                      txn.status === 'failed' ? 'bg-red-500' :
                      txn.status === 'refunded' ? 'bg-amber-500' :
                      'bg-gray-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {formatPrice(txn.amount)}
                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-2 capitalize">{txn.billing_cycle}</span>
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {txn.paid_at ? formatDate(txn.paid_at) : formatDate(txn.created_at)}
                        {txn.razorpay_payment_id && (
                          <span className="ml-2 text-gray-400">#{txn.razorpay_payment_id.slice(-8)}</span>
                        )}
                      </p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                      txn.status === 'paid' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                      txn.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                      txn.status === 'refunded' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                      'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                    }`}>
                      {txn.status === 'paid' ? 'Successful' : txn.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Security Section */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Key className="w-5 h-5" /> Security
              </h3>
            </div>

            {!showPasswordForm ? (
              <button
                onClick={() => setShowPasswordForm(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                <Key className="w-4 h-4" />
                Change Password
              </button>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Current Password</label>
                  <input
                    type="password"
                    value={passwordForm.current_password}
                    onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-transparent"
                    placeholder="Enter current password"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">New Password</label>
                  <input
                    type="password"
                    value={passwordForm.new_password}
                    onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-transparent"
                    placeholder="Enter new password (min 6 characters)"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Confirm New Password</label>
                  <input
                    type="password"
                    value={passwordForm.confirm_password}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-transparent"
                    placeholder="Confirm new password"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setShowPasswordForm(false)
                      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' })
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handlePasswordChange}
                    disabled={changingPassword || !passwordForm.current_password || !passwordForm.new_password || !passwordForm.confirm_password}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-900 dark:bg-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {changingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                    Change Password
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Recent Activity */}
        <div className="lg:col-span-1 flex flex-col min-h-0">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="p-6 pb-2 flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Activity className="w-5 h-5" /> Recent Activity
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Last 7 days</p>
            </div>

            {loadingActivity ? (
              <div className="flex items-center justify-center py-8 flex-1">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : activity.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8 flex-1">No activity in the last 7 days</p>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="flex-1 overflow-y-auto px-6" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                  <div className="space-y-3 pb-2">
                    {activity.map((item) => (
                      <div
                        key={item.log_id}
                        className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl"
                      >
                        <span className="text-lg flex-shrink-0">{getActionIcon(item.action_type)}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {item.action_type}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            on {item.table_name}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            {formatDate(item.timestamp)}
                          </p>
                          {item.ip_address && (
                            <p className="text-xs text-gray-400 dark:text-gray-500">
                              {item.ip_address}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Pagination */}
                {activityTotal > 10 && (
                  <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
                    <button
                      onClick={() => fetchActivity(activityPage - 1)}
                      disabled={activityPage <= 1}
                      className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Prev
                    </button>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {activityPage} / {Math.ceil(activityTotal / 10)}
                    </span>
                    <button
                      onClick={() => fetchActivity(activityPage + 1)}
                      disabled={activityPage >= Math.ceil(activityTotal / 10)}
                      className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hide scrollbar CSS */}
      <style>{`
        div::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
    </DashboardLayout>
  )
}
