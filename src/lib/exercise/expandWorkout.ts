/**
 * Pure interval/timer expansion: turn a workout (+ its ordered exercises and
 * format) into a flat, ordered list of timed / rep / hold STEPS the routine
 * player renders. Deterministic and clock-free — NO reliance on `Date`, timers,
 * or `performance.now`. The React player (Wave 2) consumes this list and owns
 * the ticking clock; expansion only describes what each step is and how long.
 *
 * AMRAP contract: expansion emits ONE labeled pass of the exercises (the
 * repeatable unit). The player time-boxes it from `duration_min` and records the
 * number of completed loops as `rounds_completed` at log time — expansion does
 * not pre-multiply AMRAP passes.
 */
import type { ExerciseDefaultType, WorkoutFormat } from './types'

/** Fallback work interval (sec) when neither per-exercise nor workout default is set. */
export const DEFAULT_WORK_SEC = 30
/** Fallback EMOM minute length (sec). */
export const DEFAULT_EMOM_SLOT_SEC = 60
/** Fallback hold (sec) for a hold-type exercise missing every hold value. */
export const DEFAULT_HOLD_SEC = 30

export type StepKind = 'work' | 'rest' | 'hold' | 'reps' | 'prepare'

export interface WorkoutStep {
  /** 0-based position in the full sequence. */
  index: number
  kind: StepKind
  /** Exercise name, or "Rest" / "Get ready". */
  label: string
  /** null for pure rest / prepare steps. */
  exerciseId: string | null
  /** set for work/rest/hold/prepare; null for untimed reps steps. */
  durationSec: number | null
  /** set for reps steps; null otherwise. */
  reps: number | null
  /** per-exercise note / modification hint. */
  note: string | null
  /** 1-based round for rounds/emom; null for a single pass / amrap. */
  round: number | null
  /** total rounds for rounds/emom; null otherwise. */
  totalRounds: number | null
}

export interface ExpandExercise {
  exerciseId: string
  name: string
  defaultType: ExerciseDefaultType
  workSec?: number | null
  restSec?: number | null
  reps?: number | null
  holdSec?: number | null
  note?: string | null
}

export interface ExpandInput {
  format: WorkoutFormat
  rounds?: number | null
  durationMin?: number | null
  defaultWorkSec?: number | null
  defaultRestSec?: number | null
  /** optional lead-in countdown; a `prepare` step is emitted only when > 0. */
  prepareSec?: number | null
  exercises: ExpandExercise[]
}

/** Pick the first positive number from candidates, else `fallback`. */
function firstPositive(
  candidates: Array<number | null | undefined>,
  fallback: number,
): number {
  for (const c of candidates) {
    if (typeof c === 'number' && c > 0) return c
  }
  return fallback
}

/** Resolved work/rest seconds for an exercise within a given format. */
function workSecFor(ex: ExpandExercise, input: ExpandInput): number {
  return firstPositive([ex.workSec, input.defaultWorkSec], DEFAULT_WORK_SEC)
}
function restSecFor(ex: ExpandExercise, input: ExpandInput): number {
  // 0 is a legitimate "no rest"; only fall through null/undefined.
  if (typeof ex.restSec === 'number') return Math.max(0, ex.restSec)
  if (typeof input.defaultRestSec === 'number')
    return Math.max(0, input.defaultRestSec)
  return 0
}
function holdSecFor(ex: ExpandExercise): number {
  return firstPositive([ex.holdSec], DEFAULT_HOLD_SEC)
}

/**
 * Expand a workout into an ordered step list. Returns `[]` for no exercises.
 *
 * In `timed`/`rounds` the step KIND follows each exercise's `defaultType`:
 * `duration → work`, `hold → hold`, `reps → reps` (untimed rep target). This lets
 * a rep-based `rounds` routine (e.g. NOOM "8/12/15 reps") and a HIIT `timed`
 * routine share one expander.
 *
 * Format semantics:
 * - `timed`    — each exercise → its kind step, then a `rest` step, no trailing
 *   rest after the last exercise. If `rounds > 1`, the pass repeats that many
 *   rounds (the seed marks HIIT routines `timed` with a round count), tagging
 *   `round`/`totalRounds`, again with no trailing rest on the final step.
 * - `rounds`   — the pass repeated `rounds` times (default 1), with
 *   `round`/`totalRounds` set; no trailing rest on the very last step.
 * - `amrap`    — ONE labeled pass (`round`/`totalRounds` null); player loops it.
 * - `emom`     — one fixed-length `work` slot per exercise per round; `rounds`
 *   = minutes (defaults to `durationMin`, then the exercise count). Slot length
 *   is `defaultWorkSec` or 60s. Remaining time in the minute is implicit rest.
 * - `reps`     — each exercise → an untimed `reps` step, unless its
 *   `defaultType === 'hold'` (→ a `hold` step). Optional `rest` step only when a
 *   `restSec` is explicitly present.
 * - `freestyle`— one step per exercise per its `defaultType` (reps/hold/work),
 *   no auto rest — a manual checklist.
 *
 * Cross-cutting: a `hold`-type exercise ALWAYS yields a `hold` step regardless of
 * format. A leading `prepare` step is emitted only when `prepareSec > 0`.
 */
