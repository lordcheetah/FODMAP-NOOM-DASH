import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { queryKeys } from './queryKeys'
import { likeContains } from './search'
import type { ExerciseCategory } from '@/lib/exercise/types'
import type { ExerciseRow } from './types'

/**
 * Browse exercises (reference seed + the user's own), optionally filtered by
 * category, ordered by name. RLS returns global rows (`user_id IS NULL`) plus the
 * signed-in user's rows. A no-op (empty result) when Supabase is not configured
 * so the offline/demo shell still renders.
 */
export function useExercises(category?: ExerciseCategory) {
  const enabled = supabase !== null

  return useQuery({
    queryKey: queryKeys.exercises(category),
    enabled,
    queryFn: async (): Promise<ExerciseRow[]> => {
      if (!supabase) return []
      let query = supabase.from('exercises').select('*').order('name')
      if (category) query = query.eq('category', category)
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as ExerciseRow[]
    },
  })
}

/**
 * Load a single exercise by slug (reference or the user's own). Disabled when no
 * slug or Supabase is not configured.
 */
export function useExercise(slug: string | undefined) {
  const enabled = !!slug && supabase !== null

  return useQuery({
    queryKey: queryKeys.exercise(slug ?? ''),
    enabled,
    queryFn: async (): Promise<ExerciseRow | null> => {
      if (!supabase || !slug) return null
      const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .eq('slug', slug)
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return (data as ExerciseRow | null) ?? null
    },
  })
}

/**
 * Search exercises by name (case-insensitive). Disabled below 2 chars and when
 * Supabase is not configured. Mirrors `useFoodSearch`.
 */
export function useExerciseSearch(term: string) {
  const trimmed = term.trim()
  const enabled = trimmed.length >= 2 && supabase !== null

  return useQuery({
    queryKey: queryKeys.exerciseSearch(trimmed),
    enabled,
    queryFn: async (): Promise<ExerciseRow[]> => {
      if (!supabase) return []
      const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .ilike('name', likeContains(trimmed))
        .limit(30)
      if (error) throw error
      return (data ?? []) as ExerciseRow[]
    },
  })
}
