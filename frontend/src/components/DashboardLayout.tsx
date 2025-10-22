'use client'

import Sidebar from './Sidebar'
import ProtectedRoute from './ProtectedRoute'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-50">
        <Sidebar />
        {/* Mobile: Add top padding for fixed header, Desktop: Add left padding for sidebar */}
        <div className="pt-14 sm:pt-16 md:pt-0 md:pl-64 lg:pl-72 xl:pl-80 2xl:pl-[22rem] flex flex-col flex-1 transition-all duration-300">
          <main className="flex-1">
            <div className="py-3 sm:py-4 md:py-6 lg:py-8 px-3 sm:px-4 md:px-6 lg:px-8">
              <div className="max-w-full 3xl:max-w-screen-3xl mx-auto">
                {children}
              </div>
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  )
}
