import { Suspense, useState, useEffect } from 'react'
import { Routes, Route, Outlet } from 'react-router-dom'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { LoadingProvider } from '@/contexts/LoadingContext'
import { ClientProvider } from '@/contexts/ClientContext'
import { DataProvider } from '@/contexts/DataContext'
import { LoadingInitializer } from '@/components/LoadingInitializer'
import { AppRoutes } from '@/router'
import ImpersonationBanner from '@/components/ImpersonationBanner'
import ElectronSplash from '@/components/ElectronSplash'
import UpdateNotification from '@/components/UpdateNotification'
import { InstallBanner } from '@/components/pwa/InstallBanner'

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
  const isElectron = !!(window as any).electronAPI?.isElectron

  const [startupStatus, setStartupStatus] = useState({
    message: 'Initializing…',
    progress: 5,
  })
  // Non-Electron (web): always ready. Electron: wait for backend.
  const [backendReady, setBackendReady] = useState(!isElectron)

  useEffect(() => {
    if (!isElectron) return
    const api = (window as any).electronAPI
    if (!api?.onStartupStatus) { setBackendReady(true); return }

    api.onStartupStatus((data: { message: string; progress: number }) => {
      setStartupStatus(data)
      // Mark ready only on success. On error (progress -1),
      // keep splash visible so user sees the error message.
      if (data.progress >= 80) {
        setBackendReady(true)
      }
    })

    return () => {
      api.removeStartupStatus?.()
    }
  }, [isElectron])

  if (!backendReady) return <ElectronSplash status={startupStatus} />

  return (
    <ThemeProvider>
      <LoadingProvider>
        <LoadingInitializer>
          <ClientProvider>
            <ImpersonationBanner />
            {isElectron && <UpdateNotification />}
            {!isElectron && <InstallBanner />}
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
