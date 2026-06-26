import { describe, it, expect, beforeEach } from 'vitest'
// fake-indexeddb is installed globally via src/test/setup.ts, but import the
// reset helper to isolate state between cases.
import { IDBFactory } from 'fake-indexeddb'
import { dexieStorage, createDexiePersister } from './dexiePersister'

describe('dexieStorage (AsyncStorage over Dexie)', () => {
  beforeEach(() => {
    // Fresh IndexedDB per test so keys don't leak across cases.
    globalThis.indexedDB = new IDBFactory()
  })

  it('round-trips set -> get', async () => {
    await dexieStorage.setItem('k', 'v')
    expect(await dexieStorage.getItem('k')).toBe('v')
  })

  it('overwrites the same key', async () => {
    await dexieStorage.setItem('k', 'first')
    await dexieStorage.setItem('k', 'second')
    expect(await dexieStorage.getItem('k')).toBe('second')
  })

  it('returns null after remove', async () => {
    await dexieStorage.setItem('k', 'v')
    await dexieStorage.removeItem('k')
    expect(await dexieStorage.getItem('k')).toBeNull()
  })

  it('returns null for a missing key', async () => {
    expect(await dexieStorage.getItem('does-not-exist')).toBeNull()
  })
})

describe('createDexiePersister', () => {
  it('builds a persister exposing the expected methods', () => {
    const persister = createDexiePersister()
    expect(typeof persister.persistClient).toBe('function')
    expect(typeof persister.restoreClient).toBe('function')
    expect(typeof persister.removeClient).toBe('function')
  })
})
