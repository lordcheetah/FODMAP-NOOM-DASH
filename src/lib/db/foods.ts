import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { queryKeys } from './queryKeys'
import { likeContains } from './search'
import type { FodmapLevel } from '@/lib/diet'
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

/**
 * Look up a food by barcode (used after a scan to reuse an already-saved product
 * instead of re-fetching/re-creating it). RLS lets reads see global seed rows plus
 * the user's own rows; we filter to the user's own row (barcode-tagged products
 * are always user-custom) and take at most one.
 *
 * Disabled (no throw, no data) when signed out, Supabase unconfigured, or no
 * barcode — so the offline/demo shell still renders.
 */
export function useFoodByBarcode(barcode: string | null) {
  const { user } = useAuth()
  const userId = user?.id
  const enabled = !!barcode && !!userId && supabase !== null

  return useQuery({
    queryKey: queryKeys.foodByBarcode(userId, barcode),
    enabled,
    queryFn: async (): Promise<FoodRow | null> => {
      if (!supabase || !barcode || !userId) return null
      const { data, error } = await supabase
        .from('foods')
        .select('*')
        .eq('barcode', barcode)
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as FoodRow | null
    },
  })
}

/** Fields accepted when creating a user-custom food (e.g. a scanned product). */
export interface CreateFoodInput {
  name: string
  brand?: string | null
  serving_desc: string
  serving_grams?: number | null
  calories?: number | null
  sodium_mg?: number | null
  sat_fat_g?: number | null
  potassium_mg?: number | null
  fiber_g?: number | null
  added_sugar_g?: number | null
  /** Default 'unknown' — NEVER inferred. Only the user may set a known level. */
  fructose_level?: FodmapLevel
  fructans_level?: FodmapLevel
  source?: string | null
  barcode?: string | null
}

/**
 * Create a user-custom food (scanned or manually entered). Inserts with
 * `user_id = auth.uid()` (RLS `with check` enforces it server-side too) and
 * FODMAP defaulting to 'unknown' when the user did not explicitly choose a level.
 *
 * Throws when Supabase is unconfigured or signed out (mirrors useAddLogEntry).
 * On success, invalidates barcode lookups + food search so the new row surfaces.
 * A unique-index conflict (concurrent dup on (user_id, barcode)) surfaces as the
 * mutation error so the caller can treat it as "already exists" and re-look-up.
 */
export function useCreateFood() {
  const { user } = useAuth()
  const userId = user?.id
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateFoodInput): Promise<FoodRow> => {
      if (!supabase) throw new Error('Supabase is not configured.')
      if (!userId) throw new Error('Not signed in.')
      const { data, error } = await supabase
        .from('foods')
        .insert({
          user_id: userId,
          name: input.name,
          brand: input.brand ?? null,
          serving_desc: input.serving_desc,
          serving_grams: input.serving_grams ?? null,
          calories: input.calories ?? null,
          sodium_mg: input.sodium_mg ?? null,
          sat_fat_g: input.sat_fat_g ?? null,
          potassium_mg: input.potassium_mg ?? null,
          fiber_g: input.fiber_g ?? null,
          added_sugar_g: input.added_sugar_g ?? null,
          fructose_level: input.fructose_level ?? 'unknown',
          fructans_level: input.fructans_level ?? 'unknown',
          source: input.source ?? null,
          barcode: input.barcode ?? null,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as FoodRow
    },
    onSuccess: (row) => {
      qc.invalidateQueries({
        queryKey: queryKeys.foodByBarcode(userId, row.barcode),
      })
      qc.invalidateQueries({ queryKey: ['foodSearch'] })
    },
  })
}
