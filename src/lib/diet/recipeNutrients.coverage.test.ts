import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { recipeNutrients, type NutrientFood, type NutrientIngredient } from './recipeNutrients'

/**
 * Convertibility coverage of the unit->grams + per-piece-weight layer measured on
 * the REAL seed content (`data/recipes.json` + `data/foods.json`), NOT synthetic
 * fixtures. This is the regression guard for Phase 3 piece-weights: count-unit
 * produce (onion "small", lettuce "head", scallions, plum tomatoes, etc.) must
 * now convert, lifting linked-ingredient coverage from ~76% to ~92%.
 *
 * Measured: 71/77 linked ingredients convertible = 92.2%. (The research note's
 * headline "94%" used a 70-ingredient denominator estimate; the actual seed has
 * 77 linked ingredients, including the diced-avocado-by-volume row the note
 * itself called out as a separate out-of-scope follow-up. The number that matters
 * for safety is the SECOND assertion below: every remaining miss is an
 * intentional, documented one.)
 *
 * NUTRITION accuracy only — FODMAP (recipeRollup) is untouched. Ingredients that
 * genuinely cannot be converted (unquantified pepper, shredded-cheese density,
 * lime-juice yield, kale bunch, garlic-by-volume, diced-avocado-by-volume) stay
 * unconvertible by design and keep their recipe roll-up flagged incomplete.
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

function loadJson<T>(relFromRepoRoot: string): T {
  // Vitest runs with cwd = repo root, where data/ lives.
  return JSON.parse(readFileSync(resolve(process.cwd(), relFromRepoRoot), 'utf8')) as T
}

const recipes = loadJson<RawRecipe[]>('data/recipes.json')
const foods = loadJson<RawFood[]>('data/foods.json')
const byName = new Map<string, RawFood>(foods.map((f) => [f.name, f]))

function toNutrientFood(name: string | null): NutrientFood | null {
  if (name == null) return null
  const f = byName.get(name)
  if (!f) return null
  return {
    name: f.name,
    serving_desc: f.serving_desc,
    serving_grams: f.serving_grams,
    calories: f.calories,
    fiber_g: f.fiber_g,
    sodium_mg: f.sodium_mg,
    sat_fat_g: f.sat_fat_g,
    potassium_mg: f.potassium_mg,
  }
}

/** Tally converted / unconvertible across LINKED ingredients only. */
function tally() {
  let converted = 0
  let unconvertible = 0
  const misses: string[] = []
  for (const rec of recipes) {
    const ings: NutrientIngredient[] = rec.ingredients.map((i) => ({
      quantity: i.quantity,
      unit: i.unit,
      food: toNutrientFood(i.food_name),
    }))
    // recipeNutrients counts only linked ingredients (food present) toward
    // convertibility; unlinked rows are ignored.
    const n = recipeNutrients(ings, rec.servings)
    converted += n.convertedCount
    unconvertible += n.unconvertibleCount
    if (n.unconvertibleCount > 0) {
      for (const i of rec.ingredients) {
        const food = toNutrientFood(i.food_name)
        if (food == null) continue
        const single = recipeNutrients(
          [{ quantity: i.quantity, unit: i.unit, food }],
          1,
        )
        if (single.unconvertibleCount > 0) misses.push(`${rec.name} :: ${i.raw_text}`)
      }
    }
  }
  return { converted, unconvertible, total: converted + unconvertible, misses }
}

describe('real-recipe convertibility coverage (piece-weights wiring)', () => {
  const { converted, unconvertible, total, misses } = tally()

  it('linked-ingredient coverage rose to ~92% after piece weights (was ~76%)', () => {
    const ratio = converted / total
    // Document the measured numbers for the reviewer/tester.
    console.log(
      `coverage: ${converted}/${total} = ${(ratio * 100).toFixed(1)}% convertible; ` +
        `unconvertible (${unconvertible}): ${misses.join('; ')}`,
    )
    expect(ratio).toBeGreaterThanOrEqual(0.92)
  })

  it('only the expected items remain unconvertible (honest INCOMPLETE flags)', () => {
    // Per .planning/phase3-piece-weights.md §C/§4: these stay unconvertible by
    // design and must NOT be silently zeroed.
    const expectedMisses = new Set([
      'Vegetarian Barley Soup :: 1/2 tsp. garlic, minced', // volume vs clove
      'Vegetarian Barley Soup :: freshly ground black pepper', // null quantity
      'Marinated Shrimp with Ginger, Lime, Cilantro and Honey :: juice of 2 limes', // whole-count vs juice volume
      'Smoky Paprika Kale Chips :: 1 large bunch of kale', // low-confidence bunch (omitted)
      'Chicken & Avocado Pita Pockets :: 1/4 cup reduced fat-cheddar cheese, shredded', // density
      'Chicken & Avocado Pita Pockets :: 3/4 cup avocado, diced', // volume vs count (inverse)
    ])
    for (const m of misses) {
      expect(expectedMisses.has(m), `unexpected unconvertible: ${m}`).toBe(true)
    }
    // Strengthen: the unconvertible set must be EXACTLY the intended six — no more
    // (a regression that drops coverage) and no fewer (a bug that silently
    // converted a should-stay-unconvertible row, e.g. summing kale bunch as a
    // guess). Compare the full sets, not just one-way containment.
    expect(new Set(misses)).toEqual(expectedMisses)
    expect(misses.length).toBe(6)
  })

  it('the measured tally is exactly 71/77 linked ingredients (pinned)', () => {
    // Pin the headline numbers so a change in seed data or the conversion layer
    // surfaces here for review rather than silently shifting the ratio.
    expect(total).toBe(77)
    expect(converted).toBe(71)
    expect(unconvertible).toBe(6)
  })

  it('newly-convertible count items resolve to grams (sanity of a few)', () => {
    // Onion small -> 70 g, lettuce head -> 163 g, scallion -> 15 g each.
    const onion = toNutrientFood('Onion, raw')!
    const lettuce = toNutrientFood('Butter/Boston bibb lettuce')!
    const scallion = toNutrientFood('Scallion/green onion, white part')!
    expect(recipeNutrients([{ quantity: 1, unit: 'small', food: onion }], 1).convertedCount).toBe(1)
    expect(recipeNutrients([{ quantity: 1, unit: 'head', food: lettuce }], 1).convertedCount).toBe(1)
    expect(recipeNutrients([{ quantity: 2, unit: 'scallion', food: scallion }], 1).convertedCount).toBe(1)
  })
})
