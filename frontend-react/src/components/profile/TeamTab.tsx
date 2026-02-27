import { useState, useEffect, useCallback, useRef } from 'react'
import { useClient } from '@/contexts/ClientContext'
import teamService, { type TeamMember, type PlanInfo } from '@/services/teamService'
import TeamMemberModal from '@/components/profile/TeamMemberModal'
import {
  Search,
  Plus,
  Edit3,
  Power,
  Trash2,
  Users,
  Loader2,
  Filter,
  Info,
  Crown,
} from 'lucide-react'

// ─── Props ──────────────────────────────────────────────────────────

interface TeamTabProps {
  onMessage: (msg: { type: 'success' | 'error'; text: string }) => void
}

// ─── Constants ──────────────────────────────────────────────────────

const PER_PAGE = 20

const ROLE_BADGE_CLASSES: Record<string, string> = {
  owner: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  admin: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  manager: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  staff: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  cashier: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
}

const ROLE_OPTIONS = ['', 'owner', 'admin', 'manager', 'staff', 'cashier']

// ─── Helpers ────────────────────────────────────────────────────────

function timeAgo(dateString: string | null): string {
  if (!dateString) return 'Never'
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`
  return new Date(dateString).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function getRoleBadgeClass(role: string): string {
  return ROLE_BADGE_CLASSES[role] || ROLE_BADGE_CLASSES.staff
}

// ─── Component ──────────────────────────────────────────────────────

export default function TeamTab({ onMessage }: TeamTabProps) {
  const { user } = useClient()

  // Data state
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)

  // Filter state
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')

  // Plan info
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null)

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState<TeamMember | null>(null)

  // Delete confirmation state
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Toggle status loading
  const [togglingStatus, setTogglingStatus] = useState<string | null>(null)

  // Debounce ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Skip first debounced search to avoid duplicate with page/filter effect
  const isInitialMount = useRef(true)

  // ─── Fetch members ─────────────────────────────────────────────

  const fetchMembers = useCallback(async (p: number, s: string, r: string) => {
    try {
      setLoading(true)
      const response = await teamService.list({
        page: p,
        search: s || undefined,
        role: r || undefined,
      })
      setMembers(response.data.data)
      setTotal(response.data.total)
    } catch (error: any) {
      onMessage({ type: 'error', text: error.response?.data?.error || 'Failed to load team members' })
    } finally {
      setLoading(false)
    }
  }, [onMessage])

  const fetchPlanInfo = useCallback(async () => {
    try {
      const res = await teamService.getPlanInfo()
      setPlanInfo(res.data.data)
    } catch {
      // Non-critical — UI still works without plan info
    }
  }, [])

  // Fetch plan info once on mount (refreshed explicitly after add/delete)
  useEffect(() => {
    fetchPlanInfo()
  }, [fetchPlanInfo])

  // Fetch members on page/filter changes
  useEffect(() => {
    fetchMembers(page, search, roleFilter)
  }, [page, roleFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search — skip on initial mount to avoid duplicate fetch with page/filter effect above
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setPage(1)
      fetchMembers(1, search, roleFilter)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Actions ───────────────────────────────────────────────────

  const handleToggleStatus = async (member: TeamMember) => {
    try {
      setTogglingStatus(member.user_id)
      const res = await teamService.toggleStatus(member.user_id)
      const newActive = res.data?.data?.is_active ?? !member.is_active
      // Optimistic local update — avoids a full list refetch
      setMembers((prev) =>
        prev.map((m) => m.user_id === member.user_id ? { ...m, is_active: newActive } : m)
      )
      onMessage({
        type: 'success',
        text: `${member.full_name || member.email} has been ${newActive ? 'activated' : 'deactivated'}`,
      })
    } catch (error: any) {
      onMessage({ type: 'error', text: error.response?.data?.error || 'Failed to toggle status' })
    } finally {
      setTogglingStatus(null)
    }
  }

  const handleDelete = async (userId: string) => {
    try {
      setDeleting(true)
      await teamService.delete(userId)
      onMessage({ type: 'success', text: 'Team member removed successfully' })
      setConfirmDelete(null)
      fetchPlanInfo()
      // If we deleted the last item on this page, go back a page
      if (members.length === 1 && page > 1) {
        setPage(page - 1)
      } else {
        fetchMembers(page, search, roleFilter)
      }
    } catch (error: any) {
      onMessage({ type: 'error', text: error.response?.data?.error || 'Failed to remove team member' })
    } finally {
      setDeleting(false)
    }
  }

  const handleEdit = (member: TeamMember) => {
    setEditingUser(member)
    setShowModal(true)
  }

  const handleAddNew = () => {
    setEditingUser(null)
    setShowModal(true)
  }

  const handleModalSaved = () => {
    fetchMembers(page, search, roleFilter)
    fetchPlanInfo()
  }

  const handleRoleFilterChange = (value: string) => {
    setRoleFilter(value)
    setPage(1)
  }

  // ─── Pagination ────────────────────────────────────────────────

  const totalPages = Math.ceil(total / PER_PAGE)

  // ─── Check if current user can manage a member ────────────────

  const canManageMember = (member: TeamMember): boolean => {
    if (!user) return false
    // Cannot manage yourself
    if (member.user_id === user.user_id) return false
    // Owner can manage anyone
    if (user.role === 'owner') return true
    // Admin can manage manager, staff, cashier
    if (user.role === 'admin') return ['manager', 'staff', 'cashier'].includes(member.role)
    return false
  }

  // ─── Render ────────────────────────────────────────────────────

  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Users className="w-5 h-5 flex-shrink-0" /> Team Members
              </h3>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1">
                {total} member{total !== 1 ? 's' : ''} total
              </p>
            </div>
            {planInfo && !planInfo.can_add_member ? (
              <div className="relative group flex-shrink-0">
                <button
                  type="button"
                  disabled
                  className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 rounded-lg cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                  <span className="xs:hidden">Add</span>
                  <span className="hidden xs:inline">Add Team Member</span>
                </button>
                <div className="absolute right-0 top-full mt-2 w-56 px-3 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  {planInfo.max_members === 0
                    ? 'Upgrade to Professional to add team members'
                    : `Limit reached (${planInfo.current_members}/${planInfo.max_members}). Upgrade to add more.`}
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleAddNew}
                className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white bg-gray-900 dark:bg-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span className="xs:hidden">Add</span>
                <span className="hidden xs:inline">Add Team Member</span>
              </button>
            )}
          </div>

          {/* Plan info bar */}
          {planInfo && (
            <div className="flex items-center gap-2 mt-3 px-3 py-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-xs text-gray-600 dark:text-gray-400">
              <Info className="w-3.5 h-3.5 flex-shrink-0" />
              <span>
                Team members: {planInfo.current_members}/{planInfo.max_members}
                {planInfo.plan_name && ` (${planInfo.is_trial ? 'Trial' : planInfo.plan_name} plan)`}
              </span>
              {planInfo.slots_remaining === 0 && !planInfo.is_trial && (
                <span className="ml-auto flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                  <Crown className="w-3 h-3" /> Upgrade plan
                </span>
              )}
            </div>
          )}

          {/* Search & Filter */}
          <div className="flex gap-2 sm:gap-3 mt-3 sm:mt-4">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or email..."
                className="w-full pl-9 sm:pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-transparent text-sm"
              />
            </div>
            <div className="relative flex-shrink-0">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select
                value={roleFilter}
                onChange={(e) => handleRoleFilterChange(e.target.value)}
                className="w-full pl-9 sm:pl-10 pr-6 sm:pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-transparent text-sm appearance-none cursor-pointer"
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {role ? role.charAt(0).toUpperCase() + role.slice(1) : 'All Roles'}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-10 sm:py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : members.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-10 sm:py-16 px-4 sm:px-6">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-3 sm:mb-4">
              <Users className="w-7 h-7 sm:w-8 sm:h-8 text-gray-400" />
            </div>
            <h4 className="text-base sm:text-lg font-medium text-gray-900 dark:text-white mb-1">
              {search || roleFilter ? 'No results found' : 'No team members yet'}
            </h4>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 text-center mb-4 sm:mb-6">
              {search || roleFilter
                ? 'Try adjusting your search or filter.'
                : 'Add your first team member to get started.'}
            </p>
            {!search && !roleFilter && (
              <button
                type="button"
                onClick={handleAddNew}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-900 dark:bg-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" /> Add Team Member
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Name / Email
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Branch
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Last Login
                    </th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {members.map((member) => (
                    <tr
                      key={member.user_id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      {/* Name / Email */}
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {member.full_name || 'Unnamed'}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{member.email}</p>
                        </div>
                      </td>
                      {/* Role */}
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full capitalize ${getRoleBadgeClass(member.role)}`}>
                          {member.role}
                        </span>
                      </td>
                      {/* Branch */}
                      <td className="px-6 py-4">
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          {member.branch_name || 'All Branches'}
                        </p>
                      </td>
                      {/* Status */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${member.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            {member.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </td>
                      {/* Last Login */}
                      <td className="px-6 py-4">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {timeAgo(member.last_login)}
                        </p>
                      </td>
                      {/* Actions */}
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1">
                          {canManageMember(member) ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleEdit(member)}
                                title="Edit"
                                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleStatus(member)}
                                disabled={togglingStatus === member.user_id}
                                title={member.is_active ? 'Deactivate' : 'Activate'}
                                className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${
                                  member.is_active
                                    ? 'text-amber-500 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                                    : 'text-green-500 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20'
                                }`}
                              >
                                {togglingStatus === member.user_id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Power className="w-4 h-4" />
                                )}
                              </button>

                              {confirmDelete === member.user_id ? (
                                <div className="flex items-center gap-1 ml-1">
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(member.user_id)}
                                    disabled={deleting}
                                    className="px-2 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors disabled:opacity-50"
                                  >
                                    {deleting ? 'Removing...' : 'Confirm'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDelete(null)}
                                    className="px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDelete(member.user_id)}
                                  title="Delete"
                                  className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-gray-400 dark:text-gray-500 px-2">
                              {member.user_id === user?.user_id ? 'You' : '—'}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card Layout */}
            <div className="md:hidden divide-y divide-gray-200 dark:divide-gray-700">
              {members.map((member) => (
                <div key={member.user_id} className="p-3 sm:p-4">
                  <div className="flex items-start justify-between gap-2 sm:gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {member.full_name || 'Unnamed'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{member.email}</p>
                      <div className="flex items-center gap-1.5 sm:gap-2 mt-1.5 sm:mt-2 flex-wrap">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full capitalize ${getRoleBadgeClass(member.role)}`}>
                          {member.role}
                        </span>
                        <div className="flex items-center gap-1">
                          <span className={`w-1.5 h-1.5 rounded-full ${member.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {member.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        {member.branch_name && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {member.branch_name}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        Last login: {timeAgo(member.last_login)}
                      </p>
                    </div>

                    {canManageMember(member) ? (
                      <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => handleEdit(member)}
                          className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(member)}
                          disabled={togglingStatus === member.user_id}
                          className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${
                            member.is_active
                              ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                              : 'text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20'
                          }`}
                        >
                          {togglingStatus === member.user_id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Power className="w-4 h-4" />
                          )}
                        </button>

                        {confirmDelete === member.user_id ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleDelete(member.user_id)}
                              disabled={deleting}
                              className="px-2 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors disabled:opacity-50"
                            >
                              {deleting ? '...' : 'Yes'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(null)}
                              className="px-2 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(member.user_id)}
                            className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500 px-2 flex-shrink-0 pt-1">
                        {member.user_id === user?.user_id ? 'You' : ''}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {total > PER_PAGE && (
              <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setPage(page - 1)}
                  disabled={page <= 1}
                  className="px-3 py-2 sm:py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Prev
                </button>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(page + 1)}
                  disabled={page >= totalPages}
                  className="px-3 py-2 sm:py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal */}
      <TeamMemberModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSaved={handleModalSaved}
        editingUser={editingUser}
        onMessage={onMessage}
        planInfo={planInfo}
      />
    </>
  )
}
