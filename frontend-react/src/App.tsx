import { Suspense } from 'react'
import { Routes, Route, Outlet } from 'react-router-dom'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { LoadingProvider } from '@/contexts/LoadingContext'
import { ClientProvider } from '@/contexts/ClientContext'
import { DataProvider } from '@/contexts/DataContext'
import { LoadingInitializer } from '@/components/LoadingInitializer'
import { AppRoutes } from '@/router'
import ImpersonationBanner from '@/components/ImpersonationBanner'

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="w-12 h-12 rounded-full border-4 border-primary-200 dark:border-primary-900"></div>
          <div className="absolute top-0 left-0 w-12 h-12 rounded-full border-4 border-transparent border-t-primary-600 animate-spin"></div>
        </div>
        <p className="text-gray-600 dark:text-gray-400">Loading...</p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <LoadingProvider>
        <LoadingInitializer>
          <ClientProvider>
            <ImpersonationBanner />
            <DataProvider>
              <Suspense fallback={<LoadingFallback />}>
                <AppRoutes />
              </Suspense>
            </DataProvider>
          </ClientProvider>
        </LoadingInitializer>
      </LoadingProvider>
    </ThemeProvider>
  )
}
