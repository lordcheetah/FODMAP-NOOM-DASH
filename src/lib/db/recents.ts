import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { queryKeys } from './queryKeys'
import type { ExerciseRow, FoodRow, RecipeRow } from './types'

/**
 * Dedupe a list keeping the FIRST occurrence per key (preserving order); rows
 * whose key is null/undefined are dropped. Used to turn a most-recent-first log
 * into a distinct "recently used" list. Pure + unit-tested.
 */
export function dedupeByKeyKeepFirst<T>(
  items: T[],
  keyFn: (it: T) => string | null | undefined,
): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const it of items) {
    const k = keyFn(it)
    if (k == null) continue
    if (seen.has(k)) continue
    seen.add(k)
    out.push(it)
  }
  return out
}

export interface RecentFood {
  kind: 'food' | 'recipe'
  key: string
  name: string
  food: FoodRow | null
  recipe: RecipeRow | null
}

/**
 * The user's most recently logged foods/recipes, distinct and most-recent-first.
 * Null-guarded for the offline/demo shell.
 */
export function useRecentFoods(limit = 8) {
  const { user } = useAuth()
  const userId = user?.id
  const enabled = !!userId && supabase !== null

  return useQuery({
    queryKey: queryKeys.recentFoods(userId),
    enabled,
    queryFn: async (): Promise<RecentFood[]> => {
      if (!supabase) return []
      const { data, error } = await supabase
        .from('food_log')
        .select('food_id, recipe_id, created_at, food:foods(*), recipe:recipes(*)')
        .order('created_at', { ascending: false })
        .limit(60)
      if (error) throw error
      type Row = {
        food_id: string | null
        recipe_id: string | null
        food: FoodRow | null
        recipe: RecipeRow | null
      }
      const rows = (data ?? []) as unknown as Row[]
      const mapped: RecentFood[] = rows.map((r) =>
        r.food_id
          ? {
              kind: 'food' as const,
              key: `f:${r.food_id}`,
              name: r.food?.name ?? 'Food',
              food: r.food ?? null,
              recipe: null,
            }
          : {
              kind: 'recipe' as const,
              key: `r:${r.recipe_id}`,
              name: r.recipe?.name ?? 'Recipe',
              food: null,
              recipe: r.recipe ?? null,
            },
      )
      return dedupeByKeyKeepFirst(mapped, (m) => m.key).slice(0, limit)
    },
  })
}

/**
 * The user's most recently logged exercises (distinct, most-recent-first),
 * resolved to their exercise rows. Null-guarded for the offline/demo shell.
 */
export function useRecentExercises(limit = 8) {
  const { user } = useAuth()
  const userId = user?.id
  const enabled = !!userId && supabase !== null

  return useQuery({
    queryKey: queryKeys.recentExercises(userId),
    enabled,
    queryFn: async (): Promise<ExerciseRow[]> => {
      if (!supabase) return []
      const { data, error } = await supabase
        .from('workout_log')
        .select('created_at, workout_log_exercises(exercise_id, exercise:exercises(*))')
        .order('created_at', { ascending: false })
        .limit(40)
      if (error) throw error
      type Child = { exercise_id: string | null; exercise: ExerciseRow | null }
      type Row = { workout_log_exercises: Child[] | null }
      const rows = (data ?? []) as unknown as Row[]
      const flat: Child[] = []
      for (const r of rows) {
        for (const c of r.workout_log_exercises ?? []) flat.push(c)
      }
      return dedupeByKeyKeepFirst(flat, (c) => c.exercise_id ?? null)
        .map((c) => c.exercise)
        .filter((e): e is ExerciseRow => e != null)
        .slice(0, limit)
    },
  })
}
