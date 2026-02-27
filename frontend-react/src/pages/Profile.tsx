import { useState, useEffect, useRef } from 'react'
import { useClient } from '@/contexts/ClientContext'
import DashboardLayout from '@/components/DashboardLayout'
import api from '@/lib/api'
import ProfileTabs, { type ProfileTab } from '@/components/profile/ProfileTabs'
import AccountTab from '@/components/profile/AccountTab'
import TeamTab from '@/components/profile/TeamTab'
import SubscriptionTab from '@/components/profile/SubscriptionTab'
import {
  Activity,
  AlertCircle,
  CheckCircle,
  Loader2,
  X,
} from 'lucide-react'

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
  const { user, client, refreshUserData, refreshClientData, updateSubscriptionStatus } = useClient()

  // Tab state — read from URL on mount
  const [activeTab, setActiveTab] = useState<ProfileTab>(() => {
    const params = new URLSearchParams(window.location.search)
    const tab = params.get('tab')
    return (tab === 'account' || tab === 'team' || tab === 'subscription') ? tab : 'account'
  })

  // Profile edit state
  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    full_name: user?.full_name || '',
    phone: user?.phone || '',
    department: user?.department || '',
  })
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Business info edit state
  const [isEditingBusiness, setIsEditingBusiness] = useState(false)
  const [savingBusiness, setSavingBusiness] = useState(false)
  const [businessForm, setBusinessForm] = useState({
    client_name: client?.client_name || '',
    phone: client?.phone || '',
    address: client?.address || '',
    gstin: client?.gstin || '',
  })

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

  // Telegram notification state
  const [telegramChatId, setTelegramChatId] = useState(user?.telegram_chat_id || '')
  const [savingTelegram, setSavingTelegram] = useState(false)
  const [testingTelegram, setTestingTelegram] = useState(false)

  // Activity history state
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [activityPage, setActivityPage] = useState(1)
  const [activityTotal, setActivityTotal] = useState(0)
  const [loadingActivity, setLoadingActivity] = useState(false)

  // Fetch activity on mount (always visible in right column on desktop)
  useEffect(() => {
    fetchActivity()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Lazy-load payment history only on first visit to subscription tab
  const hasFetchedPayments = useRef(false)
  useEffect(() => {
    if (activeTab === 'subscription' && !hasFetchedPayments.current) {
      hasFetchedPayments.current = true
      fetchPaymentHistory()
    }
  }, [activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync editForm when user data arrives
  useEffect(() => {
    if (user) {
      setEditForm({
        full_name: user.full_name || '',
        phone: user.phone || '',
        department: user.department || '',
      })
    }
  }, [user])

  // Sync businessForm when client data arrives
  useEffect(() => {
    if (client) {
      setBusinessForm({
        client_name: client.client_name || '',
        phone: client.phone || '',
        address: client.address || '',
        gstin: client.gstin || '',
      })
    }
  }, [client])

  // Sync telegram chat ID
  useEffect(() => {
    setTelegramChatId(user?.telegram_chat_id || '')
  }, [user?.telegram_chat_id])

  // Derive profile from ClientContext
  const profile = user ? {
    user_id: user.user_id,
    email: user.email,
    full_name: user.full_name || '',
    phone: user.phone || '',
    department: user.department || '',
    role: user.role,
    is_super_admin: user.is_super_admin || false,
    is_active: true,
    created_at: user.created_at ?? null,
    last_login: user.last_login ?? null,
    client: client ? {
      client_id: client.client_id,
      client_name: client.client_name,
      email: client.email || '',
      logo_url: client.logo_url,
    } : null,
  } : null

  const canManageTeam = user?.role === 'owner' || user?.role === 'admin'

  // ─── Handlers ───────────────────────────────────────────────

  const handleTabChange = (tab: ProfileTab) => {
    setActiveTab(tab)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', tab)
    window.history.replaceState({}, '', url.toString())
  }

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

  const handleSaveBusiness = async () => {
    if (!client?.client_id) return
    try {
      setSavingBusiness(true)
      await api.put(`/clients/${client.client_id}`, {
        client_name: businessForm.client_name,
        phone: businessForm.phone,
        address: businessForm.address,
        gst_number: businessForm.gstin,
      })
      setMessage({ type: 'success', text: 'Business information updated successfully' })
      setIsEditingBusiness(false)
      await refreshClientData()
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.error || 'Failed to update business information' })
    } finally {
      setSavingBusiness(false)
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

  const handleSaveTelegramChatId = async () => {
    try {
      setSavingTelegram(true)
      await api.put('/profile', { telegram_chat_id: telegramChatId.trim() || null })
      await refreshUserData()
      setMessage({ type: 'success', text: 'Telegram chat ID saved. Daily reports will now be sent to your Telegram.' })
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.error || 'Failed to save Telegram chat ID' })
    } finally {
      setSavingTelegram(false)
    }
  }

  const handleSendTestReport = async () => {
    try {
      setTestingTelegram(true)
      await api.post('/telegram/trigger-report')
      setMessage({ type: 'success', text: 'Test report sent! Check your Telegram.' })
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.error || 'Failed to send test report' })
    } finally {
      setTestingTelegram(false)
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

  // ─── Loading state ──────────────────────────────────────────

  if (!user || !profile) {
    return (
      <DashboardLayout>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </DashboardLayout>
    )
  }

  // ─── Render ─────────────────────────────────────────────────

  return (
    <DashboardLayout>
    <div className="h-[calc(100vh-80px)] md:h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 sm:py-4 flex-shrink-0">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">My Profile</h1>
      </div>

      {/* Tab Bar */}
      <ProfileTabs
        activeTab={activeTab}
        onTabChange={handleTabChange}
        showTeamTab={canManageTeam}
        showSubscriptionTab={canManageTeam}
      />

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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 px-3 sm:px-4 pb-4 flex-1 min-h-0 overflow-hidden">
        {/* Left Column — Active Tab Content */}
        <div className="lg:col-span-2 space-y-4 sm:space-y-6 overflow-y-auto lg:pr-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {activeTab === 'account' && (
            <AccountTab
              profile={profile}
              user={user}
              client={client}
              isEditing={isEditing}
              setIsEditing={setIsEditing}
              editForm={editForm}
              setEditForm={setEditForm}
              saving={saving}
              handleSaveProfile={handleSaveProfile}
              isEditingBusiness={isEditingBusiness}
              setIsEditingBusiness={setIsEditingBusiness}
              businessForm={businessForm}
              setBusinessForm={setBusinessForm}
              savingBusiness={savingBusiness}
              handleSaveBusiness={handleSaveBusiness}
              showPasswordForm={showPasswordForm}
              setShowPasswordForm={setShowPasswordForm}
              passwordForm={passwordForm}
              setPasswordForm={setPasswordForm}
              changingPassword={changingPassword}
              handlePasswordChange={handlePasswordChange}
              telegramChatId={telegramChatId}
              setTelegramChatId={setTelegramChatId}
              savingTelegram={savingTelegram}
              handleSaveTelegramChatId={handleSaveTelegramChatId}
              testingTelegram={testingTelegram}
              handleSendTestReport={handleSendTestReport}
              formatDate={formatDate}
            />
          )}

          {activeTab === 'team' && <TeamTab onMessage={setMessage} />}

          {activeTab === 'subscription' && (
            <SubscriptionTab
              client={client}
              transactions={transactions}
              loadingPayments={loadingPayments}
              showCancelConfirm={showCancelConfirm}
              setShowCancelConfirm={setShowCancelConfirm}
              cancelReason={cancelReason}
              setCancelReason={setCancelReason}
              cancelReasonOther={cancelReasonOther}
              setCancelReasonOther={setCancelReasonOther}
              cancelling={cancelling}
              handleCancelSubscription={handleCancelSubscription}
              formatPrice={formatPrice}
              formatDate={formatDate}
              getUpgradeUrl={getUpgradeUrl}
            />
          )}
        </div>

        {/* Right Column - Recent Activity (hidden on mobile/tablet) */}
        <div className="hidden lg:flex lg:col-span-1 flex-col min-h-0">
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
