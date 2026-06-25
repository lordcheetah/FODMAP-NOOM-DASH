import { noomColor } from './noomColor'
import type { FodmapLevel, NoomColor } from './types'
import type { FodmapSafety } from './lowFodmapSafe'

/**
 * Minimal food shape `recipeRollup` needs from a linked ingredient. The full
 * `FoodRow` is structurally assignable to this, so `useRecipe`'s richer
 * ingredients can be passed directly.
 */
export interface RollupFood {
  fructose_level: FodmapLevel
  fructans_level: FodmapLevel
  calories: number | null
  serving_grams: number | null
}

/** A recipe ingredient with its linked food (null when unlinked / raw_text only). */
export interface RollupIngredient {
  food_id: string | null
  food: RollupFood | null
}

export interface RecipeRollup {
  /** Worst-case fructose across linked ingredients ('unknown' if any unknown). */
  fructoseLevel: FodmapLevel
  /** Worst-case fructans across linked ingredients ('unknown' if any unknown). */
  fructansLevel: FodmapLevel
  /** Overall safety per the truth table (high dominates unknown). */
  safety: FodmapSafety
  /** Averaged caloric density run through `noomColor`; null when not computable. */
  noomColor: NoomColor | null
  /** Ingredients with a non-null linked food. */
  linkedCount: number
  /** Ingredients with food === null (unlinked / unverifiable). */
  unlinkedCount: number
  /** Ingredients usable for density (calories >= 0 && serving_grams > 0). */
  usableForDensityCount: number
  /** True only when every ingredient is linked AND no axis is unknown. */
  isComplete: boolean
}

/** Severity ranking for the three KNOWN levels. `unknown` is tracked separately. */
const SEVERITY: Record<'low' | 'moderate' | 'high', number> = {
  low: 0,
  moderate: 1,
  high: 2,
}

/**
 * Roll a recipe's ingredients up into a single diet verdict (FODMAP safety +
 * NOOM color), per CLAUDE.md ("worst-case fructose/fructans, averaged caloric
 * density"). Pure — no React, no DB.
 *
 * SAFETY (health-critical): the precedence is implemented DIRECTLY rather than
 * by string-maxing per-ingredient `lowFodmapSafe` results (that ordering would
 * be wrong). `high` dominates everything — a recipe with a known-high ingredient
 * is `avoid` even if other ingredients are unverifiable. Any unknown axis OR any
 * unlinked ingredient (food === null) means we cannot call it "safe", so it is
 * at most `not-verified`. An empty ingredient list is `not-verified` (nothing to
 * verify; never "safe").
 *
 * For a single linked, verified ingredient this is provably equivalent to
 * `lowFodmapSafe(food.fructose_level, food.fructans_level)` (see tests).
 */
export function recipeRollup(ingredients: RollupIngredient[]): RecipeRollup {
  let fructoseLevel: FodmapLevel = 'low'
  let fructansLevel: FodmapLevel = 'low'
  let anyKnownHigh = false
  let anyModerate = false
  let anyUnknownAxis = false

  let linkedCount = 0
  let unlinkedCount = 0
  let usableForDensityCount = 0
  let densitySum = 0

  for (const ing of ingredients) {
    if (!ing.food) {
      unlinkedCount += 1
      continue
    }
    linkedCount += 1
    const f = ing.food

    fructoseLevel = worstAxis(fructoseLevel, f.fructose_level)
    fructansLevel = worstAxis(fructansLevel, f.fructans_level)

    for (const level of [f.fructose_level, f.fructans_level]) {
      if (level === 'unknown') anyUnknownAxis = true
      else if (level === 'high') anyKnownHigh = true
      else if (level === 'moderate') anyModerate = true
    }

    // Per-ingredient caloric density = calories / serving_grams, only when both
    // are usable (mirrors noomColor's guards).
    if (
      f.calories != null &&
      f.serving_grams != null &&
      Number.isFinite(f.calories) &&
      Number.isFinite(f.serving_grams) &&
      f.serving_grams > 0 &&
      f.calories >= 0
    ) {
      usableForDensityCount += 1
      densitySum += f.calories / f.serving_grams
    }
  }

  const hasUnverifiable = unlinkedCount > 0 || anyUnknownAxis
  const isEmpty = ingredients.length === 0

  // Truth-table precedence (high dominates unknown).
  let safety: FodmapSafety
  if (anyKnownHigh) safety = 'avoid'
  else if (isEmpty || hasUnverifiable) safety = 'not-verified'
  else if (anyModerate) safety = 'caution'
  else safety = 'safe'

  // NOOM color = simple mean of per-ingredient densities, fed through the
  // canonical thresholds. We pass grams=1 so calories==density and the single
  // source of truth in noomColor.ts stays authoritative (no duplicated cutoffs).
  const noom =
    usableForDensityCount > 0
      ? noomColor(densitySum / usableForDensityCount, 1)
      : null

  return {
    fructoseLevel,
    fructansLevel,
    safety,
    noomColor: noom,
    linkedCount,
    unlinkedCount,
    usableForDensityCount,
    isComplete: unlinkedCount === 0 && !anyUnknownAxis && !isEmpty,
  }
}

/**
 * Display axes for the FODMAP badge so it AGREES with `rollup.safety`.
 *
 * `FodmapBadge`/`lowFodmapSafe` derive the label from the two axes alone, but an
 * unlinked ingredient drives safety to `not-verified` WITHOUT making any axis
 * `unknown` (the linked foods can all be low/low). To avoid a badge reading
 * "Safe" on a recipe the roll-up calls "Not verified", coerce an axis to
 * `unknown` in exactly that case. All other cases already map correctly:
 * high->avoid, moderate->caution, low/low->safe, unknown axis->not-verified.
 */
export function rollupBadgeAxes(rollup: RecipeRollup): {
  fructose: FodmapLevel
  fructans: FodmapLevel
} {
  if (
    rollup.safety === 'not-verified' &&
    rollup.fructoseLevel !== 'unknown' &&
    rollup.fructansLevel !== 'unknown'
  ) {
    return { fructose: 'unknown', fructans: rollup.fructansLevel }
  }
  return { fructose: rollup.fructoseLevel, fructans: rollup.fructansLevel }
}

/**
 * Worst-case combine of two axis levels for DISPLAY. `unknown` wins over any
 * known level (so the badge reflects the gap); among known levels, higher
 * severity wins.
 */
function worstAxis(current: FodmapLevel, next: FodmapLevel): FodmapLevel {
  if (current === 'unknown' || next === 'unknown') return 'unknown'
  return SEVERITY[next] > SEVERITY[current] ? next : current
}
