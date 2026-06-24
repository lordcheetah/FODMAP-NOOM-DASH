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
