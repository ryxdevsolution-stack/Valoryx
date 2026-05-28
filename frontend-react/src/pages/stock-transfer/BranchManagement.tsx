import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '@/components/DashboardLayout'
import api from '@/lib/api'
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Building2,
  MapPin,
  Calendar,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
  UserCheck,
  Users,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BranchMember {
  user_id: string
  full_name: string
  email: string
  role: string
}

interface Branch {
  branch_id: string
  name: string
  location: string | null
  manager_id: string | null
  manager_name: string | null
  is_active: boolean
  is_main: boolean
  created_at: string
  members: BranchMember[]
}

interface AvailableManager {
  user_id: string
  full_name: string
  email: string
  role: string
}

interface BranchFormData {
  name: string
  location: string
  manager_user_id: string
}

interface Toast {
  id: number
  message: string
  type: 'success' | 'error'
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INITIAL_FORM_DATA: BranchFormData = { name: '', location: '', manager_user_id: '' }
const TOAST_DURATION_MS = 3000

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateString: string): string {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// ---------------------------------------------------------------------------
// Toast Component
// ---------------------------------------------------------------------------

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Toast[]
  onDismiss: (id: number) => void
}) {
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
              toast.type === 'success'
                ? 'bg-green-600 text-white'
                : 'bg-red-600 text-white'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle className="h-4 w-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
            )}
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="ml-2 hover:opacity-80"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Confirmation Dialog Component
// ---------------------------------------------------------------------------

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  loading,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
        role="presentation"
      />
      {/* Dialog */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {title}
          </h3>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          {message}
        </p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Add/Edit Branch Modal Component
// ---------------------------------------------------------------------------

function BranchModal({
  open,
  editingBranch,
  onClose,
  onSave,
  onGoToTeam,
}: {
  open: boolean
  editingBranch: Branch | null
  onClose: () => void
  onSave: (data: BranchFormData, branchId?: string) => Promise<void>
  onGoToTeam: () => void
}) {
  const [formData, setFormData] = useState<BranchFormData>(INITIAL_FORM_DATA)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [managers, setManagers] = useState<AvailableManager[]>([])
  const [managersLoading, setManagersLoading] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const isCreating = !editingBranch

  // Reset form + fetch available managers when modal opens
  useEffect(() => {
    if (!open) return
    if (editingBranch) {
      setFormData({ name: editingBranch.name, location: editingBranch.location ?? '', manager_user_id: editingBranch.manager_id ?? '' })
    } else {
      setFormData(INITIAL_FORM_DATA)
      // Fetch unassigned admin/manager users for the picker
      setManagersLoading(true)
      api.get('/branches/available-managers')
        .then((res) => setManagers(res.data.data ?? []))
        .catch(() => setManagers([]))
        .finally(() => setManagersLoading(false))
    }
    setFormError(null)
    setTimeout(() => nameInputRef.current?.focus(), 100)
  }, [open, editingBranch])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = formData.name.trim()
    if (!trimmedName) { setFormError('Branch name is required.'); return }
    if (isCreating && !formData.manager_user_id) {
      setFormError('You must assign a manager before creating a branch.')
      return
    }
    try {
      setSaving(true)
      setFormError(null)
      await onSave(
        { name: trimmedName, location: formData.location.trim(), manager_user_id: formData.manager_user_id },
        editingBranch?.branch_id
      )
    } catch (err: any) {
      setFormError(err?.response?.data?.error ?? err?.message ?? 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} role="presentation" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {editingBranch ? 'Edit Branch' : 'Add New Branch'}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition" aria-label="Close modal">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {formError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Branch Name */}
          <div>
            <label htmlFor="branch-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Branch Name <span className="text-red-500">*</span>
            </label>
            <input
              ref={nameInputRef}
              id="branch-name"
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Main Store, Warehouse, Downtown Branch"
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            />
          </div>

          {/* Location */}
          <div>
            <label htmlFor="branch-location" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Location <span className="text-gray-400 dark:text-gray-500 font-normal">(optional)</span>
            </label>
            <input
              id="branch-location"
              type="text"
              value={formData.location}
              onChange={(e) => setFormData((prev) => ({ ...prev, location: e.target.value }))}
              placeholder="e.g., 123 Market Street, City"
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            />
          </div>

          {/* Manager picker — only shown when creating a new branch */}
          {isCreating && (
            <div>
              <label htmlFor="branch-manager" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Branch Manager <span className="text-red-500">*</span>
              </label>
              {managersLoading ? (
                <div className="flex items-center gap-2 py-2.5 text-sm text-gray-500 dark:text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading available managers…
                </div>
              ) : managers.length === 0 ? (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                  <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>No available manager users. Invite a new user with the <strong>manager</strong> role first, then come back to assign them to this branch.</span>
                  </div>
                  <button
                    type="button"
                    onClick={onGoToTeam}
                    className="mt-2.5 w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
                  >
                    <Plus className="h-4 w-4" />
                    Go to Team & Invite Member
                  </button>
                </div>
              ) : (
                <select
                  id="branch-manager"
                  value={formData.manager_user_id}
                  onChange={(e) => setFormData((prev) => ({ ...prev, manager_user_id: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                >
                  <option value="">Select a manager…</option>
                  {managers.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.full_name} ({m.role}) — {m.email}
                    </option>
                  ))}
                </select>
              )}
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Active and pending-invite manager users not yet assigned to any branch are shown.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition disabled:opacity-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || (isCreating && managers.length === 0 && !managersLoading)}
              className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingBranch ? 'Update Branch' : 'Create Branch'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Branch Card Component
// ---------------------------------------------------------------------------

function BranchCard({
  branch,
  onEdit,
  onDeactivate,
}: {
  branch: Branch
  onEdit: (branch: Branch) => void
  onDeactivate: (branch: Branch) => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm hover:shadow-md transition-shadow p-5"
    >
      {/* Top row: icon + name + status */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
            <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-gray-900 dark:text-white truncate">
              {branch.name}
            </h3>
          </div>
        </div>
        <span
          className={`flex-shrink-0 ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
            branch.is_active
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
          }`}
        >
          {branch.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>

      {/* Details */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <UserCheck className="h-3.5 w-3.5 flex-shrink-0 text-gray-400 dark:text-gray-500" />
          <span className="truncate">
            {(() => {
              // Show manager from manager_id FK, or infer from members
              if (branch.manager_name) {
                return <span className="font-medium text-gray-700 dark:text-gray-300">{branch.manager_name}</span>
              }
              // Find the highest-role member as de facto manager
              const roleOrder = ['owner', 'manager']
              const lead = branch.members
                ?.sort((a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role))
                ?.[0]
              if (lead) {
                return <span className="font-medium text-gray-700 dark:text-gray-300">{lead.full_name} <span className="text-xs text-gray-400">({lead.role})</span></span>
              }
              return <span className="italic text-amber-500 dark:text-amber-400">No manager assigned</span>
            })()}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-gray-400 dark:text-gray-500" />
          <span className="truncate">
            {branch.location || (
              <span className="italic text-gray-400 dark:text-gray-500">No location set</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <Calendar className="h-3.5 w-3.5 flex-shrink-0 text-gray-400 dark:text-gray-500" />
          <span>Created {formatDate(branch.created_at)}</span>
        </div>
      </div>

      {/* Members */}
      {branch.members && branch.members.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Users className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Members ({branch.members.length})
            </span>
          </div>
          <div className="space-y-1.5">
            {branch.members.map((member) => (
              <div
                key={member.user_id}
                className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
              >
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold">
                  {member.full_name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate block">
                    {member.full_name}
                  </span>
                </div>
                <span className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                  member.role === 'owner'
                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                    : member.role === 'manager'
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                    : 'bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                }`}>
                  {member.role}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-gray-700">
        {branch.is_main ? (
          <span className="text-xs text-gray-400 dark:text-gray-500 italic">Main branch — protected</span>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onEdit(branch)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition"
              aria-label={`Edit branch ${branch.name}`}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
            {branch.is_active && (
              <button
                type="button"
                onClick={() => onDeactivate(branch)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition"
                aria-label={`Deactivate branch ${branch.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Deactivate
              </button>
            )}
          </>
        )}
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Loading Skeleton
// ---------------------------------------------------------------------------

function BranchCardSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-5 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-700" />
          <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
        <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full" />
      </div>
      <div className="space-y-2 mb-4">
        <div className="h-4 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-4 w-36 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
      <div className="flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-gray-700">
        <div className="h-7 w-16 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        <div className="h-7 w-24 bg-gray-200 dark:bg-gray-700 rounded-lg" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty State Component
// ---------------------------------------------------------------------------

function EmptyState({ onCreateFirst }: { onCreateFirst: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center justify-center py-16 px-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl"
    >
      <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mb-5">
        <Building2 className="h-8 w-8 text-blue-500 dark:text-blue-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        No branches yet
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-md mb-6">
        Create your first branch to start transferring stock between locations.
      </p>
      <button
        type="button"
        onClick={onCreateFirst}
        className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition shadow-sm"
      >
        <Plus className="h-4 w-4" />
        Create First Branch
      </button>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function BranchManagement() {
  const navigate = useNavigate()

  // Data state
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null)

  // Confirm dialog state
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deactivatingBranch, setDeactivatingBranch] = useState<Branch | null>(null)
  const [deactivating, setDeactivating] = useState(false)

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastIdRef = useRef(0)

  // Prevent duplicate fetches in strict mode
  const ongoingRequest = useRef<Promise<void> | null>(null)
  const hasInitialized = useRef(false)

  // -----------------------------------------------------------------------
  // Toast helpers
  // -----------------------------------------------------------------------

  const addToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = ++toastIdRef.current
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, TOAST_DURATION_MS)
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const fetchBranches = useCallback(async () => {
    if (ongoingRequest.current) {
      return ongoingRequest.current
    }

    const request = (async () => {
      try {
        setLoading(true)
        setFetchError(null)
        const response = await api.get('/branches')
        const data = response.data
        if (data.success) {
          setBranches(data.data ?? [])
        } else {
          setFetchError(data.error ?? 'Failed to load branches.')
        }
      } catch (err: any) {
        const msg =
          err?.response?.data?.error ?? err?.message ?? 'Failed to load branches.'
        setFetchError(msg)
      } finally {
        setLoading(false)
        ongoingRequest.current = null
      }
    })()

    ongoingRequest.current = request
    return request
  }, [])

  useEffect(() => {
    if (hasInitialized.current) return
    hasInitialized.current = true
    fetchBranches()
  }, [fetchBranches])

  // -----------------------------------------------------------------------
  // Create / Update handler (called by modal)
  // -----------------------------------------------------------------------

  const handleSaveBranch = useCallback(
    async (formData: BranchFormData, branchId?: string) => {
      const payload: Record<string, string> = { name: formData.name }
      if (formData.location) payload.location = formData.location

      if (branchId) {
        if (formData.manager_user_id) payload.manager_user_id = formData.manager_user_id
        await api.put(`/branches/${branchId}`, payload)
        addToast('Branch updated successfully.', 'success')
      } else {
        payload.manager_user_id = formData.manager_user_id
        await api.post('/branches', payload)
        addToast('Branch created successfully.', 'success')
      }

      // Close modal and refresh
      setModalOpen(false)
      setEditingBranch(null)
      // Reset the guard so fetch can proceed
      ongoingRequest.current = null
      hasInitialized.current = false
      fetchBranches()
    },
    [addToast, fetchBranches]
  )

  // -----------------------------------------------------------------------
  // Deactivate handler
  // -----------------------------------------------------------------------

  const handleDeactivateConfirm = useCallback(async () => {
    if (!deactivatingBranch) return

    try {
      setDeactivating(true)
      await api.delete(`/branches/${deactivatingBranch.branch_id}`)
      addToast(`"${deactivatingBranch.name}" has been deactivated.`, 'success')
      setConfirmOpen(false)
      setDeactivatingBranch(null)
      // Reset the guard so fetch can proceed
      ongoingRequest.current = null
      hasInitialized.current = false
      fetchBranches()
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ?? err?.message ?? 'Failed to deactivate branch.'
      addToast(msg, 'error')
    } finally {
      setDeactivating(false)
    }
  }, [deactivatingBranch, addToast, fetchBranches])

  // -----------------------------------------------------------------------
  // UI event handlers
  // -----------------------------------------------------------------------

  const openAddModal = () => {
    setEditingBranch(null)
    setModalOpen(true)
  }

  const openEditModal = (branch: Branch) => {
    setEditingBranch(branch)
    setModalOpen(true)
  }

  const openDeactivateDialog = (branch: Branch) => {
    setDeactivatingBranch(branch)
    setConfirmOpen(true)
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <button
              type="button"
              onClick={() => navigate('/stock-transfer')}
              className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition mb-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Stock Transfer
            </button>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              Branch Management
            </h1>
            <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
              Create and manage your business locations
            </p>
          </div>
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Add Branch
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <BranchCardSkeleton key={i} />
          ))}
        </div>
      ) : fetchError ? (
        <div className="flex flex-col items-center justify-center py-16 px-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
          <AlertCircle className="h-10 w-10 text-red-400 mb-4" />
          <p className="text-sm text-red-600 dark:text-red-400 mb-4 text-center">
            {fetchError}
          </p>
          <button
            type="button"
            onClick={() => {
              ongoingRequest.current = null
              hasInitialized.current = false
              fetchBranches()
            }}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
          >
            Retry
          </button>
        </div>
      ) : branches.length === 0 ? (
        <EmptyState onCreateFirst={openAddModal} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {branches.map((branch) => (
            <BranchCard
              key={branch.branch_id}
              branch={branch}
              onEdit={openEditModal}
              onDeactivate={openDeactivateDialog}
            />
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      <AnimatePresence>
        {modalOpen && (
          <BranchModal
            open={modalOpen}
            editingBranch={editingBranch}
            onClose={() => {
              setModalOpen(false)
              setEditingBranch(null)
            }}
            onSave={handleSaveBranch}
            onGoToTeam={() => {
              setModalOpen(false)
              setEditingBranch(null)
              navigate('/profile?tab=team')
            }}
          />
        )}
      </AnimatePresence>

      {/* Deactivate Confirmation Dialog */}
      <AnimatePresence>
        {confirmOpen && (
          <ConfirmDialog
            open={confirmOpen}
            title="Deactivate Branch"
            message={`Are you sure you want to deactivate "${deactivatingBranch?.name}"? This branch will no longer be available for stock transfers.`}
            confirmLabel="Deactivate"
            onConfirm={handleDeactivateConfirm}
            onCancel={() => {
              setConfirmOpen(false)
              setDeactivatingBranch(null)
            }}
            loading={deactivating}
          />
        )}
      </AnimatePresence>

      {/* Toasts */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </DashboardLayout>
  )
}
