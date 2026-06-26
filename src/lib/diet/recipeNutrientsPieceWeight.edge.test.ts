import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { recipeNutrients, type NutrientFood, type NutrientIngredient } from './recipeNutrients'

/**
 * END-TO-END effect of the piece-weight fix on the recipe NUTRIENT roll-up,
 * measured on the REAL seed (`data/recipes.json` + `data/foods.json`).
 * COMPLEMENTS recipeNutrients.coverage.test.ts (which measures the global ratio):
 *
 *  - a recipe that GAINS coverage from the fix (Lean Pork Lettuce Wraps: head /
 *    small bell / small cucumber / 2 medium carrots / 1 lime) goes from
 *    INCOMPLETE -> COMPLETE, with convertedCount strictly higher than the
 *    name-less (pre-fix) baseline, and finite positive per-serving nutrients,
 *  - a recipe that stays UNCONVERTIBLE (Smoky Paprika Kale Chips: 1 bunch kale,
 *    no cited weight) remains isComplete:false and is NEVER summed as 0 (the
 *    unconvertible ingredient is dropped, not zeroed).
 *
 * NUTRITION accuracy only — FODMAP roll-up (recipeRollup) is untouched.
 */

interface RawIngredient {
  raw_text: string
  quantity: number | null
  unit: string | null
  food_name: string | null
}
interface RawRecipe {
  name: string
  servings: number | null
  ingredients: RawIngredient[]
}
interface RawFood {
  name: string
  serving_desc: string
  serving_grams: number | null
  calories: number | null
  fiber_g: number | null
  sodium_mg: number | null
  sat_fat_g: number | null
  potassium_mg: number | null
}

function loadJson<T>(rel: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), rel), 'utf8')) as T
}
const recipes = loadJson<RawRecipe[]>('data/recipes.json')
const foods = loadJson<RawFood[]>('data/foods.json')
const byName = new Map<string, RawFood>(foods.map((f) => [f.name, f]))

function getRecipe(name: string): RawRecipe {
  const r = recipes.find((x) => x.name === name)
  if (!r) throw new Error(`fixture recipe not found: ${name}`)
  return r
}

/** Build NutrientIngredients; `withName` toggles the piece-weight fallback on/off. */
function buildIngredients(rec: RawRecipe, withName: boolean): NutrientIngredient[] {
  return rec.ingredients.map((i) => {
    const f = i.food_name == null ? undefined : byName.get(i.food_name)
    const food: NutrientFood | null = f
      ? {
          // name is the ONLY thing gating the piece-weight fallback.
          name: withName ? f.name : undefined,
          serving_desc: f.serving_desc,
          serving_grams: f.serving_grams,
          calories: f.calories,
          fiber_g: f.fiber_g,
          sodium_mg: f.sodium_mg,
          sat_fat_g: f.sat_fat_g,
          potassium_mg: f.potassium_mg,
        }
      : null
    return { quantity: i.quantity, unit: i.unit, food }
  })
}

describe('e2e: a recipe that GAINS coverage from piece weights', () => {
  const rec = getRecipe('Lean Pork Lettuce Wraps')
  const withFix = recipeNutrients(buildIngredients(rec, true), rec.servings)
  const preFix = recipeNutrients(buildIngredients(rec, false), rec.servings)

  it('every ingredient is linked (precondition for this fixture)', () => {
    expect(rec.ingredients.every((i) => i.food_name != null)).toBe(true)
  })

  it('the fix strictly increases convertedCount (previously-unconvertible now contribute)', () => {
    expect(withFix.convertedCount).toBeGreaterThan(preFix.convertedCount)
    // The 5 piece-weight ingredients (head, small bell, small cucumber, 2 medium
    // carrots, 1 lime) are exactly the ones that flip.
    expect(withFix.convertedCount - preFix.convertedCount).toBe(5)
    expect(preFix.unconvertibleCount).toBe(5)
  })

  it('becomes fully COMPLETE after the fix (was INCOMPLETE before)', () => {
    expect(preFix.isComplete).toBe(false)
    expect(withFix.isComplete).toBe(true)
    expect(withFix.unconvertibleCount).toBe(0)
    expect(withFix.convertedCount).toBe(rec.ingredients.length)
  })

  it('per-serving nutrients are finite and positive (no NaN/Infinity, not 0)', () => {
    for (const v of [
      withFix.calories,
      withFix.fiber_g,
      withFix.sodium_mg,
      withFix.sat_fat_g,
      withFix.potassium_mg,
    ]) {
      expect(v).not.toBeNull()
      expect(Number.isFinite(v as number)).toBe(true)
      expect(v as number).toBeGreaterThan(0)
    }
  })

  it('the newly-counted produce ADDS nutrients (fix totals >= pre-fix totals)', () => {
    // Adding real ingredients can only raise the whole-recipe sum; per-serving
    // (same servings) must be >= the partial pre-fix figure for every nutrient.
    expect(withFix.fiber_g as number).toBeGreaterThan(preFix.fiber_g as number)
    expect(withFix.calories as number).toBeGreaterThanOrEqual(preFix.calories as number)
    expect(withFix.potassium_mg as number).toBeGreaterThan(preFix.potassium_mg as number)
  })
})

describe('e2e: a recipe that STAYS unconvertible (kale bunch has no cited weight)', () => {
  const rec = getRecipe('Smoky Paprika Kale Chips')
  const r = recipeNutrients(buildIngredients(rec, true), rec.servings)

  it('contains the intentionally-omitted kale "bunch"', () => {
    expect(rec.ingredients.some((i) => i.unit === 'bunch' && i.food_name === 'Kale, raw')).toBe(true)
  })

  it('remains INCOMPLETE (kale bunch unconvertible), never summed as 0', () => {
    expect(r.isComplete).toBe(false)
    expect(r.unconvertibleCount).toBeGreaterThanOrEqual(1)
  })

  it('the convertible remainder still produces finite per-serving values (not null/0)', () => {
    // Olive oil + paprika + salt convert, so per-serving is a real partial number,
    // explicitly flagged approximate via isComplete:false.
    expect(r.convertedCount).toBeGreaterThan(0)
    expect(r.calories).not.toBeNull()
    expect(r.calories as number).toBeGreaterThan(0)
  })
})

describe('e2e: Salmon with Tabbouleh Salad — small onion + plum tomatoes convert', () => {
  const rec = getRecipe('Salmon with Tabbouleh Salad')
  const withFix = recipeNutrients(buildIngredients(rec, true), rec.servings)
  const preFix = recipeNutrients(buildIngredients(rec, false), rec.servings)

  it('the small-onion + 4 plum-tomatoes flip from unconvertible to converted', () => {
    expect(withFix.convertedCount - preFix.convertedCount).toBe(2)
    expect(withFix.fiber_g as number).toBeGreaterThan(preFix.fiber_g as number)
  })
})
