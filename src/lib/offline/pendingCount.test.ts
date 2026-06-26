import { describe, it, expect, afterEach } from 'vitest'
import { MutationCache, MutationObserver, QueryClient, onlineManager } from '@tanstack/react-query'
import { pendingMutationCount } from './pendingCount'

/** Resolve once a microtask/macrotask boundary passes so state settles. */
const tick = () => new Promise((r) => setTimeout(r, 0))

describe('pendingMutationCount', () => {
  afterEach(() => {
    // Restore default behavior (track navigator.onLine) for other tests.
    onlineManager.setOnline(undefined as unknown as boolean)
  })

  it('returns 0 for an empty cache', () => {
    const cache = new MutationCache()
    expect(pendingMutationCount(cache)).toBe(0)
  })

  it('counts paused (offline-queued) mutations', async () => {
    onlineManager.setOnline(false)
    // networkMode 'online' makes an offline mutation PAUSE before it ever runs
    // (the deterministic queued-write state we want to count).
    const qc = new QueryClient({
      defaultOptions: { mutations: { networkMode: 'online' } },
    })
    const observer = new MutationObserver(qc, {
      mutationFn: async () => 'ok',
    })
    // Subscribe so the observer drives the mutation lifecycle.
    const unsub = observer.subscribe(() => {})
    void observer.mutate()
    await tick()

    expect(pendingMutationCount(qc.getMutationCache())).toBe(1)
    unsub()
  })

  it('does not count a settled (success) mutation', async () => {
    onlineManager.setOnline(true)
    const qc = new QueryClient()
    const observer = new MutationObserver(qc, {
      mutationFn: async () => 'ok',
    })
    await observer.mutate()
    await tick()

    expect(pendingMutationCount(qc.getMutationCache())).toBe(0)
  })

  it('does not count a settled (error) mutation', async () => {
    onlineManager.setOnline(true)
    const qc = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })
    const observer = new MutationObserver(qc, {
      mutationFn: async () => {
        throw new Error('boom')
      },
    })
    await observer.mutate().catch(() => {})
    await tick()

    expect(pendingMutationCount(qc.getMutationCache())).toBe(0)
  })
})
