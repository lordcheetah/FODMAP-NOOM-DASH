import { describe, it, expect } from 'vitest'
import {
  expandWorkout,
  DEFAULT_WORK_SEC,
  DEFAULT_EMOM_SLOT_SEC,
  DEFAULT_HOLD_SEC,
  type ExpandExercise,
  type StepKind,
} from './expandWorkout'

/** Build a `reps`/`work`-type exercise quickly. */
function ex(over: Partial<ExpandExercise> & { exerciseId: string }): ExpandExercise {
  return {
    name: over.name ?? over.exerciseId,
    defaultType: 'reps',
    ...over,
  }
}

/** Compact view of the steps for assertions. */
function shape(
  steps: ReturnType<typeof expandWorkout>,
): Array<{ kind: StepKind; label: string; dur: number | null; reps: number | null }> {
  return steps.map((s) => ({
    kind: s.kind,
    label: s.label,
    dur: s.durationSec,
    reps: s.reps,
  }))
}

describe('expandWorkout — edges', () => {
  it('returns [] for no exercises', () => {
    expect(expandWorkout({ format: 'timed', exercises: [] })).toEqual([])
  })

  it('assigns contiguous 0-based indexes', () => {
    const steps = expandWorkout({
      format: 'timed',
      defaultWorkSec: 20,
      defaultRestSec: 10,
      exercises: [
        ex({ exerciseId: 'a', defaultType: 'duration' }),
        ex({ exerciseId: 'b', defaultType: 'duration' }),
      ],
    })
    expect(steps.map((s) => s.index)).toEqual([0, 1, 2])
  })

  it('prepends a prepare step only when prepareSec > 0', () => {
    const withPrep = expandWorkout({
      format: 'timed',
      prepareSec: 10,
      defaultWorkSec: 20,
      exercises: [ex({ exerciseId: 'a', defaultType: 'duration' })],
    })
    expect(withPrep[0]).toMatchObject({ kind: 'prepare', durationSec: 10 })

    const noPrep = expandWorkout({
      format: 'timed',
      prepareSec: 0,
      defaultWorkSec: 20,
      exercises: [ex({ exerciseId: 'a', defaultType: 'duration' })],
    })
    expect(noPrep.find((s) => s.kind === 'prepare')).toBeUndefined()
  })
})

describe('expandWorkout — timed', () => {
  it('single timed exercise → one work step, NO trailing rest', () => {
    const steps = expandWorkout({
      format: 'timed',
      defaultWorkSec: 20,
      defaultRestSec: 10,
      exercises: [ex({ exerciseId: 'a', defaultType: 'duration' })],
    })
    expect(shape(steps)).toEqual([
      { kind: 'work', label: 'a', dur: 20, reps: null },
    ])
  })

  it('two timed exercises → work, rest, work (no final rest)', () => {
    const steps = expandWorkout({
      format: 'timed',
      defaultWorkSec: 20,
      defaultRestSec: 10,
      exercises: [
        ex({ exerciseId: 'a', name: 'A', defaultType: 'duration' }),
        ex({ exerciseId: 'b', name: 'B', defaultType: 'duration' }),
      ],
    })
    expect(shape(steps).map((s) => s.kind)).toEqual(['work', 'rest', 'work'])
  })

  it('per-exercise secs override the workout defaults', () => {
    const steps = expandWorkout({
      format: 'timed',
      defaultWorkSec: 20,
      defaultRestSec: 10,
      exercises: [
        ex({ exerciseId: 'a', defaultType: 'duration', workSec: 45, restSec: 5 }),
        ex({ exerciseId: 'b', defaultType: 'duration' }),
      ],
    })
    expect(steps[0].durationSec).toBe(45)
    expect(steps[1].durationSec).toBe(5) // rest
    expect(steps[2].durationSec).toBe(20) // default work
  })

  it('falls back to DEFAULT_WORK_SEC when no work secs at all', () => {
    const steps = expandWorkout({
      format: 'timed',
      exercises: [ex({ exerciseId: 'a', defaultType: 'duration' })],
    })
    expect(steps[0].durationSec).toBe(DEFAULT_WORK_SEC)
  })

  it('timed with rounds > 1 repeats the pass with round/totalRounds', () => {
    const steps = expandWorkout({
      format: 'timed',
      rounds: 3,
      defaultWorkSec: 20,
      defaultRestSec: 10,
      exercises: [
        ex({ exerciseId: 'a', defaultType: 'duration' }),
        ex({ exerciseId: 'b', defaultType: 'duration' }),
      ],
    })
    // per round: work,rest,work,rest  (rounds 1&2) then work,rest,work (round 3)
    const works = steps.filter((s) => s.kind === 'work')
    expect(works).toHaveLength(6)
    expect(works.every((s) => s.totalRounds === 3)).toBe(true)
    expect(steps[steps.length - 1].kind).toBe('work') // ends on work, no trailing rest
  })
})

