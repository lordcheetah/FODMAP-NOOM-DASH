import { describe, it, expect } from 'vitest'
import {
  todaysWorkout,
  scheduleCell,
  cycleWeekCount,
  type ScheduleCycle,
} from './todaysWorkout'

const cycle: ScheduleCycle = {
  name: 'Test Cycle',
  days: [
    { week: 1, day: 1, label: 'Full Body', workout: { slug: 'fb', name: 'Full Body' } },
    { week: 1, day: 2, label: 'REST', workout: null },
    { week: 2, day: 1, label: 'Upper', workout: { slug: 'ub', name: 'Upper Body' } },
  ],
}

describe('todaysWorkout', () => {
  it('returns the workout for a populated day', () => {
    expect(todaysWorkout(cycle, 1, 1)).toEqual({ slug: 'fb', name: 'Full Body' })
    expect(todaysWorkout(cycle, 2, 1)).toEqual({ slug: 'ub', name: 'Upper Body' })
  })

  it('returns null on a rest day', () => {
    expect(todaysWorkout(cycle, 1, 2)).toBeNull()
  })

  it('returns null for an absent week/day', () => {
    expect(todaysWorkout(cycle, 9, 9)).toBeNull()
  })

  it('returns null for a null/undefined cycle', () => {
    expect(todaysWorkout(null, 1, 1)).toBeNull()
    expect(todaysWorkout(undefined, 1, 1)).toBeNull()
  })
})

describe('scheduleCell', () => {
  it('returns the cell (with its label) even on a rest day', () => {
    expect(scheduleCell(cycle, 1, 2)).toMatchObject({ label: 'REST', workout: null })
  })

  it('returns null when absent', () => {
    expect(scheduleCell(cycle, 3, 1)).toBeNull()
  })
})

describe('cycleWeekCount', () => {
  it('counts the max week number', () => {
    expect(cycleWeekCount(cycle)).toBe(2)
  })

  it('is 0 for an empty / null cycle', () => {
    expect(cycleWeekCount(null)).toBe(0)
    expect(cycleWeekCount({ name: 'x', days: [] })).toBe(0)
  })
})
