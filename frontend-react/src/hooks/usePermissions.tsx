
import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useClient } from '@/contexts/ClientContext'

export function usePermissions() {
  const { user, hasPermission, isSuperAdmin } = useClient()

  const useRequirePermission = (permission: string, redirectTo: string = '/dashboard') => {
    const navigate = useNavigate()
    const { pathname } = useLocation()
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
        navigate(redirectTo)
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [permission, pathname, redirectTo, navigate])

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