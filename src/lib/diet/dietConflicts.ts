import type { DashGroup, FodmapLevel, MealType, NoomColor } from './types'

/**
 * Cross-diet conflict detection.
 *
 * The three frameworks disagree on specific foods, and the app's value is
 * SURFACING that disagreement rather than averaging it into one blended score.
 * Two conflicts matter for this owner (FODMAP = fructose + fructans only):
 *
 * - `dash-via-trigger` (warn): a food that counts toward a DASH produce / grain /
 *   legume serving but is HIGH in fructose or fructans — you're hitting a DASH
 *   target via one of your triggers.
 * - `keep-despite-density` (good): a calorie-dense (NOOM orange) nut/seed/legume
 *   or fat/oil that is FODMAP-clean — DASH wants it for heart health, so don't
 *   cut it just because NOOM penalizes the density.
 *
 * Pure + testable; the component maps its log rows to `ConflictInput` and renders.
 */

export type ConflictKind = 'dash-via-trigger' | 'keep-despite-density'
export type ConflictTone = 'warn' | 'good'

/** One logged food reduced to the fields conflict rules read. */
export interface ConflictInput {
  name: string
  meal: MealType
  fructoseLevel: FodmapLevel
  fructansLevel: FodmapLevel
  dashGroup: DashGroup | null
  /** NOOM color, computed from cal/g by the caller; null = unknown. */
  noom: NoomColor | null
}

export interface DietConflict {
  kind: ConflictKind
  tone: ConflictTone
  foodName: string
  meal: MealType
  message: string
}

const DASH_LABEL: Record<DashGroup, string> = {
  grains: 'Grains',
  vegetables: 'Vegetables',
  fruits: 'Fruits',
  dairy: 'Dairy',
  'meat-poultry-fish': 'Meat/Poultry/Fish',
  'nuts-seeds-legumes': 'Nuts/Seeds/Legumes',
  'fats-oils': 'Fats/Oils',
  sweets: 'Sweets',
}

/**
 * DASH groups DASH actively pushes that also carry fructose/fructans — produce,
 * grains, legumes. A high trigger landing in one of these is the classic
 * "reaching a DASH target via a FODMAP trigger" collision.
 */
const TRIGGER_PRONE_GROUPS: readonly DashGroup[] = [
  'grains',
  'fruits',
  'vegetables',
  'nuts-seeds-legumes',
]

/**
 * DASH groups NOOM penalizes for calorie density but that are cardioprotective —
 * don't cut them when they're FODMAP-clean.
 */
const DENSITY_OK_GROUPS: readonly DashGroup[] = ['nuts-seeds-legumes', 'fats-oils']

/** "fructose", "fructans", or "fructose and fructans". */
function joinAxes(axes: string[]): string {
  return axes.length === 2 ? `${axes[0]} and ${axes[1]}` : axes[0]
}

/** Classify a single logged food; null when it triggers no rule. */
function classify(f: ConflictInput): DietConflict | null {
  // Both rules key off the DASH group, so an unclassified food never conflicts.
  if (!f.dashGroup) return null

  const highAxes: string[] = []
  if (f.fructoseLevel === 'high') highAxes.push('fructose')
  if (f.fructansLevel === 'high') highAxes.push('fructans')

  // Rule 1 (precedence): a DASH produce/grain/legume that is a trigger. This
  // must win over Rule 2 so a high-fructan legume warns rather than reads "keep".
  if (highAxes.length > 0 && TRIGGER_PRONE_GROUPS.includes(f.dashGroup)) {
    return {
      kind: 'dash-via-trigger',
      tone: 'warn',
      foodName: f.name,
      meal: f.meal,
      message: `Counts toward DASH ${DASH_LABEL[f.dashGroup]}, but it's high in ${joinAxes(
        highAxes,
      )} — a trigger for you.`,
    }
  }

  // Rule 2: calorie-dense DASH fat/nut that is FODMAP-clean (BOTH axes low) —
  // NOOM would nudge you off it, but it's cardioprotective. Keep it.
  const fodmapClean = f.fructoseLevel === 'low' && f.fructansLevel === 'low'
  if (f.noom === 'orange' && DENSITY_OK_GROUPS.includes(f.dashGroup) && fodmapClean) {
    return {
      kind: 'keep-despite-density',
      tone: 'good',
      foodName: f.name,
      meal: f.meal,
      message: `Calorie-dense (NOOM orange) but a DASH-recommended, low-FODMAP ${DASH_LABEL[
        f.dashGroup
      ].toLowerCase()} pick — keep it, don't cut it for density.`,
    }
  }

  return null
}

/**
 * Detect cross-diet conflicts across a day's logged foods. Deduplicates by
 * (kind, food name) so logging the same food twice yields one message. Recipes
 * carry no single DASH group, so callers pass foods only and recipes are absent.
 */
export function dietConflicts(inputs: ConflictInput[]): DietConflict[] {
  const out: DietConflict[] = []
  const seen = new Set<string>()
  for (const f of inputs) {
    const c = classify(f)
    if (!c) continue
    const key = `${c.kind}:${c.foodName.trim().toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
  }
  return out
}
