import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import {
  foodDashServings,
  recipeNutrients,
  type DashGroup,
  type LoggedNutrients,
  type MealType,
  type RollupFood,
} from '@/lib/diet'
import { mutationKeys, queryKeys } from './queryKeys'
import { useInjectUserId } from './useInjectUserId'
import type {
  AddFoodLogVars,
  DeleteFoodLogVars,
  UpdateFoodLogVars,
} from './mutationDefaults'
import type { FoodLogRow, FoodRow, RecipeRow } from './types'

// Single source of truth for MealType is the diet lib; re-export for callers.
export type { MealType } from '@/lib/diet'

/**
 * A logged recipe's embedded ingredient. The embedded food is a superset that
 * satisfies BOTH `RollupIngredient`'s food (FODMAP/density, used by `recipeRollup`
 * in `DailyLog`) and `NutrientIngredient`'s food (serving + nutrients, used by
 * `recipeNutrients` for the per-serving roll-up). Keep both axes so each consumer
 * stays happy.
 */
export type LoggedRecipeIngredient = {
  food_id: string | null
  quantity: number | null
  unit: string | null
  food:
    | (RollupFood & {
        name?: string
        serving_desc: string
        fiber_g: number | null
        sodium_mg: number | null
        sat_fat_g: number | null
        potassium_mg: number | null
        /** Selected in FOOD_LOG_SELECT; optional so lighter embeds still type-check. */
        dash_group?: DashGroup | null
      })
    | null
}

/** A recipe embedded in a log entry, carrying just enough to compute its roll-ups. */
export type LoggedRecipe = RecipeRow & {
  recipe_ingredients: LoggedRecipeIngredient[]
}

/** A food_log row with its embedded food / recipe (one round-trip). */
export type FoodLogEntry = FoodLogRow & {
  food: FoodRow | null
  recipe: LoggedRecipe | null
}

/**
 * Resolve a log entry to the per-serving nutrients the diet functions consume.
 *
 * - A food entry uses the joined `food` row's nutrients + DASH group.
 * - A recipe entry now contributes REAL per-serving fiber/sodium/sat-fat/
 *   potassium/calories via `recipeNutrients` over the unit->grams conversion
 *   layer (`src/lib/diet/convert.ts`). This supersedes the earlier "calories
 *   only" v1 limit (`.planning/recipe-rollup.md` D4) — see
 *   `.planning/phase3-conversion.md`. Ingredients that can't be converted are
 *   dropped from the sum and flip `recipeNutrients(...).isComplete` false, which
 *   the UI surfaces as "approximate"; they are NEVER summed as 0.
 *   - Calories fall back to `cal_per_serving` when the conversion produced none
 *     (e.g. a fully unconvertible recipe), so calories still show as before.
 *   - `dash_group` stays null: a recipe has no single DASH group. It contributes
 *     nutrients but adds to no DASH serving bucket (exactly what `dashProgress`
 *     already supports).
 *
 * `servings` (the LOGGED servings) is passed through; `dashProgress`/
 * `fiberProgress` multiply the per-serving fields by it. `recipeNutrients` has
 * already divided by the RECIPE's servings, so do NOT divide/multiply here
 * (no double-divide).
 */
export function toLoggedNutrients(entry: FoodLogEntry): LoggedNutrients {
  const meal = entry.meal
  const servings = entry.servings

  if (entry.food) {
    const f = entry.food
    return {
      meal,
      servings,
      dash_group: f.dash_group,
      dashServings: foodDashServings(f.dash_servings),
      sodium_mg: f.sodium_mg,
      sat_fat_g: f.sat_fat_g,
      potassium_mg: f.potassium_mg,
      fiber_g: f.fiber_g,
      calories: f.calories,
    }
  }

  const recipe = entry.recipe
  const n = recipe
    ? recipeNutrients(recipe.recipe_ingredients ?? [], recipe.servings)
    : null

  return {
    meal,
    servings,
    dash_group: null,
    sodium_mg: n?.sodium_mg ?? null,
    sat_fat_g: n?.sat_fat_g ?? null,
    potassium_mg: n?.potassium_mg ?? null,
    fiber_g: n?.fiber_g ?? null,
    // Calories: prefer the recipe's authoritative stored per-serving value. Only
    // fall back to the ingredient-summed calories when there is no stored value
    // (e.g. a user recipe without cal_per_serving). Using the partial sum for a
    // partially-convertible recipe would silently UNDERSTATE calories against the
    // budget, so the complete stored figure wins. (Fiber/sodium/etc. have no
    // stored per-serving equivalent, so they use the summed value + approx flag.)
    calories: recipe?.cal_per_serving ?? n?.calories ?? null,
  }
}

