import { useState, useEffect, useCallback } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

interface PWAState {
  /** Whether the app can be installed (browser supports it + not already installed) */
  canInstall: boolean
  /** Whether a new service worker update is available */
  updateAvailable: boolean
  /** Whether the app is running as an installed PWA */
  isInstalled: boolean
  /** Number of bills queued for sync */
  offlineQueueCount: number
  /** Trigger the install prompt */
  install: () => Promise<boolean>
  /** Apply the pending SW update (reloads page) */
  applyUpdate: () => void
  /** Dismiss the install banner (remembers for 7 days) */
  dismissInstallBanner: () => void
  /** Whether the install banner should be shown */
  showInstallBanner: boolean
}

const DISMISS_KEY = 'valoryx-pwa-install-dismissed'
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000 // 7 days

export function usePWA(): PWAState {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [offlineQueueCount, setOfflineQueueCount] = useState(0)
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    const dismissed = localStorage.getItem(DISMISS_KEY)
    if (!dismissed) return false
    return Date.now() - parseInt(dismissed, 10) < DISMISS_DURATION
  })

  useEffect(() => {
    // Check if already installed as PWA
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    setIsInstalled(isStandalone)

    // Capture the install prompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstall)

    // Detect when app gets installed
    const handleInstalled = () => {
      setIsInstalled(true)
      setInstallPrompt(null)
    }
    window.addEventListener('appinstalled', handleInstalled)

    // Register service worker and listen for updates
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        setRegistration(reg)

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing
          if (!newWorker) return

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setUpdateAvailable(true)
            }
          })
        })
      })

      // Listen for background sync messages from SW
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'BILL_SYNCED') {
          setOfflineQueueCount((prev) => Math.max(0, prev - 1))
        }
      })
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  const install = useCallback(async () => {
    if (!installPrompt) return false
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') {
      setInstallPrompt(null)
      return true
    }
    return false
  }, [installPrompt])

  const applyUpdate = useCallback(() => {
    if (!registration?.waiting) return
    registration.waiting.postMessage({ type: 'SKIP_WAITING' })
    // Reload once the new SW takes control
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload()
    })
  }, [registration])

  const dismissInstallBanner = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString())
    setBannerDismissed(true)
  }, [])

  return {
    canInstall: !!installPrompt && !isInstalled,
    updateAvailable,
    isInstalled,
    offlineQueueCount,
    install,
    applyUpdate,
    dismissInstallBanner,
    showInstallBanner: !!installPrompt && !isInstalled && !bannerDismissed,
  }
}
