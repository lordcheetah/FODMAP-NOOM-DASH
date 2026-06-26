import { QueryClient, onlineManager } from '@tanstack/react-query'
import { registerMutationDefaults } from '@/lib/db/mutationDefaults'

/**
 * Bump this string on ANY change to a persisted query key, row shape, or schema
 * so stale IndexedDB caches are dropped on next load (instead of hydrating data
 * that no longer matches the current code). Manual knob — there is no automatic
 * migration of the persisted blob.
 */
export const CACHE_BUSTER = 'v1-2026-06'

const WEEK_MS = 1000 * 60 * 60 * 24 * 7

/**
 * The single app-wide QueryClient. Created at module scope (not in render) so
 * the same instance is shared by the hooks, the persister, and the registered
 * mutation defaults.
 *
 * `networkMode: 'offlineFirst'` makes queries serve the persisted cache (and
 * not error) while offline, and makes mutations PAUSE (not fail) while offline
 * so they can be persisted and resumed. `gcTime` must be >= the persister
 * `maxAge` or restored queries get garbage-collected immediately on load.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'offlineFirst',
      gcTime: WEEK_MS,
      staleTime: 1000 * 60 * 5, // 5m
      retry: 1,
    },
    mutations: {
      networkMode: 'offlineFirst',
      retry: 1,
    },
  },
})

// R1 (the #1 trap): mutation defaults MUST be registered before
// `resumePausedMutations()` runs (it fires from the persister's rehydrate
// `onSuccess`, a microtask after load). Registering at module load — when this
// module is first imported by main.tsx — guarantees that ordering.
registerMutationDefaults(queryClient)

// Resume the paused write queue when connectivity returns while the app stayed
// open (the persister handles the reload-time resume separately). Subscribing to
// onlineManager covers navigator.onLine + the browser online/offline events.
onlineManager.subscribe((online) => {
  if (online) {
    void queryClient
      .resumePausedMutations()
      .then(() => queryClient.invalidateQueries())
  }
})