/** One round-trip select: the log row plus embedded food + recipe (w/ ingredients). */
const FOOD_LOG_SELECT =
  '*, food:foods(*), recipe:recipes(*, recipe_ingredients(food_id, quantity, unit, food:foods(name,serving_desc,serving_grams,calories,fiber_g,sodium_mg,sat_fat_g,potassium_mg,fructose_level,fructans_level,dash_group)))'

/**
 * The day's log for `date` (YYYY-MM-DD), scoped to the signed-in user via RLS,
 * with food + recipe embedded. Disabled when signed out or Supabase unconfigured.
 */
export function useFoodLog(date: string) {
  const { user } = useAuth()
  const userId = user?.id
  const enabled = !!userId && supabase !== null

  return useQuery({
    queryKey: queryKeys.foodLog(userId, date),
    enabled,
    queryFn: async (): Promise<FoodLogEntry[]> => {
      if (!supabase) return []
      const { data, error } = await supabase
        .from('food_log')
        .select(FOOD_LOG_SELECT)
        .eq('logged_on', date)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as FoodLogEntry[]
    },
  })
}

/**
 * The log across an inclusive date range [start, end] (YYYY-MM-DD), scoped by
 * RLS, with food + recipe embedded — for weekly trend views. Ordered by day.
 * Disabled when signed out, unconfigured, or the range is incomplete.
 */
export function useFoodLogRange(start: string, end: string) {
  const { user } = useAuth()
  const userId = user?.id
  const enabled = !!userId && supabase !== null && !!start && !!end

  return useQuery({
    queryKey: queryKeys.foodLogRange(userId, start, end),
    enabled,
    queryFn: async (): Promise<FoodLogEntry[]> => {
      if (!supabase) return []
      const { data, error } = await supabase
        .from('food_log')
        .select(FOOD_LOG_SELECT)
        .gte('logged_on', start)
        .lte('logged_on', end)
        .order('logged_on', { ascending: true })
      if (error) throw error
      return (data ?? []) as FoodLogEntry[]
    },
  })
}

export interface AddLogEntryInput {
  date: string
  meal: MealType
  servings: number
  food_id?: string | null
  recipe_id?: string | null
  note?: string | null
}

/**
 * Add a log entry for the current user + date.
 *
 * Thin wrapper over the registered default (mutationFn + optimistic onMutate +
 * rollback + invalidate live in `mutationDefaults.ts`, keyed by mutationKey so
 * the write survives a reload and resumes). `useInjectUserId` adds `userId` to
 * the variables at call time. Call site signature is unchanged.
 */
export function useAddLogEntry() {
  return useInjectUserId<FoodLogRow, Error, AddLogEntryInput, AddFoodLogVars, unknown>(
    useMutation<FoodLogRow, Error, AddFoodLogVars>({
      mutationKey: mutationKeys.addFoodLog,
    }),
  )
}

export interface UpdateLogEntryInput {
  id: string
  date: string
  meal?: MealType
  servings?: number
  note?: string | null
}

/** Update a log entry (meal/servings/note); refreshes the day's log. */
export function useUpdateLogEntry() {
  return useInjectUserId<
    FoodLogRow | null,
    Error,
    UpdateLogEntryInput,
    UpdateFoodLogVars,
    unknown
  >(
    useMutation<FoodLogRow | null, Error, UpdateFoodLogVars>({
      mutationKey: mutationKeys.updateFoodLog,
    }),
  )
}

/** Delete a log entry; refreshes the day's log. */
export function useDeleteLogEntry() {
  return useInjectUserId<
    void,
    Error,
    { id: string; date: string },
    DeleteFoodLogVars,
    unknown
  >(
    useMutation<void, Error, DeleteFoodLogVars>({
      mutationKey: mutationKeys.deleteFoodLog,
    }),
  )
}
