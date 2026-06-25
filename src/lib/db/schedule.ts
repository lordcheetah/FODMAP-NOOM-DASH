import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { queryKeys } from './queryKeys'
import type { ScheduleCycle } from '@/lib/exercise/todaysWorkout'
import type { ScheduleDayRow, ScheduleRow } from './types'

/** Light workout shape embedded in a schedule day (enough for the cycle grid). */
export interface ScheduleDayWorkout {
  slug: string
  name: string
  category: string
  duration_min: number | null
  format: string
}

/** A schedule_days row with its (optional) joined workout. */
export type ScheduleDayWithWorkout = ScheduleDayRow & {
  workout: ScheduleDayWorkout | null
}

export interface ScheduleWithDays {
  schedule: ScheduleRow
  days: ScheduleDayWithWorkout[]
}

/**
 * Load a schedule cycle plus its days joined to a light workout. Without a name,
 * loads the first global seed schedule (`user_id IS NULL`). Disabled when
 * Supabase is not configured.
 */
export function useSchedule(name?: string) {
  const enabled = supabase !== null

  return useQuery({
    queryKey: queryKeys.schedule(name),
    enabled,
    queryFn: async (): Promise<ScheduleWithDays | null> => {
      if (!supabase) return null
      let query = supabase
        .from('schedules')
        .select(
          '*, schedule_days(*, workout:workouts(slug,name,category,duration_min,format))',
        )
      query = name ? query.eq('name', name) : query.is('user_id', null)
      const { data, error } = await query.limit(1).maybeSingle()
      if (error) throw error
      if (!data) return null

      const { schedule_days, ...schedule } = data as ScheduleRow & {
        schedule_days: ScheduleDayWithWorkout[] | null
      }
      const days = (schedule_days ?? [])
        .slice()
        .sort((a, b) => a.week - b.week || a.day - b.day)
      return { schedule: schedule as ScheduleRow, days }
    },
  })
}

/** Shape a loaded schedule into the pure `ScheduleCycle` for `todaysWorkout`. */
export function toScheduleCycle(loaded: ScheduleWithDays | null): ScheduleCycle | null {
  if (!loaded) return null
  return {
    name: loaded.schedule.name,
    days: loaded.days.map((d) => ({
      week: d.week,
      day: d.day,
      label: d.label,
      workout: d.workout
        ? { slug: d.workout.slug, name: d.workout.name }
        : null,
    })),
  }
}
