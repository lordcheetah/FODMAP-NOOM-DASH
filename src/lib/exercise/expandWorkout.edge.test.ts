import { describe, it, expect } from 'vitest'
import {
  expandWorkout,
  DEFAULT_WORK_SEC,
  DEFAULT_EMOM_SLOT_SEC,
  DEFAULT_HOLD_SEC,
  type ExpandExercise,
  type ExpandInput,
  type WorkoutStep,
} from './expandWorkout'
import { WORKOUT_FORMATS, type WorkoutFormat } from './types'

/**
 * Extra hardening for the interval expander. These EXTEND
 * `expandWorkout.test.ts` (the happy-path / per-format coverage) and focus on:
 * invariants that must hold for EVERY format (no 0/negative/NaN timed durations,
 * contiguous indexes, correct round bookkeeping), fallback-precedence corners,
 * and mixed-type exercise lists.
 */

function ex(over: Partial<ExpandExercise> & { exerciseId: string }): ExpandExercise {
  return {
    name: over.name ?? over.exerciseId,
    defaultType: 'reps',
    ...over,
  }
}

/** Steps whose duration is meant to be a real countdown (timer-driven). */
function timedSteps(steps: WorkoutStep[]): WorkoutStep[] {
  return steps.filter((s) => s.kind === 'work' || s.kind === 'rest' || s.kind === 'hold' || s.kind === 'prepare')
}

describe('expandWorkout — universal invariants across every format', () => {
  // One representative input per format that exercises a mix of types.
  const inputs: Record<WorkoutFormat, ExpandInput> = {
    timed: {
      format: 'timed',
      rounds: 2,
      defaultWorkSec: 20,
      defaultRestSec: 10,
      prepareSec: 5,
      exercises: [
        ex({ exerciseId: 'a', defaultType: 'duration' }),
        ex({ exerciseId: 'b', defaultType: 'hold', holdSec: 30 }),
      ],
    },
    rounds: {
      format: 'rounds',
      rounds: 3,
      defaultRestSec: 15,
      exercises: [
        ex({ exerciseId: 'a', defaultType: 'reps', reps: 12 }),
        ex({ exerciseId: 'b', defaultType: 'duration', workSec: 40 }),
      ],
    },
    amrap: {
      format: 'amrap',
      durationMin: 10,
      exercises: [
        ex({ exerciseId: 'a', defaultType: 'duration' }),
        ex({ exerciseId: 'b', defaultType: 'reps', reps: 10 }),
      ],
    },
    emom: {
      format: 'emom',
      rounds: 6,
      defaultWorkSec: 45,
      exercises: [ex({ exerciseId: 'a' }), ex({ exerciseId: 'b' })],
    },
    reps: {
      format: 'reps',
      exercises: [
        ex({ exerciseId: 'a', reps: 15, restSec: 30 }),
        ex({ exerciseId: 'b', defaultType: 'hold', holdSec: 20 }),
      ],
    },
    freestyle: {
      format: 'freestyle',
      exercises: [
        ex({ exerciseId: 'a', defaultType: 'duration', workSec: 25 }),
        ex({ exerciseId: 'b', defaultType: 'reps', reps: 8 }),
      ],
    },
  }

  // Guard: the table covers the canonical enum (catches a new format added to
  // types.ts that nobody wrote a case for).
  it('covers every declared WorkoutFormat', () => {
    expect(Object.keys(inputs).sort()).toEqual([...WORKOUT_FORMATS].sort())
  })

  for (const format of WORKOUT_FORMATS) {
    describe(format, () => {
      const steps = expandWorkout(inputs[format])

      it('emits at least one step', () => {
        expect(steps.length).toBeGreaterThan(0)
      })

      it('has contiguous 0-based indexes', () => {
        expect(steps.map((s) => s.index)).toEqual(steps.map((_, i) => i))
      })

      it('never yields a 0/negative/NaN duration on a timed step', () => {
        for (const s of timedSteps(steps)) {
          expect(s.durationSec).not.toBeNull()
          expect(Number.isFinite(s.durationSec)).toBe(true)
          expect(s.durationSec as number).toBeGreaterThan(0)
        }
      })

      it('untimed reps steps have null duration and timed steps have null reps-as-duration', () => {
        for (const s of steps) {
          if (s.kind === 'reps') expect(s.durationSec).toBeNull()
        }
      })

      it('round/totalRounds are internally consistent (both set or both null; round <= total)', () => {
        for (const s of steps) {
          if (s.round == null) {
            expect(s.totalRounds).toBeNull()
          } else {
            expect(s.totalRounds).not.toBeNull()
            expect(s.round).toBeGreaterThanOrEqual(1)
            expect(s.round).toBeLessThanOrEqual(s.totalRounds as number)
          }
        }
      })
    })
  }
})

