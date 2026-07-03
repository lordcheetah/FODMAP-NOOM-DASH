import { describe, it, expect } from 'vitest'
import { SAMPLE_DAYS, recipeSearchTerm } from './sampleDays'

describe('SAMPLE_DAYS', () => {
  it('has 7 days numbered 1..7, each with all four meals', () => {
    expect(SAMPLE_DAYS).toHaveLength(7)
    expect(SAMPLE_DAYS.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7])
    for (const d of SAMPLE_DAYS) {
      for (const slot of [d.breakfast, d.lunch, d.dinner, d.snack]) {
        expect(slot.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('recipeSearchTerm', () => {
  it('drops "(leftovers)" notes', () => {
    expect(recipeSearchTerm('Vegetarian Barley Soup (leftovers)')).toBe(
      'Vegetarian Barley Soup',
    )
  })

  it('takes the first option of an either/or', () => {
    expect(recipeSearchTerm('Tuna Boats / Vegetarian Barley Soup (leftovers)')).toBe(
      'Tuna Boats',
    )
  })

  it('leaves a plain name untouched', () => {
    expect(recipeSearchTerm('Spinach Tomato Frittata')).toBe('Spinach Tomato Frittata')
    expect(recipeSearchTerm("Strawberry 'Cheesecake'")).toBe("Strawberry 'Cheesecake'")
  })
})
