/**
 * Pure helper: resolve "today's scheduled workout" from a 4-week cycle.
 *
 * Kept clock-free and DB-free so it is trivially unit-testable; the schedule
 * hook (`src/lib/db/schedule.ts`) shapes its joined rows into `ScheduleCycle`
 * and the UI passes in a chosen week/day.
 */

/** A single day cell of a schedule cycle (shaped from `schedule_days`). */
export interface ScheduleDayCell {
  week: number
  day: number
  label: string | null
  /** Resolved workout for the day, or null on a rest day / unresolved slug. */
  workout: {
    slug: string
    name: string
  } | null
}

/** A schedule cycle: a flat list of day cells (any number of weeks). */
export interface ScheduleCycle {
  name: string
  days: ScheduleDayCell[]
}

/**
 * Find the cell for a given 1-based `week` + `day`, or null if absent. Returns
 * the cell itself (so callers can read its `label` even on a rest day).
 */
export function scheduleCell(
  cycle: ScheduleCycle | null | undefined,
  week: number,
  day: number,
): ScheduleDayCell | null {
  if (!cycle) return null
  return cycle.days.find((c) => c.week === week && c.day === day) ?? null
}

/**
 * The workout scheduled for a given 1-based `week` + `day`, or null on a rest
 * day / when the cell is absent.
 */
export function todaysWorkout(
  cycle: ScheduleCycle | null | undefined,
  week: number,
  day: number,
): ScheduleDayCell['workout'] {
  return scheduleCell(cycle, week, day)?.workout ?? null
}

/** Number of weeks in the cycle (the max `week`), 0 when empty. */
export function cycleWeekCount(cycle: ScheduleCycle | null | undefined): number {
  if (!cycle || cycle.days.length === 0) return 0
  return cycle.days.reduce((max, c) => Math.max(max, c.week), 0)
}
