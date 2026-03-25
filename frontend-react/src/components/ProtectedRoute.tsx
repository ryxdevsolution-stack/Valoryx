import { useLocation, Navigate } from 'react-router-dom'
import { useClient } from '@/contexts/ClientContext'

interface ProtectedRouteProps {
  children: React.ReactNode
  /** If provided, user must have this permission or they are redirected to /dashboard */
  permission?: string
}

export default function ProtectedRoute({ children, permission }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, hasPermission, user } = useClient()
  const { pathname } = useLocation()

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-4 border-blue-200 dark:border-blue-900"></div>
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-600 dark:border-t-blue-400 animate-spin"></div>
          </div>
          <p className="mt-4 text-gray-700 dark:text-gray-200 font-medium">Authenticating...</p>
          <div className="flex justify-center gap-1 mt-2">
            <span className="w-2 h-2 bg-blue-600 dark:bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
            <span className="w-2 h-2 bg-blue-600 dark:bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
            <span className="w-2 h-2 bg-blue-600 dark:bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
          </div>
        </div>
      </div>
    )
  }

  // Don't render children until authenticated — redirect to login, storing intended destination
  if (!isAuthenticated) {
    if (pathname) {
      sessionStorage.setItem('redirectAfterLogin', pathname)
    }
    return <Navigate to="/auth/login" replace />
  }

  // If user must change password, redirect synchronously with no flash of protected content
  // Read from React state (already in memory) instead of hitting localStorage on every render
  const mustChange = user?.must_change_password === true
  if (mustChange && pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }

  // Check page-level permission if specified — redirect to billing (safe fallback, not /dashboard which would loop)
  if (permission && !hasPermission(permission)) {
    return <Navigate to="/billing" replace />
  }

  return <>{children}</>
}
