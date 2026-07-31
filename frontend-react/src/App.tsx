import { Suspense, useState, useEffect } from 'react'
import { Routes, Route, Outlet } from 'react-router-dom'
import api from '@/lib/api'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { LoadingProvider } from '@/contexts/LoadingContext'
import { ClientProvider } from '@/contexts/ClientContext'
import { DataProvider } from '@/contexts/DataContext'
import { LoadingInitializer } from '@/components/LoadingInitializer'
import ErrorBoundary from '@/components/ErrorBoundary'
import { AppRoutes } from '@/router'
import ImpersonationBanner from '@/components/ImpersonationBanner'
import ElectronSplash from '@/components/ElectronSplash'
import ElectronSetup from '@/pages/ElectronSetup'
import UpdateNotification from '@/components/UpdateNotification'
import { InstallBanner } from '@/components/pwa/InstallBanner'
import { ApiPerformanceBar } from '@/components/ApiPerformanceBar'
import ToastContainer from '@/components/ToastContainer'

const SESSION_HEARTBEAT_MS = 30_000

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
  const [needsSetup, setNeedsSetup] = useState(false)
  // Whether this build's local backend can verify Google sign-in assertions.
  // Reported by the same needs-setup call, so the setup screen never renders a
  // Google button that could only fail.
  const [googleEnabled, setGoogleEnabled] = useState(false)

  useEffect(() => {
    if (!isElectron) return
    const api = (window as any).electronAPI
    if (!api?.onStartupStatus) { setBackendReady(true); return }

    // Pull current status immediately — the push event may have fired before we mounted
    api.getStartupStatus?.().then((data: { message: string; progress: number }) => {
      if (!data) return
      setStartupStatus(data)
      if (data.progress >= 80) setBackendReady(true)
    })

    api.onStartupStatus((data: { message: string; progress: number }) => {
      setStartupStatus(data)
      if (data.progress >= 80) {
        setBackendReady(true)
      }
    })

    return () => {
      api.removeStartupStatus?.()
    }
  }, [isElectron])

  // After backend is ready, check if first-time setup is needed
  useEffect(() => {
    if (!isElectron || !backendReady) return
    api.get('/electron/needs-setup')
      .then(r => {
        if (r.data.needs_setup) setNeedsSetup(true)
        setGoogleEnabled(!!r.data.google_enabled)
      })
      .catch(() => {})
  }, [isElectron, backendReady])

  // Single-session heartbeat: periodically confirm the session is still valid.
  // A 401 here is handled globally by the api.ts interceptor (clears auth + redirect).
  useEffect(() => {
    const ping = () => {
      if (document.visibilityState !== 'visible') return
      if (!localStorage.getItem('token')) return
      api.get('/auth/session-check').catch(() => {})
    }
    const id = window.setInterval(ping, SESSION_HEARTBEAT_MS)
    return () => window.clearInterval(id)
  }, [])

  if (!backendReady) return <ElectronSplash status={startupStatus} />
  if (isElectron && needsSetup) {
    return <ElectronSetup googleEnabled={googleEnabled} onComplete={() => setNeedsSetup(false)} />
  }

  return (
    // Outermost on purpose: a throw inside ClientProvider/DataProvider render
    // would escape a boundary nested below them and blank the app again.
    // showDetails is forced on — this is a POS running unattended, and the
    // error text is the only thing an operator can screenshot for support.
    <ErrorBoundary showDetails>
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
                <ApiPerformanceBar />
                <ToastContainer />
              </DataProvider>
            </ClientProvider>
          </LoadingInitializer>
        </LoadingProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}
