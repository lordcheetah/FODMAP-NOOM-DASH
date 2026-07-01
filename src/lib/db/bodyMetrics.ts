import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { mutationKeys, queryKeys } from './queryKeys'
import { useInjectUserId } from './useInjectUserId'
import type {
  AddWeightVars,
  DeleteWeightVars,
  UpsertBodyProfileVars,
} from './mutationDefaults'

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

/**
 * Create/update the singleton body profile. Offline-capable: queued + optimistic
 * via the registered mutation default; resumes after reload.
 */
export function useUpsertBodyProfile() {
  return useInjectUserId<
    BodyProfileRow,
    Error,
    BodyProfileInput,
    UpsertBodyProfileVars,
    unknown
  >(
    useMutation<BodyProfileRow, Error, UpsertBodyProfileVars>({
      mutationKey: mutationKeys.upsertBodyProfile,
    }),
  )
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

/** Record a weight entry (offline-capable, optimistic). */
export function useAddWeight() {
  return useInjectUserId<
    WeightLogRow,
    Error,
    AddWeightInput,
    AddWeightVars,
    unknown
  >(
    useMutation<WeightLogRow, Error, AddWeightVars>({
      mutationKey: mutationKeys.addWeight,
    }),
  )
}

/** Delete a weight entry by id (offline-capable, optimistic). */
export function useDeleteWeight() {
  return useInjectUserId<void, Error, { id: string }, DeleteWeightVars, unknown>(
    useMutation<void, Error, DeleteWeightVars>({
      mutationKey: mutationKeys.deleteWeight,
    }),
  )
}
