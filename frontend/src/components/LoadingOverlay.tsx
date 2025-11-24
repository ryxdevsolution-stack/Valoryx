'use client'

import { useLoading } from '@/contexts/LoadingContext'

export function LoadingOverlay() {
  const { isLoading, loadingMessage } = useLoading()

  if (!isLoading) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-xl">
        <div className="flex items-center space-x-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <div>
            <p className="text-lg font-medium text-gray-900 dark:text-white">
              {loadingMessage || 'Loading...'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}