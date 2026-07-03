import { describe, it, expect } from 'vitest'
import { nutrientTrend, type DatedNutrients } from './nutrientTrend'

const e = (p: Partial<DatedNutrients>): DatedNutrients => ({
  date: '2026-07-01',
  meal: 'lunch',
  servings: 1,
  ...p,
})

describe('nutrientTrend', () => {
  it('totals sodium/potassium/sat-fat per day', () => {
    const out = nutrientTrend(
      [
        e({ date: '2026-07-01', sodium_mg: 300, potassium_mg: 200, sat_fat_g: 2 }),
        e({ date: '2026-07-01', sodium_mg: 200, potassium_mg: 100, sat_fat_g: 1 }),
        e({ date: '2026-07-02', sodium_mg: 500, potassium_mg: 400, sat_fat_g: 3 }),
      ],
      ['2026-07-01', '2026-07-02'],
    )
    expect(out[0]).toEqual({
      date: '2026-07-01',
      sodiumMg: 500,
      potassiumMg: 300,
      satFatG: 3,
    })
    expect(out[1].sodiumMg).toBe(500)
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
    expect(out[0]).toEqual({ date: '2026-07-01', sodiumMg: 0, potassiumMg: 0, satFatG: 0 })
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
      { date: '2026-07-01', sodiumMg: 0, potassiumMg: 0, satFatG: 0 },
    ])
  })
})