describe('expandWorkout — empty / degenerate inputs', () => {
  it('returns [] for empty exercises in every format', () => {
    for (const format of WORKOUT_FORMATS) {
      expect(expandWorkout({ format, exercises: [] })).toEqual([])
    }
  })

  it('returns [] when prepareSec > 0 but there are no exercises (no orphan prepare)', () => {
    expect(expandWorkout({ format: 'timed', prepareSec: 10, exercises: [] })).toEqual([])
  })
})

describe('expandWorkout — fallback precedence (per-exercise > workout default > hard fallback)', () => {
  it('work: per-exercise workSec beats defaultWorkSec beats DEFAULT_WORK_SEC', () => {
    const perEx = expandWorkout({
      format: 'timed',
      defaultWorkSec: 50,
      exercises: [ex({ exerciseId: 'a', defaultType: 'duration', workSec: 99 })],
    })
    expect(perEx[0].durationSec).toBe(99)

    const def = expandWorkout({
      format: 'timed',
      defaultWorkSec: 50,
      exercises: [ex({ exerciseId: 'a', defaultType: 'duration' })],
    })
    expect(def[0].durationSec).toBe(50)

    const hard = expandWorkout({
      format: 'timed',
      exercises: [ex({ exerciseId: 'a', defaultType: 'duration' })],
    })
    expect(hard[0].durationSec).toBe(DEFAULT_WORK_SEC)
  })

  it('work: non-positive workSec / defaultWorkSec fall through to the next candidate', () => {
    // 0 and negatives are not "positive" so firstPositive skips them.
    const zeroEx = expandWorkout({
      format: 'timed',
      defaultWorkSec: 40,
      exercises: [ex({ exerciseId: 'a', defaultType: 'duration', workSec: 0 })],
    })
    expect(zeroEx[0].durationSec).toBe(40)

    const negDefault = expandWorkout({
      format: 'timed',
      defaultWorkSec: -5,
      exercises: [ex({ exerciseId: 'a', defaultType: 'duration' })],
    })
    expect(negDefault[0].durationSec).toBe(DEFAULT_WORK_SEC)
  })

  it('rest: explicit per-exercise restSec=0 means NO rest even if defaultRestSec is set', () => {
    const steps = expandWorkout({
      format: 'timed',
      defaultRestSec: 30,
      defaultWorkSec: 20,
      exercises: [
        ex({ exerciseId: 'a', defaultType: 'duration', restSec: 0 }),
        ex({ exerciseId: 'b', defaultType: 'duration' }),
      ],
    })
    // a (restSec 0 -> no rest), then b. No rest between them from a.
    expect(steps.map((s) => s.kind)).toEqual(['work', 'work'])
  })

  it('rest: negative restSec is clamped to 0 (no rest, never negative)', () => {
    const steps = expandWorkout({
      format: 'timed',
      defaultWorkSec: 20,
      exercises: [
        ex({ exerciseId: 'a', defaultType: 'duration', restSec: -10 }),
        ex({ exerciseId: 'b', defaultType: 'duration' }),
      ],
    })
    expect(steps.some((s) => s.kind === 'rest')).toBe(false)
  })

  it('rest: defaultRestSec applies when per-exercise restSec is undefined', () => {
    const steps = expandWorkout({
      format: 'timed',
      defaultWorkSec: 20,
      defaultRestSec: 12,
      exercises: [
        ex({ exerciseId: 'a', defaultType: 'duration' }),
        ex({ exerciseId: 'b', defaultType: 'duration' }),
      ],
    })
    const rest = steps.find((s) => s.kind === 'rest')
    expect(rest?.durationSec).toBe(12)
  })

  it('hold: per-exercise holdSec beats DEFAULT_HOLD_SEC; non-positive falls back', () => {
    const set = expandWorkout({
      format: 'freestyle',
      exercises: [ex({ exerciseId: 'a', defaultType: 'hold', holdSec: 55 })],
    })
    expect(set[0].durationSec).toBe(55)

    const zero = expandWorkout({
      format: 'freestyle',
      exercises: [ex({ exerciseId: 'a', defaultType: 'hold', holdSec: 0 })],
    })
    expect(zero[0].durationSec).toBe(DEFAULT_HOLD_SEC)
  })
})

