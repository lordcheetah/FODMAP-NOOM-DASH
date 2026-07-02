import type { DashGroup, MealType } from './types'

/**
 * A single resolved log entry, reduced to the nutrients the diet functions need.
 *
 * Per-serving nutrient fields are multiplied by `servings` INSIDE the functions,
 * so the data layer passes per-serving values + the servings count (single
 * source of truth). Null/undefined nutrients are treated as 0.
 */
export interface LoggedNutrients {
  dash_group?: DashGroup | null
  sodium_mg?: number | null
  sat_fat_g?: number | null
  potassium_mg?: number | null
  fiber_g?: number | null
  calories?: number | null
  meal: MealType
  /** Multiplier applied to the per-serving nutrient fields above. */
  servings: number
}

export interface DashTargets {
  sodium_budget_mg?: number | null
  /** Daily potassium FLOOR (mg) — met when the total reaches it. */
  potassium_goal_mg?: number | null
  dash_serving_goals?: Partial<Record<DashGroup, number>>
}

export interface DashProgress {
  /** Servings counted per DASH group; all 8 groups present, default 0. */
  servingsByGroup: Record<DashGroup, number>
  goalsByGroup: Partial<Record<DashGroup, number>>
  sodiumMg: number
  sodiumBudgetMg: number | null
  sodiumOverBudget: boolean
  satFatG: number
  potassiumMg: number
  /** Daily potassium goal (mg), or null when unset. */
  potassiumGoalMg: number | null
  /** True only when a goal is set AND the total reaches it. */
  meetsPotassiumGoal: boolean
}

/** The 8 DASH groups, in a stable order, used to seed the zeroed buckets. */
export const DASH_GROUPS: readonly DashGroup[] = [
  'grains',
  'vegetables',
  'fruits',
  'dairy',
  'meat-poultry-fish',
  'nuts-seeds-legumes',
  'fats-oils',
  'sweets',
] as const

/** Coerce a possibly null/undefined/non-finite nutrient to a usable number. */
function num(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function zeroedGroups(): Record<DashGroup, number> {
  const out = {} as Record<DashGroup, number>
  for (const g of DASH_GROUPS) out[g] = 0
  return out
}

/**
 * Compute DASH progress for a day: servings per food group, sodium total vs the
 * budget, and saturated-fat / potassium totals.
 *
 * - One logged item contributes `servings` DASH servings to its `dash_group`.
 * - Nutrient totals sum `value × servings`; missing nutrients count as 0.
 * - Entries with no `dash_group` still add to sodium/satfat/potassium but to no
 *   serving bucket.
 * - `sodiumOverBudget` is true only when a budget is set AND total exceeds it.
 */
export function dashProgress(
  entries: LoggedNutrients[],
  targets: DashTargets,
): DashProgress {
  const servingsByGroup = zeroedGroups()
  let sodiumMg = 0
  let satFatG = 0
  let potassiumMg = 0

  for (const e of entries) {
    const servings = num(e.servings)
    if (e.dash_group) servingsByGroup[e.dash_group] += servings
    sodiumMg += num(e.sodium_mg) * servings
    satFatG += num(e.sat_fat_g) * servings
    potassiumMg += num(e.potassium_mg) * servings
  }

  const sodiumBudgetMg =
    typeof targets.sodium_budget_mg === 'number' &&
    Number.isFinite(targets.sodium_budget_mg)
      ? targets.sodium_budget_mg
      : null

  const potassiumGoalMg =
    typeof targets.potassium_goal_mg === 'number' &&
    Number.isFinite(targets.potassium_goal_mg)
      ? targets.potassium_goal_mg
      : null

  return {
    servingsByGroup,
    goalsByGroup: targets.dash_serving_goals ?? {},
    sodiumMg,
    sodiumBudgetMg,
    sodiumOverBudget: sodiumBudgetMg != null && sodiumMg > sodiumBudgetMg,
    satFatG,
    potassiumMg,
    potassiumGoalMg,
    meetsPotassiumGoal: potassiumGoalMg != null && potassiumMg >= potassiumGoalMg,
  }
}
