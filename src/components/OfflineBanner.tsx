import { CloudOff, RefreshCw } from 'lucide-react'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { usePendingSyncCount } from '@/hooks/usePendingSyncCount'

/**
 * Unobtrusive sync-state indicator shown below the app header.
 *
 * States:
 *  - Offline                -> "Offline — changes are saved on this device and
 *                              will sync when you reconnect."
 *  - Online, N > 0 pending  -> "Syncing N change(s)…"
 *  - Online, 0 pending      -> renders nothing.
 *
 * It only REFLECTS state; the reconnect/resume of the write queue lives in
 * `queryClient.ts`. Accessible (`role="status"`, `aria-live="polite"`) and thin
 * so it never blocks the UI or the auth gate. It conveys SYNC state only — it
 * does not imply any food/diet data is verified or "safe".
 */
export default function OfflineBanner() {
  const isOnline = useOnlineStatus()
  const pending = usePendingSyncCount()

  // Online and nothing queued: nothing to show.
  if (isOnline && pending === 0) return null

  if (!isOnline) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 border-b bg-amber-50 px-4 py-1.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
      >
        <CloudOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          Offline — changes are saved on this device and will sync when you
          reconnect.
        </span>
      </div>
    )
  }

  // Online with a non-empty write queue still flushing.
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 border-b bg-sky-50 px-4 py-1.5 text-xs text-sky-800"
    >
      <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
      <span>
        Syncing {pending} change{pending === 1 ? '' : 's'}…
      </span>
    </div>
  )
}
