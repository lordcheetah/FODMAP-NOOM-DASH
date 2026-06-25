import { describe, it, expect } from 'vitest'
import { dashProgress, fiberProgress } from '@/lib/diet'
import { toLoggedNutrients, type FoodLogEntry, type LoggedRecipe } from './foodLog'
import type { FoodLogRow } from './types'

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

const convertibleFood = {
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

describe('toLoggedNutrients — recipe branch', () => {
  it('contributes real per-serving fiber/sodium for a convertible recipe', () => {
    const entry = recipeEntry({
      servings: 2,
      recipe_ingredients: [
        { food_id: 'f1', quantity: 2, unit: 'cup', food: convertibleFood }, // 8 fiber whole
      ],
    })
    const n = toLoggedNutrients(entry)
    // whole-recipe fiber = 2 cup * 4 g/cup = 8 g; /2 servings = 4 g per serving
    expect(n.fiber_g).toBeCloseTo(4, 5)
    expect(n.sodium_mg).toBeCloseTo(100, 5)
    expect(n.dash_group).toBeNull()
  })

  it('falls back to cal_per_serving when conversion yields no calories', () => {
    const entry = recipeEntry({
      servings: 4,
      cal_per_serving: 250,
      recipe_ingredients: [
        { food_id: 'f1', quantity: 1, unit: 'lime', food: convertibleFood }, // unconvertible
      ],
    })
    const n = toLoggedNutrients(entry)
    expect(n.calories).toBe(250)
    expect(n.fiber_g).toBeNull() // not 0 — unmeasured
    expect(n.sodium_mg).toBeNull()
  })

  it('no double-divide: per-serving × logged servings flows through progress fns', () => {
    // recipe: 1 cup food (4 g fiber) over 1 serving -> 4 g/serving. Log 3 servings.
    const entry = recipeEntry(
      {
        servings: 1,
        recipe_ingredients: [{ food_id: 'f1', quantity: 1, unit: 'cup', food: convertibleFood }],
      },
      3,
    )
    const nutrients = [toLoggedNutrients(entry)]
    const fiber = fiberProgress(nutrients, { fiber_goal_g: null, fiber_per_meal_g: null })
    const dash = dashProgress(nutrients, { sodium_budget_mg: null, dash_serving_goals: {} })
    // 4 g/serving × 3 logged servings = 12 g
    expect(fiber.totalFiberG).toBeCloseTo(12, 5)
    // 100 mg/serving × 3 = 300 mg; recipe adds to NO dash serving bucket
    expect(dash.sodiumMg).toBeCloseTo(300, 5)
    expect(dash.servingsByGroup.vegetables).toBe(0)
  })

  it('null servings -> null nutrients but calories fall back to cal_per_serving', () => {
    const entry = recipeEntry({
      servings: null,
      cal_per_serving: 180,
      recipe_ingredients: [{ food_id: 'f1', quantity: 1, unit: 'cup', food: convertibleFood }],
    })
    const n = toLoggedNutrients(entry)
    expect(n.fiber_g).toBeNull()
    expect(n.calories).toBe(180)
  })
})
