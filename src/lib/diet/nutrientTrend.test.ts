import { describe, it, expect } from 'vitest'
import { nutrientTrend, type DatedNutrients } from './nutrientTrend'

const e = (p: Partial<DatedNutrients>): DatedNutrients => ({
  date: '2026-07-01',
  meal: 'lunch',
  servings: 1,
  ...p,
})

describe('nutrientTrend', () => {
  it('totals calories/sodium/potassium/sat-fat/fiber per day', () => {
    const out = nutrientTrend(
      [
        e({ date: '2026-07-01', calories: 200, sodium_mg: 300, potassium_mg: 200, sat_fat_g: 2, fiber_g: 4 }),
        e({ date: '2026-07-01', calories: 150, sodium_mg: 200, potassium_mg: 100, sat_fat_g: 1, fiber_g: 3 }),
        e({ date: '2026-07-02', calories: 500, sodium_mg: 500, potassium_mg: 400, sat_fat_g: 3, fiber_g: 6 }),
      ],
      ['2026-07-01', '2026-07-02'],
    )
    expect(out[0]).toEqual({
      date: '2026-07-01',
      calories: 350,
      sodiumMg: 500,
      potassiumMg: 300,
      satFatG: 3,
      fiberG: 7,
    })
    expect(out[1].sodiumMg).toBe(500)
    expect(out[1].calories).toBe(500)
  })

  it('scales calories and fiber by servings', () => {
    const [day] = nutrientTrend(
      [e({ servings: 3, calories: 100, fiber_g: 2 })],
      ['2026-07-01'],
    )
    expect(day.calories).toBe(300)
    expect(day.fiberG).toBe(6)
  })

  it('applies servings as a multiplier (matches dashProgress)', () => {
    const [day] = nutrientTrend(
      [e({ servings: 2, sodium_mg: 100, potassium_mg: 50 })],
      ['2026-07-01'],
    )
    expect(day.sodiumMg).toBe(200)
    expect(day.potassiumMg).toBe(100)
  })

  it('fills days with no entries as zeros, preserving the requested order', () => {
    const out = nutrientTrend(
      [e({ date: '2026-07-03', sodium_mg: 900 })],
      ['2026-07-01', '2026-07-02', '2026-07-03'],
    )
    expect(out.map((d) => d.date)).toEqual(['2026-07-01', '2026-07-02', '2026-07-03'])
    expect(out[0]).toEqual({
      date: '2026-07-01',
      calories: 0,
      sodiumMg: 0,
      potassiumMg: 0,
      satFatG: 0,
      fiberG: 0,
    })
    expect(out[2].sodiumMg).toBe(900)
  })

  it('ignores entries whose date is outside the requested window', () => {
    const out = nutrientTrend(
      [e({ date: '2026-06-01', sodium_mg: 999 }), e({ date: '2026-07-01', sodium_mg: 100 })],
      ['2026-07-01'],
    )
    expect(out).toHaveLength(1)
    expect(out[0].sodiumMg).toBe(100)
  })

  it('empty input → all-zero days', () => {
    expect(nutrientTrend([], ['2026-07-01'])).toEqual([
      { date: '2026-07-01', calories: 0, sodiumMg: 0, potassiumMg: 0, satFatG: 0, fiberG: 0 },
    ])
  })
})
