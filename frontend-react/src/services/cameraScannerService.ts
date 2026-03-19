// Uses 'barcode-detector' polyfill — works on ALL browsers (Safari, Firefox, Chrome, Edge)
// The polyfill uses ZXing WASM internally, bundled at build time (works offline)
import { BarcodeDetector as BarcodeDetectorPolyfill } from 'barcode-detector'

// ─── Types ───────────────────────────────────────────────────────────

export interface ScanResult {
  barcode: string
  format: string
  timestamp: number
}

export interface ScannerConfig {
  onScan: (result: ScanResult) => void
  onError: (error: string) => void
  cooldownMs?: number
  formats?: string[]
}

// ─── BarcodeDetector type ────────────────────────────────────────────

interface DetectedBarcode {
  rawValue: string
  format: string
  boundingBox: DOMRectReadOnly
  cornerPoints: Array<{ x: number; y: number }>
}

interface BarcodeDetectorInstance {
  detect: (source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap) => Promise<DetectedBarcode[]>
}

interface BarcodeDetectorConstructor {
  new (options?: { formats: string[] }): BarcodeDetectorInstance
  getSupportedFormats: () => Promise<string[]>
}

// ─── Constants ───────────────────────────────────────────────────────

const DEFAULT_COOLDOWN_MS = 2000

const DEFAULT_FORMATS = [
  'ean_13',
  'ean_8',
  'code_128',
  'code_39',
  'qr_code',
  'upc_a',
  'upc_e',
]

// ─── Service ─────────────────────────────────────────────────────────

export class CameraScannerService {
  private stream: MediaStream | null = null
  private videoElement: HTMLVideoElement | null = null
  private config: ScannerConfig | null = null
  private detector: BarcodeDetectorInstance | null = null
  private animationFrameId: number | null = null
  private scanning = false
  private cooldownMap = new Map<string, number>()
  private facingMode: 'environment' | 'user' = 'environment'
  private lastDetectTime = 0
  private static readonly MIN_FRAME_INTERVAL = 150 // ~6-7 FPS to save battery

  /**
   * Checks if camera access is available.
   * BarcodeDetector is always available via the polyfill (works on ALL browsers).
   */
  isSupported(): boolean {
    return (
      typeof navigator.mediaDevices !== 'undefined' &&
      typeof navigator.mediaDevices.getUserMedia === 'function'
    )
  }

  /**
   * Checks only whether the camera is accessible (for error messaging).
   */
  hasCameraAccess(): boolean {
    return this.isSupported()
  }

  /**
   * Opens the camera stream on the given video element and starts the
   * barcode-detection loop.
   */
  async start(
    videoElement: HTMLVideoElement,
    config: ScannerConfig,
  ): Promise<void> {
    this.videoElement = videoElement
    this.config = config

    // Use native BarcodeDetector if available, otherwise use polyfill
    // The polyfill (barcode-detector package) uses ZXing WASM — works on ALL browsers
    const BarcodeDetectorCtor: BarcodeDetectorConstructor =
      ('BarcodeDetector' in window
        ? (window as unknown as Record<string, unknown>).BarcodeDetector
        : BarcodeDetectorPolyfill) as BarcodeDetectorConstructor

    const formats = config.formats ?? DEFAULT_FORMATS

    try {
      // Validate that the browser/polyfill supports the requested formats
      const supported = await BarcodeDetectorCtor.getSupportedFormats()
      const validFormats = formats.filter((f) => supported.includes(f))

      if (validFormats.length === 0) {
        config.onError('No supported barcode formats found')
        return
      }

      this.detector = new BarcodeDetectorCtor({ formats: validFormats })
    } catch {
      config.onError('Failed to initialise barcode detector')
      return
    }

    await this.startCamera()
    this.startScanLoop()
  }

  /**
   * Stops the camera stream and the scanning loop. Safe to call multiple
   * times or when already stopped.
   */
  stop(): void {
    this.scanning = false

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }

    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop()
      }
      this.stream = null
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null
      this.videoElement = null
    }

    this.detector = null
    this.config = null
    this.cooldownMap.clear()
  }

  /**
   * Toggles the torch (flashlight) if the active video track supports it.
   * Returns the new torch state (true = on).
   */
  async toggleFlash(): Promise<boolean> {
    if (!this.stream) return false

    const track = this.stream.getVideoTracks()[0]
    if (!track) return false

    try {
      const capabilities = track.getCapabilities?.() as Record<string, unknown> | undefined
      if (!capabilities?.torch) return false

      const settings = track.getSettings() as Record<string, unknown>
      const currentTorch = Boolean(settings.torch)
      const newTorch = !currentTorch

      await track.applyConstraints({
        advanced: [{ torch: newTorch } as MediaTrackConstraintSet],
      })

      return newTorch
    } catch {
      return false
    }
  }

  /**
   * Switches between front and back cameras.  Restarts the stream and
   * resumes scanning automatically.
   */
  async switchCamera(): Promise<void> {
    this.facingMode =
      this.facingMode === 'environment' ? 'user' : 'environment'

    // Stop the current stream but keep the rest of the state intact
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop()
      }
      this.stream = null
    }

    await this.startCamera()
  }

  // ─── Private helpers ────────────────────────────────────────────────

  private async startCamera(): Promise<void> {
    if (!this.videoElement || !this.config) return

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: this.facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })

      this.videoElement.srcObject = this.stream
      await this.videoElement.play()
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Camera permission was denied. Please allow camera access and try again.'
          : 'Unable to access camera. Please check your device settings.'
      this.config.onError(message)
    }
  }

  private startScanLoop(): void {
    this.scanning = true
    const loop = async () => {
      if (!this.scanning) return

      await this.detectFrame()

      this.animationFrameId = requestAnimationFrame(loop)
    }
    this.animationFrameId = requestAnimationFrame(loop)
  }

  private async detectFrame(): Promise<void> {
    if (!this.detector || !this.videoElement || !this.config) return
    if (this.videoElement.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) return

    // Throttle detection to ~6-7 FPS to save CPU/battery on mobile
    const now = Date.now()
    if (now - this.lastDetectTime < CameraScannerService.MIN_FRAME_INTERVAL) return
    this.lastDetectTime = now

    try {
      const barcodes = await this.detector.detect(this.videoElement)

      for (const barcode of barcodes) {
        const value = barcode.rawValue.trim()
        if (!value) continue

        if (this.isOnCooldown(value)) continue

        this.setCooldown(value)

        // Haptic feedback
        navigator.vibrate?.(200)

        this.config.onScan({
          barcode: value,
          format: barcode.format,
          timestamp: Date.now(),
        })
      }
    } catch {
      // Detection can fail on individual frames (e.g. the video element
      // is mid-resize).  Silently continue — the next frame will retry.
    }
  }

  private isOnCooldown(barcode: string): boolean {
    const lastSeen = this.cooldownMap.get(barcode)
    if (lastSeen === undefined) return false

    const cooldownMs = this.config?.cooldownMs ?? DEFAULT_COOLDOWN_MS
    return Date.now() - lastSeen < cooldownMs
  }

  private setCooldown(barcode: string): void {
    this.cooldownMap.set(barcode, Date.now())
  }
}

// Singleton — one scanner instance shared across the app
export const cameraScannerService = new CameraScannerService()
