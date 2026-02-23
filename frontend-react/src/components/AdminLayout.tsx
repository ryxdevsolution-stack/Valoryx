import React, { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useClient } from '@/contexts/ClientContext'
import AdminSidebar from '@/components/AdminSidebar'

export default function AdminLayout() {
  const { user, isLoading, isSuperAdmin } = useClient()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && !user) {
      navigate('/auth/login')
      return
    }

    if (!isLoading && user && !isSuperAdmin()) {
      navigate('/dashboard')
      return
    }
  }, [user, isLoading, isSuperAdmin, navigate])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900">
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

  if (!user || !isSuperAdmin()) {
    return null
  }

  return (
    <div className="flex h-screen bg-slate-100 dark:bg-slate-900">
      <AdminSidebar />
      <main className="flex-1 overflow-auto">
        <div className="min-h-full">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
