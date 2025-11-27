'use client'

import { useState, useEffect } from 'react'
import { usePermissions } from '@/hooks/usePermissions'
import DashboardLayout from '@/components/DashboardLayout'
import { TableSkeleton } from '@/components/SkeletonLoader'
import api from '@/lib/api'
import {
  Shield, User, Check, Save, RefreshCw, AlertCircle, Search,
  ChevronDown, ChevronRight, CheckSquare, Square,
  Users, Package, FileText, TrendingUp, CreditCard, UserCog,
  Settings, PlusSquare, Crown
} from 'lucide-react'

// Icon mapping for sections
const SECTION_ICONS: Record<string, any> = {
  'Create Bill': PlusSquare,
  'Manage Bills': FileText,
  'Customer Management': Users,
  'Stock Management': Package,
  'Reports & Analytics': TrendingUp,
  'Payment Types': CreditCard,
  'User Management': UserCog,
  'System Settings': Settings,
  'Audit & Logs': Search,
  'System Administration': Shield,
  'Bulk Orders': Package,
  'Notes': FileText,
}

interface Permission {
  permission_id: string
  permission_name: string
  description: string
  section_id: string | null
  section_name: string | null
  display_order: number
}

interface PermissionSection {
  section_id: string
  section_name: string
  description: string
  display_order: number
  icon: string
  permissions: Permission[]
}

interface UserWithPermissions {
  user_id: string
  email: string
  full_name?: string
  role: string
  is_super_admin: boolean
  is_active: boolean
  permissions: string[]
  permission_count?: number
  created_at: string
  last_login: string | null
}

