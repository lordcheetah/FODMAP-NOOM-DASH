import { describe, it, expect } from 'vitest'
import { dashProgress, DASH_GROUPS, type LoggedNutrients } from './dashProgress'

function entry(over: Partial<LoggedNutrients>): LoggedNutrients {
  return { meal: 'lunch', servings: 1, ...over }
}

describe('dashProgress', () => {
  it('empty log → all zeros, not over budget', () => {
    const r = dashProgress([], { sodium_budget_mg: 2300 })
    for (const g of DASH_GROUPS) expect(r.servingsByGroup[g]).toBe(0)
    expect(r.sodiumMg).toBe(0)
    expect(r.satFatG).toBe(0)
    expect(r.potassiumMg).toBe(0)
    expect(r.sodiumOverBudget).toBe(false)
    expect(r.sodiumBudgetMg).toBe(2300)
  })

  it('all 8 groups are always present and default to 0', () => {
    const r = dashProgress([entry({ dash_group: 'vegetables' })], {})
    expect(Object.keys(r.servingsByGroup).sort()).toEqual([...DASH_GROUPS].sort())
    expect(r.servingsByGroup.dairy).toBe(0)
  })

  it('buckets servings by group and sums nutrients under budget', () => {
    const entries: LoggedNutrients[] = [
      entry({ dash_group: 'vegetables', sodium_mg: 300, potassium_mg: 200, sat_fat_g: 0 }),
      entry({ dash_group: 'vegetables', sodium_mg: 200, potassium_mg: 100, sat_fat_g: 0 }),
      entry({ dash_group: 'fruits', sodium_mg: 300, potassium_mg: 150, sat_fat_g: 1 }),
    ]
    const r = dashProgress(entries, { sodium_budget_mg: 2300 })
    expect(r.servingsByGroup.vegetables).toBe(2)
    expect(r.servingsByGroup.fruits).toBe(1)
    expect(r.sodiumMg).toBe(800)
    expect(r.potassiumMg).toBe(450)
    expect(r.satFatG).toBe(1)
    expect(r.sodiumOverBudget).toBe(false)
  })

  it('applies servings as a multiplier to nutrients and buckets', () => {
    const r = dashProgress(
      [entry({ dash_group: 'grains', servings: 2, sodium_mg: 100, fiber_g: 3 })],
      {},
    )
    expect(r.servingsByGroup.grains).toBe(2)
    expect(r.sodiumMg).toBe(200)
  })

  it('crossing the sodium budget flips the flag (boundary: equal is NOT over)', () => {
    const atBudget = dashProgress([entry({ sodium_mg: 2300 })], { sodium_budget_mg: 2300 })
    expect(atBudget.sodiumOverBudget).toBe(false)
    const over = dashProgress([entry({ sodium_mg: 2301 })], { sodium_budget_mg: 2300 })
    expect(over.sodiumOverBudget).toBe(true)
  })

  it('null/undefined budget → never over budget', () => {
    expect(dashProgress([entry({ sodium_mg: 9999 })], {}).sodiumOverBudget).toBe(false)
    expect(
      dashProgress([entry({ sodium_mg: 9999 })], { sodium_budget_mg: null }).sodiumOverBudget,
    ).toBe(false)
  })

  it('missing/null nutrients are treated as 0 and do not throw', () => {
    const entries: LoggedNutrients[] = [
      entry({ dash_group: null, sodium_mg: null, potassium_mg: undefined, sat_fat_g: null }),
      entry({ dash_group: 'dairy' }),
    ]
    const r = dashProgress(entries, { sodium_budget_mg: 2300 })
    expect(r.sodiumMg).toBe(0)
    expect(r.satFatG).toBe(0)
    expect(r.potassiumMg).toBe(0)
    expect(r.servingsByGroup.dairy).toBe(1)
  })

  it('entries with no dash_group still add to sodium but no serving bucket', () => {
    const r = dashProgress([entry({ dash_group: null, sodium_mg: 500 })], {})
    expect(r.sodiumMg).toBe(500)
    for (const g of DASH_GROUPS) expect(r.servingsByGroup[g]).toBe(0)
  })

  it('passes through dash_serving_goals', () => {
    const r = dashProgress([], { dash_serving_goals: { vegetables: 5, fruits: 4 } })
    expect(r.goalsByGroup).toEqual({ vegetables: 5, fruits: 4 })
  })
})
