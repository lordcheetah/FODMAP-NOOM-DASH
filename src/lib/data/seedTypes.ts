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
