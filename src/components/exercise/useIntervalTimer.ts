import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Wall-clock countdown for the routine player. Owns ONLY the ticking clock — the
 * step list + interval math live in the pure `expandWorkout`. The player feeds it
 * the current step's duration (or `null` for an untimed reps step, which pauses
 * the clock) and an `onComplete` callback fired when the countdown hits zero.
 *
 * Drift-safe: the remaining time is recomputed every tick from a target
 * timestamp (`performance.now() + durationSec*1000`), never by decrementing a
 * stored counter. So throttled / dropped `setInterval` ticks (background tab,
 * screen lock) don't accumulate error. On `visibilitychange → visible` it
 * reconciles immediately and, if the target already passed while hidden, fires
 * `onComplete` so the player auto-advances past elapsed steps.
 */
export interface IntervalTimerState {
  /** Whole seconds remaining on the current step (ceil), 0 when elapsed. */
  remainingSec: number
  /** Fractional seconds remaining (for progress rings / sub-second cues). */
  remainingMs: number
  running: boolean
  paused: boolean
}

export interface UseIntervalTimerOptions {
  /** Current step duration in seconds; `null` = untimed (clock idle). */
  durationSec: number | null
  /**
   * Identity of the current step (e.g. its index/key). The clock re-arms whenever
   * this changes, NOT only when `durationSec` changes — so back-to-back steps with
   * the SAME duration (equal-duration work intervals, EMOM slots, AMRAP loop-back)
   * still restart the countdown instead of staying elapsed. Defaults to 0 for
   * callers/tests that drive re-arming purely via `durationSec`.
   */
  stepKey?: number | string
  /** Fired once when the countdown reaches zero. */
  onComplete: () => void
  /** Optional per-tick callback with the integer seconds remaining (for cues). */
  onTick?: (remainingSec: number) => void
  /** Start paused (e.g. before the user presses play). Default false. */
  startPaused?: boolean
}

const now = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()

export function useIntervalTimer({
  durationSec,
  stepKey = 0,
  onComplete,
  onTick,
  startPaused = false,
}: UseIntervalTimerOptions): IntervalTimerState & {
  pause: () => void
  resume: () => void
  togglePause: () => void
  /** Restart the clock for a (possibly new) duration, respecting paused state. */
  reset: (paused?: boolean) => void
} {
  const timed = typeof durationSec === 'number' && durationSec > 0
  const [paused, setPaused] = useState(startPaused)
  const [remainingMs, setRemainingMs] = useState(
    timed ? durationSec * 1000 : 0,
  )

  // Absolute target timestamp; when paused we stash the remaining ms instead.
  const targetRef = useRef<number | null>(null)
  const pausedRemainingRef = useRef<number>(timed ? durationSec * 1000 : 0)
  const lastTickSecRef = useRef<number>(-1)
  const completedRef = useRef(false)

  // Keep the latest callbacks without re-arming the interval each render.
  const onCompleteRef = useRef(onComplete)
  const onTickRef = useRef(onTick)
  onCompleteRef.current = onComplete
  onTickRef.current = onTick

  const fireComplete = useCallback(() => {
    if (completedRef.current) return
    completedRef.current = true
    onCompleteRef.current()
  }, [])

  const recompute = useCallback(() => {
    if (!timed) {
      setRemainingMs(0)
      return
    }
    if (paused || targetRef.current == null) {
      setRemainingMs(pausedRemainingRef.current)
      return
    }
    const left = targetRef.current - now()
    if (left <= 0) {
      setRemainingMs(0)
      fireComplete()
      return
    }
    setRemainingMs(left)
    const sec = Math.ceil(left / 1000)
    if (sec !== lastTickSecRef.current) {
      lastTickSecRef.current = sec
      onTickRef.current?.(sec)
    }
  }, [timed, paused, fireComplete])

  // (Re)initialize whenever the step duration changes.
  const arm = useCallback(
    (asPaused: boolean) => {
      completedRef.current = false
      lastTickSecRef.current = -1
      if (!timed) {
        targetRef.current = null
        pausedRemainingRef.current = 0
        setRemainingMs(0)
        return
      }
      const ms = durationSec! * 1000
      pausedRemainingRef.current = ms
      setRemainingMs(ms)
      if (asPaused) {
        targetRef.current = null
      } else {
        targetRef.current = now() + ms
      }
    },
    [timed, durationSec],
  )

  // Re-arm on STEP IDENTITY change (new step), not just duration — so two
  // consecutive steps with the same duration still restart the countdown.
  // On a real step change the new step AUTO-RESUMES (paused is cleared): if the
  // user paused step N then skipped, step N+1 should start running, not begin
  // frozen with no indication. The very first arm respects `startPaused`.
  const firstArmRef = useRef(true)
  useEffect(() => {
    if (firstArmRef.current) {
      firstArmRef.current = false
      arm(paused)
      return
    }
    if (paused) setPaused(false)
    arm(false)
    // Intentionally NOT depending on `paused` — pause/resume handle that path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey, durationSec])

  const pause = useCallback(() => {
    setPaused((p) => {
      if (p) return p
      // Freeze remaining from the live target.
      if (timed && targetRef.current != null) {
        pausedRemainingRef.current = Math.max(0, targetRef.current - now())
      }
      targetRef.current = null
      return true
    })
  }, [timed])

  const resume = useCallback(() => {
    setPaused((p) => {
      if (!p) return p
      if (timed) targetRef.current = now() + pausedRemainingRef.current
      return false
    })
  }, [timed])

  const togglePause = useCallback(() => {
    if (paused) resume()
    else pause()
  }, [paused, pause, resume])

  const reset = useCallback(
    (asPaused = false) => {
      setPaused(asPaused)
      arm(asPaused)
    },
    [arm],
  )

  // Ticking loop + visibility reconciliation.
  useEffect(() => {
    if (!timed || paused) return
    const id = window.setInterval(recompute, 200)
    const onVisible = () => {
      if (document.visibilityState === 'visible') recompute()
    }
    document.addEventListener('visibilitychange', onVisible)
    // Immediate first tick so the UI doesn't wait 200ms.
    recompute()
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [timed, paused, recompute])

  return {
    remainingSec: timed ? Math.ceil(remainingMs / 1000) : 0,
    remainingMs,
    running: timed && !paused,
    paused,
    pause,
    resume,
    togglePause,
    reset,
  }
}
