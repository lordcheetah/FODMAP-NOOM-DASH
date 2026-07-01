import { describe, it, expect } from 'vitest'
import { dedupeByKeyKeepFirst } from './recents'

describe('dedupeByKeyKeepFirst', () => {
  it('keeps the first occurrence per key, preserving order', () => {
    const items = [
      { id: 'a', n: 1 },
      { id: 'b', n: 2 },
      { id: 'a', n: 3 },
      { id: 'c', n: 4 },
      { id: 'b', n: 5 },
    ]
    expect(dedupeByKeyKeepFirst(items, (x) => x.id)).toEqual([
      { id: 'a', n: 1 },
      { id: 'b', n: 2 },
      { id: 'c', n: 4 },
    ])
  })

  it('drops rows with a null/undefined key', () => {
    const items = [
      { id: 'a' },
      { id: null },
      { id: undefined },
      { id: 'a' },
      { id: 'b' },
    ]
    expect(dedupeByKeyKeepFirst(items, (x) => x.id)).toEqual([
      { id: 'a' },
      { id: 'b' },
    ])
  })

  it('returns [] for an empty list', () => {
    expect(dedupeByKeyKeepFirst([], () => 'k')).toEqual([])
  })

  it('handles all-distinct and all-same inputs', () => {
    expect(dedupeByKeyKeepFirst([{ k: 'x' }, { k: 'y' }], (i) => i.k)).toHaveLength(2)
    expect(
      dedupeByKeyKeepFirst([{ k: 'x' }, { k: 'x' }, { k: 'x' }], (i) => i.k),
    ).toEqual([{ k: 'x' }])
  })
})
