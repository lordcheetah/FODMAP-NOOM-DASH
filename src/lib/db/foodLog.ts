import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import type { LoggedNutrients, MealType, RollupIngredient } from '@/lib/diet'
import { queryKeys } from './queryKeys'
import type { FoodLogRow, FoodRow, RecipeRow } from './types'

// Single source of truth for MealType is the diet lib; re-export for callers.
export type { MealType } from '@/lib/diet'

/** A recipe embedded in a log entry, carrying just enough to compute its roll-up. */
export type LoggedRecipe = RecipeRow & { recipe_ingredients: RollupIngredient[] }

/** A food_log row with its embedded food / recipe (one round-trip). */
export type FoodLogEntry = FoodLogRow & {
  food: FoodRow | null
  recipe: LoggedRecipe | null
}

/**
 * Resolve a log entry to the per-serving nutrients the diet functions consume.
 *
 * - A food entry uses the joined `food` row's nutrients + DASH group.
 * - A recipe entry uses `cal_per_serving` for calories. Recipe DASH/fiber/sodium
 *   are INTENTIONALLY left null (calories only) — this is a deliberate v1 limit,
 *   not a TODO. An accurate per-serving fiber/sodium roll-up needs a
 *   quantity->grams unit-conversion layer the data does not yet have, so summing
 *   ingredient nutrients would be misleading in a health app. See
 *   `.planning/recipe-rollup.md` (Decision D4). `recipeRollup` provides the
 *   qualitative FODMAP + NOOM verdict for display only; it does not feed totals.
 *
 * `servings` is passed through; the diet functions multiply per-serving fields.
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
      sodium_mg: f.sodium_mg,
      sat_fat_g: f.sat_fat_g,
      potassium_mg: f.potassium_mg,
      fiber_g: f.fiber_g,
      calories: f.calories,
    }
  }

  // Recipe entry: calories only (roll-up deferred — see doc comment above).
  return {
    meal,
    servings,
    dash_group: null,
    sodium_mg: null,
    sat_fat_g: null,
    potassium_mg: null,
    fiber_g: null,
    calories: entry.recipe?.cal_per_serving ?? null,
  }
}

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
        .select(
          '*, food:foods(*), recipe:recipes(*, recipe_ingredients(food_id, food:foods(fructose_level,fructans_level,calories,serving_grams)))',
        )
        .eq('logged_on', date)
        .order('created_at', { ascending: true })
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

/** Add a log entry for the current user + date; refreshes the day's log. */
export function useAddLogEntry() {
  const { user } = useAuth()
  const userId = user?.id
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: AddLogEntryInput): Promise<FoodLogRow> => {
      if (!supabase) throw new Error('Supabase is not configured.')
      if (!userId) throw new Error('Not signed in.')
      const { data, error } = await supabase
        .from('food_log')
        .insert({
          user_id: userId,
          logged_on: input.date,
          meal: input.meal,
          servings: input.servings,
          food_id: input.food_id ?? null,
          recipe_id: input.recipe_id ?? null,
          note: input.note ?? null,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as FoodLogRow
    },
    onSuccess: (_row, input) => {
      qc.invalidateQueries({ queryKey: queryKeys.foodLog(userId, input.date) })
    },
  })
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
  const { user } = useAuth()
  const userId = user?.id
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateLogEntryInput): Promise<FoodLogRow> => {
      if (!supabase) throw new Error('Supabase is not configured.')
      if (!userId) throw new Error('Not signed in.')
      const patch: Partial<FoodLogRow> = {}
      if (input.meal !== undefined) patch.meal = input.meal
      if (input.servings !== undefined) patch.servings = input.servings
      if (input.note !== undefined) patch.note = input.note
      const { data, error } = await supabase
        .from('food_log')
        .update(patch)
        .eq('id', input.id)
        .select('*')
        .single()
      if (error) throw error
      return data as FoodLogRow
    },
    onSuccess: (_row, input) => {
      qc.invalidateQueries({ queryKey: queryKeys.foodLog(userId, input.date) })
    },
  })
}

/** Delete a log entry; refreshes the day's log. */
export function useDeleteLogEntry() {
  const { user } = useAuth()
  const userId = user?.id
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: { id: string; date: string }): Promise<void> => {
      if (!supabase) throw new Error('Supabase is not configured.')
      if (!userId) throw new Error('Not signed in.')
      const { error } = await supabase.from('food_log').delete().eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_void, input) => {
      qc.invalidateQueries({ queryKey: queryKeys.foodLog(userId, input.date) })
    },
  })
}
