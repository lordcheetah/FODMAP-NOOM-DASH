import { describe, it, expect } from 'vitest'
import {
  metForExercise,
  caloriesBurned,
  paceMinPerUnit,
  formatPace,
  inclineFactor,
  miToKm,
  kmToMi,
} from './calories'
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

describe('distance / pace / incline helpers', () => {
  it('mi <-> km round-trip', () => {
    expect(miToKm(1)).toBeCloseTo(1.609344, 6)
    expect(kmToMi(1.609344)).toBeCloseTo(1, 6)
    expect(kmToMi(miToKm(3))).toBeCloseTo(3, 6)
  })

  it('pace = minutes / distance', () => {
    expect(paceMinPerUnit(3, 45)).toBe(15) // 15 min/mi
    expect(paceMinPerUnit(0, 45)).toBeNull()
    expect(paceMinPerUnit(3, 0)).toBeNull()
    expect(paceMinPerUnit(null, 45)).toBeNull()
  })

  it('formats pace as m:ss', () => {
    expect(formatPace(15)).toBe('15:00')
    expect(formatPace(12.5)).toBe('12:30')
    expect(formatPace(null)).toBeNull()
    expect(formatPace(0)).toBeNull()
  })

  it('incline factor: +5% per grade, capped, 1 when none', () => {
    expect(inclineFactor(null)).toBe(1)
    expect(inclineFactor(0)).toBe(1)
    expect(inclineFactor(2)).toBeCloseTo(1.1, 6)
    expect(inclineFactor(100)).toBeCloseTo(1.75, 6) // capped at 15% grade
  })
})
