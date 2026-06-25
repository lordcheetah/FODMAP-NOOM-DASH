import { describe, it, expect } from 'vitest'
import {
  ingredientNutrients,
  recipeNutrients,
  type NutrientFood,
  type NutrientIngredient,
} from './recipeNutrients'

function makeFood(over: Partial<NutrientFood> = {}): NutrientFood {
  return {
    serving_desc: '1 cup',
    serving_grams: 100,
    calories: 50,
    fiber_g: 2,
    sodium_mg: 10,
    sat_fat_g: 1,
    potassium_mg: 200,
    ...over,
  }
}

describe('ingredientNutrients', () => {
  it('scales linearly with grams (2 cup of a 1-cup/100g food = ×2)', () => {
    const n = ingredientNutrients(2, 'cup', makeFood())
    expect(n.grams).toBeCloseTo(200, 5)
    expect(n.calories).toBeCloseTo(100, 5)
    expect(n.fiber_g).toBeCloseTo(4, 5)
    expect(n.sodium_mg).toBeCloseTo(20, 5)
    expect(n.sat_fat_g).toBeCloseTo(2, 5)
    expect(n.potassium_mg).toBeCloseTo(400, 5)
  })

  it('weight unit scales directly via the food serving', () => {
    // food: 1 oz = 28.3495 g, 50 cal; 4 oz ingredient -> ×4
    const n = ingredientNutrients(4, 'oz', makeFood({ serving_desc: '1 oz', serving_grams: 28.3495 }))
    expect(n.grams).toBeCloseTo(113.398, 2)
    expect(n.calories).toBeCloseTo(200, 4)
  })

  it('returns grams:null (unconvertible) when toGrams is null', () => {
    // volume ingredient vs weight-served food
    const n = ingredientNutrients(0.25, 'cup', makeFood({ serving_desc: '1 oz', serving_grams: 28 }))
    expect(n.grams).toBeNull()
  })

  it('returns grams:null when food is missing', () => {
    expect(ingredientNutrients(1, 'cup', null).grams).toBeNull()
  })

  it('returns grams:null when serving_grams is null/<=0', () => {
    expect(ingredientNutrients(1, 'cup', makeFood({ serving_grams: null })).grams).toBeNull()
    expect(ingredientNutrients(1, 'cup', makeFood({ serving_grams: 0 })).grams).toBeNull()
  })

  it('returns grams:null when quantity is null or unit unrecognized', () => {
    expect(ingredientNutrients(null, 'cup', makeFood()).grams).toBeNull()
    expect(ingredientNutrients(1, 'lime', makeFood()).grams).toBeNull()
  })

  it('null specific nutrient -> 0 contribution but still converted (grams set)', () => {
    const n = ingredientNutrients(1, 'cup', makeFood({ fiber_g: null, sodium_mg: null }))
    expect(n.grams).toBeCloseTo(100, 5)
    expect(n.fiber_g).toBe(0)
    expect(n.sodium_mg).toBe(0)
    expect(n.calories).toBeCloseTo(50, 5)
  })
})

describe('recipeNutrients — per-serving sum + completeness', () => {
  it('sums then divides ONCE by servings', () => {
    const ings: NutrientIngredient[] = [
      { quantity: 2, unit: 'cup', food: makeFood() }, // 100 cal, 4 fiber
      { quantity: 1, unit: 'cup', food: makeFood() }, // 50 cal, 2 fiber
    ]
    const r = recipeNutrients(ings, 3)
    // whole-recipe fiber = 6 g, /3 servings = 2 g
    expect(r.fiber_g).toBeCloseTo(2, 5)
    expect(r.calories).toBeCloseTo(50, 5)
    expect(r.convertedCount).toBe(2)
    expect(r.unconvertibleCount).toBe(0)
    expect(r.totalCount).toBe(2)
    expect(r.isComplete).toBe(true)
  })

  it('drops an unconvertible ingredient (not summed as 0) and flags incomplete', () => {
    const ings: NutrientIngredient[] = [
      { quantity: 2, unit: 'cup', food: makeFood() }, // convertible: 4 fiber
      { quantity: 1, unit: 'lime', food: makeFood() }, // unconvertible unit
    ]
    const r = recipeNutrients(ings, 2)
    expect(r.convertedCount).toBe(1)
    expect(r.unconvertibleCount).toBe(1)
    expect(r.isComplete).toBe(false)
    // only the convertible ingredient contributes: 4 fiber / 2 = 2
    expect(r.fiber_g).toBeCloseTo(2, 5)
  })

  it('ignores unlinked (food:null) ingredients in the convertibility tally', () => {
    const ings: NutrientIngredient[] = [
      { quantity: 1, unit: 'cup', food: makeFood() },
      { quantity: 1, unit: null, food: null },
    ]
    const r = recipeNutrients(ings, 1)
    expect(r.totalCount).toBe(1)
    expect(r.convertedCount).toBe(1)
    expect(r.unconvertibleCount).toBe(0)
    expect(r.isComplete).toBe(true)
  })

  it('null servings -> null per-serving nutrients + isComplete false', () => {
    const r = recipeNutrients([{ quantity: 1, unit: 'cup', food: makeFood() }], null)
    expect(r.calories).toBeNull()
    expect(r.fiber_g).toBeNull()
    expect(r.isComplete).toBe(false)
    expect(r.convertedCount).toBe(1)
  })

  it('zero / negative servings -> null per-serving nutrients + isComplete false', () => {
    expect(recipeNutrients([{ quantity: 1, unit: 'cup', food: makeFood() }], 0).fiber_g).toBeNull()
    expect(recipeNutrients([{ quantity: 1, unit: 'cup', food: makeFood() }], -1).isComplete).toBe(
      false,
    )
  })

  it('empty ingredient list -> null nutrients + isComplete false', () => {
    const r = recipeNutrients([], 4)
    expect(r.fiber_g).toBeNull()
    expect(r.isComplete).toBe(false)
    expect(r.totalCount).toBe(0)
  })

  it('all-unconvertible recipe -> null nutrients (no 0-data injection)', () => {
    const r = recipeNutrients([{ quantity: 1, unit: 'lime', food: makeFood() }], 2)
    expect(r.fiber_g).toBeNull()
    expect(r.calories).toBeNull()
    expect(r.unconvertibleCount).toBe(1)
    expect(r.isComplete).toBe(false)
  })

  it('hand-calc: a small mixed recipe matches manual per-serving fiber within 0.5 g', () => {
    // Spinach: 1 cup = 30 g, 0.7 g fiber per 30 g; ingredient 2 cup -> 60 g -> 1.4 g
    const spinach = makeFood({ serving_desc: '1 cup', serving_grams: 30, fiber_g: 0.7 })
    // Salmon: 3 oz = 85 g, 0 fiber; ingredient 1 lb -> 453.592 g (no fiber)
    const salmon = makeFood({ serving_desc: '3 oz', serving_grams: 85, fiber_g: 0 })
    const ings: NutrientIngredient[] = [
      { quantity: 2, unit: 'cup', food: spinach },
      { quantity: 1, unit: 'lb', food: salmon },
    ]
    const r = recipeNutrients(ings, 4)
    // whole-recipe fiber = 1.4 g; /4 = 0.35 g
    expect(r.isComplete).toBe(true)
    expect(r.fiber_g).not.toBeNull()
    expect(Math.abs((r.fiber_g as number) - 0.35)).toBeLessThanOrEqual(0.5)
    expect(r.fiber_g).toBeCloseTo(0.35, 5)
  })
})
