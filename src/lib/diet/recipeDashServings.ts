import { canonicalUnit, toGrams } from './convert'
import type { DashGroup } from './types'

/**
 * Attribute a recipe's DASH servings to food groups from its ingredients.
 *
 * For each linked ingredient with a DASH group, convert its amount to grams
 * (same unit->grams layer as `recipeNutrients`) and divide by the food's own
 * serving size to get how many food-servings it contributes, then divide once by
 * the recipe's servings → servings PER RECIPE SERVING. Callers multiply by the
 * LOGGED servings (no double-divide). Ingredients we can't convert, that lack a
 * group, or lack a usable serving size are dropped (approximate, never inflated).
 *
 * Pure — no React, no DB.
 */
export interface DashServingFood {
  /** Used by the count-unit piece-weight fallback in `toGrams` (optional). */
  name?: string
  serving_desc: string
  serving_grams: number | null
  dash_group?: DashGroup | null
}

export interface DashServingIngredient {
  quantity: number | null
  unit: string | null
  food: DashServingFood | null
}

/** Per-group DASH servings for ONE serving of the recipe. */
export function recipeDashServings(
  ingredients: DashServingIngredient[],
  servings: number | null,
): Partial<Record<DashGroup, number>> {
  const out: Partial<Record<DashGroup, number>> = {}
  const servingsValid =
    typeof servings === 'number' && Number.isFinite(servings) && servings > 0
  if (!servingsValid) return out // can't produce a safe per-serving figure

  for (const ing of ingredients) {
    const f = ing.food
    if (!f || !f.dash_group) continue
    if (f.serving_grams == null || !Number.isFinite(f.serving_grams) || f.serving_grams <= 0) {
      continue
    }
    if (ing.quantity == null) continue
    const unit = canonicalUnit(ing.unit)
    if (unit == null) continue
    const grams = toGrams(ing.quantity, unit, f)
    if (grams == null) continue

    const foodServings = grams / f.serving_grams
    out[f.dash_group] = (out[f.dash_group] ?? 0) + foodServings
  }

  const s = servings as number
  for (const g of Object.keys(out) as DashGroup[]) {
    out[g] = (out[g] ?? 0) / s
  }
  return out
}
