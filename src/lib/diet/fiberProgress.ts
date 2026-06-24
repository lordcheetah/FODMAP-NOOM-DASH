import type { MealType } from './types'
import type { LoggedNutrients } from './dashProgress'
import { LOW_FODMAP_HIGH_FIBER, type FiberSuggestion } from './fiberSuggestions'

export type { FiberSuggestion } from './fiberSuggestions'

export interface FiberTargets {
  /** Daily fiber goal (grams). */
  fiber_goal_g?: number | null
  /** Per-meal fiber target (grams). */
  fiber_per_meal_g?: number | null
}

export interface MealFiber {
  meal: MealType
  fiberG: number
  targetG: number | null
  /** `max(0, target − consumed)`; 0 when there is no per-meal target. */
  gapG: number
  meetsTarget: boolean
}

export interface FiberProgress {
  totalFiberG: number
  goalG: number | null
  /** `max(0, goal − total)`; 0 when there is no daily goal. */
  dailyGapG: number
  meetsGoal: boolean
  /** Always all 4 meals, in fixed order. */
  byMeal: MealFiber[]
  /** `[]` when there is no daily gap; else low-FODMAP high-fiber picks. */
  suggestions: FiberSuggestion[]
}

/** Fixed meal order — `byMeal` always returns all four, even when empty. */
export const MEAL_ORDER: readonly MealType[] = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
] as const

function num(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function target(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Compute fiber progress: daily total vs goal, per-meal totals vs the per-meal
 * target, and (only when there is a daily gap) low-FODMAP high-fiber suggestions
 * to help close it.
 *
 * - `totalFiberG = Σ(fiber_g × servings)`; per-meal sums the same.
 * - Gaps are `max(0, target − consumed)`; no target → gap 0, `meetsTarget` true.
 * - Suggestions are returned ONLY when `dailyGapG > 0`, drawn from the curated
 *   low-FODMAP list (every item is fructose + fructans `low` by construction).
 */
export function fiberProgress(
  entries: LoggedNutrients[],
  targets: FiberTargets,
): FiberProgress {
  const perMeal: Record<MealType, number> = {
    breakfast: 0,
    lunch: 0,
    dinner: 0,
    snack: 0,
  }
  let totalFiberG = 0

  for (const e of entries) {
    const fiber = num(e.fiber_g) * num(e.servings)
    totalFiberG += fiber
    perMeal[e.meal] += fiber
  }

  const goalG = target(targets.fiber_goal_g)
  const perMealTarget = target(targets.fiber_per_meal_g)
  const dailyGapG = goalG != null ? Math.max(0, goalG - totalFiberG) : 0

  const byMeal: MealFiber[] = MEAL_ORDER.map((meal) => {
    const fiberG = perMeal[meal]
    const targetG = perMealTarget
    const gapG = targetG != null ? Math.max(0, targetG - fiberG) : 0
    return {
      meal,
      fiberG,
      targetG,
      gapG,
      meetsTarget: targetG == null ? true : fiberG >= targetG,
    }
  })

  return {
    totalFiberG,
    goalG,
    dailyGapG,
    meetsGoal: goalG == null ? true : totalFiberG >= goalG,
    byMeal,
    suggestions: dailyGapG > 0 ? [...LOW_FODMAP_HIGH_FIBER] : [],
  }
}
