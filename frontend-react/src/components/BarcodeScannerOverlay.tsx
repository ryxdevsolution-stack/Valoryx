import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { cameraScannerService } from '@/services/cameraScannerService'

interface Props {
  onScan: (barcode: string) => void
  onClose: () => void
}

export default function BarcodeScannerOverlay({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [scanned, setScanned] = useState<string | null>(null)
  const [flashOn, setFlashOn] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    cameraScannerService.start(video, {
      onScan: (result) => {
        setScanned(result.barcode)
        // Brief success flash, then pass value up and close
        setTimeout(() => {
          cameraScannerService.stop()
          onScan(result.barcode)
          onClose()
        }, 600)
      },
      onError: (msg) => setError(msg),
      cooldownMs: 1500,
    })

    return () => {
      cameraScannerService.stop()
    }
  }, [onScan, onClose])

  const handleFlash = async () => {
    const next = await cameraScannerService.toggleFlash()
    setFlashOn(next)
  }

  const handleSwitchCamera = () => {
    cameraScannerService.switchCamera()
  }

  return (
    <div className="fixed inset-0 bg-black z-[200] flex flex-col">
      {/* Keyframe for the scan line */}
      <style>{`
        @keyframes barcodeScanLine {
          0%   { top: 12%; }
          50%  { top: 78%; }
          100% { top: 12%; }
        }
        .bso-scan-line {
          position: absolute;
          left: 8px;
          right: 8px;
          height: 2px;
          background: linear-gradient(to right, transparent 0%, #4ade80 30%, #86efac 50%, #4ade80 70%, transparent 100%);
          animation: barcodeScanLine 2s ease-in-out infinite;
          box-shadow: 0 0 8px 1px rgba(74, 222, 128, 0.7);
        }
      `}</style>

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/90 z-10 flex-shrink-0">
        <span className="text-white font-semibold text-base tracking-wide">Scan Barcode</span>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          aria-label="Close scanner"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Camera view */}
      <div className="flex-1 relative overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
          autoPlay
        />

        {/* Overlay with scan frame */}
        {!error && !scanned && (
          <div className="absolute inset-0 flex items-center justify-center">
            {/* Semi-transparent mask */}
            <div className="absolute inset-0 bg-black/45" />

            {/* Scan frame */}
            <div className="relative z-10 w-72 h-52">
              {/* Corner markers */}
              <span className="absolute top-0 left-0 w-7 h-7 border-t-4 border-l-4 border-green-400 rounded-tl" />
              <span className="absolute top-0 right-0 w-7 h-7 border-t-4 border-r-4 border-green-400 rounded-tr" />
              <span className="absolute bottom-0 left-0 w-7 h-7 border-b-4 border-l-4 border-green-400 rounded-bl" />
              <span className="absolute bottom-0 right-0 w-7 h-7 border-b-4 border-r-4 border-green-400 rounded-br" />

              {/* Animated scan line */}
              <div className="bso-scan-line" />
            </div>

            {/* Hint text */}
            <p className="absolute bottom-[22%] text-white text-sm font-medium bg-black/60 px-4 py-1.5 rounded-full">
              Point camera at barcode or QR code
            </p>
          </div>
        )}

        {/* Success state */}
        {scanned && (
          <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center z-20">
            <div className="bg-white dark:bg-gray-900 rounded-2xl px-8 py-6 text-center shadow-2xl mx-6 max-w-xs w-full">
              <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Barcode detected!</p>
              <p className="font-bold text-lg text-gray-900 dark:text-white font-mono break-all">{scanned}</p>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="absolute inset-0 bg-black/85 flex items-center justify-center z-20">
            <div className="text-center px-8 max-w-xs">
              <div className="text-5xl mb-4">📷</div>
              <p className="text-white text-sm leading-relaxed mb-5">{error}</p>
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 bg-white text-black font-semibold rounded-xl text-sm"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      {!error && !scanned && (
        <div className="flex justify-center gap-8 py-5 bg-black/90 z-10 flex-shrink-0">
          <button
            type="button"
            onClick={handleFlash}
            title={flashOn ? 'Turn off flash' : 'Turn on flash'}
            className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition-colors ${
              flashOn ? 'bg-yellow-400 text-black' : 'bg-white/15 text-white hover:bg-white/25'
            }`}
          >
            ⚡
          </button>
          <button
            type="button"
            onClick={handleSwitchCamera}
            title="Switch front/back camera"
            className="w-12 h-12 rounded-full bg-white/15 text-white text-xl flex items-center justify-center hover:bg-white/25 transition-colors"
          >
            🔄
          </button>
        </div>
      )}
    </div>
  )
}