export function expandWorkout(input: ExpandInput): WorkoutStep[] {
  const exercises = input.exercises ?? []
  if (exercises.length === 0) return []

  const steps: Omit<WorkoutStep, 'index'>[] = []
  const prepareSec = input.prepareSec ?? 0
  if (prepareSec > 0) {
    steps.push({
      kind: 'prepare',
      label: 'Get ready',
      exerciseId: null,
      durationSec: prepareSec,
      reps: null,
      note: null,
      round: null,
      totalRounds: null,
    })
  }

  switch (input.format) {
    case 'timed':
    case 'rounds':
      pushRoundedSequence(steps, input, exercises)
      break
    case 'amrap':
      pushSinglePass(steps, input, exercises, null, null)
      break
    case 'emom':
      pushEmom(steps, input, exercises)
      break
    case 'reps':
      pushRepsChecklist(steps, input, exercises, true)
      break
    case 'freestyle':
      pushRepsChecklist(steps, input, exercises, false)
      break
    default:
      pushSinglePass(steps, input, exercises, null, null)
  }

  return steps.map((s, index) => ({ index, ...s }))
}

/** Emit a single work/rest (or hold) pass; trailing rest suppressed by caller. */
function pushSinglePass(
  steps: Omit<WorkoutStep, 'index'>[],
  input: ExpandInput,
  exercises: ExpandExercise[],
  round: number | null,
  totalRounds: number | null,
  suppressTrailingRest = true,
): void {
  exercises.forEach((ex, i) => {
    const isLast = i === exercises.length - 1
    // The step kind follows the exercise's measurement type so a rep-based
    // `rounds` routine (e.g. "8/12/15 reps") yields untimed `reps` steps, a hold
    // (stretch / wall-sit) yields a `hold`, and a duration move yields `work`.
    if (ex.defaultType === 'hold') {
      steps.push({
        kind: 'hold',
        label: ex.name,
        exerciseId: ex.exerciseId,
        durationSec: holdSecFor(ex),
        reps: null,
        note: ex.note ?? null,
        round,
        totalRounds,
      })
    } else if (ex.defaultType === 'reps') {
      steps.push({
        kind: 'reps',
        label: ex.name,
        exerciseId: ex.exerciseId,
        durationSec: null,
        reps: ex.reps ?? null,
        note: ex.note ?? null,
        round,
        totalRounds,
      })
    } else {
      steps.push({
        kind: 'work',
        label: ex.name,
        exerciseId: ex.exerciseId,
        durationSec: workSecFor(ex, input),
        reps: null,
        note: ex.note ?? null,
        round,
        totalRounds,
      })
    }
    const rest = restSecFor(ex, input)
    const skipRest = suppressTrailingRest && isLast
    if (rest > 0 && !skipRest) {
      steps.push({
        kind: 'rest',
        label: 'Rest',
        exerciseId: null,
        durationSec: rest,
        reps: null,
        note: null,
        round,
        totalRounds,
      })
    }
  })
}

/** Repeat the work/rest pass `rounds` times; no trailing rest on the last step. */
function pushRoundedSequence(
  steps: Omit<WorkoutStep, 'index'>[],
  input: ExpandInput,
  exercises: ExpandExercise[],
): void {
  const total = Math.max(1, input.rounds ?? 1)
  const single = total === 1
  for (let r = 1; r <= total; r++) {
    const isLastRound = r === total
    // Within every round keep inter-exercise rests; suppress the round's
    // trailing rest only on the final round (so rounds chain back-to-back via
    // their last exercise's rest, but the workout ends on work/hold).
    pushSinglePass(
      steps,
      input,
      exercises,
      single ? null : r,
      single ? null : total,
      isLastRound,
    )
  }
}

/** EMOM: one fixed-length work slot per exercise per round (minute). */
function pushEmom(
  steps: Omit<WorkoutStep, 'index'>[],
  input: ExpandInput,
  exercises: ExpandExercise[],
): void {
  const minutes = Math.max(
    1,
    input.rounds ?? input.durationMin ?? exercises.length,
  )
  const slot = firstPositive([input.defaultWorkSec], DEFAULT_EMOM_SLOT_SEC)
  for (let r = 1; r <= minutes; r++) {
    const ex = exercises[(r - 1) % exercises.length]
    steps.push({
      kind: 'work',
      label: ex.name,
      exerciseId: ex.exerciseId,
      durationSec: firstPositive([ex.workSec], slot),
      reps: ex.reps ?? null,
      note: ex.note ?? null,
      round: r,
      totalRounds: minutes,
    })
  }
}

/**
 * Rep checklist (`reps` / `freestyle`). Hold-type exercises become `hold` steps.
 * `reps` format may emit a `rest` step when a per-exercise `restSec` is present;
 * `freestyle` never adds rest (allowRest=false).
 */
function pushRepsChecklist(
  steps: Omit<WorkoutStep, 'index'>[],
  _input: ExpandInput,
  exercises: ExpandExercise[],
  allowRest: boolean,
): void {
  for (const ex of exercises) {
    if (ex.defaultType === 'hold') {
      steps.push({
        kind: 'hold',
        label: ex.name,
        exerciseId: ex.exerciseId,
        durationSec: holdSecFor(ex),
        reps: null,
        note: ex.note ?? null,
        round: null,
        totalRounds: null,
      })
    } else if (ex.defaultType === 'duration') {
      steps.push({
        kind: 'work',
        label: ex.name,
        exerciseId: ex.exerciseId,
        durationSec: firstPositive([ex.workSec], DEFAULT_WORK_SEC),
        reps: null,
        note: ex.note ?? null,
        round: null,
        totalRounds: null,
      })
    } else {
      steps.push({
        kind: 'reps',
        label: ex.name,
        exerciseId: ex.exerciseId,
        durationSec: null,
        reps: ex.reps ?? null,
        note: ex.note ?? null,
        round: null,
        totalRounds: null,
      })
    }
    if (allowRest && typeof ex.restSec === 'number' && ex.restSec > 0) {
      steps.push({
        kind: 'rest',
        label: 'Rest',
        exerciseId: null,
        durationSec: ex.restSec,
        reps: null,
        note: null,
        round: null,
        totalRounds: null,
      })
    }
  }
}
