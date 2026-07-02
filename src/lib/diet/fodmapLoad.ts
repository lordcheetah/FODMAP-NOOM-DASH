import type { FodmapLevel, MealType } from './types'

/**
 * FODMAP meal-window stacking.
 *
 * A categorical low/moderate/high per food can't be summed, but symptoms are a
 * THRESHOLD-AND-STACKING effect: several individually-tolerable servings in one
 * sitting can add up past a threshold. We approximate the "2–3 hour window" with
 * the MEAL SLOT (breakfast/lunch/dinner/snack) — the finest grouping the log
 * carries without eating timestamps.
 *
 * Method: map each known level to a superlinear per-serving WEIGHT, sum
 * `weight × servings` within a meal per axis (fructose and fructans separately —
 * different molecules, different thresholds), then threshold the sum back to a
 * level. The weights/thresholds are a MODEL to be calibrated against the owner's
 * own reintroduction data, so they live in ONE place and the UI labels the
 * result an estimate.
 *
 * HEALTH-SAFETY: 'unknown' has no weight — it must NOT coerce to 0 and read as a
 * light meal. It propagates: if any food on an axis is unknown and the known
 * foods don't already reach 'high', the meal's axis level is reported 'unknown'
 * ("not verified"), never low/safe.
 */

type KnownLevel = 'low' | 'moderate' | 'high'

/**
 * Superlinear per-serving load weight per known level. Heuristic — tune against
 * real reintroduction data. 'unknown' is intentionally absent (see propagation).
 */
export const FODMAP_LOAD_WEIGHT: Record<KnownLevel, number> = {
  low: 1,
  moderate: 4,
  high: 9,
}

/**
 * Inclusive upper bounds mapping a summed load back to a level:
 * `load ≤ low` → low, `≤ moderate` → moderate, else high. Chosen so a few low
 * servings stay low, a moderate shows through, and stacked moderates/a single
 * high reach high. Tunable alongside the weights.
 */
export const FODMAP_LOAD_THRESHOLDS = { low: 3, moderate: 8 } as const

/** One logged item reduced to what the stack reads. */
export interface FodmapStackInput {
  meal: MealType
  /** Logged servings; coerced to 1 when missing/invalid (an item is ≥1 serving). */
  servings: number
  fructoseLevel: FodmapLevel
  fructansLevel: FodmapLevel
}

export interface AxisLoad {
  /** Summed `weight × servings` over foods with a KNOWN level (unknown excluded). */
  load: number
  /** Stacked level from the known foods only. */
  knownLevel: KnownLevel
  /** An item on this axis had an unknown level — true load may be higher. */
  hasUnknown: boolean
  /** Safety-honest level for display: 'unknown' when unverified and not already high. */
  level: FodmapLevel
}

export interface MealFodmapLoad {
  meal: MealType
  fructose: AxisLoad
  fructans: AxisLoad
  itemCount: number
  /** Either axis at moderate / high / unknown — worth surfacing to the user. */
  flagged: boolean
}

const MEAL_ORDER: readonly MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

function servingsOf(s: number): number {
  return Number.isFinite(s) && s > 0 ? s : 1
}

function levelFromLoad(load: number): KnownLevel {
  if (load <= FODMAP_LOAD_THRESHOLDS.low) return 'low'
  if (load <= FODMAP_LOAD_THRESHOLDS.moderate) return 'moderate'
  return 'high'
}

/** A meal axis is worth flagging when it isn't plain 'low'. */
function isFlagged(level: FodmapLevel): boolean {
  return level !== 'low'
}

function axisLoad(items: { level: FodmapLevel; servings: number }[]): AxisLoad {
  let load = 0
  let hasUnknown = false
  for (const { level, servings } of items) {
    if (level === 'unknown') {
      hasUnknown = true
      continue
    }
    load += FODMAP_LOAD_WEIGHT[level] * servingsOf(servings)
  }
  const knownLevel = levelFromLoad(load)
  // Unverified foods mean the true load may exceed what we summed — never render
  // the meal as low/safe. Report 'unknown' unless the KNOWN foods already reach
  // 'high' (an unknown can't make the strongest warning any stronger).
  const level: FodmapLevel =
    hasUnknown && knownLevel !== 'high' ? 'unknown' : knownLevel
  return { load, knownLevel, hasUnknown, level }
}

/**
 * Stack FODMAP load per meal across a day's items. Returns one entry per meal
 * that has ≥1 item, in canonical meal order. Callers pass FOODS (their own
 * levels) and RECIPES (via `recipeAxisLevel` over a roll-up).
 */
export function fodmapMealLoad(inputs: FodmapStackInput[]): MealFodmapLoad[] {
  const byMeal = new Map<MealType, FodmapStackInput[]>()
  for (const i of inputs) {
    const arr = byMeal.get(i.meal)
    if (arr) arr.push(i)
    else byMeal.set(i.meal, [i])
  }

  const out: MealFodmapLoad[] = []
  for (const meal of MEAL_ORDER) {
    const items = byMeal.get(meal)
    if (!items || items.length === 0) continue
    const fructose = axisLoad(
      items.map((i) => ({ level: i.fructoseLevel, servings: i.servings })),
    )
    const fructans = axisLoad(
      items.map((i) => ({ level: i.fructansLevel, servings: i.servings })),
    )
    out.push({
      meal,
      fructose,
      fructans,
      itemCount: items.length,
      flagged: isFlagged(fructose.level) || isFlagged(fructans.level),
    })
  }
  return out
}

/**
 * Bridge a recipe roll-up axis (worst-case level + completeness) into a stack
 * level. A known 'high' ingredient dominates and is kept; anything unverified
 * (unknown axis OR an unlinked ingredient → `isComplete === false`) becomes
 * 'unknown' so a partially-known recipe is never understated to 'low'.
 */
export function recipeAxisLevel(
  rollupLevel: FodmapLevel,
  isComplete: boolean,
): FodmapLevel {
  if (rollupLevel === 'high') return 'high'
  if (rollupLevel === 'unknown' || !isComplete) return 'unknown'
  return rollupLevel
}
