'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useClient } from '@/contexts/ClientContext'

export function usePermissions() {
  const { user, hasPermission, isSuperAdmin } = useClient()

  const useRequirePermission = (permission: string, redirectTo: string = '/dashboard') => {
    const router = useRouter()
    const pathname = usePathname()
    const [isChecking, setIsChecking] = useState(true)
    const [hasAccess, setHasAccess] = useState(false)

    useEffect(() => {
      if (!user) {
        setIsChecking(false)
        return
      }

      const access = hasPermission(permission)
      setHasAccess(access)
      setIsChecking(false)

      if (!access && pathname !== redirectTo) {
        router.push(redirectTo)
      }
    }, [user, permission, pathname, redirectTo, router])

    return { isChecking, hasAccess }
  }

  const useMultiplePermissions = (permissions: string[]): boolean[] => {
    return permissions.map(permission => hasPermission(permission))
  }

  const canAccessRoute = (routePermission: string): boolean => {
    return hasPermission(routePermission)
  }

  const getAccessibleRoutes = (routes: { permission: string, [key: string]: any }[]) => {
    return routes.filter(route => hasPermission(route.permission))
  }

  return {
    hasPermission,
    isSuperAdmin,
    useRequirePermission,
    useMultiplePermissions,
    canAccessRoute,
    getAccessibleRoutes,
    user
  }
}