import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { queryKeys } from './queryKeys'
import { likeContains } from './search'
import type { RollupIngredient } from '@/lib/diet'
import type { FoodRow, RecipeRow, RecipeIngredientRow } from './types'

/** A recipe ingredient with its joined food row (null when unmatched). */
export type RecipeIngredientWithFood = RecipeIngredientRow & {
  food: FoodRow | null
}

export interface RecipeWithIngredients {
  recipe: RecipeRow
  ingredients: RecipeIngredientWithFood[]
}

/** A search result carries just enough ingredient data to compute the roll-up. */
export interface RecipeSearchResult {
  recipe: RecipeRow
  ingredients: RollupIngredient[]
}

/** Selective ingredient embed: only the fields `recipeRollup` consumes. */
const SEARCH_INGREDIENT_EMBED =
  'recipe_ingredients(food_id, food:foods(fructose_level,fructans_level,calories,serving_grams))'

/**
 * Search recipes by name (case-insensitive). RLS returns seed + the user's own.
 * Disabled below 2 chars and when Supabase is not configured.
 */
export function useRecipeSearch(term: string) {
  const trimmed = term.trim()
  const enabled = trimmed.length >= 2 && supabase !== null

  return useQuery({
    queryKey: queryKeys.recipeSearch(trimmed),
    enabled,
    queryFn: async (): Promise<RecipeSearchResult[]> => {
      if (!supabase) return []
      const { data, error } = await supabase
        .from('recipes')
        .select(`*, ${SEARCH_INGREDIENT_EMBED}`)
        .ilike('name', likeContains(trimmed))
        .limit(30)
      if (error) throw error
      const rows = (data ?? []) as (RecipeRow & {
        recipe_ingredients: RollupIngredient[] | null
      })[]
      return rows.map((row) => {
        const { recipe_ingredients, ...recipe } = row
        return {
          recipe: recipe as RecipeRow,
          ingredients: recipe_ingredients ?? [],
        }
      })
    },
  })
}

/**
 * Load a single recipe plus its ingredients joined to foods (for roll-up flags).
 * Disabled when no id or Supabase is not configured.
 */
export function useRecipe(id: string | undefined) {
  const enabled = !!id && supabase !== null

  return useQuery({
    queryKey: queryKeys.recipe(id ?? ''),
    enabled,
    queryFn: async (): Promise<RecipeWithIngredients | null> => {
      if (!supabase || !id) return null
      const { data, error } = await supabase
        .from('recipes')
        .select('*, recipe_ingredients(*, food:foods(*))')
        .eq('id', id)
        .single()
      if (error) throw error
      if (!data) return null

      const { recipe_ingredients, ...recipe } = data as RecipeRow & {
        recipe_ingredients: RecipeIngredientWithFood[]
      }
      return {
        recipe: recipe as RecipeRow,
        ingredients: recipe_ingredients ?? [],
      }
    },
  })
}
