/**
 * Recipe NUTRIENT roll-up: per-serving calories, fiber, sodium, saturated fat,
 * and potassium summed from a recipe's ingredients via the unit->grams layer.
 *
 * Scope reminder (CLAUDE.md): this is NUTRITION accuracy only. It is SEPARATE
 * from `recipeRollup` (the FODMAP worst-case safety verdict), which is unchanged
 * and does not depend on grams. An ingredient we cannot convert is NOT counted
 * as 0 — it is dropped from the sum and flips `isComplete` to false, so the UI
 * can mark the totals "approximate". Never present an approximate total as exact.
 *
 * Pure module — no React, no DB.
 */
import { canonicalUnit, toGrams } from './convert'

/** Food fields needed to scale nutrients. Superset of `convert`'s food shape. */
export interface NutrientFood {
  /**
   * The food's display name, used by the count-unit per-piece weight fallback in
   * `toGrams` (e.g. "Onion, raw" + "small" -> 70 g). Optional: when absent, the
   * piece-weight fallback is simply not attempted.
   */
  name?: string
  serving_desc: string
  serving_grams: number | null
  calories: number | null
  fiber_g: number | null
  sodium_mg: number | null
  sat_fat_g: number | null
  potassium_mg: number | null
}

/** A recipe ingredient carrying its amount + the linked food (null = unlinked). */
export interface NutrientIngredient {
  quantity: number | null
  unit: string | null
  food: NutrientFood | null
}

/** Scaled nutrient contribution of one ingredient. `grams === null` = unconvertible. */
export interface IngredientNutrients {
  grams: number | null
  calories: number
  fiber_g: number
  sodium_mg: number
  sat_fat_g: number
  potassium_mg: number
}

export interface RecipeNutrients {
  /** Per SERVING (whole-recipe sum / servings). `null` when servings invalid. */
  calories: number | null
  fiber_g: number | null
  sodium_mg: number | null
  sat_fat_g: number | null
  potassium_mg: number | null
  /** Linked ingredients successfully converted to grams. */
  convertedCount: number
  /** Linked ingredients that could NOT be converted (dropped from the sum). */
  unconvertibleCount: number
  /** Linked ingredients considered (convertedCount + unconvertibleCount). */
  totalCount: number
  /** True only when every linked ingredient converted AND servings is valid. */
  isComplete: boolean
}

const ZERO: IngredientNutrients = {
  grams: null,
  calories: 0,
  fiber_g: 0,
  sodium_mg: 0,
  sat_fat_g: 0,
  potassium_mg: 0,
}

/** Coerce a possibly null/non-finite nutrient to a usable number (mirrors progress fns). */
function num(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * Scale one food's per-serving nutrients by `grams / food.serving_grams`.
 *
 * Returns `{ grams: null, ... }` (UNCONVERTIBLE) when the amount can't be turned
 * into grams, the food is missing, or the food has no usable `serving_grams`.
 * A converted ingredient whose specific nutrient is null contributes 0 for that
 * nutrient but STILL counts as converted (the food is measured; the nutrient is
 * genuinely absent in our data).
 */
export function ingredientNutrients(
  quantity: number | null,
  unit: string | null,
  food: NutrientFood | null,
): IngredientNutrients {
  if (food == null || quantity == null) return ZERO
  if (food.serving_grams == null || !Number.isFinite(food.serving_grams) || food.serving_grams <= 0) {
    return ZERO
  }
  const normUnit = canonicalUnit(unit)
  if (normUnit == null) return ZERO

  const grams = toGrams(quantity, normUnit, food)
  if (grams == null) return ZERO

  const factor = grams / food.serving_grams
  return {
    grams,
    calories: num(food.calories) * factor,
    fiber_g: num(food.fiber_g) * factor,
    sodium_mg: num(food.sodium_mg) * factor,
    sat_fat_g: num(food.sat_fat_g) * factor,
    potassium_mg: num(food.potassium_mg) * factor,
  }
}

/**
 * Roll a recipe's ingredients into PER-SERVING nutrients + a completeness flag.
 *
 * Sums each ingredient's converted contribution, then divides ONCE by `servings`.
 * Unconvertible ingredients are dropped (not summed as 0) and flip `isComplete`.
 * When `servings` is null/<=0/non-finite, or no ingredient converted, the
 * per-serving fields are `null` (we cannot produce a safe per-serving number).
 *
 * IMPORTANT (no double-divide): callers feeding `dashProgress`/`fiberProgress`
 * must NOT divide/multiply by servings again here — those functions multiply by
 * the LOGGED servings. This returns per-(recipe-)serving values.
 */
export function recipeNutrients(
  ingredients: NutrientIngredient[],
  servings: number | null,
): RecipeNutrients {
  let convertedCount = 0
  let unconvertibleCount = 0
  const totals = { calories: 0, fiber_g: 0, sodium_mg: 0, sat_fat_g: 0, potassium_mg: 0 }

  for (const ing of ingredients) {
    // Unlinked ingredients (no food) are out of scope for the nutrient roll-up
    // and do not count toward convertibility — they carry no nutrient data.
    if (ing.food == null) continue
    const n = ingredientNutrients(ing.quantity, ing.unit, ing.food)
    if (n.grams == null) {
      unconvertibleCount += 1
      continue
    }
    convertedCount += 1
    totals.calories += n.calories
    totals.fiber_g += n.fiber_g
    totals.sodium_mg += n.sodium_mg
    totals.sat_fat_g += n.sat_fat_g
    totals.potassium_mg += n.potassium_mg
  }

  const totalCount = convertedCount + unconvertibleCount
  const servingsValid =
    typeof servings === 'number' && Number.isFinite(servings) && servings > 0
  const canDivide = servingsValid && convertedCount > 0

  const isComplete = unconvertibleCount === 0 && totalCount > 0 && servingsValid

  if (!canDivide) {
    return {
      calories: null,
      fiber_g: null,
      sodium_mg: null,
      sat_fat_g: null,
      potassium_mg: null,
      convertedCount,
      unconvertibleCount,
      totalCount,
      isComplete,
    }
  }

  const s = servings as number
  return {
    calories: totals.calories / s,
    fiber_g: totals.fiber_g / s,
    sodium_mg: totals.sodium_mg / s,
    sat_fat_g: totals.sat_fat_g / s,
    potassium_mg: totals.potassium_mg / s,
    convertedCount,
    unconvertibleCount,
    totalCount,
    isComplete,
  }
}
