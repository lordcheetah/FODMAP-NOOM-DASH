import { describe, it, expect } from 'vitest'
import { fiberProgress, MEAL_ORDER } from './fiberProgress'
import { LOW_FODMAP_HIGH_FIBER } from './fiberSuggestions'
import { lowFodmapSafe } from './lowFodmapSafe'
import type { LoggedNutrients } from './dashProgress'

function entry(over: Partial<LoggedNutrients>): LoggedNutrients {
  return { meal: 'breakfast', servings: 1, ...over }
}

// The exact curated set — cross-check suggestions against the source of truth.
const SUGGESTION_BY_NAME = new Map(LOW_FODMAP_HIGH_FIBER.map((s) => [s.name, s]))

describe('fiberProgress — edge cases (extends fiberProgress.test.ts)', () => {
  it('all 4 meals present even when entries cover only some meals', () => {
    // Only breakfast + dinner logged; lunch + snack must still appear, zeroed.
    const r = fiberProgress(
      [entry({ meal: 'breakfast', fiber_g: 4 }), entry({ meal: 'dinner', fiber_g: 6 })],
      { fiber_goal_g: 28 },
    )
    expect(r.byMeal.map((m) => m.meal)).toEqual([...MEAL_ORDER])
    expect(r.byMeal).toHaveLength(4)
    const byName = new Map(r.byMeal.map((m) => [m.meal, m]))
    expect(byName.get('breakfast')!.fiberG).toBe(4)
    expect(byName.get('lunch')!.fiberG).toBe(0)
    expect(byName.get('dinner')!.fiberG).toBe(6)
    expect(byName.get('snack')!.fiberG).toBe(0)
  })

  it('suggestions are EXACTLY the curated low-FODMAP set when there is a gap', () => {
    const r = fiberProgress([entry({ fiber_g: 5 })], { fiber_goal_g: 28 })
    expect(r.dailyGapG).toBeGreaterThan(0)
    // identity + ordering of the curated set is preserved
    expect(r.suggestions).toEqual([...LOW_FODMAP_HIGH_FIBER])
  })

  it('every suggestion item is a real low-FODMAP high-fiber pick (cross-checked)', () => {
    const r = fiberProgress([], { fiber_goal_g: 28 })
    expect(r.suggestions.length).toBeGreaterThan(0)
    for (const s of r.suggestions) {
      // name must exist in the curated source and match its fiber value
      const src = SUGGESTION_BY_NAME.get(s.name)
      expect(src, `unknown suggestion "${s.name}"`).toBeDefined()
      expect(s.fiber_g).toBe(src!.fiber_g)
      // and that curated item is, by construction, fructose+fructans low → safe
      expect(lowFodmapSafe('low', 'low')).toBe('safe')
      expect(s.fiber_g).toBeGreaterThan(0)
    }
  })

  it.each([
    // [gapPresent, goal, totalFiber]
    [false, 10, 10], // exactly meets → no gap → no suggestions
    [false, 10, 11], // exceeds → no gap → no suggestions
    [true, 10, 9.9], // just short → gap → suggestions
  ] as const)(
    'suggestions non-empty IFF dailyGapG>0 (goal %s, total via servings)',
    (gapPresent, goal, total) => {
      const r = fiberProgress([entry({ fiber_g: total })], { fiber_goal_g: goal })
      expect(r.dailyGapG > 0).toBe(gapPresent)
      expect(r.suggestions.length > 0).toBe(gapPresent)
    },
  )

  it('no suggestions when there is no daily goal even if per-meal targets are missed', () => {
    // dailyGapG is driven only by the daily goal, not per-meal gaps.
    const r = fiberProgress([entry({ meal: 'lunch', fiber_g: 1 })], {
      fiber_per_meal_g: 8,
    })
    expect(r.goalG).toBeNull()
    expect(r.dailyGapG).toBe(0)
    expect(r.suggestions).toEqual([])
  })

  it('per-meal gap math with mixed servings multipliers (deterministic)', () => {
    // breakfast: 3g × 2 = 6  → target 8 → gap 2, not met
    // lunch:     2g × 3 = 6  → target 8 → gap 2, not met
    // dinner:    4g × 2 = 8  → target 8 → gap 0, met (boundary)
    const r = fiberProgress(
      [
        entry({ meal: 'breakfast', fiber_g: 3, servings: 2 }),
        entry({ meal: 'lunch', fiber_g: 2, servings: 3 }),
        entry({ meal: 'dinner', fiber_g: 4, servings: 2 }),
      ],
      { fiber_per_meal_g: 8 },
    )
    const m = new Map(r.byMeal.map((x) => [x.meal, x]))
    expect(m.get('breakfast')).toMatchObject({ fiberG: 6, gapG: 2, meetsTarget: false })
    expect(m.get('lunch')).toMatchObject({ fiberG: 6, gapG: 2, meetsTarget: false })
    expect(m.get('dinner')).toMatchObject({ fiberG: 8, gapG: 0, meetsTarget: true })
    expect(m.get('snack')).toMatchObject({ fiberG: 0, gapG: 8, meetsTarget: false })
    expect(r.totalFiberG).toBe(20)
  })

  it('multiple entries in the same meal accumulate before the per-meal gap check', () => {
    const r = fiberProgress(
      [
        entry({ meal: 'breakfast', fiber_g: 3 }),
        entry({ meal: 'breakfast', fiber_g: 5 }),
      ],
      { fiber_per_meal_g: 8 },
    )
    const bfast = r.byMeal.find((x) => x.meal === 'breakfast')!
    expect(bfast.fiberG).toBe(8)
    expect(bfast.gapG).toBe(0)
    expect(bfast.meetsTarget).toBe(true)
  })

  it.each([
    [null, 0],
    [undefined, 0],
    [NaN, 0],
    [Infinity, 0],
  ] as const)('null/undefined/non-finite fiber_g (%s) counts as 0', (val, expected) => {
    const r = fiberProgress([entry({ fiber_g: val as number | null | undefined })], {
      fiber_goal_g: 28,
    })
    expect(r.totalFiberG).toBe(expected)
    expect(r.dailyGapG).toBe(28)
  })

  it('goal null and per-meal target null → all gaps 0, meets everything, no suggestions', () => {
    const r = fiberProgress([entry({ fiber_g: 2 })], {
      fiber_goal_g: null,
      fiber_per_meal_g: null,
    })
    expect(r.goalG).toBeNull()
    expect(r.dailyGapG).toBe(0)
    expect(r.meetsGoal).toBe(true)
    expect(r.suggestions).toEqual([])
    for (const m of r.byMeal) {
      expect(m.targetG).toBeNull()
      expect(m.gapG).toBe(0)
      expect(m.meetsTarget).toBe(true)
    }
  })

  it('meetsGoal/meetsTarget semantics at the exact boundary (>= is met)', () => {
    const exactDaily = fiberProgress([entry({ fiber_g: 28 })], { fiber_goal_g: 28 })
    expect(exactDaily.meetsGoal).toBe(true)
    expect(exactDaily.dailyGapG).toBe(0)

    const exactMeal = fiberProgress([entry({ meal: 'snack', fiber_g: 8 })], {
      fiber_per_meal_g: 8,
    })
    const snack = exactMeal.byMeal.find((m) => m.meal === 'snack')!
    expect(snack.meetsTarget).toBe(true)
    expect(snack.gapG).toBe(0)
  })

  it('goal of 0 is a real target (not treated as "no goal")', () => {
    // target() keeps finite 0; a 0 goal is always met, gap 0.
    const r = fiberProgress([], { fiber_goal_g: 0, fiber_per_meal_g: 0 })
    expect(r.goalG).toBe(0)
    expect(r.dailyGapG).toBe(0)
    expect(r.meetsGoal).toBe(true)
    expect(r.suggestions).toEqual([])
    for (const m of r.byMeal) {
      expect(m.targetG).toBe(0)
      expect(m.meetsTarget).toBe(true)
    }
  })
})