describe('expandWorkout — rounds bookkeeping & trailing-rest rule', () => {
  it('rounds=1 yields a single pass with null round/totalRounds', () => {
    const steps = expandWorkout({
      format: 'rounds',
      rounds: 1,
      defaultRestSec: 10,
      exercises: [
        ex({ exerciseId: 'a', defaultType: 'duration', workSec: 20 }),
        ex({ exerciseId: 'b', defaultType: 'duration', workSec: 20 }),
      ],
    })
    expect(steps.every((s) => s.round === null && s.totalRounds === null)).toBe(true)
    // single pass: work, rest, work — no trailing rest.
    expect(steps[steps.length - 1].kind).toBe('work')
  })

  it('rounds<=0 is coerced to a single round (Math.max(1, ...))', () => {
    for (const bad of [0, -3]) {
      const steps = expandWorkout({
        format: 'rounds',
        rounds: bad,
        exercises: [ex({ exerciseId: 'a', reps: 5 })],
      })
      expect(steps).toHaveLength(1)
      expect(steps[0].round).toBeNull()
    }
  })

  // `rounds: NaN` is coerced to a single round. `??` only guards null/undefined,
  // so NaN would survive into `Math.max(1, NaN) === NaN` and the loop would never
  // run; pushRoundedSequence now uses a Number.isFinite check to fall back to 1.
  it('rounds: NaN is coerced to a single round (one pass, null round tags)', () => {
    const steps = expandWorkout({
      format: 'rounds',
      rounds: NaN,
      exercises: [ex({ exerciseId: 'a', reps: 5 })],
    })
    expect(steps).toHaveLength(1)
    expect(steps[0].round).toBeNull()
    expect(steps[0].totalRounds).toBeNull()
  })

  it('emom: NaN minute count falls back to the exercise count (one slot per exercise)', () => {
    const steps = expandWorkout({
      format: 'emom',
      rounds: NaN,
      exercises: [ex({ exerciseId: 'a' }), ex({ exerciseId: 'b' })],
    })
    expect(steps).toHaveLength(2)
    expect(steps.map((s) => s.label)).toEqual(['a', 'b'])
  })

  it('rounds=3 keeps inter-round rest but suppresses ONLY the final trailing rest', () => {
    const steps = expandWorkout({
      format: 'rounds',
      rounds: 3,
      defaultRestSec: 10,
      defaultWorkSec: 20,
      exercises: [
        ex({ exerciseId: 'a', defaultType: 'duration' }),
        ex({ exerciseId: 'b', defaultType: 'duration' }),
      ],
    })
    // Each non-final round: work,rest,work,rest. Final round: work,rest,work.
    // rounds 1+2 -> 4 steps each = 8, round 3 -> 3 steps = 11 total.
    expect(steps).toHaveLength(11)
    expect(steps[steps.length - 1].kind).toBe('work')
    // Exactly one fewer rest than the "every exercise gets a rest" count (3*2 - 1).
    expect(steps.filter((s) => s.kind === 'rest')).toHaveLength(5)
    // Round tags are 1,1,1,1,2,2,2,2,3,3,3
    expect(steps.map((s) => s.round)).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3])
  })

  it('timed rounds>1: round tags correct and no trailing rest on the final step', () => {
    const steps = expandWorkout({
      format: 'timed',
      rounds: 2,
      defaultWorkSec: 20,
      defaultRestSec: 10,
      exercises: [
        ex({ exerciseId: 'a', defaultType: 'duration' }),
        ex({ exerciseId: 'b', defaultType: 'duration' }),
      ],
    })
    expect(steps[steps.length - 1].kind).toBe('work')
    expect(steps.every((s) => s.totalRounds === 2)).toBe(true)
  })
})