export default function PermissionsPage() {
  const { isSuperAdmin } = usePermissions()
  const [users, setUsers] = useState<UserWithPermissions[]>([])
  const [sections, setSections] = useState<PermissionSection[]>([])
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [userPermissions, setUserPermissions] = useState<Record<string, boolean>>({})
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [userSearchTerm, setUserSearchTerm] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      // Fetch all users and permissions (sections)
      const [usersResponse, permissionsResponse] = await Promise.all([
        api.get('/permissions/users'),
        api.get('/permissions/all')
      ])

      setUsers(usersResponse.data.users)
      setSections(permissionsResponse.data.sections || [])

      // Expand all sections by default
      const expandAll: Record<string, boolean> = {}
      permissionsResponse.data.sections?.forEach((section: PermissionSection) => {
        expandAll[section.section_id] = true
      })
      setExpandedSections(expandAll)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const selectUser = (userId: string) => {
    const user = users.find(u => u.user_id === userId)
    if (!user) return

    setSelectedUser(userId)

    // Initialize permission checkboxes
    const permissionMap: Record<string, boolean> = {}
    sections.forEach(section => {
      section.permissions.forEach(perm => {
        permissionMap[perm.permission_name] = user.permissions.includes(perm.permission_name)
      })
    })
    setUserPermissions(permissionMap)
  }

  const togglePermission = (permissionName: string) => {
    setUserPermissions(prev => ({
      ...prev,
      [permissionName]: !prev[permissionName]
    }))
  }

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }))
  }

  const selectAllInSection = (section: PermissionSection) => {
    const allSelected = section.permissions.every(p => userPermissions[p.permission_name])
    const newPermissions = { ...userPermissions }

    section.permissions.forEach(perm => {
      newPermissions[perm.permission_name] = !allSelected
    })

    setUserPermissions(newPermissions)
  }

  const savePermissions = async () => {
    if (!selectedUser) return

    setSaving(true)
    setError(null)
    setSuccessMessage(null)

    try {
      // Get list of enabled permissions
      const enabledPermissions = Object.keys(userPermissions).filter(p => userPermissions[p])

      await api.post('/permissions/bulk-update', {
        user_id: selectedUser,
        permissions: enabledPermissions
      })

      setSuccessMessage('Permissions updated successfully')

      // Refresh user data
      await fetchData()

      // Re-select user to refresh their permission state
      if (selectedUser) {
        selectUser(selectedUser)
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save permissions')
    } finally {
      setSaving(false)
    }
  }

  const getSelectedPermissionCount = () => {
    return Object.values(userPermissions).filter(Boolean).length
  }

  const getTotalPermissionCount = () => {
    return sections.reduce((sum, section) => sum + section.permissions.length, 0)
  }

  const getSectionPermissionCounts = (section: PermissionSection) => {
    const total = section.permissions.length
    const selected = section.permissions.filter(p => userPermissions[p.permission_name]).length
    return { total, selected }
  }

  const selectAllPermissions = () => {
    const allPerms: Record<string, boolean> = {}
    sections.forEach(section => {
      section.permissions.forEach(perm => {
        allPerms[perm.permission_name] = true
      })
    })
    setUserPermissions(allPerms)
  }

  const deselectAllPermissions = () => {
    const allPerms: Record<string, boolean> = {}
    sections.forEach(section => {
      section.permissions.forEach(perm => {
        allPerms[perm.permission_name] = false
      })
    })
    setUserPermissions(allPerms)
  }

  const filteredSections = sections.map(section => ({
    ...section,
    permissions: section.permissions.filter(p =>
      p.permission_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.description.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })).filter(section =>
    searchTerm === '' || section.permissions.length > 0
  )

  const filteredUsers = users.filter(u =>
    u.email.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
    u.role.toLowerCase().includes(userSearchTerm.toLowerCase())
  )

  if (!isSuperAdmin()) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Shield className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Access Denied</h3>
            <p className="text-gray-500">Only super administrators can manage permissions</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Shield className="h-7 w-7 text-indigo-600" />
              Permission Management
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage user permissions and access control
            </p>
          </div>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        )}

        {successMessage && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
            <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-green-800">Success</h3>
              <p className="text-sm text-green-700 mt-1">{successMessage}</p>
            </div>
          </div>
        )}

        {loading ? (
          <TableSkeleton />
        ) : (
          <div className="grid grid-cols-12 gap-6">
            {/* User List Panel - Left Side */}
            <div className="col-span-12 lg:col-span-4 bg-white rounded-lg shadow">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Users</h2>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={userSearchTerm}
                    onChange={(e) => setUserSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>
              <div className="overflow-y-auto max-h-[calc(100vh-300px)]">
                {filteredUsers.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <User className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No users found</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {filteredUsers.map(user => (
                      <button
                        key={user.user_id}
                        onClick={() => selectUser(user.user_id)}
                        className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${
                          selectedUser === user.user_id ? 'bg-indigo-50 border-l-4 border-indigo-600' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                              user.is_super_admin ? 'bg-purple-100' : 'bg-gray-100'
                            }`}>
                              {user.is_super_admin ? (
                                <Shield className="h-5 w-5 text-purple-600" />
                              ) : (
                                <User className="h-5 w-5 text-gray-600" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {user.full_name || user.email.split('@')[0]}
                              </p>
                              <p className="text-xs text-gray-500 truncate">
                                {user.email}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                  user.is_super_admin
                                    ? 'bg-purple-100 text-purple-800'
                                    : 'bg-blue-100 text-blue-800'
                                }`}>
                                  {user.role}
                                </span>
                                {!user.is_active && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                                    Inactive
                                  </span>
                                )}
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                  user.is_super_admin
                                    ? 'bg-purple-100 text-purple-800'
                                    : 'bg-green-100 text-green-800'
                                }`}>
                                  {user.is_super_admin
                                    ? 'All perms'
                                    : `${user.permission_count || user.permissions.length} perms`}
                                </span>
                              </div>
                            </div>
                          </div>
                          {selectedUser === user.user_id && (
                            <Check className="h-5 w-5 text-indigo-600 flex-shrink-0" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Permission Editor Panel - Right Side */}
            <div className="col-span-12 lg:col-span-8 bg-white rounded-lg shadow">
              {selectedUser ? (
                <>
                  <div className="p-4 border-b border-gray-200">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-lg font-semibold text-gray-900">
                        Edit Permissions
                      </h2>
                      <div className="text-sm text-gray-600">
                        {getSelectedPermissionCount()} of {getTotalPermissionCount()} permissions enabled
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search permissions..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                      </div>
                      {!users.find(u => u.user_id === selectedUser)?.is_super_admin && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={selectAllPermissions}
                            className="flex items-center gap-1 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                          >
                            <CheckSquare className="h-4 w-4" />
                            All
                          </button>
                          <button
                            onClick={deselectAllPermissions}
                            className="flex items-center gap-1 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                          >
                            <Square className="h-4 w-4" />
                            None
                          </button>
                        </div>
                      )}
                      <button
                        onClick={savePermissions}
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {saving ? (
                          <>
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4" />
                            Save Changes
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="overflow-y-auto max-h-[calc(100vh-300px)] p-4">
                    {users.find(u => u.user_id === selectedUser)?.is_super_admin ? (
                      <div className="text-center py-12">
                        <div className="relative inline-block mb-4">
                          <Shield className="h-20 w-20 text-purple-600" />
                          <Crown className="h-8 w-8 text-yellow-500 absolute -top-2 -right-2" />
                        </div>
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">Super Administrator</h3>
                        <p className="text-gray-500 mb-4">
                          Super administrators have all permissions by default and cannot be modified.
                        </p>
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-50 rounded-full">
                          <Check className="h-5 w-5 text-purple-600" />
                          <span className="text-purple-800 font-medium">
                            {getTotalPermissionCount()} permissions granted
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {filteredSections.length === 0 ? (
                          <div className="text-center py-12">
                            <Search className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                            <p className="text-gray-500">No permissions found matching your search</p>
                          </div>
                        ) : (
                          filteredSections.map(section => {
                            const { total, selected } = getSectionPermissionCounts(section)
                            const isExpanded = expandedSections[section.section_id]
                            const IconComponent = SECTION_ICONS[section.section_name] || Shield
                            const allSelected = selected === total

                            return (
                              <div key={section.section_id} className="border border-gray-200 rounded-lg overflow-hidden">
                                {/* Section Header */}
                                <div className="bg-gray-50 p-4">
                                  <div className="flex items-center justify-between">
                                    <button
                                      onClick={() => toggleSection(section.section_id)}
                                      className="flex items-center gap-3 flex-1 text-left hover:text-indigo-600 transition-colors"
                                    >
                                      {isExpanded ? (
                                        <ChevronDown className="h-5 w-5 text-gray-500 flex-shrink-0" />
                                      ) : (
                                        <ChevronRight className="h-5 w-5 text-gray-500 flex-shrink-0" />
                                      )}
                                      <IconComponent className="h-5 w-5 text-indigo-600 flex-shrink-0" />
                                      <div className="flex-1">
                                        <h3 className="text-base font-semibold text-gray-900">
                                          {section.section_name}
                                        </h3>
                                        {section.description && (
                                          <p className="text-xs text-gray-500 mt-0.5">
                                            {section.description}
                                          </p>
                                        )}
                                      </div>
                                    </button>
                                    <div className="flex items-center gap-3">
                                      <span className="text-sm text-gray-600">
                                        {selected}/{total}
                                      </span>
                                      <button
                                        onClick={() => selectAllInSection(section)}
                                        className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-white transition-colors"
                                      >
                                        {allSelected ? (
                                          <>
                                            <CheckSquare className="h-4 w-4" />
                                            Deselect All
                                          </>
                                        ) : (
                                          <>
                                            <Square className="h-4 w-4" />
                                            Select All
                                          </>
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                </div>

                                {/* Permission List */}
                                {isExpanded && (
                                  <div className="divide-y divide-gray-100">
                                    {section.permissions.map(permission => (
                                      <label
                                        key={permission.permission_id}
                                        className="flex items-start gap-3 p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={userPermissions[permission.permission_name] || false}
                                          onChange={() => togglePermission(permission.permission_name)}
                                          className="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                        />
                                        <div className="flex-1">
                                          <div className="text-sm font-medium text-gray-900">
                                            {permission.description}
                                          </div>
                                          <div className="text-xs text-gray-500 mt-0.5 font-mono">
                                            {permission.permission_name}
                                          </div>
                                        </div>
                                        {userPermissions[permission.permission_name] && (
                                          <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                                        )}
                                      </label>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )
                          })
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full min-h-[400px]">
                  <div className="text-center">
                    <User className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No User Selected</h3>
                    <p className="text-gray-500">
                      Select a user from the list to manage their permissions
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
