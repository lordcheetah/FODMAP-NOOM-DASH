import { useSyncExternalStore } from 'react'
import { onlineManager } from '@tanstack/react-query'

/**
 * Live online/offline state, sourced from TanStack Query's `onlineManager`
 * (which already tracks `navigator.onLine` plus the browser online/offline
 * events). Returns `true` when online.
 *
 * Read-only: this hook only REFLECTS connectivity. Resuming the paused write
 * queue on reconnect is handled once, in `src/lib/offline/queryClient.ts`'s
 * `onlineManager.subscribe` listener — do not duplicate that here.
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    // subscribe: onlineManager.subscribe returns an unsubscribe fn.
    (onStoreChange) => onlineManager.subscribe(() => onStoreChange()),
    // getSnapshot: seed + read current state.
    () => onlineManager.isOnline(),
    // getServerSnapshot: assume online during SSR/non-browser.
    () => true,
  )
}