describe('expandWorkout — rounds', () => {
  it('rounds:3 triples the sequence with correct round/totalRounds', () => {
    const steps = expandWorkout({
      format: 'rounds',
      rounds: 3,
      exercises: [
        ex({ exerciseId: 'a', reps: 8 }),
        ex({ exerciseId: 'b', reps: 8 }),
      ],
    })
    const repsSteps = steps.filter((s) => s.kind === 'reps')
    expect(repsSteps).toHaveLength(6)
    expect(repsSteps.map((s) => s.round)).toEqual([1, 1, 2, 2, 3, 3])
    expect(repsSteps.every((s) => s.totalRounds === 3)).toBe(true)
  })

  it('rounds adds inter-exercise rest when defaultRestSec is set, none trailing', () => {
    const steps = expandWorkout({
      format: 'rounds',
      rounds: 2,
      defaultRestSec: 15,
      exercises: [
        ex({ exerciseId: 'a', defaultType: 'duration', workSec: 30 }),
        ex({ exerciseId: 'b', defaultType: 'duration', workSec: 30 }),
      ],
    })
    expect(steps[steps.length - 1].kind).toBe('work')
    expect(steps.some((s) => s.kind === 'rest')).toBe(true)
  })

  it('rounds defaults to a single pass when rounds is null', () => {
    const steps = expandWorkout({
      format: 'rounds',
      rounds: null,
      exercises: [ex({ exerciseId: 'a', reps: 10 })],
    })
    expect(steps).toHaveLength(1)
    expect(steps[0].round).toBeNull()
    expect(steps[0].totalRounds).toBeNull()
  })
})

describe('expandWorkout — amrap', () => {
  it('emits ONE pass with null round/totalRounds (player loops it)', () => {
    const steps = expandWorkout({
      format: 'amrap',
      rounds: 3,
      durationMin: 10,
      exercises: [
        ex({ exerciseId: 'a', reps: 10, defaultType: 'duration', workSec: 30 }),
        ex({ exerciseId: 'b', defaultType: 'hold' }),
      ],
    })
    // one pass = 2 steps (one work, one hold), no pre-multiplication by rounds
    expect(steps).toHaveLength(2)
    expect(steps.every((s) => s.round === null && s.totalRounds === null)).toBe(true)
    expect(steps[1].kind).toBe('hold')
  })
})

describe('expandWorkout — emom', () => {
  it('4 exercises × 2 rounds → 8 fixed-length work steps', () => {
    const steps = expandWorkout({
      format: 'emom',
      rounds: 8,
      exercises: [
        ex({ exerciseId: 'a' }),
        ex({ exerciseId: 'b' }),
        ex({ exerciseId: 'c' }),
        ex({ exerciseId: 'd' }),
      ],
    })
    expect(steps).toHaveLength(8)
    expect(steps.every((s) => s.kind === 'work')).toBe(true)
    expect(steps.every((s) => s.durationSec === DEFAULT_EMOM_SLOT_SEC)).toBe(true)
    expect(steps.map((s) => s.label)).toEqual(['a', 'b', 'c', 'd', 'a', 'b', 'c', 'd'])
    expect(steps.map((s) => s.round)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('uses defaultWorkSec as the slot length and carries reps', () => {
    const steps = expandWorkout({
      format: 'emom',
      rounds: 2,
      defaultWorkSec: 45,
      exercises: [ex({ exerciseId: 'a', reps: 12 })],
    })
    expect(steps.every((s) => s.durationSec === 45)).toBe(true)
    expect(steps.every((s) => s.reps === 12)).toBe(true)
  })

  it('minute count falls back to durationMin then exercise count', () => {
    const byDuration = expandWorkout({
      format: 'emom',
      durationMin: 5,
      exercises: [ex({ exerciseId: 'a' })],
    })
    expect(byDuration).toHaveLength(5)

    const byCount = expandWorkout({
      format: 'emom',
      exercises: [ex({ exerciseId: 'a' }), ex({ exerciseId: 'b' })],
    })
    expect(byCount).toHaveLength(2)
  })
})

describe('expandWorkout — reps & freestyle', () => {
  it('reps format yields untimed reps steps carrying the rep target', () => {
    const steps = expandWorkout({
      format: 'reps',
      exercises: [ex({ exerciseId: 'a', reps: 15 })],
    })
    expect(shape(steps)).toEqual([
      { kind: 'reps', label: 'a', dur: null, reps: 15 },
    ])
  })

  it('reps format adds a rest step only when a per-exercise restSec is present', () => {
    const steps = expandWorkout({
      format: 'reps',
      exercises: [
        ex({ exerciseId: 'a', reps: 15, restSec: 30 }),
        ex({ exerciseId: 'b', reps: 15 }),
      ],
    })
    expect(steps.map((s) => s.kind)).toEqual(['reps', 'rest', 'reps'])
  })

  it('freestyle yields one step per exercise per defaultType, no auto rest', () => {
    const steps = expandWorkout({
      format: 'freestyle',
      exercises: [
        ex({ exerciseId: 'a', defaultType: 'reps', reps: 10, restSec: 99 }),
        ex({ exerciseId: 'b', defaultType: 'hold', holdSec: 20 }),
        ex({ exerciseId: 'c', defaultType: 'duration', workSec: 40 }),
      ],
    })
    expect(steps.map((s) => s.kind)).toEqual(['reps', 'hold', 'work'])
    // restSec on a freestyle exercise is ignored
    expect(steps.some((s) => s.kind === 'rest')).toBe(false)
  })
})

describe('expandWorkout — hold exercises across formats', () => {
  it('a hold-type exercise inside a timed workout yields a hold step', () => {
    const steps = expandWorkout({
      format: 'timed',
      defaultWorkSec: 30,
      exercises: [ex({ exerciseId: 'plank', defaultType: 'hold', holdSec: 45 })],
    })
    expect(shape(steps)).toEqual([
      { kind: 'hold', label: 'plank', dur: 45, reps: null },
    ])
  })

  it('hold exercise falls back to DEFAULT_HOLD_SEC when no hold value', () => {
    const steps = expandWorkout({
      format: 'reps',
      exercises: [ex({ exerciseId: 'wall-sit', defaultType: 'hold' })],
    })
    expect(steps[0].kind).toBe('hold')
    expect(steps[0].durationSec).toBe(DEFAULT_HOLD_SEC)
  })
})
