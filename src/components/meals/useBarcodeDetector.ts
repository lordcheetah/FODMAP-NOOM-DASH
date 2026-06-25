import { useEffect, useRef, useState } from 'react'

/**
 * Camera + barcode-decode lifecycle for the scanner, isolated from presentation
 * (mirrors the Phase 2 `useIntervalTimer` split). Owns: secure-context detection,
 * `getUserMedia`, the decode loop via the `barcode-detector` polyfill, single-fire
 * debounce, and — critically — FULL camera teardown on unmount / stop / detect.
 *
 * SECURE CONTEXT: `getUserMedia` (camera) only runs on HTTPS or `localhost`. A LAN
 * IP over plain http (e.g. http://192.168.x.x:5173 from a phone) is blocked by the
 * browser. Test on the deployed HTTPS URL or an HTTPS dev tunnel. On an insecure or
 * unsupported origin this hook resolves to status 'unsupported' and never throws.
 *
 * POLYFILL: `barcode-detector` exposes a single `BarcodeDetector` interface — it
 * uses the native API where present (Chrome/Android, 0 KB) and lazily loads a
 * zxing-wasm fallback elsewhere. We import it dynamically so the WASM only loads
 * when the scanner is actually opened, keeping it out of the entry/vendor chunk.
 */

/** Retail formats only (faster, fewer false positives) — EAN/UPC. */
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const

export type ScannerStatus =
  | 'idle'
  | 'starting'
  | 'scanning'
  | 'permission-denied'
  | 'no-camera'
  | 'unsupported'

export interface UseBarcodeDetectorResult {
  videoRef: React.RefObject<HTMLVideoElement>
  status: ScannerStatus
}

interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>
}

function hasGetUserMedia(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  )
}

/**
 * Start the camera + decode loop while `active`. Calls `onDetected(barcode)` once
 * (debounced) on the first successful read, then stops the stream.
 */
export function useBarcodeDetector(
  active: boolean,
  onDetected: (barcode: string) => void,
): UseBarcodeDetectorResult {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<ScannerStatus>('idle')

  // Keep the latest callback without re-running the effect on every render.
  const onDetectedRef = useRef(onDetected)
  onDetectedRef.current = onDetected

  useEffect(() => {
    if (!active) return

    let stream: MediaStream | null = null
    let rafId = 0
    let cancelled = false
    let fired = false

    const stop = () => {
      cancelled = true
      if (rafId) cancelAnimationFrame(rafId)
      if (stream) {
        stream.getTracks().forEach((t) => t.stop())
        stream = null
      }
      const video = videoRef.current
      if (video) video.srcObject = null
    }

    const run = async () => {
      if (!hasGetUserMedia() || typeof window === 'undefined') {
        setStatus('unsupported')
        return
      }
      // Secure-context guard: getUserMedia throws on insecure origins anyway, but
      // failing fast gives a clearer "unsupported" message.
      if (window.isSecureContext === false) {
        setStatus('unsupported')
        return
      }

      let Detector: new (opts: { formats: readonly string[] }) => BarcodeDetectorLike
      try {
        // Lazy-load the polyfill (native path = 0 KB; zxing-wasm only here).
        const mod = await import('barcode-detector/pure')
        Detector = mod.BarcodeDetector as unknown as typeof Detector
      } catch {
        setStatus('unsupported')
        return
      }
      if (cancelled) return

      setStatus('starting')
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
      } catch (err) {
        const name = (err as DOMException)?.name
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setStatus('permission-denied')
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setStatus('no-camera')
        } else {
          setStatus('unsupported')
        }
        return
      }
      if (cancelled) {
        stop()
        return
      }

      const video = videoRef.current
      if (!video) {
        stop()
        return
      }
      video.srcObject = stream
      video.setAttribute('playsinline', 'true') // iOS Safari needs this.
      try {
        await video.play()
      } catch {
        // Autoplay can reject without a user gesture; the loop still reads frames.
      }
      if (cancelled) {
        stop()
        return
      }

      const detector = new Detector({ formats: FORMATS })
      setStatus('scanning')

      const tick = async () => {
        if (cancelled || fired) return
        try {
          if (video.readyState >= 2 && video.videoWidth > 0) {
            const codes = await detector.detect(video)
            const value = codes[0]?.rawValue?.trim()
            if (value && !fired) {
              fired = true
              stop()
              onDetectedRef.current(value)
              return
            }
          }
        } catch {
          // Per-frame decode errors are non-fatal; keep scanning.
        }
        if (!cancelled && !fired) rafId = requestAnimationFrame(tick)
      }
      rafId = requestAnimationFrame(tick)
    }

    void run()
    return stop
  }, [active])

  return { videoRef, status }
}
