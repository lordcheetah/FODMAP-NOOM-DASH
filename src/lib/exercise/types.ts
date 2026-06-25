/**
 * Shared exercise-domain types — the SINGLE SOURCE OF TRUTH for the exercise
 * enum string literals. The DB enums (`supabase/migrations/0003_exercise.sql`),
 * the seed contracts (`src/lib/data/seedTypes.ts`), the DB row types
 * (`src/lib/db/types.ts`), and the pure logic (`expandWorkout`) all reuse these.
 * Do NOT redefine these literals inline anywhere else.
 *
 * Exercise has no diet rules to honor, but it shares the data-safety posture:
 * `cautions` / `modifications` from the source must be shown verbatim, never
 * silently dropped.
 */

/** Top-level grouping for both exercises and workouts. */
export type ExerciseCategory =
  | 'cardio'
  | 'strength'
  | 'dynamic'
  | 'stretch'
  | 'yoga'
  | 'back'

/**
 * How a workout is structured / timed:
 * - `timed`    — fixed work (+ rest) intervals per exercise (HIIT style).
 * - `rounds`   — repeat the exercise sequence N rounds (reps usually vary/round).
 * - `amrap`    — as many rounds as possible; player owns the time-box clock.
 * - `emom`     — every minute on the minute; one exercise pass per minute slot.
 * - `reps`     — rep-target checklist, no timer.
 * - `freestyle`— open checklist the user advances manually.
 */
export type WorkoutFormat =
  | 'timed'
  | 'rounds'
  | 'amrap'
  | 'emom'
  | 'reps'
  | 'freestyle'

/**
 * Default prescription kind for a single exercise:
 * - `reps`     — count repetitions (no timer).
 * - `duration` — perform for a number of seconds (a work interval).
 * - `hold`     — hold a position for a number of seconds (stretch / isometric).
 *
 * (Named `ExerciseMeasureType` in the Wave-1 brief; kept as `ExerciseDefaultType`
 * to match the DB column `default_type` and the plan's signatures. The alias
 * below lets callers use either name.)
 */
export type ExerciseDefaultType = 'reps' | 'duration' | 'hold'

/** Alias for `ExerciseDefaultType` (the measurement kind of an exercise). */
export type ExerciseMeasureType = ExerciseDefaultType

/** Exercise difficulty rating. */
export type Difficulty = 'easy' | 'medium' | 'hard'

/** Runtime-checkable value sets (used by the seed to reject unknown enum values). */
export const EXERCISE_CATEGORIES: readonly ExerciseCategory[] = [
  'cardio',
  'strength',
  'dynamic',
  'stretch',
  'yoga',
  'back',
]

export const WORKOUT_FORMATS: readonly WorkoutFormat[] = [
  'timed',
  'rounds',
  'amrap',
  'emom',
  'reps',
  'freestyle',
]

export const EXERCISE_DEFAULT_TYPES: readonly ExerciseDefaultType[] = [
  'reps',
  'duration',
  'hold',
]

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard']
