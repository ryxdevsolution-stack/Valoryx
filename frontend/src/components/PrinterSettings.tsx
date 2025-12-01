'use client'

import { useState, useEffect } from 'react'
import { qzPrinter } from '@/lib/qzPrinter'

interface PrinterSettingsProps {
  onClose?: () => void
  isModal?: boolean
}

export default function PrinterSettings({ onClose, isModal = false }: PrinterSettingsProps) {
  const [qzConnected, setQzConnected] = useState(false)
  const [qzError, setQzError] = useState<string | null>(null)
  const [printers, setPrinters] = useState<string[]>([])
  const [selectedPrinter, setSelectedPrinter] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [testPrinting, setTestPrinting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    initializeQz()
  }, [])

  const initializeQz = async () => {
    setLoading(true)
    setQzError(null)

    try {
      // Dynamically import qz-tray only on client side
      if (typeof window !== 'undefined') {
        const qz = await import('qz-tray')
        ;(window as any).qz = qz.default || qz

        await qzPrinter.connect()
        setQzConnected(true)

        // Get available printers
        const printerList = await qzPrinter.getPrinters()
        setPrinters(printerList)

        // Get saved printer
        const saved = qzPrinter.getSavedPrinter()
        if (saved && printerList.includes(saved)) {
          setSelectedPrinter(saved)
        } else if (printerList.length > 0) {
          // Try to get default printer
          const defaultPrinter = await qzPrinter.getDefaultPrinter()
          if (defaultPrinter && printerList.includes(defaultPrinter)) {
            setSelectedPrinter(defaultPrinter)
          } else {
            setSelectedPrinter(printerList[0])
          }
        }
      }
    } catch (error: any) {
      console.error('[PrinterSettings] QZ Tray error:', error)
      setQzConnected(false)

      if (error.message?.includes('not running') || error.message?.includes('Unable to establish')) {
        setQzError('QZ Tray is not running. Please download and install QZ Tray from qz.io')
      } else {
        setQzError(error.message || 'Failed to connect to QZ Tray')
      }
    } finally {
      setLoading(false)
    }
  }

  const handlePrinterSelect = (printerName: string) => {
    setSelectedPrinter(printerName)
    qzPrinter.setPrinter(printerName)
    setTestResult(null)
  }

  const handleTestPrint = async () => {
    if (!selectedPrinter) return

    setTestPrinting(true)
    setTestResult(null)

    try {
      await qzPrinter.testPrint(selectedPrinter)
      setTestResult({ success: true, message: 'Test print sent successfully!' })
    } catch (error: any) {
      setTestResult({ success: false, message: error.message || 'Test print failed' })
    } finally {
      setTestPrinting(false)
    }
  }

  const handleRefresh = () => {
    setTestResult(null)
    initializeQz()
  }

  const content = (
    <div className="space-y-4">
      {/* Connection Status */}
      <div className={`p-4 rounded-lg ${qzConnected ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
        <div className="flex items-center gap-3">
          {qzConnected ? (
            <>
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <div>
                <p className="font-medium text-green-800">QZ Tray Connected</p>
                <p className="text-sm text-green-600">Silent printing is available</p>
              </div>
            </>
          ) : (
            <>
              <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
              <div>
                <p className="font-medium text-yellow-800">QZ Tray Not Connected</p>
                <p className="text-sm text-yellow-600">
                  {qzError || 'Install QZ Tray for silent printing'}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* QZ Tray Download Link */}
      {!qzConnected && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="font-medium text-blue-800 mb-2">Install QZ Tray</h4>
          <p className="text-sm text-blue-600 mb-3">
            QZ Tray enables silent printing directly to your thermal printer without browser dialogs.
          </p>
          <a
            href="https://qz.io/download/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download QZ Tray
          </a>
        </div>
      )}

      {/* Printer Selection */}
      {qzConnected && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-gray-800">Select Printer</h4>
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="p-4 text-center text-gray-500">
              <svg className="animate-spin h-6 w-6 mx-auto mb-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Loading printers...
            </div>
          ) : printers.length === 0 ? (
            <div className="p-4 bg-gray-50 rounded-lg text-center text-gray-500">
              No printers found. Make sure your printer is connected and turned on.
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {printers.map((printer) => (
                <label
                  key={printer}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedPrinter === printer
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="printer"
                    value={printer}
                    checked={selectedPrinter === printer}
                    onChange={() => handlePrinterSelect(printer)}
                    className="w-4 h-4 text-indigo-600"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-gray-800">{printer}</p>
                  </div>
                  {selectedPrinter === printer && (
                    <svg className="w-5 h-5 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  )}
                </label>
              ))}
            </div>
          )}

          {/* Test Print Button */}
          {selectedPrinter && (
            <div className="pt-2">
              <button
                onClick={handleTestPrint}
                disabled={testPrinting}
                className={`w-full px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors ${
                  testPrinting
                    ? 'bg-gray-400 cursor-not-allowed text-white'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                }`}
              >
                {testPrinting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Printing...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    Test Print
                  </>
                )}
              </button>

              {/* Test Result */}
              {testResult && (
                <div className={`mt-2 p-3 rounded-lg text-sm ${
                  testResult.success
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {testResult.message}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Instructions */}
      <div className="pt-4 border-t border-gray-200">
        <h4 className="font-medium text-gray-800 mb-2">How it works</h4>
        <ul className="text-sm text-gray-600 space-y-1">
          <li className="flex items-start gap-2">
            <span className="text-indigo-600">1.</span>
            Install and run QZ Tray on this computer
          </li>
          <li className="flex items-start gap-2">
            <span className="text-indigo-600">2.</span>
            Select your thermal printer from the list
          </li>
          <li className="flex items-start gap-2">
            <span className="text-indigo-600">3.</span>
            Click &quot;Test Print&quot; to verify it works
          </li>
          <li className="flex items-start gap-2">
            <span className="text-indigo-600">4.</span>
            Bills will now print silently without any dialog!
          </li>
        </ul>
      </div>
    </div>
  )

  if (isModal) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
          <div className="sticky top-0 bg-indigo-600 text-white p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <div>
                <h2 className="font-semibold">Printer Settings</h2>
                <p className="text-xs text-indigo-200">Configure silent printing</p>
              </div>
            </div>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1 hover:bg-indigo-700 rounded transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <div className="flex-1 overflow-auto p-4">
            {content}
          </div>
        </div>
      </div>
    )
  }

  return content
}
