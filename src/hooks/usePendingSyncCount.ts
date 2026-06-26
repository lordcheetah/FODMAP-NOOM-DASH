import { useSyncExternalStore } from 'react'
import { queryClient } from '@/lib/offline/queryClient'
import { pendingMutationCount } from '@/lib/offline/pendingCount'

/**
 * Live count of not-yet-synced writes (paused + in-flight), driven by the
 * shared `queryClient`'s mutation cache. Re-renders whenever the mutation cache
 * changes (a write is queued, starts, or settles) and cleans up its
 * subscription on unmount.
 */
export function usePendingSyncCount(): number {
  const cache = queryClient.getMutationCache()
  return useSyncExternalStore(
    // subscribe: MutationCache.subscribe returns an unsubscribe fn.
    (onStoreChange) => cache.subscribe(() => onStoreChange()),
    () => pendingMutationCount(cache),
    () => 0,
  )
}
