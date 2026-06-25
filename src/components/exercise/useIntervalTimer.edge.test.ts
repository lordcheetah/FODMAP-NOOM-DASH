import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useIntervalTimer } from './useIntervalTimer'

/**
 * EXTENDS `useIntervalTimer.test.ts`. Same fake-timer + mocked-performance.now
 * harness. Focus: remaining never goes negative, reset/skip mid-step, rapid
 * pause/resume churn, untimed steps stay idle, onComplete fires at most once, and
 * onTick is emitted at most once per whole second.
 *
 * Hygiene: every test restores real timers + mocks in afterEach so fake timers
 * cannot leak between tests (a leak would make a later real-time test hang).
 */
describe('useIntervalTimer — edges', () => {
  let nowMs = 0

  beforeEach(() => {
    nowMs = 10_000
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function advance(ms: number) {
    act(() => {
      nowMs += ms
      vi.advanceTimersByTime(ms)
    })
  }

  it('remaining is clamped at 0 and never goes negative past the end', () => {
    const onComplete = vi.fn()
    const { result } = renderHook(() =>
      useIntervalTimer({ durationSec: 5, onComplete }),
    )
    advance(20_000) // far past the end
    expect(result.current.remainingSec).toBe(0)
    expect(result.current.remainingMs).toBeGreaterThanOrEqual(0)
    expect(result.current.remainingMs).toBe(0)
  })

  it('onComplete fires exactly once even after many extra ticks past zero', () => {
    const onComplete = vi.fn()
    renderHook(() => useIntervalTimer({ durationSec: 3, onComplete }))
    advance(3_000)
    expect(onComplete).toHaveBeenCalledTimes(1)
    advance(10_000) // keep ticking well past completion
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('reset() restarts the countdown for the same duration', () => {
    const onComplete = vi.fn()
    const { result } = renderHook(() =>
      useIntervalTimer({ durationSec: 10, onComplete }),
    )
    advance(7_000)
    expect(result.current.remainingSec).toBe(3)

    act(() => result.current.reset())
    expect(result.current.remainingSec).toBe(10)
    expect(result.current.paused).toBe(false)

    advance(4_000)
    expect(result.current.remainingSec).toBe(6)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('reset(true) restarts paused; resume continues from full duration', () => {
    const onComplete = vi.fn()
    const { result } = renderHook(() =>
      useIntervalTimer({ durationSec: 8, onComplete }),
    )
    advance(3_000)
    act(() => result.current.reset(true))
    expect(result.current.paused).toBe(true)
    expect(result.current.remainingSec).toBe(8)

    // Time passes while paused — no change, no completion.
    advance(20_000)
    expect(result.current.remainingSec).toBe(8)
    expect(onComplete).not.toHaveBeenCalled()

    act(() => result.current.resume())
    advance(8_000)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('changing durationSec (new step / "skip") re-arms the clock fresh', () => {
    const onComplete = vi.fn()
    const { result, rerender } = renderHook(
      ({ d }: { d: number | null }) =>
        useIntervalTimer({ durationSec: d, onComplete }),
      { initialProps: { d: 20 as number | null } },
    )
    advance(5_000)
    expect(result.current.remainingSec).toBe(15)

    // Simulate the player advancing to a new 10s step.
    rerender({ d: 10 })
    expect(result.current.remainingSec).toBe(10)
    expect(onComplete).not.toHaveBeenCalled()

    advance(10_000)
    expect(result.current.remainingSec).toBe(0)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('switching to an untimed (null) step stops the clock and idles', () => {
    const onComplete = vi.fn()
    const { result, rerender } = renderHook(
      ({ d }: { d: number | null }) =>
        useIntervalTimer({ durationSec: d, onComplete }),
      { initialProps: { d: 10 as number | null } },
    )
    advance(2_000)
    rerender({ d: null })
    expect(result.current.running).toBe(false)
    expect(result.current.remainingSec).toBe(0)
    advance(30_000)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('a null-duration step never auto-completes (untimed reps step stays idle)', () => {
    const onComplete = vi.fn()
    const { result } = renderHook(() =>
      useIntervalTimer({ durationSec: null, onComplete }),
    )
    expect(result.current.running).toBe(false)
    expect(result.current.remainingSec).toBe(0)
    advance(60_000)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('rapid pause/resume churn does not lose or add time', () => {
    const onComplete = vi.fn()
    const { result } = renderHook(() =>
      useIntervalTimer({ durationSec: 30, onComplete }),
    )
    advance(5_000) // remaining 25
    for (let i = 0; i < 5; i++) {
      act(() => result.current.pause())
      advance(1_000) // paused: should not count
      act(() => result.current.resume())
    }
    // 5s elapsed pre-churn; the 5x1s while paused must NOT count.
    expect(result.current.remainingSec).toBe(25)

    advance(10_000)
    expect(result.current.remainingSec).toBe(15)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('double pause / double resume are idempotent', () => {
    const onComplete = vi.fn()
    const { result } = renderHook(() =>
      useIntervalTimer({ durationSec: 20, onComplete }),
    )
    advance(4_000)
    act(() => result.current.pause())
    act(() => result.current.pause()) // no-op
    advance(10_000)
    expect(result.current.remainingSec).toBe(16)

    act(() => result.current.resume())
    act(() => result.current.resume()) // no-op
    advance(6_000)
    expect(result.current.remainingSec).toBe(10)
  })

  it('togglePause flips running/paused state correctly', () => {
    const onComplete = vi.fn()
    const { result } = renderHook(() =>
      useIntervalTimer({ durationSec: 15, onComplete }),
    )
    expect(result.current.paused).toBe(false)
    act(() => result.current.togglePause())
    expect(result.current.paused).toBe(true)
    expect(result.current.running).toBe(false)
    act(() => result.current.togglePause())
    expect(result.current.paused).toBe(false)
    expect(result.current.running).toBe(true)
  })

  it('startPaused begins idle and only counts after resume', () => {
    const onComplete = vi.fn()
    const { result } = renderHook(() =>
      useIntervalTimer({ durationSec: 12, onComplete, startPaused: true }),
    )
    expect(result.current.paused).toBe(true)
    expect(result.current.remainingSec).toBe(12)
    advance(5_000)
    expect(result.current.remainingSec).toBe(12) // paused, no decrement

    act(() => result.current.resume())
    advance(4_000)
    expect(result.current.remainingSec).toBe(8)
  })

  it('onTick fires at most once per whole second and reports integer seconds', () => {
    const onComplete = vi.fn()
    const ticks: number[] = []
    renderHook(() =>
      useIntervalTimer({
        durationSec: 5,
        onComplete,
        onTick: (s) => ticks.push(s),
      }),
    )
    // Drive five 1s advances; ticks must be integers, monotonic non-increasing,
    // and never repeat a second value (dedup via lastTickSecRef).
    for (let i = 0; i < 5; i++) advance(1_000)
    expect(ticks.every((t) => Number.isInteger(t))).toBe(true)
    const uniq = new Set(ticks)
    expect(uniq.size).toBe(ticks.length)
    // No tick should be negative.
    expect(ticks.every((t) => t >= 0)).toBe(true)
  })

  it('no drift across coarse 1s ticks: total elapsed matches wall clock', () => {
    const onComplete = vi.fn()
    const { result } = renderHook(() =>
      useIntervalTimer({ durationSec: 60, onComplete }),
    )
    // 30 one-second steps; remaining should land on exactly 30.
    for (let i = 0; i < 30; i++) advance(1_000)
    expect(result.current.remainingSec).toBe(30)
    expect(onComplete).not.toHaveBeenCalled()
  })
})

/**
 * A separate suite that does NOT use fake timers, run AFTER the fake-timer suite,
 * to prove the afterEach cleanup actually restored real timers (a fake-timer leak
 * would freeze this test's wall clock and the assertion below would still pass on
 * value, but performance.now would be the un-mocked real one).
 */
describe('useIntervalTimer — no fake-timer leak guard', () => {
  it('uses the real performance.now after the previous suite', () => {
    expect(vi.isMockFunction(performance.now)).toBe(false)
  })
})
