import { describe, it, expect } from 'vitest'
import {
  buildMealPlan,
  MEAL_DASH_SHARE,
  PLAN_MEALS,
  type PlanLoggedItem,
} from './mealPlan'
import type { DashGroup } from './types'

function slot(plan: ReturnType<typeof buildMealPlan>, meal: string) {
  return plan.find((s) => s.meal === meal)!
}
function grp(plan: ReturnType<typeof buildMealPlan>, meal: string, g: DashGroup) {
  return slot(plan, meal).groups.find((x) => x.group === g)
}

describe('MEAL_DASH_SHARE', () => {
  it("each group's shares sum to ~1 across the day", () => {
    const groups: DashGroup[] = [
      'grains',
      'vegetables',
      'fruits',
      'dairy',
      'meat-poultry-fish',
      'nuts-seeds-legumes',
      'fats-oils',
      'sweets',
    ]
    for (const g of groups) {
      const sum = PLAN_MEALS.reduce((s, m) => s + (MEAL_DASH_SHARE[m][g] ?? 0), 0)
      if (sum > 0) expect(sum).toBeCloseTo(1, 5)
    }
  })
})

describe('buildMealPlan — targets & gaps', () => {
  const goals: Partial<Record<DashGroup, number>> = { vegetables: 4, fruits: 4, grains: 6 }

  it('distributes daily goals across meals per the template', () => {
    const plan = buildMealPlan(goals, 8, [], new Set())
    // fruits 4 × 0.5 at breakfast = 2
    expect(grp(plan, 'breakfast', 'fruits')!.target).toBeCloseTo(2, 5)
    // vegetables 4 × 0.5 at lunch = 2
    expect(grp(plan, 'lunch', 'vegetables')!.target).toBeCloseTo(2, 5)
    // grains split 0.34/0.33/0.33 → breakfast ≈ 2.04
    expect(grp(plan, 'breakfast', 'grains')!.target).toBeCloseTo(6 * 0.34, 5)
  })

  it('subtracts logged servings from the target for that meal+group', () => {
    const logged: PlanLoggedItem[] = [
      { meal: 'breakfast', dashGroup: 'fruits', servings: 1 },
    ]
    const plan = buildMealPlan(goals, null, logged, new Set())
    const f = grp(plan, 'breakfast', 'fruits')!
    expect(f.logged).toBe(1)
    expect(f.gap).toBeCloseTo(1, 5) // target 2 − 1 logged
  })

  it('offers suggestions only when there is a gap', () => {
    const logged: PlanLoggedItem[] = [
      { meal: 'breakfast', dashGroup: 'fruits', servings: 5 }, // exceeds target
    ]
    const plan = buildMealPlan(goals, null, logged, new Set())
    const f = grp(plan, 'breakfast', 'fruits')!
    expect(f.gap).toBe(0)
    expect(f.suggestions).toEqual([])
    // a group with a gap has suggestions
    expect(grp(plan, 'lunch', 'vegetables')!.suggestions.length).toBeGreaterThan(0)
  })

  it('ignores logged items with no DASH group', () => {
    const plan = buildMealPlan(goals, null, [
      { meal: 'breakfast', dashGroup: null, servings: 3 },
    ], new Set())
    expect(grp(plan, 'breakfast', 'fruits')!.logged).toBe(0)
  })

  it('omits groups with no goal', () => {
    const plan = buildMealPlan({ fruits: 4 }, null, [], new Set())
    expect(grp(plan, 'lunch', 'vegetables')).toBeUndefined()
  })
})

describe('buildMealPlan — defer', () => {
  const goals: Partial<Record<DashGroup, number>> = { fruits: 4 }

  it('moves a deferred target to the next meal', () => {
    // Breakfast fruits target = 2; defer it → gone from breakfast, carried to lunch.
    const plan = buildMealPlan(goals, null, [], new Set(['breakfast:fruits']))
    expect(grp(plan, 'breakfast', 'fruits')).toBeUndefined()
    // Lunch has no fruits share, so the carried 2 shows there, flagged deferredIn.
    const lunchFruit = grp(plan, 'lunch', 'fruits')!
    expect(lunchFruit.target).toBeCloseTo(2, 5)
    expect(lunchFruit.deferredIn).toBe(true)
  })

  it('carries a defer across multiple meals until it lands', () => {
    // Defer at breakfast AND lunch → fruits skips both, appears at dinner.
    const plan = buildMealPlan(
      goals,
      null,
      [],
      new Set(['breakfast:fruits', 'lunch:fruits']),
    )
    expect(grp(plan, 'breakfast', 'fruits')).toBeUndefined()
    expect(grp(plan, 'lunch', 'fruits')).toBeUndefined()
    expect(grp(plan, 'dinner', 'fruits')!.target).toBeCloseTo(2, 5)
  })

  it('cannot defer past the last meal (snack stays put)', () => {
    const plan = buildMealPlan(goals, null, [], new Set(['snack:fruits']))
    // The defer key is ignored at the last meal — fruits still render at snack.
    expect(grp(plan, 'snack', 'fruits')).toBeDefined()
  })
})
