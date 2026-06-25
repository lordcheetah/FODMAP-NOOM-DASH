/**
 * Data-file contracts for the seed pipeline.
 *
 * These interfaces mirror the JSON shapes in `data/*.json` (the researcher output)
 * so the seed script (`scripts/seed.ts`) and any future "load a sample day" feature
 * agree on the exact shapes. They reuse the diet-domain enums from
 * `src/lib/diet/types.ts` — do NOT redefine enums here.
 *
 * Field/column mapping and the default-to-`unknown` rule are documented in
 * `data/README.md`.
 *
 * Scope reminder (CLAUDE.md): "FODMAP" = fructose + fructans only; an omitted
 * FODMAP level defaults to `'unknown'` and must NEVER be invented as `'low'`.
 */
import type {
  FodmapLevel,
  NoomCategory,
  DashGroup,
  MealType,
} from '@/lib/diet/types'
import type {
  ExerciseCategory,
  ExerciseDefaultType,
  WorkoutFormat,
  Difficulty,
} from '@/lib/exercise/types'

/**
 * One row of `data/foods.json`. Maps to the `foods` table.
 *
 * Stable key for idempotent seeding: `(lower(name), coalesce(lower(brand), ''))`.
 *
 * `fructose_level` / `fructans_level` are optional in the file but DEFAULT TO
 * `'unknown'` when omitted (never invent `'low'`). The DB columns are NOT NULL
 * with a default of `'unknown'`.
 */
export interface FoodSeed {
  name: string
  brand?: string
  serving_desc: string
  serving_grams?: number
  calories?: number
  sodium_mg?: number
  sat_fat_g?: number
  potassium_mg?: number
  fiber_g?: number
  added_sugar_g?: number
  fructose_level?: FodmapLevel
  fructans_level?: FodmapLevel
  noom_category?: NoomCategory
  dash_group?: DashGroup
  /**
   * Curated flag marking a food as a low-FODMAP high-fiber pick (oats, chia,
   * kiwi, raspberries, firm tofu, quinoa, etc.). NOT a DB column — there is no
   * matching `foods` column, so the seed script ignores it. Present in the data
   * file as a research convenience / future suggestion source.
   */
  low_fodmap_high_fiber?: boolean
  source?: string
}

/**
 * One ingredient of a recipe. `food_name` is matched (exact, case-insensitive)
 * against a seeded `FoodSeed.name`; on a miss the seed stores `raw_text` with
 * `food_id = null` and prints the unmatched name.
 */
export interface IngredientSeed {
  food_name?: string
  raw_text?: string
  quantity?: number | null
  unit?: string | null
}

/**
 * One row of `data/recipes.json`. Maps to the `recipes` table (+ child
 * `recipe_ingredients`). Stable key for idempotent seeding: `lower(name)`.
 */
export interface RecipeSeed {
  name: string
  prep_min?: number
  servings?: number
  cal_per_serving?: number
  meal_type?: MealType
  instructions: string[]
  source?: string
  ingredients: IngredientSeed[]
}

/**
 * One row of `data/swaps.json`. Maps to the `swaps` table.
 * Stable key for idempotent seeding: `(lower(from_food), lower(to_food))`.
 */
export interface SwapSeed {
  from_food: string
  to_food: string
  calories_saved?: number
  note?: string
}

/**
 * One row of `data/sample_days.json` — a 7-day sample menu where each meal slot
 * names a recipe (or free-text item) by string.
 *
 * v1 use: reference data for a FUTURE "load a sample day" feature. The seed
 * script does NOT write these to `food_log` (that table is per-user) and does
 * NOT currently persist sample days at all. Documented as not-yet-wired so a
 * partial dataset never blocks the build.
 */
export interface SampleDay {
  day: number
  breakfast?: string
  lunch?: string
  dinner?: string
  snack?: string
}

// ---------------------------------------------------------------------------
// Exercise seed contracts (Phase 2). These mirror the JSON shapes in
// data/exercises.json, data/workouts.json, data/schedule.json and reuse the
// exercise-domain enums from src/lib/exercise/types.ts — do NOT redefine enums.
// Field/column mapping + default rules are documented in data/README.md.
// ---------------------------------------------------------------------------

/**
 * One row of `data/exercises.json`. Maps to the `exercises` table.
 *
 * Stable key for idempotent seeding: `lower(slug)`.
 *
 * `category` / `default_type` must be valid enum values — the seed REJECTS
 * (warns + skips) rows with an unknown value rather than coercing one. Array
 * fields default to `[]` when omitted. `default_type` is required and is never
 * invented.
 */
export interface ExerciseSeed {
  slug: string
  name: string
  category: ExerciseCategory
  subcategory?: string
  muscle_groups?: string[]
  equipment?: string[]
  difficulty?: Difficulty
  instructions?: string[]
  modifications?: string[]
  cautions?: string[]
  default_type: ExerciseDefaultType
  default_reps?: number | null
  default_duration_sec?: number | null
  default_hold_sec?: number | null
  source?: string
}

/**
 * One exercise inside a workout (`data/workouts.json` → `exercises[]`). Maps to
 * a `workout_exercises` child row. `exercise_slug` resolves (exact,
 * case-insensitive) to a seeded `ExerciseSeed.slug`; on a miss the junction row
 * is SKIPPED (the FK column is NOT NULL) and the slug is printed. `order` maps
 * to the DB column `position` (avoids the reserved word `order`).
 */
export interface WorkoutExerciseSeed {
  exercise_slug: string
  order: number
  work_sec?: number | null
  rest_sec?: number | null
  reps?: number | null
  hold_sec?: number | null
  note?: string | null
}

/**
 * One row of `data/workouts.json`. Maps to the `workouts` table (+ child
 * `workout_exercises`). Stable key for idempotent seeding: `lower(slug)`.
 *
 * `format` must be a valid enum value (seed rejects unknown). AMRAP/EMOM time
 * boxing derives from `duration_min` (no separate cap field).
 */
export interface WorkoutSeed {
  slug: string
  name: string
  category: ExerciseCategory
  description?: string
  duration_min?: number | null
  format: WorkoutFormat
  rounds?: number | null
  default_work_sec?: number | null
  default_rest_sec?: number | null
  exercises: WorkoutExerciseSeed[]
  source?: string
}

/** One day inside a schedule week. `workout_slug` is null on a rest day. */
export interface ScheduleDaySeed {
  day: number
  label?: string
  workout_slug?: string | null
}

/** One week inside a schedule cycle. */
export interface ScheduleWeekSeed {
  week: number
  days: ScheduleDaySeed[]
}

/**
 * `data/schedule.json` — a single cycle object (or an array of cycles). Maps to
 * the `schedules` table (+ child `schedule_days`). Stable key: `lower(name)`.
 * Each day's `workout_slug` resolves to a `workout_id`; null / unresolved →
 * `workout_id = null` (rest day) so the cycle still seeds.
 */
export interface ScheduleSeed {
  name: string
  source?: string
  weeks: ScheduleWeekSeed[]
}
