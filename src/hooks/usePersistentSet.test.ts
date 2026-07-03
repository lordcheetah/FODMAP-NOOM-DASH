import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePersistentSet } from './usePersistentSet'

beforeEach(() => localStorage.clear())

describe('usePersistentSet', () => {
  it('persists toggles and rehydrates a fresh hook from localStorage', () => {
    const { result, unmount } = renderHook(() => usePersistentSet('k1'))
    act(() => result.current.toggle('a'))
    act(() => result.current.toggle('b', true))
    expect([...result.current.set].sort()).toEqual(['a', 'b'])
    expect(JSON.parse(localStorage.getItem('k1')!).sort()).toEqual(['a', 'b'])

    unmount()
    const { result: r2 } = renderHook(() => usePersistentSet('k1'))
    expect(r2.current.set.has('a')).toBe(true)
    expect(r2.current.set.has('b')).toBe(true)
  })

  it('toggle(value, false) removes; clear empties and persists', () => {
    const { result } = renderHook(() => usePersistentSet('k2'))
    act(() => result.current.toggle('x', true))
    act(() => result.current.toggle('x', false))
    expect(result.current.set.has('x')).toBe(false)

    act(() => result.current.toggle('y'))
    act(() => result.current.clear())
    expect(result.current.set.size).toBe(0)
    expect(localStorage.getItem('k2')).toBe('[]')
  })

  it('keeps separate values per key', () => {
    const { result: a } = renderHook(() => usePersistentSet('kA'))
    const { result: b } = renderHook(() => usePersistentSet('kB'))
    act(() => a.current.toggle('one'))
    expect(b.current.set.has('one')).toBe(false)
  })
})
