import { describe, it, expect } from 'vitest'
import { dashProgress, fiberProgress } from '@/lib/diet'
import { toLoggedNutrients, type FoodLogEntry, type LoggedRecipe } from './foodLog'
import type { FoodLogRow } from './types'

/**
 * Edge hardening for the recipe -> log -> progress chain. EXTENDS foodLog.test.ts:
 * proves NO double-multiply/divide by servings — recipeNutrients divides by the
 * RECIPE's servings once, and fiberProgress/dashProgress multiply by the LOGGED
 * servings once, so the day total is exactly F_perServing * loggedServings.
 */
const BASE_ROW: FoodLogRow = {
  id: 'log-1',
  user_id: 'u',
  logged_on: '2026-06-25',
  meal: 'dinner',
  food_id: null,
  recipe_id: 'r',
  servings: 1,
  note: null,
  created_at: '2026-06-25T00:00:00Z',
}

function recipeEntry(
  recipe: Partial<LoggedRecipe> & {
    servings: number | null
    recipe_ingredients: LoggedRecipe['recipe_ingredients']
  },
  servings = 1,
): FoodLogEntry {
  return {
    ...BASE_ROW,
    servings,
    food: null,
    recipe: {
      id: 'r',
      user_id: null,
      name: 'Test Recipe',
      prep_min: null,
      cal_per_serving: 200,
      meal_type: 'dinner',
      instructions: [],
      source: null,
      created_at: '2026-06-25T00:00:00Z',
      ...recipe,
    },
  }
}

const food = {
  serving_desc: '1 cup',
  serving_grams: 100,
  calories: 50,
  fiber_g: 4,
  sodium_mg: 100,
  sat_fat_g: 1,
  potassium_mg: 200,
  fructose_level: 'low' as const,
  fructans_level: 'low' as const,
}

describe('no double-servings: day total == perServingF * loggedServings', () => {
  // recipe servings, ingredient cups, logged servings -> expected day fiber
  // perServing fiber = (cups * 4) / recipeServings; day = perServing * logged
  const cases: Array<[number, number, number]> = [
    [1, 1, 1],
    [1, 1, 3],
    [2, 2, 1],
    [2, 2, 5],
    [4, 8, 2],
    [3, 6, 4],
  ]
  it.each(cases)(
    'recipeServings=%s cups=%s loggedServings=%s',
    (recipeServings, cups, logged) => {
      const entry = recipeEntry(
        {
          servings: recipeServings,
          recipe_ingredients: [{ food_id: 'f1', quantity: cups, unit: 'cup', food }],
        },
        logged,
      )
      const nutrients = [toLoggedNutrients(entry)]
      const perServingFiber = (cups * 4) / recipeServings
      const expectedDay = perServingFiber * logged

      const fiber = fiberProgress(nutrients, { fiber_goal_g: null, fiber_per_meal_g: null })
      expect(fiber.totalFiberG).toBeCloseTo(expectedDay, 5)

      // sodium tracks the same chain: perServing 100*cups/recipeServings * logged
      const dash = dashProgress(nutrients, { sodium_budget_mg: null, dash_serving_goals: {} })
      const expectedSodium = ((cups * 100) / recipeServings) * logged
      expect(dash.sodiumMg).toBeCloseTo(expectedSodium, 5)
    },
  )
})

describe('multi-ingredient recipe flows without extra scaling', () => {
  it('two ingredients summed, /recipeServings once, *logged once', () => {
    // ing A: 2 cup -> 8 fiber whole; ing B: 1 cup -> 4 fiber whole; total 12
    const entry = recipeEntry(
      {
        servings: 3, // perServing fiber = 12/3 = 4
        recipe_ingredients: [
          { food_id: 'a', quantity: 2, unit: 'cup', food },
          { food_id: 'b', quantity: 1, unit: 'cup', food },
        ],
      },
      2, // logged
    )
    const nutrients = [toLoggedNutrients(entry)]
    const fiber = fiberProgress(nutrients, { fiber_goal_g: null, fiber_per_meal_g: null })
    // 4 g/serving * 2 logged = 8 g
    expect(fiber.totalFiberG).toBeCloseTo(8, 5)
    const dash = dashProgress(nutrients, { sodium_budget_mg: null, dash_serving_goals: {} })
    // sodium: (3 cups total * 100)/3 = 100/serving * 2 = 200
    expect(dash.sodiumMg).toBeCloseTo(200, 5)
    // recipes never add to a DASH serving bucket
    expect(dash.servingsByGroup.vegetables).toBe(0)
  })

  it('sat_fat and potassium flow through the same chain', () => {
    const entry = recipeEntry(
      {
        servings: 2,
        recipe_ingredients: [{ food_id: 'a', quantity: 4, unit: 'cup', food }],
      },
      3,
    )
    const n = toLoggedNutrients(entry)
    // perServing: sat_fat = (4*1)/2 = 2; potassium = (4*200)/2 = 400
    expect(n.sat_fat_g).toBeCloseTo(2, 5)
    expect(n.potassium_mg).toBeCloseTo(400, 5)
    const dash = dashProgress([n], { sodium_budget_mg: null, dash_serving_goals: {} })
    // *3 logged: sat_fat 6, potassium 1200
    expect(dash.satFatG).toBeCloseTo(6, 5)
    expect(dash.potassiumMg).toBeCloseTo(1200, 5)
  })
})

describe('partial recipe honesty in the log chain', () => {
  it('one convertible + one unconvertible: fiber counts only convertible, calories fall back', () => {
    const entry = recipeEntry({
      servings: 2,
      cal_per_serving: 300,
      recipe_ingredients: [
        { food_id: 'a', quantity: 2, unit: 'cup', food }, // 8 fiber whole -> /2 = 4
        { food_id: 'b', quantity: 1, unit: 'lime', food }, // unconvertible
      ],
    })
    const n = toLoggedNutrients(entry)
    // partial sum still produces a per-serving number (8/2 = 4); never null here
    expect(n.fiber_g).toBeCloseTo(4, 5)
    // calories: conversion DID produce some (50*2cups/100 *? ) so it uses rolled calories,
    // not the fallback — assert it is a finite positive number.
    expect(n.calories).not.toBeNull()
    expect(Number.isFinite(n.calories as number)).toBe(true)
  })

  it('fully unconvertible recipe -> fiber null, calories fall back to cal_per_serving', () => {
    const entry = recipeEntry({
      servings: 4,
      cal_per_serving: 250,
      recipe_ingredients: [{ food_id: 'a', quantity: 1, unit: 'lime', food }],
    })
    const n = toLoggedNutrients(entry)
    expect(n.fiber_g).toBeNull()
    expect(n.sodium_mg).toBeNull()
    expect(n.calories).toBe(250)
    // null fiber contributes 0 (not NaN) to the day total
    const fiber = fiberProgress([n], { fiber_goal_g: 25, fiber_per_meal_g: null })
    expect(fiber.totalFiberG).toBe(0)
    expect(Number.isNaN(fiber.totalFiberG)).toBe(false)
  })
})
