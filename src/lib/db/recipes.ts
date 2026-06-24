import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { queryKeys } from './queryKeys'
import { likeContains } from './search'
import type { FoodRow, RecipeRow, RecipeIngredientRow } from './types'

/** A recipe ingredient with its joined food row (null when unmatched). */
export type RecipeIngredientWithFood = RecipeIngredientRow & {
  food: FoodRow | null
}

export interface RecipeWithIngredients {
  recipe: RecipeRow
  ingredients: RecipeIngredientWithFood[]
}

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
    queryFn: async (): Promise<RecipeRow[]> => {
      if (!supabase) return []
      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .ilike('name', likeContains(trimmed))
        .limit(30)
      if (error) throw error
      return (data ?? []) as RecipeRow[]
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
