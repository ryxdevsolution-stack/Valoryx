import { useEffect, useRef, useState, useCallback, memo } from 'react'
import { cameraScannerService } from '@/services/cameraScannerService'

// ─── Types ───────────────────────────────────────────────────────────

interface BarcodeScannerModalProps {
  isOpen: boolean
  onClose: () => void
  onScan: (barcode: string) => void
}

// ─── Icons (inline SVG to avoid external deps) ──────────────────────

function IconX({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function IconFlash({ className, active }: { className?: string; active: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill={active ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
}

function IconCameraSwitch({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
      <path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5" />
      <circle cx="12" cy="12" r="3" />
      <path d="m18 22-3-3 3-3" />
      <path d="m6 2 3 3-3 3" />
    </svg>
  )
}

// ─── Corner marker for the scanning frame ────────────────────────────

function CornerMarker({ position }: { position: 'tl' | 'tr' | 'bl' | 'br' }) {
  const base = 'absolute w-6 h-6 border-green-400'
  const corners: Record<string, string> = {
    tl: `${base} border-t-3 border-l-3 top-0 left-0 rounded-tl`,
    tr: `${base} border-t-3 border-r-3 top-0 right-0 rounded-tr`,
    bl: `${base} border-b-3 border-l-3 bottom-0 left-0 rounded-bl`,
    br: `${base} border-b-3 border-r-3 bottom-0 right-0 rounded-br`,
  }
  return <div className={corners[position]} />
}

// ─── Component ───────────────────────────────────────────────────────

function BarcodeScannerModal({ isOpen, onClose, onScan }: BarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [flashOn, setFlashOn] = useState(false)
  const [scanSuccess, setScanSuccess] = useState(false)

  // Stable close handler that stops the scanner
  const handleClose = useCallback(() => {
    cameraScannerService.stop()
    setFlashOn(false)
    setError(null)
    setScanSuccess(false)
    onClose()
  }, [onClose])

  // ── Start / stop scanner when modal opens / closes ──────────────
  useEffect(() => {
    if (!isOpen) return

    // Check for camera access
    if (!cameraScannerService.isSupported()) {
      setError('Camera access is not available on this device. Please check your browser settings.')
      return
    }

    const videoEl = videoRef.current
    if (!videoEl) return

    // Small delay lets the modal DOM settle before requesting camera
    const timerId = setTimeout(() => {
      cameraScannerService.start(videoEl, {
        onScan: (result) => {
          // Show success flash
          setScanSuccess(true)

          // Deliver the barcode after a short visual-feedback window
          setTimeout(() => {
            onScan(result.barcode)
            handleClose()
          }, 300)
        },
        onError: (msg) => setError(msg),
      })
    }, 100)

    return () => {
      clearTimeout(timerId)
      cameraScannerService.stop()
    }
  }, [isOpen, onScan, handleClose])

  // ── Keyboard: Escape to close ───────────────────────────────────
  useEffect(() => {
    if (!isOpen) return

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, handleClose])

  // ── Flash toggle ────────────────────────────────────────────────
  const handleFlashToggle = useCallback(async () => {
    const newState = await cameraScannerService.toggleFlash()
    setFlashOn(newState)
  }, [])

  // ── Camera switch ───────────────────────────────────────────────
  const handleCameraSwitch = useCallback(async () => {
    setFlashOn(false)
    await cameraScannerService.switchCamera()
  }, [])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      role="dialog"
      aria-modal="true"
      aria-label="Barcode scanner"
    >
      {/* ── Top bar ───────────────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/70 to-transparent">
        <button
          type="button"
          onClick={handleClose}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 transition-colors"
          aria-label="Close scanner"
        >
          <IconX className="w-5 h-5 text-white" />
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleFlashToggle}
            className={`flex items-center justify-center w-10 h-10 rounded-full transition-colors ${
              flashOn
                ? 'bg-yellow-400/80 text-black'
                : 'bg-white/15 hover:bg-white/25 text-white'
            }`}
            aria-label={flashOn ? 'Turn flash off' : 'Turn flash on'}
          >
            <IconFlash className="w-5 h-5" active={flashOn} />
          </button>

          <button
            type="button"
            onClick={handleCameraSwitch}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 transition-colors"
            aria-label="Switch camera"
          >
            <IconCameraSwitch className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      {/* ── Camera feed ───────────────────────────────────────────── */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        playsInline
        muted
        autoPlay
        aria-hidden="true"
      />

      {/* ── Success flash overlay ─────────────────────────────────── */}
      {scanSuccess && (
        <div className="absolute inset-0 bg-green-400/30 pointer-events-none animate-pulse" />
      )}

      {/* ── Scanning frame ────────────────────────────────────────── */}
      {!error && (
        <div className="relative w-[250px] h-[250px] z-10">
          {/* Semi-transparent border around the target area */}
          <div className="absolute inset-0 border-2 border-white/30 rounded-lg" />

          {/* Corner markers */}
          <CornerMarker position="tl" />
          <CornerMarker position="tr" />
          <CornerMarker position="bl" />
          <CornerMarker position="br" />

          {/* Scanning line animation */}
          <div className="absolute left-2 right-2 h-0.5 bg-green-400/70 animate-[scan_2s_ease-in-out_infinite]" />
        </div>
      )}

      {/* ── Bottom text ───────────────────────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 z-10 pb-10 pt-6 bg-gradient-to-t from-black/70 to-transparent text-center">
        {error ? (
          <div className="px-6">
            <p className="text-red-400 text-sm font-medium mb-3">{error}</p>
            <button
              type="button"
              onClick={handleClose}
              className="px-6 py-2 bg-white/15 hover:bg-white/25 rounded-full text-white text-sm transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <p className="text-white/80 text-sm font-medium tracking-wide">
            Align barcode within frame
          </p>
        )}
      </div>

      {/* ── Scanning-line keyframe (injected once) ────────────────── */}
      <style>{`
        @keyframes scan {
          0%, 100% { top: 10%; }
          50% { top: 88%; }
        }
      `}</style>
    </div>
  )
}

export default memo(BarcodeScannerModal)
