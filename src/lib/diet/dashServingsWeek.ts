import { dashProgress, DASH_GROUPS, type LoggedNutrients } from './dashProgress'
import type { DashGroup } from './types'
import type { DatedNutrients } from './nutrientTrend'

/**
 * Weekly DASH serving averages per food group. Reuses `dashProgress` per day so
 * the per-group counts match the day summary, then averages over the window.
 */
export interface DashGroupWeek {
  group: DashGroup
  /** Total servings across the window. */
  total: number
  /** Average servings per day (total / number of days in the window). */
  avgPerDay: number
  /** The user's DAILY serving goal for this group, or null when unset. */
  dailyGoal: number | null
}

/**
 * Average DASH servings per group over `dates`. Empty days count as 0 servings
 * (so the average reflects the whole window), and entries whose date is outside
 * `dates` are ignored. Returns all 8 groups in canonical order.
 */
export function dashServingsWeek(
  entries: DatedNutrients[],
  dates: string[],
  goals: Partial<Record<DashGroup, number>>,
): DashGroupWeek[] {
  const byDate = new Map<string, LoggedNutrients[]>()
  for (const e of entries) {
    const arr = byDate.get(e.date)
    if (arr) arr.push(e)
    else byDate.set(e.date, [e])
  }

  const totals = Object.fromEntries(DASH_GROUPS.map((g) => [g, 0])) as Record<
    DashGroup,
    number
  >
  for (const date of dates) {
    const dash = dashProgress(byDate.get(date) ?? [], {})
    for (const g of DASH_GROUPS) totals[g] += dash.servingsByGroup[g]
  }

  const days = dates.length || 1
  return DASH_GROUPS.map((g) => ({
    group: g,
    total: totals[g],
    avgPerDay: totals[g] / days,
    dailyGoal: goals[g] ?? null,
  }))
}
