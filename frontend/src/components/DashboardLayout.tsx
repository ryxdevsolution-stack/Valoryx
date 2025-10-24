'use client'

import Sidebar from './Sidebar'
import ProtectedRoute from './ProtectedRoute'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 transition-colors duration-300">
        <Sidebar />
        {/* Mobile: Add top padding for fixed header, Desktop: Add left padding for compact pill sidebar */}
        <div className="pt-14 sm:pt-16 md:pt-0 md:pl-20 flex flex-col flex-1 transition-all duration-300">
          <main className="flex-1 min-h-screen overflow-y-auto">
            <div className="h-full py-3 md:py-4 lg:py-6 px-3 md:px-6 lg:px-8">
              <div className="max-w-full mx-auto h-full">
                {children}
              </div>
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  )
}
