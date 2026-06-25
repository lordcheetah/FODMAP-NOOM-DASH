import { describe, it, expect } from 'vitest'
import {
  ingredientNutrients,
  recipeNutrients,
  type NutrientFood,
  type NutrientIngredient,
} from './recipeNutrients'

/**
 * Edge hardening for the recipe NUTRIENT roll-up. EXTENDS recipeNutrients.test.ts:
 * divide-by-servings-exactly-once across multiple ingredients, completeness
 * honesty (unconvertible dropped AND flips isComplete, NOT summed as 0), null
 * specific nutrient -> 0 but still converted, count tallies, and a hand
 * calculation in mixed units.
 */
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

describe('ingredientNutrients — completeness honesty', () => {
  it('converted food with ALL specific nutrients null -> 0s but grams set (counts as converted)', () => {
    const n = ingredientNutrients(
      2,
      'cup',
      makeFood({ calories: null, fiber_g: null, sodium_mg: null, sat_fat_g: null, potassium_mg: null }),
    )
    expect(n.grams).toBeCloseTo(200, 5)
    expect(n.calories).toBe(0)
    expect(n.fiber_g).toBe(0)
    expect(n.sodium_mg).toBe(0)
    expect(n.sat_fat_g).toBe(0)
    expect(n.potassium_mg).toBe(0)
  })

  it('mixed null/real nutrients scale only the real ones', () => {
    const n = ingredientNutrients(3, 'cup', makeFood({ fiber_g: 4, sodium_mg: null }))
    // factor = 300/100 = 3
    expect(n.fiber_g).toBeCloseTo(12, 5)
    expect(n.sodium_mg).toBe(0)
    expect(n.calories).toBeCloseTo(150, 5)
  })

  it('NaN/Infinity nutrient coerces to 0 (no NaN leak into totals)', () => {
    const n = ingredientNutrients(1, 'cup', makeFood({ fiber_g: Number.NaN, calories: Number.POSITIVE_INFINITY }))
    expect(n.fiber_g).toBe(0)
    expect(n.calories).toBe(0)
    expect(n.grams).toBeCloseTo(100, 5)
  })
})

describe('recipeNutrients — divide by recipe servings EXACTLY once (multi-ingredient)', () => {
  it('three convertible ingredients sum then /servings once', () => {
    const ings: NutrientIngredient[] = [
      { quantity: 2, unit: 'cup', food: makeFood({ fiber_g: 3 }) }, // 200g -> 6 fiber
      { quantity: 1, unit: 'cup', food: makeFood({ fiber_g: 3 }) }, // 100g -> 3 fiber
      { quantity: 1, unit: 'cup', food: makeFood({ fiber_g: 3 }) }, // 100g -> 3 fiber
    ]
    // whole-recipe fiber = 12; servings 4 -> 3 g/serving
    const r = recipeNutrients(ings, 4)
    expect(r.fiber_g).toBeCloseTo(3, 5)
    expect(r.convertedCount).toBe(3)
    expect(r.unconvertibleCount).toBe(0)
    expect(r.totalCount).toBe(3)
    expect(r.isComplete).toBe(true)
  })

  it('per-serving scales as 1/servings (same recipe, double the servings -> half)', () => {
    const ings: NutrientIngredient[] = [{ quantity: 4, unit: 'cup', food: makeFood({ fiber_g: 2 }) }]
    const a = recipeNutrients(ings, 2)
    const b = recipeNutrients(ings, 4)
    expect((a.fiber_g as number) / (b.fiber_g as number)).toBeCloseTo(2, 5)
  })
})

