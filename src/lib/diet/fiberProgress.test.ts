import { describe, it, expect } from 'vitest'
import { fiberProgress, MEAL_ORDER } from './fiberProgress'
import { LOW_FODMAP_HIGH_FIBER } from './fiberSuggestions'
import type { LoggedNutrients } from './dashProgress'

function entry(over: Partial<LoggedNutrients>): LoggedNutrients {
  return { meal: 'breakfast', servings: 1, ...over }
}

const SUGGESTION_NAMES = new Set(LOW_FODMAP_HIGH_FIBER.map((s) => s.name))

describe('fiberProgress', () => {
  it('no entries + goal 28 → full gap, not met, suggestions non-empty & all low-FODMAP', () => {
    const r = fiberProgress([], { fiber_goal_g: 28 })
    expect(r.totalFiberG).toBe(0)
    expect(r.dailyGapG).toBe(28)
    expect(r.meetsGoal).toBe(false)
    expect(r.suggestions.length).toBeGreaterThan(0)
    for (const s of r.suggestions) expect(SUGGESTION_NAMES.has(s.name)).toBe(true)
  })

  it('hitting the goal → gap 0, met, no suggestions', () => {
    const r = fiberProgress([entry({ fiber_g: 30 })], { fiber_goal_g: 28 })
    expect(r.dailyGapG).toBe(0)
    expect(r.meetsGoal).toBe(true)
    expect(r.suggestions).toEqual([])
  })

  it('exactly meeting the goal is met with no gap (boundary)', () => {
    const r = fiberProgress([entry({ fiber_g: 28 })], { fiber_goal_g: 28 })
    expect(r.dailyGapG).toBe(0)
    expect(r.meetsGoal).toBe(true)
    expect(r.suggestions).toEqual([])
  })

  it('totals multiply fiber by servings', () => {
    const r = fiberProgress([entry({ fiber_g: 5, servings: 2 })], { fiber_goal_g: 28 })
    expect(r.totalFiberG).toBe(10)
    expect(r.dailyGapG).toBe(18)
  })

  it('byMeal always has all 4 meals in fixed order', () => {
    const r = fiberProgress([], { fiber_goal_g: 28 })
    expect(r.byMeal.map((m) => m.meal)).toEqual([...MEAL_ORDER])
    expect(r.byMeal).toHaveLength(4)
  })

  it('per-meal target 8 with a 5g breakfast → that meal gap 3, not met', () => {
    const r = fiberProgress([entry({ meal: 'breakfast', fiber_g: 5 })], {
      fiber_per_meal_g: 8,
    })
    const bfast = r.byMeal.find((m) => m.meal === 'breakfast')!
    expect(bfast.fiberG).toBe(5)
    expect(bfast.targetG).toBe(8)
    expect(bfast.gapG).toBe(3)
    expect(bfast.meetsTarget).toBe(false)
    // a meal with no entries still appears with the full gap
    const lunch = r.byMeal.find((m) => m.meal === 'lunch')!
    expect(lunch.fiberG).toBe(0)
    expect(lunch.gapG).toBe(8)
    expect(lunch.meetsTarget).toBe(false)
  })

  it('per-meal target met exactly → gap 0, met', () => {
    const r = fiberProgress([entry({ meal: 'lunch', fiber_g: 8 })], {
      fiber_per_meal_g: 8,
    })
    const lunch = r.byMeal.find((m) => m.meal === 'lunch')!
    expect(lunch.gapG).toBe(0)
    expect(lunch.meetsTarget).toBe(true)
  })

  it('no targets → no gaps, everything "meets", no suggestions', () => {
    const r = fiberProgress([entry({ fiber_g: 1 })], {})
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

  it('null fiber values and null targets do not throw', () => {
    const r = fiberProgress(
      [entry({ fiber_g: null }), entry({ meal: 'dinner', fiber_g: undefined })],
      { fiber_goal_g: null, fiber_per_meal_g: null },
    )
    expect(r.totalFiberG).toBe(0)
    expect(r.goalG).toBeNull()
    expect(r.suggestions).toEqual([])
  })
})
