import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { mutationKeys, queryKeys } from './queryKeys'
import { useInjectUserId } from './useInjectUserId'
import type {
  AddWorkoutLogVars,
  DeleteWorkoutLogVars,
  UpdateWorkoutLogVars,
} from './mutationDefaults'
import type { WorkoutLogExerciseRow, WorkoutLogRow } from './types'

/** A workout_log session with its per-exercise results embedded. */
export type WorkoutLogEntry = WorkoutLogRow & {
  workout_log_exercises: WorkoutLogExerciseRow[]
}

/** Per-exercise result to record alongside a session (id/log_id managed here). */
export type WorkoutLogExerciseInput = Omit<
  WorkoutLogExerciseRow,
  'id' | 'workout_log_id'
>

export interface AddWorkoutLogInput {
  date: string
  workout_id?: string | null
  name?: string | null
  duration_sec?: number | null
  rounds_completed?: number | null
  calories_burned?: number | null
  distance_km?: number | null
  incline_pct?: number | null
  notes?: string | null
  completed?: boolean
  exercises?: WorkoutLogExerciseInput[]
}

/**
 * The day's workout sessions for `date` (YYYY-MM-DD), scoped to the signed-in
 * user via RLS, with per-exercise results embedded. Disabled when signed out or
 * Supabase is not configured.
 */
export function useWorkoutLog(date: string) {
  const { user } = useAuth()
  const userId = user?.id
  const enabled = !!userId && supabase !== null

  return useQuery({
    queryKey: queryKeys.workoutLog(userId, date),
    enabled,
    queryFn: async (): Promise<WorkoutLogEntry[]> => {
      if (!supabase) return []
      const { data, error } = await supabase
        .from('workout_log')
        .select('*, workout_log_exercises(*)')
        .eq('performed_on', date)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as WorkoutLogEntry[]
    },
  })
}

/**
 * Recent workout sessions (newest first), scoped to the signed-in user via RLS.
 * Disabled when signed out or Supabase is not configured.
 */
export function useWorkoutLogHistory(limit = 30) {
  const { user } = useAuth()
  const userId = user?.id
  const enabled = !!userId && supabase !== null

  return useQuery({
    queryKey: queryKeys.workoutLogHistory(userId),
    enabled,
    queryFn: async (): Promise<WorkoutLogEntry[]> => {
      if (!supabase) return []
      const { data, error } = await supabase
        .from('workout_log')
        .select('*, workout_log_exercises(*)')
        .order('performed_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as WorkoutLogEntry[]
    },
  })
}

/**
 * Add a session for the current user + date, then its per-exercise results in a
 * second insert keyed by the new session id. Refreshes the date + history keys.
 */
export function useAddWorkoutLog() {
  return useInjectUserId<
    WorkoutLogRow,
    Error,
    AddWorkoutLogInput,
    AddWorkoutLogVars,
    unknown
  >(
    useMutation<WorkoutLogRow, Error, AddWorkoutLogVars>({
      mutationKey: mutationKeys.addWorkoutLog,
    }),
  )
}

export interface UpdateWorkoutLogInput {
  id: string
  date: string
  name?: string | null
  duration_sec?: number | null
  rounds_completed?: number | null
  notes?: string | null
  completed?: boolean
}

/** Update a session (not its children); refreshes the date + history keys. */
export function useUpdateWorkoutLog() {
  return useInjectUserId<
    WorkoutLogRow | null,
    Error,
    UpdateWorkoutLogInput,
    UpdateWorkoutLogVars,
    unknown
  >(
    useMutation<WorkoutLogRow | null, Error, UpdateWorkoutLogVars>({
      mutationKey: mutationKeys.updateWorkoutLog,
    }),
  )
}

/** Delete a session (children cascade in the DB); refreshes date + history. */
export function useDeleteWorkoutLog() {
  return useInjectUserId<
    void,
    Error,
    { id: string; date: string },
    DeleteWorkoutLogVars,
    unknown
  >(
    useMutation<void, Error, DeleteWorkoutLogVars>({
      mutationKey: mutationKeys.deleteWorkoutLog,
    }),
  )
}
