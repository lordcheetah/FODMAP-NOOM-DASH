import type { MutationCache } from '@tanstack/react-query'

/**
 * Count the writes that have not yet been flushed to the server: those PAUSED
 * (queued while offline) plus those currently in-flight (`pending`). Settled
 * mutations (`success`/`error`/`idle`) are not counted.
 *
 * Pure and dependency-injected — it takes a `MutationCache` so unit tests can
 * pass a real one (from a throwaway `QueryClient`) without rendering.
 */
export function pendingMutationCount(mutationCache: MutationCache): number {
  return mutationCache
    .getAll()
    .filter((m) => m.state.isPaused || m.state.status === 'pending').length
}
