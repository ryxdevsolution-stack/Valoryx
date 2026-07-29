import LoadingScreen from '@/components/LoadingScreen'

interface StartupStatus {
  message: string
  progress: number  // -1 = error, 0-100 = percent
}

interface ElectronSplashProps {
  status: StartupStatus
}

/**
 * ElectronSplash — shown only in Electron while the Flask backend boots.
 * Receives status as a prop from App.tsx (single IPC listener there).
 *
 * Delegates entirely to LoadingScreen so the splash, the router's lazy-load
 * fallback, and Home's auth-resolving state are one identical view. It used to
 * carry its own hand-rolled slate gradient and inline-styled spinner, which is
 * how it drifted away from the rest of the app's loading states.
 */
export default function ElectronSplash({ status }: ElectronSplashProps) {
  const isError = status.progress === -1

  return (
    <LoadingScreen
      progress={status.progress}
      message={
        isError
          ? `${status.message} — close and reopen the app to try again.`
          : status.message
      }
    />
  )
}
