import { usePWA } from '@/hooks/usePWA'
import { Download, X, RefreshCw } from 'lucide-react'

export function InstallBanner() {
  const { showInstallBanner, updateAvailable, install, applyUpdate, dismissInstallBanner } = usePWA()

  // Update available toast
  if (updateAvailable) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-center gap-3 bg-purple-600 text-white px-5 py-3 rounded-2xl shadow-2xl">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span className="text-sm font-medium">A new version is available</span>
          <button
            type="button"
            onClick={applyUpdate}
            className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-semibold transition-colors"
          >
            Update Now
          </button>
        </div>
      </div>
    )
  }

  // Install prompt banner
  if (!showInstallBanner) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center gap-3 bg-gray-900 dark:bg-gray-800 text-white pl-5 pr-3 py-3 rounded-2xl shadow-2xl border border-gray-700/50">
        <img src="/icons/icon-96x96.png" alt="" className="w-10 h-10 rounded-xl" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
        <div className="flex flex-col">
          <span className="text-sm font-semibold">Install Valoryx</span>
          <span className="text-xs text-gray-400">Quick access from your home screen</span>
        </div>
        <button
          type="button"
          onClick={install}
          className="ml-2 flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-xl text-sm font-semibold transition-colors"
        >
          <Download className="w-4 h-4" />
          Install
        </button>
        <button
          type="button"
          onClick={dismissInstallBanner}
          className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>
    </div>
  )
}
