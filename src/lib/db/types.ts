/**
 * Hand-authored Supabase row types, mirroring `supabase/migrations/0001_init.sql`.
 *
 * Decision (Phase 1): hand-author a minimal `Tables` set rather than wiring
 * `supabase gen types` into the build — the schema is small and stable, and this
 * keeps the toolchain light. Reuse the enum types from `src/lib/diet/types.ts`;
 * do NOT redefine them.
 *
 * numeric(8,2) columns surface as `number` over the JS client. Nullable columns
 * are `T | null`; columns with a NOT NULL + default are non-null on a read row.
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
} from '@/lib/exercise/types'

/** `foods` — reference + user-custom rows. `user_id IS NULL` = global seed. */
export interface FoodRow {
  id: string
  user_id: string | null
  name: string
  brand: string | null
  serving_desc: string
  serving_grams: number | null
  calories: number | null
  sodium_mg: number | null
  sat_fat_g: number | null
  potassium_mg: number | null
  fiber_g: number | null
  added_sugar_g: number | null
  fructose_level: FodmapLevel
  fructans_level: FodmapLevel
  noom_category: NoomCategory | null
  dash_group: DashGroup | null
  source: string | null
  created_at: string
}

/** `recipes` — reference + user-custom. `user_id IS NULL` = global seed. */
export interface RecipeRow {
  id: string
  user_id: string | null
  name: string
  prep_min: number | null
  servings: number | null
  cal_per_serving: number | null
  meal_type: MealType | null
  instructions: string[]
  source: string | null
  created_at: string
}

/** `recipe_ingredients` — child of a recipe; food link is nullable. */
export interface RecipeIngredientRow {
  id: string
  recipe_id: string
  food_id: string | null
  raw_text: string | null
  quantity: number | null
  unit: string | null
}

/** `swaps` — "Save 100 Calories" library. Reference data, read-only via RLS. */
export interface SwapRow {
  id: string
  from_food: string
  to_food: string
  calories_saved: number | null
  note: string | null
}

/** `food_log` — private per user. DB CHECK enforces food_id OR recipe_id present. */
export interface FoodLogRow {
  id: string
  user_id: string
  logged_on: string
  meal: MealType
  food_id: string | null
  recipe_id: string | null
  servings: number
  note: string | null
  created_at: string
}

/** `daily_targets` — private per user; PK is `user_id`. */
export interface DailyTargetsRow {
  user_id: string
  calorie_budget: number | null
  sodium_budget_mg: number | null
  fiber_goal_g: number | null
  fiber_per_meal_g: number | null
  /** jsonb; e.g. `{ "vegetables": 5, "fruits": 5 }`. */
  dash_serving_goals: Partial<Record<DashGroup, number>>
  updated_at: string
}

// ---------------------------------------------------------------------------
// Exercise rows (Phase 2), mirroring 0003_exercise.sql. Enum types reused from
// src/lib/exercise/types.ts; arrays are non-null (DB default '{}').
// ---------------------------------------------------------------------------

/** `exercises` — reference + user-custom. `user_id IS NULL` = global seed. */
export interface ExerciseRow {
  id: string
  user_id: string | null
  slug: string
  name: string
  category: ExerciseCategory
  subcategory: string | null
  muscle_groups: string[]
  equipment: string[]
  difficulty: string | null
  instructions: string[]
  modifications: string[]
  cautions: string[]
  default_type: ExerciseDefaultType
  default_reps: number | null
  default_duration_sec: number | null
  default_hold_sec: number | null
  source: string | null
  created_at: string
}

/** `workouts` — reference + user-custom. `user_id IS NULL` = global seed. */
export interface WorkoutRow {
  id: string
  user_id: string | null
  slug: string
  name: string
  category: ExerciseCategory
  description: string | null
  duration_min: number | null
  format: WorkoutFormat
  rounds: number | null
  default_work_sec: number | null
  default_rest_sec: number | null
  source: string | null
  created_at: string
}

/** `workout_exercises` — ordered child of a workout (`position` = seed `order`). */
export interface WorkoutExerciseRow {
  id: string
  workout_id: string
  exercise_id: string
  position: number
  work_sec: number | null
  rest_sec: number | null
  reps: number | null
  hold_sec: number | null
  note: string | null
}

/** `schedules` — reference + user-custom. `user_id IS NULL` = global seed. */
export interface ScheduleRow {
  id: string
  user_id: string | null
  name: string
  source: string | null
  created_at: string
}

/** `schedule_days` — ordered child of a schedule; `workout_id` null = rest day. */
export interface ScheduleDayRow {
  id: string
  schedule_id: string
  week: number
  day: number
  label: string | null
  workout_id: string | null
}

/** `workout_log` — private per user; one row per session. */
export interface WorkoutLogRow {
  id: string
  user_id: string
  performed_on: string
  workout_id: string | null
  name: string | null
  duration_sec: number | null
  rounds_completed: number | null
  notes: string | null
  completed: boolean
  created_at: string
}

/** `workout_log_exercises` — per-exercise results, child of `workout_log`. */
export interface WorkoutLogExerciseRow {
  id: string
  workout_log_id: string
  exercise_id: string | null
  name: string | null
  position: number | null
  sets: number | null
  reps: number | null
  duration_sec: number | null
  hold_sec: number | null
  score: number | null
  notes: string | null
}
