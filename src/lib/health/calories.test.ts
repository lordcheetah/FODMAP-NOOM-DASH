import { describe, it, expect } from 'vitest'
import { metForExercise, caloriesBurned } from './calories'
import type { ExerciseRow } from '@/lib/db/types'

const ex = (p: Partial<ExerciseRow>): ExerciseRow =>
  ({ slug: '', name: '', category: 'cardio', subcategory: null, ...p }) as ExerciseRow

describe('metForExercise', () => {
  it.each([
    [{ category: 'cardio', slug: 'treadmill-jog', name: 'Treadmill jogging' }, 7.0],
    [{ category: 'cardio', slug: 'brisk-walk', name: 'Brisk walk' }, 4.3],
    [{ category: 'cardio', slug: 'treadmill-walk', name: 'Treadmill walking' }, 3.5],
    [{ category: 'cardio', slug: 'ebike-ride', name: 'E-bike ride' }, 4.0],
    [{ category: 'cardio', slug: 'stationary-bike-steady', name: 'Stationary bike' }, 7.0],
    [{ category: 'cardio', slug: 'rowing-machine-steady', name: 'Rowing machine' }, 6.0],
    [{ category: 'strength', slug: 'band-row', name: 'Band row' }, 4.0],
    [{ category: 'yoga', slug: 'child-pose', name: "Child's pose" }, 2.5],
    [{ category: 'martial-arts', slug: 'ma-shadowboxing', name: 'Shadowboxing' }, 8.0],
  ] as const)('%o -> MET %s', (p, met) => {
    expect(metForExercise(ex(p))).toBe(met)
  })
})

describe('caloriesBurned', () => {
  it('computes MET × kg × hours (rounded)', () => {
    // 3.5 MET, 77 kg, 30 min -> 3.5*77*0.5 = 134.75 -> 135
    expect(caloriesBurned(3.5, 77, 30)).toBe(135)
    // 7 MET, 80 kg, 60 min -> 560
    expect(caloriesBurned(7, 80, 60)).toBe(560)
  })

  it('returns null for missing / non-positive / non-finite inputs', () => {
    expect(caloriesBurned(3.5, null, 30)).toBeNull()
    expect(caloriesBurned(3.5, 77, null)).toBeNull()
    expect(caloriesBurned(3.5, 0, 30)).toBeNull()
    expect(caloriesBurned(3.5, 77, 0)).toBeNull()
    expect(caloriesBurned(0, 77, 30)).toBeNull()
    expect(caloriesBurned(3.5, NaN, 30)).toBeNull()
  })
})
