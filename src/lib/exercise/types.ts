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

/**
 * Top-level grouping for both exercises and workouts (they share the DB
 * `exercise_category` enum). `circuit` and `hiit` are workout-only groupings
 * (no exercise uses them) but live in the shared enum so the workout data
 * validates and those workouts surface in the browser.
 */
export type ExerciseCategory =
  | 'cardio'
  | 'strength'
  | 'dynamic'
  | 'stretch'
  | 'yoga'
  | 'back'
  | 'martial-arts'
  | 'circuit'
  | 'hiit'

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
  'martial-arts',
  'circuit',
  'hiit',
]

/**
 * Human-readable label for each category, for headings / chips / labels in the
 * UI. Typed as a full `Record<ExerciseCategory, string>` so adding a category to
 * the union without a label here is a COMPILE error (exhaustiveness guard). Use
 * this everywhere a category is displayed so no screen ever shows the raw
 * "martial-arts" slug.
 */
export const EXERCISE_CATEGORY_LABEL: Record<ExerciseCategory, string> = {
  cardio: 'Cardio',
  strength: 'Strength',
  dynamic: 'Dynamic',
  stretch: 'Stretch',
  yoga: 'Yoga',
  back: 'Back',
  'martial-arts': 'Martial Arts',
  circuit: 'Circuit',
  hiit: 'HIIT',
}

/**
 * Human label for a discipline (the `subcategory` of a martial-arts exercise):
 * title-cases hyphenated values and uppercases known acronyms. `null` → "General".
 * Shared by the browser grouping and the exercise card so disciplines read
 * uniformly everywhere (e.g. "muay-thai" → "Muay Thai", "bjj" → "BJJ").
 */
export function disciplineLabel(subcategory: string | null | undefined): string {
  if (!subcategory) return 'General'
  if (subcategory.toLowerCase() === 'bjj') return 'BJJ'
  return subcategory
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

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
