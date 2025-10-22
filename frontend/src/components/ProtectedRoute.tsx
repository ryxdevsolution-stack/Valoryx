'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useClient } from '@/contexts/ClientContext'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useClient()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    // Only redirect after loading is complete
    if (!isLoading && !isAuthenticated) {
      // Store intended destination
      if (pathname) {
        sessionStorage.setItem('redirectAfterLogin', pathname)
      }
      router.push('/auth/login')
    }
  }, [isAuthenticated, isLoading, router, pathname])

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-slate-200 border-t-slate-600 rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-slate-600 text-sm font-medium">Loading...</p>
        </div>
      </div>
    )
  }

  // Don't render children until authenticated
  if (!isAuthenticated) {
    return null
  }

  return <>{children}</>
}
