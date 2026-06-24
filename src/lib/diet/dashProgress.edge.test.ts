import { describe, it, expect } from 'vitest'
import { dashProgress, DASH_GROUPS, type LoggedNutrients } from './dashProgress'

function entry(over: Partial<LoggedNutrients>): LoggedNutrients {
  return { meal: 'lunch', servings: 1, ...over }
}

describe('dashProgress — edge cases (extends dashProgress.test.ts)', () => {
  it('servings multiplier is applied to sodium, satFat, AND potassium (not just sodium)', () => {
    const r = dashProgress(
      [entry({ dash_group: 'meat-poultry-fish', servings: 3, sodium_mg: 100, sat_fat_g: 2, potassium_mg: 50 })],
      {},
    )
    expect(r.servingsByGroup['meat-poultry-fish']).toBe(3)
    expect(r.sodiumMg).toBe(300)
    expect(r.satFatG).toBe(6)
    expect(r.potassiumMg).toBe(150)
  })

  it('servings multiplier applies to serving COUNT as well as nutrients', () => {
    const r = dashProgress([entry({ dash_group: 'fruits', servings: 2.5, potassium_mg: 40 })], {})
    expect(r.servingsByGroup.fruits).toBe(2.5)
    expect(r.potassiumMg).toBe(100)
  })

  it.each([
    // [sodiumTotal, budget, expectedOver]  — boundary table
    [2300, 2300, false], // exactly at budget → NOT over
    [2299, 2300, false], // under → not over
    [2301, 2300, true], // strictly over → over
    [0, 0, false], // at a zero budget → not over (0 > 0 is false)
    [1, 0, true], // over a zero budget → over
  ] as const)(
    'sodium %img vs budget %img → over=%s',
    (sodium, budget, expectedOver) => {
      const r = dashProgress([entry({ sodium_mg: sodium })], { sodium_budget_mg: budget })
      expect(r.sodiumOverBudget).toBe(expectedOver)
      expect(r.sodiumBudgetMg).toBe(budget)
    },
  )

  it('a zero sodium budget is a real budget, not "no budget"', () => {
    const r = dashProgress([entry({ sodium_mg: 10 })], { sodium_budget_mg: 0 })
    expect(r.sodiumBudgetMg).toBe(0)
    expect(r.sodiumOverBudget).toBe(true)
  })

  it.each([
    [null],
    [undefined],
    [NaN],
    [Infinity],
  ] as const)('non-finite/null sodium budget (%s) → never over budget', (budget) => {
    const r = dashProgress([entry({ sodium_mg: 9999 })], {
      sodium_budget_mg: budget as number | null | undefined,
    })
    expect(r.sodiumBudgetMg).toBeNull()
    expect(r.sodiumOverBudget).toBe(false)
  })

  it('multiple entries with no dash_group all contribute nutrients but no serving bucket', () => {
    const r = dashProgress(
      [
        entry({ dash_group: null, sodium_mg: 200, sat_fat_g: 1, potassium_mg: 30 }),
        entry({ dash_group: undefined, sodium_mg: 300, sat_fat_g: 2, potassium_mg: 70, servings: 2 }),
      ],
      { sodium_budget_mg: 2300 },
    )
    // 200 + 300×2 = 800 ; satfat 1 + 2×2 = 5 ; potassium 30 + 70×2 = 170
    expect(r.sodiumMg).toBe(800)
    expect(r.satFatG).toBe(5)
    expect(r.potassiumMg).toBe(170)
    for (const g of DASH_GROUPS) expect(r.servingsByGroup[g]).toBe(0)
  })

  it('mixed dash_group and no-group entries: only grouped servings bucket, all sodium counts', () => {
    const r = dashProgress(
      [
        entry({ dash_group: 'vegetables', sodium_mg: 100 }),
        entry({ dash_group: null, sodium_mg: 400 }),
        entry({ dash_group: 'vegetables', sodium_mg: 100, servings: 2 }),
      ],
      {},
    )
    expect(r.servingsByGroup.vegetables).toBe(3) // 1 + 2
    expect(r.sodiumMg).toBe(700) // 100 + 400 + 200
  })

  it('non-finite/null nutrients coerce to 0 across all totals', () => {
    const r = dashProgress(
      [
        entry({
          dash_group: 'dairy',
          sodium_mg: NaN,
          sat_fat_g: Infinity,
          potassium_mg: null,
        }),
      ],
      {},
    )
    expect(r.sodiumMg).toBe(0)
    expect(r.satFatG).toBe(0)
    expect(r.potassiumMg).toBe(0)
    expect(r.servingsByGroup.dairy).toBe(1)
  })

  it('non-finite servings coerce to 0 (no NaN leak into buckets or nutrients)', () => {
    const r = dashProgress(
      [entry({ dash_group: 'grains', servings: NaN, sodium_mg: 100 })],
      {},
    )
    expect(r.servingsByGroup.grains).toBe(0)
    expect(r.sodiumMg).toBe(0)
  })

  it('empty log → all zeros, null budget passthrough, empty goals', () => {
    const r = dashProgress([], {})
    for (const g of DASH_GROUPS) expect(r.servingsByGroup[g]).toBe(0)
    expect(r.sodiumMg).toBe(0)
    expect(r.satFatG).toBe(0)
    expect(r.potassiumMg).toBe(0)
    expect(r.sodiumBudgetMg).toBeNull()
    expect(r.sodiumOverBudget).toBe(false)
    expect(r.goalsByGroup).toEqual({})
  })

  it('fiber_g on an entry never appears in DASH output (DASH does not track fiber)', () => {
    const r = dashProgress([entry({ dash_group: 'grains', fiber_g: 99 })], {})
    expect(Object.keys(r)).not.toContain('fiberG')
    expect(Object.keys(r)).not.toContain('fiber_g')
  })
})
