import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { queryKeys } from './queryKeys'
import { likeContains } from './search'
import type { ExerciseCategory } from '@/lib/exercise/types'
import type { ExerciseRow, WorkoutExerciseRow, WorkoutRow } from './types'

/** A workout_exercises row with its joined exercise (one round-trip). */
export type WorkoutExerciseWithExercise = WorkoutExerciseRow & {
  exercise: ExerciseRow
}

export interface WorkoutWithExercises {
  workout: WorkoutRow
  exercises: WorkoutExerciseWithExercise[]
}

/**
 * Browse workouts (reference seed + the user's own), optionally filtered by
 * category, ordered by name. No-op (empty) when Supabase is not configured.
 */
export function useWorkouts(category?: ExerciseCategory) {
  const enabled = supabase !== null

  return useQuery({
    queryKey: queryKeys.workouts(category),
    enabled,
    queryFn: async (): Promise<WorkoutRow[]> => {
      if (!supabase) return []
      let query = supabase.from('workouts').select('*').order('name')
      if (category) query = query.eq('category', category)
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as WorkoutRow[]
    },
  })
}

/**
 * Search workouts by name (case-insensitive). Disabled below 2 chars and when
 * Supabase is not configured. Ephemeral — excluded from the persisted cache.
 * Mirrors `useExerciseSearch`/`useFoodSearch`.
 */
export function useWorkoutSearch(term: string) {
  const trimmed = term.trim()
  const enabled = trimmed.length >= 2 && supabase !== null

  return useQuery({
    queryKey: queryKeys.workoutSearch(trimmed),
    enabled,
    meta: { persist: false },
    queryFn: async (): Promise<WorkoutRow[]> => {
      if (!supabase) return []
      const { data, error } = await supabase
        .from('workouts')
        .select('*')
        .ilike('name', likeContains(trimmed))
        .limit(30)
      if (error) throw error
      return (data ?? []) as WorkoutRow[]
    },
  })
}

/**
 * Load a single workout plus its ordered exercises joined to `exercises`, in one
 * round-trip. Children are sorted by `position` client-side (the embed order is
 * not guaranteed). Disabled when no slug or Supabase is not configured.
 */
export function useWorkout(slug: string | undefined) {
  const enabled = !!slug && supabase !== null

  return useQuery({
    queryKey: queryKeys.workout(slug ?? ''),
    enabled,
    queryFn: async (): Promise<WorkoutWithExercises | null> => {
      if (!supabase || !slug) return null
      const { data, error } = await supabase
        .from('workouts')
        .select('*, workout_exercises(*, exercise:exercises(*))')
        .eq('slug', slug)
        .limit(1)
        .maybeSingle()
      if (error) throw error
      if (!data) return null

      const { workout_exercises, ...workout } = data as WorkoutRow & {
        workout_exercises: WorkoutExerciseWithExercise[] | null
      }
      const exercises = (workout_exercises ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
      return { workout: workout as WorkoutRow, exercises }
    },
  })
}
