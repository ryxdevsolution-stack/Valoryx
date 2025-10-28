'use client'

import React from 'react'
import { usePermissions } from '@/hooks/usePermissions'
import { AlertCircle } from 'lucide-react'

interface PermissionGateProps {
  permission?: string
  permissions?: string[]
  requireAll?: boolean
  requireSuperAdmin?: boolean
  children: React.ReactNode
  fallback?: React.ReactNode
  showAccessDenied?: boolean
}

export function PermissionGate({
  permission,
  permissions,
  requireAll = false,
  requireSuperAdmin = false,
  children,
  fallback,
  showAccessDenied = false
}: PermissionGateProps) {
  const { hasPermission, isSuperAdmin } = usePermissions()

  // Check super admin requirement
  if (requireSuperAdmin && !isSuperAdmin()) {
    return fallback || (showAccessDenied ? <AccessDenied message="Super admin access required" /> : null)
  }

  // Check single permission
  if (permission && !hasPermission(permission)) {
    return fallback || (showAccessDenied ? <AccessDenied message={`Permission "${permission}" required`} /> : null)
  }

  // Check multiple permissions
  if (permissions && permissions.length > 0) {
    const hasPermissions = permissions.map(p => hasPermission(p))

    if (requireAll) {
      // Must have ALL permissions
      if (!hasPermissions.every(has => has)) {
        const missing = permissions.filter((p, i) => !hasPermissions[i])
        return fallback || (showAccessDenied ? <AccessDenied message={`Missing permissions: ${missing.join(', ')}`} /> : null)
      }
    } else {
      // Must have at least ONE permission
      if (!hasPermissions.some(has => has)) {
        return fallback || (showAccessDenied ? <AccessDenied message={`One of these permissions required: ${permissions.join(', ')}`} /> : null)
      }
    }
  }

  return <>{children}</>
}

function AccessDenied({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
      <div className="flex items-center gap-3 mb-4">
        <AlertCircle className="w-8 h-8 text-red-500 dark:text-red-400" />
        <h3 className="text-xl font-semibold text-red-700 dark:text-red-300">Access Denied</h3>
      </div>
      <p className="text-red-600 dark:text-red-400 text-center">{message}</p>
    </div>
  )
}

// Utility component for admin-only content
export function AdminOnly({ children, fallback }: { children: React.ReactNode, fallback?: React.ReactNode }) {
  return (
    <PermissionGate requireSuperAdmin fallback={fallback}>
      {children}
    </PermissionGate>
  )
}

// Utility component for permission-based visibility
export function CanView({ permission, children }: { permission: string, children: React.ReactNode }) {
  return (
    <PermissionGate permission={permission}>
      {children}
    </PermissionGate>
  )
}