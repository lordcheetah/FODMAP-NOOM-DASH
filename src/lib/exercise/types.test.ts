import { describe, it, expect } from 'vitest'
import {
  EXERCISE_CATEGORIES,
  EXERCISE_CATEGORY_LABEL,
  type ExerciseCategory,
} from './types'

describe('exercise category enum source of truth', () => {
  it('includes martial-arts', () => {
    expect(EXERCISE_CATEGORIES).toContain('martial-arts')
  })

  it('has no duplicate values', () => {
    expect(new Set(EXERCISE_CATEGORIES).size).toBe(EXERCISE_CATEGORIES.length)
  })

  it('has a label for every category (exhaustive map)', () => {
    for (const c of EXERCISE_CATEGORIES) {
      expect(EXERCISE_CATEGORY_LABEL[c]).toBeTruthy()
      expect(typeof EXERCISE_CATEGORY_LABEL[c]).toBe('string')
    }
  })

  it('label map keys exactly match the category array (no extras, no gaps)', () => {
    const labelKeys = Object.keys(EXERCISE_CATEGORY_LABEL) as ExerciseCategory[]
    expect(new Set(labelKeys)).toEqual(new Set(EXERCISE_CATEGORIES))
    expect(labelKeys.length).toBe(EXERCISE_CATEGORIES.length)
  })

  it('renders martial-arts as a clean "Martial Arts" label', () => {
    expect(EXERCISE_CATEGORY_LABEL['martial-arts']).toBe('Martial Arts')
  })
})
