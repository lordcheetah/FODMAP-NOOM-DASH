import { describe, it, expect } from 'vitest'
import {
  todaysWorkout,
  scheduleCell,
  cycleWeekCount,
  type ScheduleCycle,
  type ScheduleDayCell,
} from './todaysWorkout'

/**
 * EXTENDS `todaysWorkout.test.ts`. Builds a full 4-week x 7-day cycle (the
 * Phase-2 NOOM cadence) and exercises week/day resolution, REST cells, and
 * out-of-range lookups. These helpers are clock-free: the caller computes the
 * 1-based week/day; we only verify the lookup table never resolves an
 * unscheduled slot to a workout.
 */

/** A 4-week cycle: day 3 and day 6 are REST every week; others have a workout. */
function buildCycle(): ScheduleCycle {
  const days: ScheduleDayCell[] = []
  for (let week = 1; week <= 4; week++) {
    for (let day = 1; day <= 7; day++) {
      const rest = day === 3 || day === 6
      days.push({
        week,
        day,
        label: rest ? 'REST' : `W${week}D${day}`,
        workout: rest
          ? null
          : { slug: `w${week}-d${day}`, name: `Week ${week} Day ${day}` },
      })
    }
  }
  return { name: '4-Week Cycle', days }
}

const cycle = buildCycle()

describe('todaysWorkout — full 4-week cycle', () => {
  it('cycleWeekCount reports 4 weeks', () => {
    expect(cycleWeekCount(cycle)).toBe(4)
  })

  it('resolves the correct workout for each week boundary', () => {
    expect(todaysWorkout(cycle, 1, 1)).toEqual({ slug: 'w1-d1', name: 'Week 1 Day 1' })
    expect(todaysWorkout(cycle, 4, 7)).toEqual({ slug: 'w4-d7', name: 'Week 4 Day 7' })
    expect(todaysWorkout(cycle, 2, 5)).toEqual({ slug: 'w2-d5', name: 'Week 2 Day 5' })
  })

  it('REST cells (day 3 & 6) resolve to null in every week', () => {
    for (let week = 1; week <= 4; week++) {
      expect(todaysWorkout(cycle, week, 3)).toBeNull()
      expect(todaysWorkout(cycle, week, 6)).toBeNull()
      // but the cell still exists and carries its REST label
      expect(scheduleCell(cycle, week, 3)).toMatchObject({ label: 'REST', workout: null })
    }
  })

  it('week 5 (past a 4-week cycle) is out of range -> null (no implicit wrap)', () => {
    // The helper does NOT wrap; the caller is responsible for modulo-ing the
    // calendar week into 1..4. A raw week 5 lookup must not leak week-1 data.
    expect(todaysWorkout(cycle, 5, 1)).toBeNull()
    expect(scheduleCell(cycle, 5, 1)).toBeNull()
  })

  it('demonstrates correct caller-side wrap into the 4-week cycle', () => {
    // If a caller is on calendar week 5 (1-based), it should map to cycle week 1.
    const calendarWeek = 5
    const wrapped = ((calendarWeek - 1) % cycleWeekCount(cycle)) + 1
    expect(wrapped).toBe(1)
    expect(todaysWorkout(cycle, wrapped, 1)).toEqual({ slug: 'w1-d1', name: 'Week 1 Day 1' })

    // Calendar week 6 -> cycle week 2.
    const w6 = ((6 - 1) % cycleWeekCount(cycle)) + 1
    expect(w6).toBe(2)
    expect(todaysWorkout(cycle, w6, 4)).toEqual({ slug: 'w2-d4', name: 'Week 2 Day 4' })
  })

  it('out-of-range day (0, 8) resolves to null', () => {
    expect(todaysWorkout(cycle, 1, 0)).toBeNull()
    expect(todaysWorkout(cycle, 1, 8)).toBeNull()
    expect(scheduleCell(cycle, 1, 0)).toBeNull()
    expect(scheduleCell(cycle, 1, 8)).toBeNull()
  })

  it('negative week/day resolves to null', () => {
    expect(todaysWorkout(cycle, -1, -1)).toBeNull()
  })
})
