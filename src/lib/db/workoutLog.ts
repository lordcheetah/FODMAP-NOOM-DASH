import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { queryKeys } from './queryKeys'
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
  const { user } = useAuth()
  const userId = user?.id
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: AddWorkoutLogInput): Promise<WorkoutLogRow> => {
      if (!supabase) throw new Error('Supabase is not configured.')
      if (!userId) throw new Error('Not signed in.')

      const { data: session, error: sessErr } = await supabase
        .from('workout_log')
        .insert({
          user_id: userId,
          performed_on: input.date,
          workout_id: input.workout_id ?? null,
          name: input.name ?? null,
          duration_sec: input.duration_sec ?? null,
          rounds_completed: input.rounds_completed ?? null,
          notes: input.notes ?? null,
          completed: input.completed ?? true,
        })
        .select('*')
        .single()
      if (sessErr) throw sessErr

      const session_row = session as WorkoutLogRow
      const children = input.exercises ?? []
      if (children.length > 0) {
        const rows = children.map((c) => ({
          workout_log_id: session_row.id,
          exercise_id: c.exercise_id ?? null,
          name: c.name ?? null,
          position: c.position ?? null,
          sets: c.sets ?? null,
          reps: c.reps ?? null,
          duration_sec: c.duration_sec ?? null,
          hold_sec: c.hold_sec ?? null,
          score: c.score ?? null,
          notes: c.notes ?? null,
        }))
        const { error: childErr } = await supabase
          .from('workout_log_exercises')
          .insert(rows)
        if (childErr) throw childErr
      }

      return session_row
    },
    onSuccess: (_row, input) => {
      qc.invalidateQueries({ queryKey: queryKeys.workoutLog(userId, input.date) })
      qc.invalidateQueries({ queryKey: queryKeys.workoutLogHistory(userId) })
    },
  })
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
  const { user } = useAuth()
  const userId = user?.id
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateWorkoutLogInput): Promise<WorkoutLogRow> => {
      if (!supabase) throw new Error('Supabase is not configured.')
      if (!userId) throw new Error('Not signed in.')
      const patch: Partial<WorkoutLogRow> = {}
      if (input.name !== undefined) patch.name = input.name
      if (input.duration_sec !== undefined) patch.duration_sec = input.duration_sec
      if (input.rounds_completed !== undefined)
        patch.rounds_completed = input.rounds_completed
      if (input.notes !== undefined) patch.notes = input.notes
      if (input.completed !== undefined) patch.completed = input.completed
      const { data, error } = await supabase
        .from('workout_log')
        .update(patch)
        .eq('id', input.id)
        .select('*')
        .single()
      if (error) throw error
      return data as WorkoutLogRow
    },
    onSuccess: (_row, input) => {
      qc.invalidateQueries({ queryKey: queryKeys.workoutLog(userId, input.date) })
      qc.invalidateQueries({ queryKey: queryKeys.workoutLogHistory(userId) })
    },
  })
}

/** Delete a session (children cascade in the DB); refreshes date + history. */
export function useDeleteWorkoutLog() {
  const { user } = useAuth()
  const userId = user?.id
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: { id: string; date: string }): Promise<void> => {
      if (!supabase) throw new Error('Supabase is not configured.')
      if (!userId) throw new Error('Not signed in.')
      const { error } = await supabase
        .from('workout_log')
        .delete()
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_void, input) => {
      qc.invalidateQueries({ queryKey: queryKeys.workoutLog(userId, input.date) })
      qc.invalidateQueries({ queryKey: queryKeys.workoutLogHistory(userId) })
    },
  })
}
