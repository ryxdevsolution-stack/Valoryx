import type { ReactNode } from 'react'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import ProtectedRoute from './ProtectedRoute'
import TrialBanner from './TrialBanner'
import SubscriptionWarningBanner from './SubscriptionWarningBanner'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 transition-colors duration-300">
        <TrialBanner />
        <SubscriptionWarningBanner />
        <Sidebar />
        <BottomNav />
        {/* Mobile: pb-16 clears bottom nav. Desktop: pl-20 clears left pill sidebar */}
        <div className="pb-16 md:pb-0 md:pl-20 flex flex-col flex-1 transition-all duration-300">
          <main className="flex-1 min-h-full overflow-y-auto">
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
