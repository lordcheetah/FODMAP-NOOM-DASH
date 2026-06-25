import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useBarcodeDetector, type ScannerStatus } from './useBarcodeDetector'

/**
 * Camera barcode scanner. Opens the rear camera, decodes a retail barcode
 * (EAN/UPC) once, and emits it via `onDetected`. Every failure mode renders a
 * friendly message with an "Add manually" escape — never a raw exception. The
 * camera stream is fully released on detect / cancel / unmount (see the hook).
 *
 * SECURE CONTEXT: the camera only works on HTTPS or localhost. On insecure /
 * unsupported origins the scanner shows the 'unsupported' state and points the
 * user at manual entry. See `useBarcodeDetector` for the testing notes.
 */
export interface BarcodeScannerProps {
  open: boolean
  onClose: () => void
  /** Fired once with the decoded barcode; the stream is already stopped. */
  onDetected: (barcode: string) => void
  /** User chose to skip the camera and type the product in. */
  onManual: () => void
}

const MESSAGE: Record<Exclude<ScannerStatus, 'scanning'>, string> = {
  idle: '',
  starting: 'Starting camera…',
  'permission-denied':
    'Camera permission denied. Enable it in your browser settings, or add the food manually.',
  'no-camera': 'No camera found. Add the food manually.',
  unsupported: "Scanning isn't available here. Add the food manually.",
}

export function BarcodeScanner({
  open,
  onClose,
  onDetected,
  onManual,
}: BarcodeScannerProps) {
  const { videoRef, status } = useBarcodeDetector(open, onDetected)

  const isError =
    status === 'permission-denied' ||
    status === 'no-camera' ||
    status === 'unsupported'

  return (
    <Dialog open={open} onClose={onClose} variant="sheet" title="Scan barcode">
      <div className="space-y-4">
        {!isError && (
          <div className="relative overflow-hidden rounded-lg bg-black">
            {/* playsinline/muted set in the hook + here for iOS Safari. */}
            <video
              ref={videoRef}
              className="aspect-[4/3] w-full object-cover"
              muted
              playsInline
              aria-label="Camera preview"
            />
            {/* Aiming guide overlay. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <div className="h-24 w-3/4 rounded-lg border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
            </div>
            {status === 'scanning' && (
              <p className="absolute bottom-2 left-0 right-0 text-center text-xs text-white/90">
                Point the camera at a barcode
              </p>
            )}
          </div>
        )}

        {status === 'starting' && (
          <p className="text-sm text-muted-foreground">{MESSAGE.starting}</p>
        )}

        {isError && (
          <p className="rounded-lg border bg-muted p-3 text-sm text-muted-foreground">
            {MESSAGE[status]}
          </p>
        )}

        {status === 'scanning' && (
          <p className="text-xs text-muted-foreground">
            Couldn&apos;t read a code? Try better lighting, or add the food
            manually.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="outline" onClick={onManual}>
            Add manually
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
