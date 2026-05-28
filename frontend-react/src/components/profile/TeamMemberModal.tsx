import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useClient } from '@/contexts/ClientContext'
import teamService, {
  type TeamMember,
  type PermissionSection,
  type BranchItem,
  type PlanInfo,
  type PermissionPreset,
} from '@/services/teamService'
import {
  X,
  Save,
  Loader2,
  Key,
  ChevronDown,
  ChevronRight,
  Check,
  Plus,
  Lock,
  Sparkles,
} from 'lucide-react'

// ─── Props ──────────────────────────────────────────────────────────

interface TeamMemberModalProps {
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
  editingUser: TeamMember | null // null = create, set = edit
  onMessage: (msg: { type: 'success' | 'error'; text: string }) => void
  planInfo: PlanInfo | null
  /** Pre-verified TOTP action token — required when owner has 2FA enabled */
  totpActionToken?: string | null
}

// ─── Constants ──────────────────────────────────────────────────────

const ROLE_HIERARCHY: Record<string, number> = {
  owner: 3,
  manager: 2,
  staff: 1,
}

const ALL_ROLES = ['owner', 'manager', 'staff']

const INPUT_CLASS =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-transparent text-sm'

const LABEL_CLASS = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

const BILLING_PERMS = new Set(['gst_billing', 'non_gst_billing'])

const API_ERROR_MESSAGES: Record<string, string> = {
  PLAN_LIMIT_REACHED: 'You have reached your team member limit. Please upgrade your plan to add more.',
  ROLE_QUOTA_REACHED: 'The quota for this role has been reached. Please contact support to increase the limit.',
  BILLING_PERMISSION_RESTRICTED: 'Some billing permissions are not available on your current plan.',
}

// ─── Form State ─────────────────────────────────────────────────────

interface FormState {
  full_name: string
  email: string
  phone: string
  department: string
  role: string
  branch_id: string
  is_active: boolean
}

const INITIAL_FORM: FormState = {
  full_name: '',
  email: '',
  phone: '',
  department: '',
  role: 'staff',
  branch_id: '',
  is_active: true,
}

// ─── Component ──────────────────────────────────────────────────────

