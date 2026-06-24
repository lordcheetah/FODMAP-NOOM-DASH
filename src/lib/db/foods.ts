import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { queryKeys } from './queryKeys'
import { likeContains } from './search'
import type { FoodRow } from './types'

/**
 * Search foods by name (case-insensitive). RLS already returns the global seed
 * rows (`user_id IS NULL`) plus the signed-in user's own rows.
 *
 * Name-only for now: seed foods carry no brand and there is no custom-food entry
 * UI yet. Brand search returns alongside barcode/custom foods in a later phase
 * (it needs the quoted `.or(...)` form to stay injection-safe).
 *
 * Disabled for terms shorter than 2 chars, and a no-op (empty result) when
 * Supabase is not configured so the offline/demo shell still renders.
 */
export function useFoodSearch(term: string) {
  const trimmed = term.trim()
  const enabled = trimmed.length >= 2 && supabase !== null

  return useQuery({
    queryKey: queryKeys.foodSearch(trimmed),
    enabled,
    queryFn: async (): Promise<FoodRow[]> => {
      if (!supabase) return []
      const { data, error } = await supabase
        .from('foods')
        .select('*')
        .ilike('name', likeContains(trimmed))
        .limit(30)
      if (error) throw error
      return (data ?? []) as FoodRow[]
    },
  })
}
