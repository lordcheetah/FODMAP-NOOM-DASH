import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { queryKeys } from './queryKeys'

export interface BodyProfileRow {
  user_id: string
  height_cm: number | null
  sex: string | null
  weight_unit: string // 'lb' | 'kg'
  height_unit: string // 'ftin' | 'cm'
  updated_at: string
}

export interface WeightLogRow {
  id: string
  user_id: string
  recorded_on: string
  weight_kg: number
  note: string | null
  created_at: string
}

/** The user's body profile (height/sex/unit prefs), or null if not set yet. */
export function useBodyProfile() {
  const { user } = useAuth()
  const userId = user?.id
  const enabled = !!userId && supabase !== null

  return useQuery({
    queryKey: queryKeys.bodyProfile(userId),
    enabled,
    queryFn: async (): Promise<BodyProfileRow | null> => {
      if (!supabase || !userId) return null
      const { data, error } = await supabase
        .from('body_profile')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw error
      return (data as BodyProfileRow | null) ?? null
    },
  })
}

export interface BodyProfileInput {
  height_cm?: number | null
  sex?: string | null
  weight_unit?: string
  height_unit?: string
}

/** Create/update the singleton body profile for the current user. */
export function useUpsertBodyProfile() {
  const { user } = useAuth()
  const userId = user?.id
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: BodyProfileInput): Promise<BodyProfileRow> => {
      if (!supabase) throw new Error('Supabase is not configured.')
      if (!userId) throw new Error('Not signed in.')
      const { data, error } = await supabase
        .from('body_profile')
        .upsert(
          {
            user_id: userId,
            ...input,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        )
        .select('*')
        .single()
      if (error) throw error
      return data as BodyProfileRow
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.bodyProfile(userId) })
    },
  })
}

/** The user's weight entries, newest first. */
export function useWeightLog(limit = 90) {
  const { user } = useAuth()
  const userId = user?.id
  const enabled = !!userId && supabase !== null

  return useQuery({
    queryKey: queryKeys.weightLog(userId),
    enabled,
    queryFn: async (): Promise<WeightLogRow[]> => {
      if (!supabase) return []
      const { data, error } = await supabase
        .from('weight_log')
        .select('*')
        .order('recorded_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as WeightLogRow[]
    },
  })
}

export interface AddWeightInput {
  weight_kg: number
  recorded_on?: string
  note?: string | null
}

/** Record a weight entry for the current user; refreshes the history. */
export function useAddWeight() {
  const { user } = useAuth()
  const userId = user?.id
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: AddWeightInput): Promise<WeightLogRow> => {
      if (!supabase) throw new Error('Supabase is not configured.')
      if (!userId) throw new Error('Not signed in.')
      const { data, error } = await supabase
        .from('weight_log')
        .insert({
          user_id: userId,
          weight_kg: input.weight_kg,
          recorded_on: input.recorded_on ?? undefined,
          note: input.note ?? null,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as WeightLogRow
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.weightLog(userId) })
    },
  })
}

/** Delete a weight entry; refreshes the history. */
export function useDeleteWeight() {
  const { user } = useAuth()
  const userId = user?.id
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      if (!supabase) throw new Error('Supabase is not configured.')
      const { error } = await supabase.from('weight_log').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.weightLog(userId) })
    },
  })
}