describe('expandWorkout — emom corners', () => {
  it('cycles exercises across more minutes than exercises', () => {
    const steps = expandWorkout({
      format: 'emom',
      rounds: 5,
      exercises: [ex({ exerciseId: 'a' }), ex({ exerciseId: 'b' })],
    })
    expect(steps.map((s) => s.label)).toEqual(['a', 'b', 'a', 'b', 'a'])
    expect(steps.every((s) => s.durationSec === DEFAULT_EMOM_SLOT_SEC)).toBe(true)
    expect(steps.map((s) => s.totalRounds)).toEqual([5, 5, 5, 5, 5])
    expect(steps.map((s) => s.round)).toEqual([1, 2, 3, 4, 5])
  })

  it('per-exercise workSec overrides the slot length for that minute', () => {
    const steps = expandWorkout({
      format: 'emom',
      rounds: 2,
      defaultWorkSec: 60,
      exercises: [
        ex({ exerciseId: 'a', workSec: 40 }),
        ex({ exerciseId: 'b' }),
      ],
    })
    expect(steps[0].durationSec).toBe(40)
    expect(steps[1].durationSec).toBe(60)
  })

  it('all emom steps are work-kind even for hold/reps default types', () => {
    const steps = expandWorkout({
      format: 'emom',
      rounds: 2,
      exercises: [
        ex({ exerciseId: 'a', defaultType: 'hold', holdSec: 99 }),
        ex({ exerciseId: 'b', defaultType: 'reps', reps: 10 }),
      ],
    })
    expect(steps.every((s) => s.kind === 'work')).toBe(true)
    // reps carried through, but the slot (not holdSec) drives the duration.
    expect(steps[0].durationSec).toBe(DEFAULT_EMOM_SLOT_SEC)
    expect(steps[1].reps).toBe(10)
  })
})

describe('expandWorkout — mixed-type lists & cross-format hold', () => {
  it('timed list mixing duration/hold/reps yields work/hold/reps kinds in order', () => {
    const steps = expandWorkout({
      format: 'timed',
      defaultWorkSec: 20,
      defaultRestSec: 0,
      exercises: [
        ex({ exerciseId: 'a', defaultType: 'duration' }),
        ex({ exerciseId: 'b', defaultType: 'hold', holdSec: 30 }),
        ex({ exerciseId: 'c', defaultType: 'reps', reps: 12 }),
      ],
    })
    expect(steps.map((s) => s.kind)).toEqual(['work', 'hold', 'reps'])
    expect(steps[2].reps).toBe(12)
    expect(steps[2].durationSec).toBeNull()
  })

  it('reps format with a hold-type entry yields a hold step (cross-cutting rule)', () => {
    const steps = expandWorkout({
      format: 'reps',
      exercises: [
        ex({ exerciseId: 'a', reps: 10 }),
        ex({ exerciseId: 'b', defaultType: 'hold', holdSec: 25 }),
      ],
    })
    expect(steps.map((s) => s.kind)).toEqual(['reps', 'hold'])
    expect(steps[1].durationSec).toBe(25)
  })

  it('reps format with a duration-type entry yields a timed work step', () => {
    const steps = expandWorkout({
      format: 'reps',
      exercises: [ex({ exerciseId: 'a', defaultType: 'duration', workSec: 35 })],
    })
    expect(steps[0].kind).toBe('work')
    expect(steps[0].durationSec).toBe(35)
  })

  it('notes pass through to the produced step', () => {
    const steps = expandWorkout({
      format: 'freestyle',
      exercises: [ex({ exerciseId: 'a', defaultType: 'hold', holdSec: 10, note: 'keep back flat' })],
    })
    expect(steps[0].note).toBe('keep back flat')
  })
})

describe('expandWorkout — prepare step duration', () => {
  it('prepare step duration is exactly prepareSec and only one is emitted', () => {
    const steps = expandWorkout({
      format: 'rounds',
      rounds: 3,
      prepareSec: 7,
      exercises: [ex({ exerciseId: 'a', reps: 5 })],
    })
    const prep = steps.filter((s) => s.kind === 'prepare')
    expect(prep).toHaveLength(1)
    expect(prep[0].durationSec).toBe(7)
    expect(prep[0].index).toBe(0)
  })
})
