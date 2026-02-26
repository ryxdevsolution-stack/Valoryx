import { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useClient } from '@/contexts/ClientContext'
import AdminSidebar from '@/components/AdminSidebar'

export default function AdminLayout() {
  const { user, isLoading } = useClient()
  const navigate = useNavigate()
  // Derive stable boolean to avoid re-running the effect when isSuperAdmin fn ref changes
  const isSuperAdminUser = user?.is_super_admin ?? false

  useEffect(() => {
    if (!isLoading && !user) {
      navigate('/auth/login')
      return
    }

    if (!isLoading && user && !isSuperAdminUser) {
      navigate('/dashboard')
      return
    }
  }, [user, isLoading, isSuperAdminUser, navigate])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-violet-200 dark:border-violet-900"></div>
            <div className="absolute top-0 left-0 w-16 h-16 rounded-full border-4 border-transparent border-t-violet-600 animate-spin"></div>
          </div>
          <p className="text-slate-600 dark:text-slate-400 font-medium">Loading Admin Panel...</p>
        </div>
      </div>
    )
  }

  if (!user || !isSuperAdminUser) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 transition-colors duration-300">
      <AdminSidebar />
      <div className="pt-14 sm:pt-16 md:pt-0 md:pl-20 flex flex-col flex-1 transition-all duration-300">
        <main className="flex-1 min-h-screen overflow-y-auto">
          <div className="h-full py-3 md:py-4 lg:py-6 px-3 md:px-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
