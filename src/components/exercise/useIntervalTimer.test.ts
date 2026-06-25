import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useIntervalTimer } from './useIntervalTimer'

/**
 * The hook must drive the countdown from a wall-clock target timestamp and
 * recompute remaining each tick — NOT decrement a stored counter — so dropped /
 * throttled ticks (background tab, screen lock) don't drift, and steps that
 * elapsed while hidden auto-advance.
 */
describe('useIntervalTimer', () => {
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

  /** Advance both the mocked clock and the fake interval timers together. */
  function advance(ms: number) {
    act(() => {
      nowMs += ms
      vi.advanceTimersByTime(ms)
    })
  }

  it('counts down a timed step and fires onComplete at zero', () => {
    const onComplete = vi.fn()
    const { result } = renderHook(() =>
      useIntervalTimer({ durationSec: 10, onComplete }),
    )

    expect(result.current.remainingSec).toBe(10)
    expect(result.current.running).toBe(true)

    advance(4_000)
    expect(result.current.remainingSec).toBe(6)
    expect(onComplete).not.toHaveBeenCalled()

    advance(6_000)
    expect(result.current.remainingSec).toBe(0)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('recomputes from the timestamp (no drift) when many ticks are dropped', () => {
    const onComplete = vi.fn()
    const { result } = renderHook(() =>
      useIntervalTimer({ durationSec: 30, onComplete }),
    )

    // Simulate the tab being hidden: the wall clock jumps 20s but the interval
    // only fires once. A decrement-counter timer would still read ~30s; a
    // wall-clock timer reads 10s.
    act(() => {
      nowMs += 20_000
      vi.advanceTimersByTime(200)
    })
    expect(result.current.remainingSec).toBe(10)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('auto-advances (onComplete) for a step that fully elapsed while hidden', () => {
    const onComplete = vi.fn()
    renderHook(() => useIntervalTimer({ durationSec: 15, onComplete }))

    act(() => {
      nowMs += 60_000 // far past the 15s step
      vi.advanceTimersByTime(200)
    })
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('does not run for an untimed (reps) step', () => {
    const onComplete = vi.fn()
    const { result } = renderHook(() =>
      useIntervalTimer({ durationSec: null, onComplete }),
    )
    expect(result.current.running).toBe(false)
    advance(5_000)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('pause freezes remaining and resume continues from the frozen value', () => {
    const onComplete = vi.fn()
    const { result } = renderHook(() =>
      useIntervalTimer({ durationSec: 20, onComplete }),
    )

    advance(5_000)
    expect(result.current.remainingSec).toBe(15)

    act(() => result.current.pause())
    // Time passes while paused; remaining must NOT change.
    advance(10_000)
    expect(result.current.remainingSec).toBe(15)
    expect(result.current.paused).toBe(true)

    act(() => result.current.resume())
    advance(5_000)
    expect(result.current.remainingSec).toBe(10)
    expect(onComplete).not.toHaveBeenCalled()
  })

  // B1 regression: two consecutive steps with the SAME duration. The clock must
  // re-arm on STEP IDENTITY (stepKey), not just on durationSec — otherwise the
  // countdown stays elapsed and never auto-advances (routine freezes).
  it('re-arms on stepKey change even when durationSec is unchanged (B1)', () => {
    const onComplete = vi.fn()
    const { result, rerender } = renderHook(
      ({ k }: { k: number }) =>
        useIntervalTimer({ durationSec: 30, stepKey: k, onComplete }),
      { initialProps: { k: 0 } },
    )

    // Complete step 0.
    advance(30_000)
    expect(result.current.remainingSec).toBe(0)
    expect(onComplete).toHaveBeenCalledTimes(1)

    // Advance to step 1 — SAME 30s duration, new identity.
    rerender({ k: 1 })
    expect(result.current.remainingSec).toBe(30)
    expect(result.current.running).toBe(true)

    // It must count down and fire onComplete AGAIN.
    advance(30_000)
    expect(result.current.remainingSec).toBe(0)
    expect(onComplete).toHaveBeenCalledTimes(2)
  })

  // M1: pausing a step then advancing (skip/done/prev → new stepKey) must
  // auto-resume the next step rather than leaving it frozen/pre-paused.
  it('auto-resumes the next step when advanced while paused (M1)', () => {
    const onComplete = vi.fn()
    const { result, rerender } = renderHook(
      ({ k }: { k: number }) =>
        useIntervalTimer({ durationSec: 20, stepKey: k, onComplete }),
      { initialProps: { k: 0 } },
    )

    advance(5_000)
    act(() => result.current.pause())
    expect(result.current.paused).toBe(true)

    // User taps Skip while paused → player advances to a new step identity.
    rerender({ k: 1 })
    expect(result.current.paused).toBe(false)
    expect(result.current.running).toBe(true)
    expect(result.current.remainingSec).toBe(20)

    advance(20_000)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })
})
