'use client'

import { useState, useEffect } from 'react'
import { usePermissions } from '@/hooks/usePermissions'
import DashboardLayout from '@/components/DashboardLayout'
import { TableSkeleton } from '@/components/SkeletonLoader'
import api from '@/lib/api'
import { Shield, User, Check, X, Save, RefreshCw, AlertCircle } from 'lucide-react'

interface Permission {
  permission_id: string
  permission_name: string
  description: string
  category: string
}

interface UserWithPermissions {
  user_id: string
  email: string
  role: string
  is_super_admin: boolean
  is_active: boolean
  permissions: string[]
  created_at: string
  last_login: string | null
}

export default function PermissionsPage() {
  const { isSuperAdmin } = usePermissions()
  const [users, setUsers] = useState<UserWithPermissions[]>([])
  const [allPermissions, setAllPermissions] = useState<Permission[]>([])
  const [categorizedPermissions, setCategorizedPermissions] = useState<Record<string, Permission[]>>({})
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [userPermissions, setUserPermissions] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      // Fetch all users and permissions
      const [usersResponse, permissionsResponse] = await Promise.all([
        api.get('/permissions/users'),
        api.get('/permissions/all')
      ])

      setUsers(usersResponse.data.users)
      setAllPermissions(permissionsResponse.data.permissions)
      setCategorizedPermissions(permissionsResponse.data.categorized)
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
    allPermissions.forEach(perm => {
      permissionMap[perm.permission_name] = user.permissions.includes(perm.permission_name)
    })
    setUserPermissions(permissionMap)
  }

  const togglePermission = (permissionName: string) => {
    setUserPermissions(prev => ({
      ...prev,
      [permissionName]: !prev[permissionName]
    }))
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

      setSuccessMessage('Permissions updated successfully!')

      // Refresh user data
      await fetchData()

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update permissions')
    } finally {
      setSaving(false)
    }
  }

  const selectedUserData = users.find(u => u.user_id === selectedUser)

  if (!isSuperAdmin()) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <Shield className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-200">Access Denied</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">Only super admins can manage permissions</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="w-8 h-8 text-purple-600" />
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">User Permissions</h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            Manage user permissions and access control for your billing system
          </p>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <p className="text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {successMessage && (
          <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-3">
            <Check className="w-5 h-5 text-green-500" />
            <p className="text-green-600 dark:text-green-400">{successMessage}</p>
          </div>
        )}

        {loading ? (
          <TableSkeleton rows={5} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* User List */}
            <div className="lg:col-span-1">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                  <h2 className="font-semibold text-lg text-gray-900 dark:text-white">Users</h2>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {users.map(user => (
                    <button
                      key={user.user_id}
                      onClick={() => selectUser(user.user_id)}
                      className={`w-full text-left p-4 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                        selectedUser === user.user_id ? 'bg-purple-50 dark:bg-purple-900/30' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-gray-500" />
                            <p className="font-medium text-gray-900 dark:text-white">{user.email}</p>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-500 dark:text-gray-400">{user.role}</span>
                            {user.is_super_admin && (
                              <span className="text-xs px-2 py-1 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded-full">
                                Super Admin
                              </span>
                            )}
                          </div>
                        </div>
                        {selectedUser === user.user_id && (
                          <Check className="w-5 h-5 text-purple-600" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Permission Editor */}
            <div className="lg:col-span-2">
              {selectedUserData ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md">
                  <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="font-semibold text-lg text-gray-900 dark:text-white">
                          Edit Permissions for {selectedUserData.email}
                        </h2>
                        {selectedUserData.is_super_admin && (
                          <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">
                            Super admins have all permissions by default
                          </p>
                        )}
                      </div>
                      <button
                        onClick={savePermissions}
                        disabled={saving || selectedUserData.is_super_admin}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {saving ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        Save Changes
                      </button>
                    </div>
                  </div>

                  <div className="p-4 max-h-96 overflow-y-auto">
                    {Object.entries(categorizedPermissions).map(([category, permissions]) => (
                      <div key={category} className="mb-6">
                        <h3 className="font-medium text-gray-900 dark:text-white mb-3 capitalize">
                          {category}
                        </h3>
                        <div className="space-y-2">
                          {permissions.map(permission => (
                            <label
                              key={permission.permission_id}
                              className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={userPermissions[permission.permission_name] || false}
                                onChange={() => togglePermission(permission.permission_name)}
                                disabled={selectedUserData.is_super_admin}
                                className="mt-1 rounded border-gray-300 dark:border-gray-600 text-purple-600 focus:ring-purple-500 disabled:opacity-50"
                              />
                              <div className="flex-1">
                                <p className="font-medium text-sm text-gray-900 dark:text-white">
                                  {permission.permission_name}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {permission.description}
                                </p>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8">
                  <div className="text-center">
                    <User className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400">
                      Select a user to manage their permissions
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