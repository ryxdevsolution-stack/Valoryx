import { useState, useEffect, useCallback, memo } from 'react'
import bluetoothPrinterService from '../../services/bluetoothPrinterService'

interface BluetoothPrinterSettingsProps {
  isOpen: boolean
  onClose: () => void
}

type LoadingState = 'idle' | 'searching' | 'connecting' | 'printing'

function BluetoothPrinterSettings({ isOpen, onClose }: BluetoothPrinterSettingsProps) {
  const [isConnected, setIsConnected] = useState(bluetoothPrinterService.isConnected)
  const [deviceName, setDeviceName] = useState<string | null>(
    bluetoothPrinterService.connectedDevice?.name ?? null
  )
  const [deviceId, setDeviceId] = useState<string | null>(
    bluetoothPrinterService.savedDeviceId
  )
  const [loadingState, setLoadingState] = useState<LoadingState>('idle')
  const [error, setError] = useState<string | null>(null)

  const supported = bluetoothPrinterService.isSupported()

  // Sync connection state when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsConnected(bluetoothPrinterService.isConnected)
      setDeviceName(bluetoothPrinterService.connectedDevice?.name ?? null)
      setDeviceId(bluetoothPrinterService.savedDeviceId)
    }
  }, [isOpen])

  // Auto-dismiss errors after 5 seconds
  useEffect(() => {
    if (!error) return
    const timer = setTimeout(() => setError(null), 5000)
    return () => clearTimeout(timer)
  }, [error])

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const handlePairPrinter = useCallback(async () => {
    setError(null)
    setLoadingState('searching')

    try {
      const device = await bluetoothPrinterService.requestDevice()
      if (!device) {
        setLoadingState('idle')
        return // user cancelled — not an error
      }

      setLoadingState('connecting')
      const success = await bluetoothPrinterService.connect(device)

      if (success) {
        setIsConnected(true)
        setDeviceName(device.name ?? null)
        setDeviceId(bluetoothPrinterService.savedDeviceId)
      } else {
        setError('Failed to connect. Make sure the printer is powered on and nearby.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.')
    } finally {
      setLoadingState('idle')
    }
  }, [])

  const handleDisconnect = useCallback(async () => {
    setError(null)
    try {
      await bluetoothPrinterService.disconnect()
      setIsConnected(false)
      setDeviceName(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect.')
    }
  }, [])

  const handleTestPrint = useCallback(async () => {
    setError(null)
    setLoadingState('printing')

    try {
      const now = new Date()
      const success = await bluetoothPrinterService.printReceipt({
        shopName: 'Test Print',
        address1: 'Printer Connection Test',
        phone: '',
        billNumber: 'TEST-001',
        date: now.toLocaleDateString('en-IN'),
        time: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        paymentMethod: 'N/A',
        items: [
          { name: 'Sample Item 1', quantity: 2, rate: 100, amount: 200 },
          { name: 'Sample Item 2', quantity: 1, rate: 50, amount: 50 },
        ],
        subtotal: 250,
        grandTotal: 250,
        footerText: 'Printer is working!',
      })

      if (!success) {
        setError('Test print failed. Check that the printer has paper and is ready.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test print failed.')
    } finally {
      setLoadingState('idle')
    }
  }, [])

  if (!isOpen) return null

  const isLoading = loadingState !== 'idle'

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Bottom Sheet */}
      <div
        className="relative z-50 w-full max-w-lg bg-white dark:bg-gray-800 rounded-t-2xl shadow-xl animate-slide-up"
        role="dialog"
        aria-modal="true"
        aria-label="Printer Settings"
      >
        {/* Drag Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Printer Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close printer settings"
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {!supported ? (
            /* Not Supported State */
            <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-4">
              <div className="flex gap-3">
                <svg aria-hidden="true" className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Bluetooth Not Available
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    Bluetooth printing requires Chrome or Edge on Android.
                  </p>
                  <p className="text-sm text-blue-600 dark:text-blue-400 mt-2 font-medium cursor-pointer hover:underline">
                    Use browser print (Ctrl+P) instead
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Connection Status */}
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4">
                <div className="flex items-center gap-3">
                  <span
                    className={`w-3 h-3 rounded-full flex-shrink-0 ${
                      isConnected
                        ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]'
                        : 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]'
                    }`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {isConnected
                        ? `Connected to ${deviceName ?? 'Unknown Printer'}`
                        : 'No printer connected'}
                    </p>
                    {deviceId && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5 truncate">
                        ID: {deviceId}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 px-4 py-3">
                  <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                </div>
              )}

              {/* Loading Indicator */}
              {isLoading && (
                <div className="flex items-center gap-3 px-1">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent flex-shrink-0" />
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {loadingState === 'searching' && 'Searching for printers...'}
                    {loadingState === 'connecting' && 'Connecting...'}
                    {loadingState === 'printing' && 'Printing test...'}
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={handlePairPrinter}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98] shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg aria-hidden="true" className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0" />
                  </svg>
                  Pair New Printer
                </button>

                {isConnected && (
                  <>
                    <button
                      type="button"
                      onClick={handleTestPrint}
                      disabled={isLoading}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all bg-green-600 text-white hover:bg-green-700 active:scale-[0.98] shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg aria-hidden="true" className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                      </svg>
                      Test Print
                    </button>

                    <button
                      type="button"
                      onClick={handleDisconnect}
                      disabled={isLoading}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all bg-gray-100 dark:bg-gray-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 active:scale-[0.98] border border-gray-200 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg aria-hidden="true" className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                      Disconnect
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Safe area padding for mobile */}
        <div className="h-safe-area-bottom pb-4" />
      </div>

      {/* Slide-up animation */}
      <style>{`
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.25s ease-out;
        }
        .h-safe-area-bottom {
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
      `}</style>
    </div>
  )
}

export default memo(BluetoothPrinterSettings)
