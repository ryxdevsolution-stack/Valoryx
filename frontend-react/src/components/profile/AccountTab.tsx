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
  Loader2,
  MapPin,
  Hash,
  Send,
  MessageCircle,
} from 'lucide-react'

interface AccountTabProps {
  profile: {
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
  user: any
  client: any
  // Profile edit
  isEditing: boolean
  setIsEditing: (v: boolean) => void
  editForm: { full_name: string; phone: string; department: string }
  setEditForm: (v: { full_name: string; phone: string; department: string }) => void
  saving: boolean
  handleSaveProfile: () => void
  // Business edit
  isEditingBusiness: boolean
  setIsEditingBusiness: (v: boolean) => void
  businessForm: { client_name: string; phone: string; address: string; gstin: string }
  setBusinessForm: (v: { client_name: string; phone: string; address: string; gstin: string }) => void
  savingBusiness: boolean
  handleSaveBusiness: () => void
  // Password
  showPasswordForm: boolean
  setShowPasswordForm: (v: boolean) => void
  passwordForm: { current_password: string; new_password: string; confirm_password: string }
  setPasswordForm: (v: { current_password: string; new_password: string; confirm_password: string }) => void
  changingPassword: boolean
  handlePasswordChange: () => void
  // Telegram
  telegramChatId: string
  setTelegramChatId: (v: string) => void
  savingTelegram: boolean
  handleSaveTelegramChatId: () => void
  testingTelegram: boolean
  handleSendTestReport: () => void
  // Business summary emails (owner only)
  savingReportFreq: boolean
  handleReportFrequencyChange: (freq: 'off' | 'daily' | 'weekly') => void
  // Utilities
  formatDate: (d: string | null) => string
}

export default function AccountTab({
  profile,
  user,
  client,
  isEditing,
  setIsEditing,
  editForm,
  setEditForm,
  saving,
  handleSaveProfile,
  isEditingBusiness,
  setIsEditingBusiness,
  businessForm,
  setBusinessForm,
  savingBusiness,
  handleSaveBusiness,
  showPasswordForm,
  setShowPasswordForm,
  passwordForm,
  setPasswordForm,
  changingPassword,
  handlePasswordChange,
  telegramChatId,
  setTelegramChatId,
  savingTelegram,
  handleSaveTelegramChatId,
  testingTelegram,
  handleSendTestReport,
  savingReportFreq,
  handleReportFrequencyChange,
  formatDate,
}: AccountTabProps) {
  return (
    <>
      {/* Profile Card */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header Section */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-6">
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
                <Edit3 className="w-4 h-4" /> Edit
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setIsEditing(false)
                    setEditForm({
                      full_name: user?.full_name || '',
                      phone: user?.phone || '',
                      department: user?.department || '',
                    })
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" /> Cancel
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
                  placeholder="Enter your name"
                />
              ) : (
                <p className="text-gray-900 dark:text-white">{profile.full_name || 'Not set'}</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <Mail className="w-4 h-4" /> Email
              </label>
              <p className="text-gray-900 dark:text-white">{profile.email}</p>
            </div>
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
                  placeholder="Enter your phone"
                />
              ) : (
                <p className="text-gray-900 dark:text-white">{profile.phone || 'Not set'}</p>
              )}
            </div>
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
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <Building className="w-4 h-4" /> Role
              </label>
              <p className="text-gray-900 dark:text-white capitalize">{profile.role}</p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <Clock className="w-4 h-4" /> Last Login
              </label>
              <p className="text-gray-900 dark:text-white">{formatDate(profile.last_login)}</p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <Calendar className="w-4 h-4" /> Member Since
              </label>
              <p className="text-gray-900 dark:text-white">{formatDate(profile.created_at)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Business Information */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Building className="w-5 h-5" /> Business Information
            </h3>
            {(profile.is_super_admin || profile.role === 'owner' || profile.role === 'admin') && !isEditingBusiness && (
              <button
                onClick={() => setIsEditingBusiness(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <Edit3 className="w-4 h-4" /> Edit
              </button>
            )}
            {isEditingBusiness && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setIsEditingBusiness(false)
                    setBusinessForm({
                      client_name: client?.client_name || '',
                      phone: client?.phone || '',
                      address: client?.address || '',
                      gstin: client?.gstin || '',
                    })
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" /> Cancel
                </button>
                <button
                  onClick={handleSaveBusiness}
                  disabled={savingBusiness}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-gray-900 dark:bg-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                >
                  {savingBusiness ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <Building className="w-4 h-4" /> Business Name
              </label>
              {isEditingBusiness ? (
                <input
                  type="text"
                  value={businessForm.client_name}
                  onChange={(e) => setBusinessForm({ ...businessForm, client_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-transparent"
                  placeholder="Enter business name"
                />
              ) : (
                <p className="text-gray-900 dark:text-white">{client?.client_name || 'Not set'}</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <Mail className="w-4 h-4" /> Business Email
              </label>
              <p className="text-gray-900 dark:text-white">{client?.email || 'Not set'}</p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <Phone className="w-4 h-4" /> Phone
              </label>
              {isEditingBusiness ? (
                <input
                  type="tel"
                  value={businessForm.phone}
                  onChange={(e) => setBusinessForm({ ...businessForm, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-transparent"
                  placeholder="Enter business phone"
                />
              ) : (
                <p className="text-gray-900 dark:text-white">{client?.phone || 'Not set'}</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <Hash className="w-4 h-4" /> GSTIN
              </label>
              {isEditingBusiness ? (
                <input
                  type="text"
                  value={businessForm.gstin}
                  onChange={(e) => setBusinessForm({ ...businessForm, gstin: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-transparent"
                  placeholder="e.g. 29ABCDE1234F1Z5"
                  maxLength={15}
                />
              ) : (
                <p className="text-gray-900 dark:text-white">{client?.gstin || 'Not set'}</p>
              )}
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <MapPin className="w-4 h-4" /> Address
              </label>
              {isEditingBusiness ? (
                <textarea
                  rows={3}
                  value={businessForm.address}
                  onChange={(e) => setBusinessForm({ ...businessForm, address: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-transparent resize-none"
                  placeholder="Enter business address"
                />
              ) : (
                <p className="text-gray-900 dark:text-white whitespace-pre-line">{client?.address || 'Not set'}</p>
              )}
            </div>
          </div>
        </div>
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

      {/* Telegram Notifications — hidden in Electron */}
      {!import.meta.env.VITE_ELECTRON && <div className="hidden bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-1">
          <MessageCircle className="w-5 h-5 text-sky-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Telegram Daily Reports</h3>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Receive an automatic daily business summary every night at 9:00 PM IST.
        </p>

        {!user?.telegram_chat_id && (
          <div className="mb-4 p-3 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-700 rounded-xl space-y-2">
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-400 uppercase tracking-wide">How to connect</p>
            <ol className="space-y-1.5 text-sm text-gray-700 dark:text-gray-300">
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-sky-500 text-white text-xs flex items-center justify-center font-bold mt-0.5">1</span>
                <span>Open Telegram and message <a href="https://t.me/Valoryxv1bot" target="_blank" rel="noopener noreferrer" className="font-semibold text-sky-600 dark:text-sky-400 underline underline-offset-2">@Valoryxv1bot</a> — send any message (e.g. "hi")</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-sky-500 text-white text-xs flex items-center justify-center font-bold mt-0.5">2</span>
                <span>The bot will instantly reply with <strong>your Chat ID</strong> (a number like 1234567890)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-sky-500 text-white text-xs flex items-center justify-center font-bold mt-0.5">3</span>
                <span>Copy that number, paste it below, and click <strong>Save</strong></span>
              </li>
            </ol>
            <a
              href="https://t.me/Valoryxv1bot"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Send className="w-3 h-3" /> Open @Valoryxv1bot in Telegram
            </a>
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Your Telegram Chat ID
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                placeholder="Paste your chat ID here (e.g. 1234567890)"
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm"
              />
              <button
                onClick={handleSaveTelegramChatId}
                disabled={savingTelegram}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {savingTelegram ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </button>
            </div>
          </div>

          {user?.telegram_chat_id && (
            <div className="flex items-center justify-between p-3 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-xl">
              <div>
                <p className="text-xs font-medium text-sky-700 dark:text-sky-400">Connected</p>
                <p className="text-sm text-gray-700 dark:text-gray-300">Chat ID: <span className="font-mono">{user.telegram_chat_id}</span></p>
              </div>
              <button
                onClick={handleSendTestReport}
                disabled={testingTelegram}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-sky-700 dark:text-sky-400 border border-sky-300 dark:border-sky-700 hover:bg-sky-100 dark:hover:bg-sky-900/40 rounded-lg transition-colors disabled:opacity-50"
              >
                {testingTelegram ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Send Test Report
              </button>
            </div>
          )}
        </div>
      </div>}

      {/* Business Summary Emails — owner only */}
      {user?.role === 'owner' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-2 mb-1">
            <Mail className="w-5 h-5 text-indigo-500" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Business Summary Emails</h3>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Get a revenue and invoice summary emailed to you. Sent only on days with activity —
            you won't get an email for a day with zero sales.
          </p>

          <div className="inline-flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            {(['off', 'daily', 'weekly'] as const).map((freq) => (
              <button
                key={freq}
                type="button"
                disabled={savingReportFreq}
                onClick={() => handleReportFrequencyChange(freq)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all disabled:opacity-50 ${
                  (user?.report_email_frequency ?? 'off') === freq
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {freq === 'off' ? 'Off' : freq === 'daily' ? 'Daily' : 'Weekly'}
              </button>
            ))}
          </div>

          {(user?.report_email_frequency ?? 'off') !== 'off' && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
              Sent to <span className="font-medium">{user?.email}</span> around 9:00 PM IST.
              You can unsubscribe anytime from a link in the email, or by switching this back to Off.
            </p>
          )}
        </div>
      )}
    </>
  )
}