export default function TeamMemberModal({
  isOpen,
  onClose,
  onSaved,
  editingUser,
  onMessage,
  planInfo,
  totpActionToken,
}: TeamMemberModalProps) {
  const { user: currentUser } = useClient()

  // Form state
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})

  // Branch data
  const [branches, setBranches] = useState<BranchItem[]>([])
  const [loadingBranches, setLoadingBranches] = useState(false)

  // Permissions state
  const [allPermissions, setAllPermissions] = useState<PermissionSection[]>([])
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set())
  const [loadingPermissions, setLoadingPermissions] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [showPermissions, setShowPermissions] = useState(false)

  // Preset state
  const [preset, setPreset] = useState<PermissionPreset | null>(null)
  const [presetApplied, setPresetApplied] = useState(false)

  // Password reset state
  const [resettingPassword, setResettingPassword] = useState(false)
  const [showPasswordField, setShowPasswordField] = useState(false)
  const [customPassword, setCustomPassword] = useState('')
  // Remember last selected branch across modal opens
  const lastBranchIdRef = useRef<string | null>(null)

  // Branch combobox state
  const [branchQuery, setBranchQuery] = useState('')
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false)
  const [creatingBranch, setCreatingBranch] = useState(false)
  const [highlightedBranch, setHighlightedBranch] = useState(0)
  const creatingBranchRef = useRef(false)
  const branchContainerRef = useRef<HTMLDivElement>(null)
  const branchInputRef = useRef<HTMLInputElement>(null)

  const isEditMode = editingUser !== null

  // ─── Plan-based permission restrictions ─────────────────────

  const restrictedPermissions = useMemo(() => {
    if (!planInfo) return new Set<string>()
    const allowed = new Set(planInfo.allowed_billing)
    const restricted = new Set<string>()
    for (const perm of BILLING_PERMS) {
      if (!allowed.has(perm)) restricted.add(perm)
    }
    return restricted
  }, [planInfo])

  // ─── Computed: available roles for dropdown ────────────────────

  const availableRoles = ALL_ROLES.filter((role) => {
    if (!currentUser) return false
    const currentLevel = ROLE_HIERARCHY[currentUser.role] ?? 0
    const roleLevel = ROLE_HIERARCHY[role] ?? 0
    // Can only assign roles strictly below own level
    return roleLevel < currentLevel
  })

  // ─── Role quota helpers ────────────────────────────────────────

  const getRoleQuotaInfo = (role: string) => {
    if (!planInfo?.role_usage) return null
    return planInfo.role_usage[role] ?? null
  }

  const isRoleAtQuota = (role: string) => {
    // In edit mode, quota doesn't block (role might not change)
    if (isEditMode) return false
    const info = getRoleQuotaInfo(role)
    return info ? info.at_limit : false
  }

  // ─── Branch combobox computed values ──────────────────────────

  const filteredBranches = useMemo(() => {
    if (!branchQuery.trim()) return branches
    const q = branchQuery.toLowerCase().trim()
    return branches.filter((b) => b.name.toLowerCase().includes(q))
  }, [branches, branchQuery])

  const selectedBranchDisplay = useMemo(() => {
    if (!form.branch_id) return 'All Branches'
    const found = branches.find((b) => b.branch_id === form.branch_id)
    return found ? found.name + (found.location ? ` — ${found.location}` : '') : 'All Branches'
  }, [form.branch_id, branches])

  const trimmedQuery = branchQuery.trim()
  const exactMatch = branches.some((b) => b.name.toLowerCase() === trimmedQuery.toLowerCase())
  const canCreateBranch = currentUser?.role === 'owner' || currentUser?.role === 'manager'
  const showCreateOption = trimmedQuery.length > 0 && !exactMatch && canCreateBranch

  // ─── Load data on open ────────────────────────────────────────

  const loadInitialData = useCallback(async () => {
    if (!isOpen) return

    setLoadingBranches(true)
    setLoadingPermissions(true)

    // Fire all independent API calls in parallel
    const [branchRes, allPermsRes, userPermsRes] = await Promise.all([
      teamService.getBranches().catch(() => null),
      teamService.getAllPermissions().catch(() => null),
      editingUser
        ? teamService.getPermissions(editingUser.user_id).catch(() => null)
        : Promise.resolve(null),
    ])

    if (branchRes) {
      const fetchedBranches: BranchItem[] = branchRes.data.data
      setBranches(fetchedBranches)
      // In create mode: if role is owner, auto-select Main Branch after branches load
      if (!editingUser) {
        setForm((prev) => {
          if (prev.role === 'owner') {
            const mainBranch = fetchedBranches.find(
              (b) => b.name.toLowerCase() === 'main branch'
            )
            if (mainBranch) return { ...prev, branch_id: mainBranch.branch_id }
          }
          return prev
        })
      }
    }
    setLoadingBranches(false)

    if (allPermsRes) setAllPermissions(allPermsRes.data.data)
    setLoadingPermissions(false)

    if (userPermsRes) {
      const granted = new Set<string>()
      for (const section of userPermsRes.data.data) {
        for (const perm of section.permissions) {
          if (perm.has_permission) {
            granted.add(perm.permission_name)
          }
        }
      }
      setSelectedPermissions(granted)
    }
  }, [isOpen, editingUser])

  useEffect(() => {
    if (isOpen) {
      // Reset form based on mode
      if (editingUser) {
        setForm({
          full_name: editingUser.full_name || '',
          email: editingUser.email || '',
          phone: editingUser.phone || '',
          department: editingUser.department || '',
          role: editingUser.role || 'staff',
          branch_id: editingUser.branch_id || '',
          is_active: editingUser.is_active,
        })
      } else {
        // For new members: use last selected branch, or current user's branch as fallback.
        // Coerce null → '' to match FormState.branch_id (string); handleSave converts '' back to null for API.
        const defaultBranch = lastBranchIdRef.current ?? currentUser?.branch_id ?? ''
        setForm({ ...INITIAL_FORM, branch_id: defaultBranch })
        // Auto-select billing permissions allowed by the plan
        const autoPerms = new Set<string>()
        if (planInfo?.allowed_billing) {
          for (const perm of planInfo.allowed_billing) autoPerms.add(perm)
        }
        setSelectedPermissions(autoPerms)
      }

      setErrors({})
      setShowPasswordField(false)
      setCustomPassword('')
      setShowPermissions(false)
      setExpandedSections(new Set())
      setBranchDropdownOpen(false)
      setBranchQuery('')
      setPreset(null)
      setPresetApplied(false)
      loadInitialData()
    }
  }, [isOpen, editingUser, loadInitialData])

  // ─── Fetch & auto-apply preset when role changes (create mode only) ──────

  useEffect(() => {
    if (!isOpen || isEditMode) return

    let cancelled = false
    const fetchAndApplyPreset = async () => {
      setPreset(null)
      setPresetApplied(false)
      try {
        const res = await teamService.getPreset(form.role)
        if (cancelled) return
        const data = res.data.data
        if (data) {
          setPreset(data)
          // Auto-apply immediately — no manual "Apply" step needed
          const allowed = (data.permissions as string[]).filter(
            (p) => !restrictedPermissions.has(p)
          )
          setSelectedPermissions(new Set(allowed))
          setPresetApplied(true)
        }
      } catch {
        // Non-critical — silently ignore
      }

      // (Main Branch selection is handled in a separate effect below)
    }
    fetchAndApplyPreset()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.role, isOpen, isEditMode])

  // ─── Auto-select Main Branch when role is owner (create mode) ──

  useEffect(() => {
    if (!isOpen || isEditMode || form.role !== 'owner') return
    const mainBranch = branches.find((b) => b.name.toLowerCase() === 'main branch')
    if (mainBranch) {
      setForm((prev) => ({ ...prev, branch_id: mainBranch.branch_id }))
    }
  }, [form.role, branches, isOpen, isEditMode])

  // ─── Apply preset handler (manual re-apply from UI) ─────────

  const applyPreset = useCallback(() => {
    if (!preset) return
    const presetPerms = new Set(
      (preset.permissions as string[]).filter((p) => !restrictedPermissions.has(p))
    )
    setSelectedPermissions(presetPerms)
    setPresetApplied(true)
    setShowPermissions(true)
  }, [preset, restrictedPermissions])

  // ─── Branch combobox handlers ─────────────────────────────────

  const selectBranch = (branchId: string) => {
    setForm((prev) => ({ ...prev, branch_id: branchId }))
    setBranchDropdownOpen(false)
    setBranchQuery('')
  }

  const handleCreateBranch = async (name: string) => {
    if (creatingBranchRef.current) return
    creatingBranchRef.current = true
    setCreatingBranch(true)
    try {
      const res = await teamService.createBranch({ name })
      const newBranch = res.data.data
      setBranches((prev) => [...prev, newBranch].sort((a, b) => a.name.localeCompare(b.name)))
      setForm((prev) => ({ ...prev, branch_id: newBranch.branch_id }))
      setBranchDropdownOpen(false)
      setBranchQuery('')
    } catch (error: any) {
      onMessage({ type: 'error', text: error.response?.data?.error || 'Failed to create branch' })
    } finally {
      creatingBranchRef.current = false
      setCreatingBranch(false)
    }
  }

  const handleBranchKeyDown = (e: React.KeyboardEvent) => {
    const optionCount = 1 + filteredBranches.length + (showCreateOption ? 1 : 0)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedBranch((prev) => (prev + 1) % optionCount)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedBranch((prev) => (prev - 1 + optionCount) % optionCount)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightedBranch === 0) {
        selectBranch('')
      } else if (highlightedBranch <= filteredBranches.length) {
        selectBranch(filteredBranches[highlightedBranch - 1].branch_id)
      } else if (showCreateOption) {
        handleCreateBranch(trimmedQuery)
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setBranchDropdownOpen(false)
      setBranchQuery('')
    }
  }

  // Close branch dropdown on outside click
  useEffect(() => {
    if (!branchDropdownOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (branchContainerRef.current && !branchContainerRef.current.contains(e.target as Node)) {
        setBranchDropdownOpen(false)
        setBranchQuery('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [branchDropdownOpen])

  // Auto-focus input when branch dropdown opens
  useEffect(() => {
    if (branchDropdownOpen) {
      branchInputRef.current?.focus()
    }
  }, [branchDropdownOpen])

  // Clamp highlighted index when filtered list shrinks
  useEffect(() => {
    const maxIndex = filteredBranches.length + (showCreateOption ? 1 : 0)
    setHighlightedBranch((prev) => Math.min(prev, maxIndex))
  }, [filteredBranches.length, showCreateOption])

  // ─── Validation ────────────────────────────────────────────────

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof FormState, string>> = {}

    if (!form.full_name.trim()) {
      newErrors.full_name = 'Full name is required'
    }
    if (!form.email.trim() || !form.email.includes('@')) {
      newErrors.email = 'Valid email is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // ─── Save ──────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!validate()) return

    try {
      setSaving(true)

      if (isEditMode && editingUser) {
        // Update user profile
        await teamService.update(editingUser.user_id, {
          full_name: form.full_name,
          phone: form.phone || undefined,
          department: form.department || undefined,
          role: form.role,
          is_active: form.is_active,
          branch_id: form.branch_id || null,
        })
        // Update permissions (strip any restricted billing perms)
        const cleanPerms = [...selectedPermissions].filter((p) => !restrictedPermissions.has(p))
        await teamService.updatePermissions(editingUser.user_id, cleanPerms)
        onMessage({ type: 'success', text: `${form.full_name} updated successfully` })
      } else {
        // Create new member — invite email sent, user sets password via link
        await teamService.create({
          email: form.email,
          full_name: form.full_name,
          phone: form.phone || undefined,
          department: form.department || undefined,
          role: form.role,
          branch_id: form.branch_id || null,
          permissions: [...selectedPermissions].filter((p) => !restrictedPermissions.has(p)),
          ...(totpActionToken ? { totp_action_token: totpActionToken } : {}),
        })
        onMessage({
          type: 'success',
          text: `Invite sent to ${form.email}. They will receive an email to set their password.`,
        })
      }

      // Remember the selected branch for subsequent additions
      lastBranchIdRef.current = form.branch_id || null

      onSaved()
      onClose()
    } catch (error: any) {
      const code = error.response?.data?.error
      const field = error.response?.data?.field
      const msg = error.response?.data?.message

      // Show inline field error for duplicates
      if (field === 'email' || field === 'full_name') {
        setErrors((prev) => ({ ...prev, [field]: msg }))
        return
      }

      const friendlyMsg = API_ERROR_MESSAGES[code]
      onMessage({
        type: 'error',
        text: friendlyMsg || msg || code || `Failed to ${isEditMode ? 'update' : 'create'} team member`,
      })
    } finally {
      setSaving(false)
    }
  }

  // ─── Reset Password ───────────────────────────────────────────

  const handleResetPassword = async () => {
    if (!editingUser) return

    try {
      setResettingPassword(true)
      const res = await teamService.resetPassword(editingUser.user_id)
      const tempPassword = res.data?.temporary_password || res.data?.data?.temporary_password
      if (tempPassword) {
        onMessage({
          type: 'success',
          text: `Temporary password for ${editingUser.full_name || editingUser.email}: ${tempPassword}`,
        })
      } else {
        onMessage({ type: 'success', text: 'Password has been reset. The user will receive instructions.' })
      }
    } catch (error: any) {
      onMessage({ type: 'error', text: error.response?.data?.error || 'Failed to reset password' })
    } finally {
      setResettingPassword(false)
    }
  }

  const handleSendCustomPassword = async () => {
    if (!editingUser || customPassword.length < 6) {
      onMessage({ type: 'error', text: 'Password must be at least 6 characters' })
      return
    }

    try {
      setResettingPassword(true)
      await teamService.resetPassword(editingUser.user_id, customPassword)
      onMessage({ type: 'success', text: `Password updated for ${editingUser.full_name || editingUser.email}` })
      setCustomPassword('')
      setShowPasswordField(false)
    } catch (error: any) {
      onMessage({ type: 'error', text: error.response?.data?.error || 'Failed to set password' })
    } finally {
      setResettingPassword(false)
    }
  }

  // ─── Permission toggles ───────────────────────────────────────

  const togglePermission = (permName: string) => {
    if (restrictedPermissions.has(permName)) return
    setSelectedPermissions((prev) => {
      const next = new Set(prev)
      if (next.has(permName)) {
        next.delete(permName)
      } else {
        next.add(permName)
      }
      return next
    })
  }

  const toggleSectionAll = (section: PermissionSection) => {
    const toggleable = section.permissions
      .map((p) => p.permission_name)
      .filter((name) => !restrictedPermissions.has(name))
    const allSelected = toggleable.length > 0 && toggleable.every((name) => selectedPermissions.has(name))

    setSelectedPermissions((prev) => {
      const next = new Set(prev)
      for (const name of toggleable) {
        if (allSelected) {
          next.delete(name)
        } else {
          next.add(name)
        }
      }
      return next
    })
  }

  const toggleSectionExpand = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(sectionId)) {
        next.delete(sectionId)
      } else {
        next.add(sectionId)
      }
      return next
    })
  }

  // ─── Don't render if closed ────────────────────────────────────

  if (!isOpen) return null

  // ─── Render ────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Panel — full screen on mobile, max-w-lg on larger */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-modal-title"
        className="relative w-full sm:max-w-lg bg-white dark:bg-gray-800 h-auto sm:h-full max-h-[90vh] sm:max-h-none rounded-t-2xl sm:rounded-none overflow-hidden flex flex-col shadow-xl"
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      >
        {/* Mobile drag handle */}
        <div className="flex justify-center pt-2 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h2 id="team-modal-title" className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
            {isEditMode ? 'Edit Team Member' : 'Add Team Member'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5 space-y-4 sm:space-y-5" style={{ scrollbarWidth: 'thin' }}>
          {/* Full Name */}
          <div>
            <label className={LABEL_CLASS}>
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.full_name}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, full_name: e.target.value }))
                if (errors.full_name) setErrors((prev) => ({ ...prev, full_name: undefined }))
              }}
              className={`${INPUT_CLASS} ${errors.full_name ? 'border-red-500 focus:ring-red-500' : ''}`}
              placeholder="Enter full name"
            />
            {errors.full_name && (
              <p className="text-xs text-red-500 mt-1">{errors.full_name}</p>
            )}
          </div>

          {/* Email */}
          <div>
            <label className={LABEL_CLASS}>
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, email: e.target.value }))
                if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }))
              }}
              disabled={isEditMode}
              className={`${INPUT_CLASS} ${isEditMode ? 'opacity-60 cursor-not-allowed' : ''} ${errors.email ? 'border-red-500 focus:ring-red-500' : ''}`}
              placeholder="user@example.com"
            />
            {errors.email && (
              <p className="text-xs text-red-500 mt-1">{errors.email}</p>
            )}
          </div>

          {/* Password — create mode: invite info banner; edit mode: reset button */}
          {!isEditMode ? (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-3">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                An invite email will be sent to the address above. The team member will set their own password when they accept the invite.
              </p>
            </div>
          ) : (
            <div>
              <label className={LABEL_CLASS}>Password</label>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    disabled={resettingPassword}
                    className="flex items-center gap-2 px-3 py-2 text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {resettingPassword ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Key className="w-4 h-4" />
                    )}
                    Reset Password
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPasswordField(!showPasswordField)}
                    className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline underline-offset-2"
                  >
                    {showPasswordField ? 'Hide' : 'Set specific password'}
                  </button>
                </div>

                {showPasswordField && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customPassword}
                      onChange={(e) => setCustomPassword(e.target.value)}
                      className={`flex-1 ${INPUT_CLASS}`}
                      placeholder="New password (min 6 characters)"
                    />
                    <button
                      type="button"
                      onClick={handleSendCustomPassword}
                      disabled={resettingPassword || customPassword.length < 6}
                      className="px-3 py-2 text-sm font-medium text-white bg-gray-900 dark:bg-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {resettingPassword ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'Set'
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Phone */}
          <div>
            <label className={LABEL_CLASS}>Phone</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              className={INPUT_CLASS}
              placeholder="Phone number (optional)"
            />
          </div>

          {/* Department */}
          <div>
            <label className={LABEL_CLASS}>Department</label>
            <input
              type="text"
              value={form.department}
              onChange={(e) => setForm((prev) => ({ ...prev, department: e.target.value }))}
              className={INPUT_CLASS}
              placeholder="e.g. Sales, Inventory, Billing"
            />
          </div>

          {/* Role & Branch row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Role */}
            <div>
              <label className={LABEL_CLASS}>Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
                className={`${INPUT_CLASS} appearance-none cursor-pointer`}
              >
                {availableRoles.map((role) => {
                  const quotaInfo = getRoleQuotaInfo(role)
                  const atLimit = isRoleAtQuota(role)
                  const label = role.charAt(0).toUpperCase() + role.slice(1)
                  const suffix = quotaInfo
                    ? ` (${quotaInfo.used}/${quotaInfo.quota}${atLimit ? ' — full' : ''})`
                    : ''
                  return (
                    <option key={role} value={role} disabled={atLimit && !isEditMode}>
                      {label}{suffix}
                    </option>
                  )
                })}
              </select>
              {/* Warn if currently selected role is at its quota */}
              {!isEditMode && isRoleAtQuota(form.role) && (() => {
                const info = getRoleQuotaInfo(form.role)
                return (
                  <p className="mt-1 text-xs text-red-600">
                    {form.role.charAt(0).toUpperCase() + form.role.slice(1)} quota reached ({info?.used}/{info?.quota}). Select a different role or contact support.
                  </p>
                )
              })()}
            </div>

            {/* Branch — creatable combobox */}
            <div ref={branchContainerRef} className="relative">
              <label className={LABEL_CLASS} id="branch-label">Branch</label>
              {branchDropdownOpen ? (
                <input
                  ref={branchInputRef}
                  type="text"
                  role="combobox"
                  aria-expanded={true}
                  aria-controls="branch-listbox"
                  aria-activedescendant={`branch-option-${highlightedBranch}`}
                  aria-autocomplete="list"
                  aria-haspopup="listbox"
                  aria-labelledby="branch-label"
                  value={branchQuery}
                  onChange={(e) => {
                    setBranchQuery(e.target.value)
                    setHighlightedBranch(0)
                  }}
                  onKeyDown={handleBranchKeyDown}
                  placeholder="Search or create branch..."
                  className={INPUT_CLASS}
                />
              ) : (
                <div
                  role="combobox"
                  tabIndex={0}
                  aria-expanded={false}
                  aria-haspopup="listbox"
                  aria-labelledby="branch-label"
                  onClick={() => {
                    if (!loadingBranches && !creatingBranch) {
                      setBranchDropdownOpen(true)
                      setBranchQuery('')
                      setHighlightedBranch(0)
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      if (!loadingBranches && !creatingBranch) {
                        setBranchDropdownOpen(true)
                        setBranchQuery('')
                        setHighlightedBranch(0)
                      }
                    }
                  }}
                  className={`${INPUT_CLASS} cursor-pointer flex items-center justify-between`}
                >
                  <span className={form.branch_id ? '' : 'text-gray-500 dark:text-gray-400'}>
                    {loadingBranches ? 'Loading...' : selectedBranchDisplay}
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                </div>
              )}

              {/* Dropdown */}
              {branchDropdownOpen && (
                <div
                  id="branch-listbox"
                  role="listbox"
                  aria-label="Branches"
                  className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto"
                >
                  {/* All Branches */}
                  <div
                    id="branch-option-0"
                    role="option"
                    aria-selected={!form.branch_id}
                    onClick={() => selectBranch('')}
                    className={`px-3 py-2 cursor-pointer text-sm ${
                      highlightedBranch === 0
                        ? 'bg-gray-100 dark:bg-gray-700'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    } text-gray-500 dark:text-gray-400`}
                  >
                    All Branches
                  </div>

                  {/* Existing branches */}
                  {filteredBranches.map((b, index) => (
                    <div
                      id={`branch-option-${index + 1}`}
                      key={b.branch_id}
                      role="option"
                      aria-selected={form.branch_id === b.branch_id}
                      onClick={() => selectBranch(b.branch_id)}
                      className={`px-3 py-2 cursor-pointer text-sm ${
                        highlightedBranch === index + 1
                          ? 'bg-gray-100 dark:bg-gray-700'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      } text-gray-900 dark:text-white`}
                    >
                      {b.name}
                      {b.location && (
                        <span className="text-gray-400 dark:text-gray-500 ml-1">— {b.location}</span>
                      )}
                    </div>
                  ))}

                  {/* No results */}
                  {filteredBranches.length === 0 && trimmedQuery && !showCreateOption && (
                    <div className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">
                      No branches found
                    </div>
                  )}

                  {/* Create new branch */}
                  {showCreateOption && (
                    <div
                      id={`branch-option-${1 + filteredBranches.length}`}
                      role="option"
                      aria-selected={false}
                      onClick={() => handleCreateBranch(trimmedQuery)}
                      className={`px-3 py-2 cursor-pointer text-sm border-t border-gray-200 dark:border-gray-700 flex items-center gap-2 ${
                        highlightedBranch === 1 + filteredBranches.length
                          ? 'bg-gray-100 dark:bg-gray-700'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      } text-gray-700 dark:text-gray-300`}
                    >
                      {creatingBranch ? (
                        <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                      ) : (
                        <Plus className="w-4 h-4 flex-shrink-0" />
                      )}
                      <span>
                        Create &ldquo;<span className="font-medium">{trimmedQuery}</span>&rdquo;
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Active Toggle */}
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Active Status</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Inactive users cannot log in
              </p>
            </div>
            <button
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, is_active: !prev.is_active }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${
                form.is_active
                  ? 'bg-green-500'
                  : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  form.is_active ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200 dark:border-gray-700" />

          {/* Permissions Section */}
          <div>
            <button
              type="button"
              onClick={() => setShowPermissions(!showPermissions)}
              className="flex items-center justify-between w-full text-left"
            >
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Permissions</h3>
              {showPermissions ? (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-400" />
              )}
            </button>

            {/* Auto-applied permissions notice — create mode only */}
            {!isEditMode && presetApplied && (
              <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <Sparkles className="w-4 h-4 text-green-500 flex-shrink-0" />
                <p className="text-xs text-green-700 dark:text-green-300 flex-1">
                  Default <strong className="capitalize">{form.role}</strong> permissions applied. You can customize below.
                </p>
              </div>
            )}

            {showPermissions && (
              <div className="mt-3 space-y-2">
                {loadingPermissions ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                  </div>
                ) : allPermissions.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
                    No permissions configured
                  </p>
                ) : (
                  allPermissions.map((section) => {
                    const isExpanded = expandedSections.has(section.section_id)
                    const allNames = section.permissions.map((p) => p.permission_name)
                    const toggleableNames = allNames.filter((n) => !restrictedPermissions.has(n))
                    const allSelected = toggleableNames.length > 0 && toggleableNames.every((n) => selectedPermissions.has(n))
                    const someSelected = toggleableNames.some((n) => selectedPermissions.has(n))

                    return (
                      <div
                        key={section.section_id}
                        className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                      >
                        {/* Section Header */}
                        <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-700/50">
                          <button
                            type="button"
                            onClick={() => toggleSectionExpand(section.section_id)}
                            className="flex-1 flex items-center gap-2 text-left"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            )}
                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                              {section.section_name}
                            </span>
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                              ({allNames.filter((n) => selectedPermissions.has(n)).length}/{allNames.length})
                            </span>
                          </button>

                          {/* Select All */}
                          <button
                            type="button"
                            onClick={() => toggleSectionAll(section)}
                            className={`flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded transition-colors ${
                              allSelected
                                ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                                : someSelected
                                  ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20'
                                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'
                            }`}
                          >
                            {allSelected && <Check className="w-3 h-3" />}
                            {allSelected ? 'All' : 'Select All'}
                          </button>
                        </div>

                        {/* Section Body */}
                        {isExpanded && (
                          <div className="px-4 py-2 space-y-1">
                            {section.permissions.map((perm) => {
                              const isChecked = selectedPermissions.has(perm.permission_name)
                              const isRestricted = restrictedPermissions.has(perm.permission_name)
                              return (
                                <label
                                  key={perm.permission_id}
                                  className={`flex items-start gap-3 py-2 group ${
                                    isRestricted ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                                  }`}
                                >
                                  <div className="flex-shrink-0 mt-0.5">
                                    <div
                                      className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                                        isRestricted
                                          ? 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700'
                                          : isChecked
                                            ? 'bg-gray-900 dark:bg-white border-gray-900 dark:border-white'
                                            : 'border-gray-300 dark:border-gray-500 group-hover:border-gray-400 dark:group-hover:border-gray-400'
                                      }`}
                                    >
                                      {isRestricted ? (
                                        <Lock className="w-2.5 h-2.5 text-gray-400 dark:text-gray-500" />
                                      ) : isChecked ? (
                                        <Check className="w-3 h-3 text-white dark:text-gray-900" />
                                      ) : null}
                                    </div>
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => togglePermission(perm.permission_name)}
                                      disabled={isRestricted}
                                      className="sr-only"
                                    />
                                  </div>
                                  <div>
                                    <p className={`text-sm ${isRestricted ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>
                                      {perm.permission_name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                                    </p>
                                    {isRestricted ? (
                                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                                        Available on Enterprise plan
                                      </p>
                                    ) : perm.description ? (
                                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                        {perm.description}
                                      </p>
                                    ) : null}
                                  </div>
                                </label>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 sm:gap-3 px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3 sm:px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium text-white bg-gray-900 dark:bg-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isEditMode ? 'Save Changes' : 'Create Member'}
          </button>
        </div>
      </div>
    </div>
  )
}
