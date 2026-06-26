import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { onlineManager } from '@tanstack/react-query'
import { useOnlineStatus } from './useOnlineStatus'

describe('useOnlineStatus', () => {
  afterEach(() => {
    // Restore default behavior (track navigator.onLine) for other tests.
    onlineManager.setOnline(undefined as unknown as boolean)
  })

  it('reflects onlineManager state and updates when it toggles', () => {
    onlineManager.setOnline(true)
    let result!: { current: boolean }
    act(() => {
      ;({ result } = renderHook(() => useOnlineStatus()))
    })
    expect(result.current).toBe(true)

    act(() => onlineManager.setOnline(false))
    expect(result.current).toBe(false)

    act(() => onlineManager.setOnline(true))
    expect(result.current).toBe(true)
  })
})