describe('recipeNutrients — unconvertible is dropped, NOT summed as 0', () => {
  it('an unconvertible ingredient does not deflate the per-serving average', () => {
    // If the bad ingredient were summed as 0 the result would be the same number,
    // but it must NOT contribute and MUST flip isComplete. We assert the
    // convertible-only total AND the incomplete flag.
    const good = makeFood({ fiber_g: 5 })
    const withBad: NutrientIngredient[] = [
      { quantity: 1, unit: 'cup', food: good }, // 5 fiber
      { quantity: 1, unit: 'lime', food: good }, // unconvertible unit
    ]
    const onlyGood: NutrientIngredient[] = [{ quantity: 1, unit: 'cup', food: good }]
    const r1 = recipeNutrients(withBad, 1)
    const r2 = recipeNutrients(onlyGood, 1)
    // per-serving fiber identical (the bad one contributes nothing, not a 0 that
    // would also be identical — but here we prove the number tracks only-good)
    expect(r1.fiber_g).toBeCloseTo(r2.fiber_g as number, 6)
    expect(r1.fiber_g).toBeCloseTo(5, 5)
    // honesty: presence of an unconvertible ingredient forces incomplete
    expect(r1.isComplete).toBe(false)
    expect(r2.isComplete).toBe(true)
    expect(r1.unconvertibleCount).toBe(1)
  })

  it('count tallies: 2 good + 1 bad + 1 unlinked', () => {
    const ings: NutrientIngredient[] = [
      { quantity: 1, unit: 'cup', food: makeFood() },
      { quantity: 2, unit: 'cup', food: makeFood() },
      { quantity: 1, unit: 'lime', food: makeFood() }, // unconvertible
      { quantity: 1, unit: null, food: null }, // unlinked, ignored
    ]
    const r = recipeNutrients(ings, 2)
    expect(r.convertedCount).toBe(2)
    expect(r.unconvertibleCount).toBe(1)
    expect(r.totalCount).toBe(3) // unlinked excluded
    expect(r.isComplete).toBe(false)
  })
})

describe('recipeNutrients — invalid servings honesty', () => {
  it.each([null, 0, -3, Number.NaN, Number.POSITIVE_INFINITY])(
    'servings=%s -> null per-serving + isComplete false (but counts kept)',
    (servings) => {
      const r = recipeNutrients([{ quantity: 1, unit: 'cup', food: makeFood() }], servings as number | null)
      expect(r.calories).toBeNull()
      expect(r.fiber_g).toBeNull()
      expect(r.sodium_mg).toBeNull()
      expect(r.sat_fat_g).toBeNull()
      expect(r.potassium_mg).toBeNull()
      expect(r.isComplete).toBe(false)
      expect(r.convertedCount).toBe(1)
    },
  )
})

describe('recipeNutrients — hand calculation in mixed units (grams vs servings sanity)', () => {
  it('oats(cup) + chia(tbsp) + kiwi(g) -> per-serving fiber within tolerance', () => {
    // Oats: 1 cup = 80 g, 8 g fiber/serving. Ingredient: 1 cup -> 80 g -> 8 g fiber.
    const oats = makeFood({ serving_desc: '1 cup', serving_grams: 80, fiber_g: 8 })
    // Chia: 1 tbsp = 12 g, 4 g fiber/serving. Ingredient: 2 tbsp -> 24 g -> 8 g fiber.
    const chia = makeFood({ serving_desc: '1 tbsp', serving_grams: 12, fiber_g: 4 })
    // Kiwi: 1 g serving carrier (serving_grams 100, 3 g fiber/100g). Ingredient 150 g -> 4.5 g fiber.
    const kiwi = makeFood({ serving_desc: '100 g', serving_grams: 100, fiber_g: 3 })
    const ings: NutrientIngredient[] = [
      { quantity: 1, unit: 'cup', food: oats }, // 8 g
      { quantity: 2, unit: 'tbsp', food: chia }, // 8 g
      { quantity: 150, unit: 'g', food: kiwi }, // 4.5 g
    ]
    // whole-recipe fiber = 8 + 8 + 4.5 = 20.5 g; servings 2 -> 10.25 g/serving
    const r = recipeNutrients(ings, 2)
    expect(r.isComplete).toBe(true)
    expect(r.fiber_g).not.toBeNull()
    expect(Math.abs((r.fiber_g as number) - 10.25)).toBeLessThanOrEqual(0.01)
    expect(r.fiber_g).toBeCloseTo(10.25, 5)
  })

  it('sodium in mg stays mg (no unit drift): 1 cup=100g, 200mg/serving -> 2 cup=400mg', () => {
    const salted = makeFood({ serving_desc: '1 cup', serving_grams: 100, sodium_mg: 200 })
    const r = recipeNutrients([{ quantity: 2, unit: 'cup', food: salted }], 1)
    expect(r.sodium_mg).toBeCloseTo(400, 5)
  })
})
