export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-slate-200 dark:border-gray-700 shadow-md overflow-hidden">
      <div className="animate-pulse">
        {/* Table Header */}
        <div className="bg-gradient-to-r from-slate-200 to-slate-100 dark:from-gray-700 dark:to-gray-600 px-4 py-4">
          <div className="flex gap-4">
            <div className="h-3 bg-slate-300 dark:bg-gray-600 rounded w-20"></div>
            <div className="h-3 bg-slate-300 dark:bg-gray-600 rounded w-24"></div>
            <div className="h-3 bg-slate-300 dark:bg-gray-600 rounded w-32"></div>
            <div className="h-3 bg-slate-300 dark:bg-gray-600 rounded flex-1"></div>
          </div>
        </div>
        {/* Table Rows */}
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="border-t border-slate-200 dark:border-gray-700 px-4 py-4">
            <div className="flex gap-4">
              <div className="h-4 bg-slate-200 dark:bg-gray-700 rounded w-16"></div>
              <div className="h-4 bg-slate-200 dark:bg-gray-700 rounded w-28"></div>
              <div className="h-4 bg-slate-200 dark:bg-gray-700 rounded w-36"></div>
              <div className="h-4 bg-slate-200 dark:bg-gray-700 rounded flex-1"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function CardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="bg-white dark:bg-gray-800 rounded-xl border-2 border-slate-200 dark:border-gray-700 shadow-md p-5">
          <div className="animate-pulse">
            <div className="h-3 bg-slate-200 dark:bg-gray-700 rounded w-24 mb-3"></div>
            <div className="h-8 bg-slate-200 dark:bg-gray-700 rounded w-32"></div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function ReportSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-slate-200 dark:border-gray-700 overflow-hidden">
      <div className="animate-pulse">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-200 to-slate-100 dark:from-gray-700 dark:to-gray-600 px-6 py-5">
          <div className="h-6 bg-slate-300 dark:bg-gray-600 rounded w-48 mb-2"></div>
          <div className="h-4 bg-slate-300 dark:bg-gray-600 rounded w-64"></div>
        </div>
        {/* Content */}
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="bg-slate-50 dark:bg-gray-700 rounded-xl p-5">
                <div className="h-3 bg-slate-200 dark:bg-gray-600 rounded w-20 mb-3"></div>
                <div className="h-8 bg-slate-200 dark:bg-gray-600 rounded w-32 mb-2"></div>
                <div className="h-3 bg-slate-200 dark:bg-gray-600 rounded w-24"></div>
              </div>
            ))}
          </div>
          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="bg-slate-50 dark:bg-gray-700 rounded-xl p-5 h-80">
                <div className="h-full bg-slate-200 dark:bg-gray-600 rounded"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function CustomerCardSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-4">
          <div className="animate-pulse">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-12 h-12 bg-slate-200 dark:bg-gray-700 rounded-full"></div>
              <div className="flex-1">
                <div className="h-4 bg-slate-200 dark:bg-gray-700 rounded w-32 mb-2"></div>
                <div className="h-3 bg-slate-200 dark:bg-gray-700 rounded w-24"></div>
              </div>
              <div className="w-16 h-6 bg-slate-200 dark:bg-gray-700 rounded-full"></div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100 dark:border-gray-700">
              <div>
                <div className="h-3 bg-slate-200 dark:bg-gray-700 rounded w-16 mb-2"></div>
                <div className="h-4 bg-slate-200 dark:bg-gray-700 rounded w-12"></div>
              </div>
              <div>
                <div className="h-3 bg-slate-200 dark:bg-gray-700 rounded w-20 mb-2"></div>
                <div className="h-4 bg-slate-200 dark:bg-gray-700 rounded w-24"></div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-5 border border-slate-200 dark:border-gray-700">
            <div className="animate-pulse">
              <div className="h-3 bg-slate-200 dark:bg-gray-700 rounded w-24 mb-3"></div>
              <div className="h-8 bg-slate-200 dark:bg-gray-700 rounded w-32"></div>
            </div>
          </div>
        ))}
      </div>
      {/* Quick Actions */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-slate-200 dark:border-gray-700">
        <div className="animate-pulse">
          <div className="h-5 bg-slate-200 dark:bg-gray-700 rounded w-32 mb-4"></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-32 bg-slate-100 dark:bg-gray-700 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function PaymentTypesSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="animate-pulse">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="h-5 bg-slate-200 dark:bg-gray-700 rounded w-32 mb-2"></div>
                <div className="h-3 bg-slate-200 dark:bg-gray-700 rounded w-40"></div>
              </div>
              <div className="w-12 h-12 bg-slate-200 dark:bg-gray-700 rounded"></div>
            </div>
            <div className="border-t dark:border-gray-700 pt-4 flex justify-between items-center">
              <div className="h-3 bg-slate-200 dark:bg-gray-700 rounded w-24"></div>
              <div className="h-4 bg-slate-200 dark:bg-gray-700 rounded w-16"></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
