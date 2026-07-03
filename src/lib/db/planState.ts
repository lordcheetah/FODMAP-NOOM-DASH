import { useCallback, useMemo } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { mutationKeys, queryKeys } from './queryKeys'
import { useInjectUserId } from './useInjectUserId'
import type { SetPlanStateVars } from './mutationDefaults'
import type { PlanStateRow } from './types'

/**
 * Read a per-user string set stored under `key` in `plan_state` (cross-device).
 * Returns [] when signed out / unconfigured / no row yet. Persisted by the app's
 * query cache, so it also reads offline.
 */
export function usePlanStateValues(key: string) {
  const { user } = useAuth()
  const userId = user?.id
  const enabled = !!userId && supabase !== null

  return useQuery({
    queryKey: queryKeys.planState(userId, key),
    enabled,
    queryFn: async (): Promise<string[]> => {
      if (!supabase || !userId) return []
      const { data, error } = await supabase
        .from('plan_state')
        .select('values')
        .eq('key', key)
        .maybeSingle()
      if (error) throw error
      return ((data?.values as string[] | undefined) ?? [])
    },
  })
}

export interface SetPlanStateInput {
  key: string
  values: string[]
}

/** Upsert a key's set (offline-capable, optimistic — see mutationDefaults). */
export function useSetPlanState() {
  return useInjectUserId<PlanStateRow, Error, SetPlanStateInput, SetPlanStateVars, unknown>(
    useMutation<PlanStateRow, Error, SetPlanStateVars>({
      mutationKey: mutationKeys.setPlanState,
    }),
  )
}

/**
 * A cross-device-synced Set<string> returning `{ set, toggle, clear }`. Reads
 * from `plan_state`
 * and writes the whole set on each change; optimistic updates make toggles
 * instant and the offline queue resumes writes after a reload.
 */
export function useSyncedSet(key: string) {
  const query = usePlanStateValues(key)
  const setter = useSetPlanState()
  const set = useMemo(() => new Set(query.data ?? []), [query.data])

  const write = useCallback(
    (next: Set<string>) => setter.mutate({ key, values: [...next] }),
    [key, setter],
  )

  const toggle = useCallback(
    (value: string, on?: boolean) => {
      const next = new Set(set)
      const want = on ?? !next.has(value)
      if (want) next.add(value)
      else next.delete(value)
      write(next)
    },
    [set, write],
  )

  const clear = useCallback(() => write(new Set()), [write])

  return { set, toggle, clear }
}
