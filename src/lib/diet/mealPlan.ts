import { DASH_GROUPS } from './dashProgress'
import type { DashGroup, MealType } from './types'

/**
 * Guided per-meal planner. Distributes the DAILY DASH serving goals across the
 * day's meals via a sensible template, subtracts what's already logged, and
 * surfaces low-FODMAP food suggestions to fill each gap. The user can DEFER a
 * food type from one meal to the next.
 *
 * All suggestions are a NON-AUTHORITATIVE low-FODMAP (fructose/fructans) memory
 * aid — portions matter and they never claim anything about a specific product.
 */

export const PLAN_MEALS: readonly MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

/**
 * Fraction of each DASH group's DAILY goal to aim for at each meal. Each group's
 * shares sum to ~1 across the day. A reasonable default template — tune later.
 */
export const MEAL_DASH_SHARE: Record<MealType, Partial<Record<DashGroup, number>>> = {
  breakfast: { grains: 0.34, fruits: 0.5, dairy: 0.5 },
  lunch: {
    grains: 0.33,
    vegetables: 0.5,
    'meat-poultry-fish': 0.5,
    'fats-oils': 0.5,
    'nuts-seeds-legumes': 0.5,
  },
  dinner: {
    grains: 0.33,
    vegetables: 0.5,
    'meat-poultry-fish': 0.5,
    'fats-oils': 0.5,
  },
  snack: { fruits: 0.5, dairy: 0.5, 'nuts-seeds-legumes': 0.5, sweets: 1 },
}

/** Short NOOM guidance per meal (NOOM color = caloric density). */
export const MEAL_NOOM_HINT: Record<MealType, string> = {
  breakfast: 'Mostly green, some yellow — whole grains, fruit, a protein.',
  lunch: 'Half the plate green veg; lean protein; a little healthy fat.',
  dinner: 'Half the plate green veg; lean protein; a whole grain.',
  snack: 'Green-leaning — fruit, veg, yogurt, or a few nuts.',
}

/**
 * Curated LOW-FODMAP (fructose/fructans) picks per DASH group — guidance to fill
 * a gap without breaking the owner's limits. Lactose is NOT a tracked trigger,
 * so dairy is included normally.
 */
export const LOW_FODMAP_BY_GROUP: Partial<Record<DashGroup, string[]>> = {
  grains: ['oats', 'rice', 'quinoa', 'sourdough spelt', 'corn tortilla', 'gluten-free bread'],
  vegetables: ['spinach', 'carrot', 'zucchini', 'bell pepper', 'green beans', 'cucumber', 'tomato', 'kale'],
  fruits: ['kiwi', 'blueberries', 'strawberries', 'raspberries', 'orange', 'grapes', 'firm banana'],
  dairy: ['milk', 'plain yogurt', 'hard cheese', 'cottage cheese'],
  'meat-poultry-fish': ['chicken', 'turkey', 'salmon', 'tuna', 'eggs', 'firm tofu'],
  'nuts-seeds-legumes': ['walnuts', 'pumpkin seeds', 'chia seeds', 'peanuts', 'canned lentils (¼ cup)'],
  'fats-oils': ['olive oil', 'garlic-infused oil', 'avocado (small)', 'butter'],
  sweets: ['dark chocolate (small)', 'maple syrup', 'table sugar (small)'],
}

/**
 * Fallback daily DASH goals (~2,000 kcal column) used when the user hasn't set
 * their own, so the planner is useful out of the box.
 */
export const DEFAULT_DASH_GOALS: Partial<Record<DashGroup, number>> = {
  grains: 6,
  vegetables: 5,
  fruits: 4,
  dairy: 2,
  'meat-poultry-fish': 2,
  'nuts-seeds-legumes': 1,
  'fats-oils': 2,
}

/** One logged item reduced to what the planner reads. */
export interface PlanLoggedItem {
  meal: MealType
  dashGroup: DashGroup | null
  servings: number
}

export interface MealGroupTarget {
  group: DashGroup
  /** Effective target servings at this meal (base share + any deferred-in). */
  target: number
  /** Servings already logged toward this group at this meal today. */
  logged: number
  /** max(0, target − logged). */
  gap: number
  /** Low-FODMAP suggestions to fill the gap (empty when already met). */
  suggestions: string[]
  /** True when (some of) this target was deferred here from an earlier meal. */
  deferredIn: boolean
}

export interface MealPlanSlot {
  meal: MealType
  noomHint: string
  fiberTargetG: number | null
  groups: MealGroupTarget[]
}

function servingsOf(v: number): number {
  return Number.isFinite(v) && v > 0 ? v : 0
}

/**
 * Build the day's guided plan. `deferred` holds `${meal}:${group}` keys the user
 * has pushed to the NEXT meal; a deferred target is carried forward (its servings
 * add to the next meal's target). The last meal (snack) cannot defer further.
 */
export function buildMealPlan(
  dailyGoals: Partial<Record<DashGroup, number>>,
  fiberPerMealG: number | null,
  logged: PlanLoggedItem[],
  deferred: Set<string>,
): MealPlanSlot[] {
  const loggedMap: Record<MealType, Partial<Record<DashGroup, number>>> = {
    breakfast: {},
    lunch: {},
    dinner: {},
    snack: {},
  }
  for (const it of logged) {
    if (!it.dashGroup) continue
    const bucket = loggedMap[it.meal]
    if (!bucket) continue
    bucket[it.dashGroup] = (bucket[it.dashGroup] ?? 0) + servingsOf(it.servings)
  }

  let carry: Partial<Record<DashGroup, number>> = {}
  const slots: MealPlanSlot[] = []

  PLAN_MEALS.forEach((meal, idx) => {
    const isLast = idx === PLAN_MEALS.length - 1
    const share = MEAL_DASH_SHARE[meal]
    const nextCarry: Partial<Record<DashGroup, number>> = {}
    const groups: MealGroupTarget[] = []

    for (const g of DASH_GROUPS) {
      const base = (dailyGoals[g] ?? 0) * (share[g] ?? 0)
      const carriedIn = carry[g] ?? 0
      const target = base + carriedIn
      if (target <= 0) continue

      // Defer pushes the whole remaining target to the next meal (not on snack).
      if (!isLast && deferred.has(`${meal}:${g}`)) {
        nextCarry[g] = (nextCarry[g] ?? 0) + target
        continue
      }

      const loggedServ = loggedMap[meal][g] ?? 0
      const gap = Math.max(0, target - loggedServ)
      groups.push({
        group: g,
        target,
        logged: loggedServ,
        gap,
        suggestions: gap > 0 ? (LOW_FODMAP_BY_GROUP[g] ?? []) : [],
        deferredIn: carriedIn > 0,
      })
    }

    slots.push({
      meal,
      noomHint: MEAL_NOOM_HINT[meal],
      fiberTargetG: fiberPerMealG ?? null,
      groups,
    })
    carry = nextCarry
  })

  return slots
}
