import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { queryKeys } from './queryKeys'
import type { DailyTargetsRow } from './types'

/**
 * The signed-in user's single daily_targets row (PK = user_id), or null when no
 * row exists yet. Disabled when signed out or Supabase unconfigured.
 */
export function useDailyTargets() {
  const { user } = useAuth()
  const userId = user?.id
  const enabled = !!userId && supabase !== null

  return useQuery({
    queryKey: queryKeys.dailyTargets(userId),
    enabled,
    queryFn: async (): Promise<DailyTargetsRow | null> => {
      if (!supabase || !userId) return null
      const { data, error } = await supabase
        .from('daily_targets')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw error
      return (data as DailyTargetsRow | null) ?? null
    },
  })
}

/** Fields the user can set; user_id/updated_at are managed by the hook/DB. */
export type DailyTargetsInput = Omit<
  Partial<DailyTargetsRow>,
  'user_id' | 'updated_at'
>

/**
 * Create or update the user's daily_targets row (upsert on the user_id PK).
 * Refreshes the targets query on success. No-op throw when unconfigured.
 */
export function useUpsertDailyTargets() {
  const { user } = useAuth()
  const userId = user?.id
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: DailyTargetsInput): Promise<DailyTargetsRow> => {
      if (!supabase) throw new Error('Supabase is not configured.')
      if (!userId) throw new Error('Not signed in.')
      const { data, error } = await supabase
        .from('daily_targets')
        .upsert({ ...input, user_id: userId }, { onConflict: 'user_id' })
        .select('*')
        .single()
      if (error) throw error
      return data as DailyTargetsRow
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.dailyTargets(userId) })
    },
  })
}
