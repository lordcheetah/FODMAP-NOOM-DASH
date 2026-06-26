import Dexie, { type Table } from 'dexie'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import type { AsyncStorage } from '@tanstack/query-persist-client-core'

/**
 * Dexie-backed key/value store for the persisted TanStack Query cache.
 *
 * The whole dehydrated client (successful queries + paused mutations) is
 * serialized to ONE JSON string by the async-storage persister and stored here
 * under a single key. This is the documented `createAsyncStoragePersister`
 * pattern; we back it with Dexie (per CLAUDE.md's "Dexie for offline cache +
 * write outbox" note) instead of localStorage so the blob can grow past the
 * ~5MB localStorage cap and stay off the main thread.
 *
 * Mirrors the singleton + env-guard style of `src/lib/supabase.ts`.
 */
class OfflineCacheDB extends Dexie {
  kv!: Table<{ key: string; value: string }, string>

  constructor() {
    super('tanstackQueryCache')
    this.version(1).stores({ kv: 'key' }) // primary key = key
  }
}

/** True when IndexedDB exists (browser). False under SSR / bare Node. */
const hasIndexedDB = typeof indexedDB !== 'undefined'

/** Lazily-created singleton DB; null when IndexedDB is unavailable. */
let db: OfflineCacheDB | null = null
function getDb(): OfflineCacheDB | null {
  if (!hasIndexedDB) return null
  if (!db) db = new OfflineCacheDB()
  return db
}

/**
 * AsyncStorage adapter over the Dexie `kv` table. No-ops (returns null / does
 * nothing) when IndexedDB is unavailable so SSR / Node never crash.
 */
export const dexieStorage: AsyncStorage<string> = {
  getItem: async (key: string): Promise<string | null> => {
    const d = getDb()
    if (!d) return null
    const row = await d.kv.get(key)
    return row?.value ?? null
  },
  setItem: async (key: string, value: string): Promise<void> => {
    const d = getDb()
    if (!d) return
    await d.kv.put({ key, value })
  },
  removeItem: async (key: string): Promise<void> => {
    const d = getDb()
    if (!d) return
    await d.kv.delete(key)
  },
}

/**
 * Build the async-storage persister used by `PersistQueryClientProvider`.
 * `throttleTime` coalesces the rapid writes that follow an optimistic update.
 */
export function createDexiePersister() {
  return createAsyncStoragePersister({
    storage: dexieStorage,
    key: 'fnd-rq-cache',
    throttleTime: 1000,
  })
}
