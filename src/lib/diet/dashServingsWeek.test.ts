import { describe, it, expect } from 'vitest'
import { dashServingsWeek } from './dashServingsWeek'
import type { DatedNutrients } from './nutrientTrend'

const e = (p: Partial<DatedNutrients>): DatedNutrients => ({
  date: '2026-07-01',
  meal: 'lunch',
  servings: 1,
  ...p,
})

/** Find one group's row for terse assertions. */
function group(rows: ReturnType<typeof dashServingsWeek>, g: string) {
  return rows.find((r) => r.group === g)!
}

describe('dashServingsWeek', () => {
  it('returns all 8 groups in canonical order', () => {
    const rows = dashServingsWeek([], ['2026-07-01'], {})
    expect(rows.map((r) => r.group)).toEqual([
      'grains',
      'vegetables',
      'fruits',
      'dairy',
      'meat-poultry-fish',
      'nuts-seeds-legumes',
      'fats-oils',
      'sweets',
    ])
  })

  it('totals servings per group and averages over the whole window', () => {
    const dates = ['2026-07-01', '2026-07-02']
    const rows = dashServingsWeek(
      [
        e({ date: '2026-07-01', dash_group: 'vegetables', servings: 2 }),
        e({ date: '2026-07-02', dash_group: 'vegetables', servings: 4 }),
        e({ date: '2026-07-01', dash_group: 'fruits', servings: 1 }),
      ],
      dates,
      {},
    )
    const veg = group(rows, 'vegetables')
    expect(veg.total).toBe(6)
    expect(veg.avgPerDay).toBe(3) // 6 servings / 2 days
    const fruits = group(rows, 'fruits')
    expect(fruits.total).toBe(1)
    expect(fruits.avgPerDay).toBe(0.5)
  })

  it('empty days drag the average down (counted as 0)', () => {
    const veg = group(
      dashServingsWeek(
        [e({ date: '2026-07-03', dash_group: 'vegetables', servings: 7 })],
        ['2026-07-01', '2026-07-02', '2026-07-03'],
        {},
      ),
      'vegetables',
    )
    expect(veg.total).toBe(7)
    expect(veg.avgPerDay).toBeCloseTo(7 / 3, 5)
  })

  it('passes through the daily goal per group', () => {
    const rows = dashServingsWeek([], ['2026-07-01'], { vegetables: 5, fruits: 4 })
    expect(group(rows, 'vegetables').dailyGoal).toBe(5)
    expect(group(rows, 'fruits').dailyGoal).toBe(4)
    expect(group(rows, 'grains').dailyGoal).toBeNull()
  })

  it('ignores entries outside the window and foods with no group', () => {
    const rows = dashServingsWeek(
      [
        e({ date: '2026-06-01', dash_group: 'grains', servings: 9 }),
        e({ date: '2026-07-01', dash_group: null, servings: 3 }),
      ],
      ['2026-07-01'],
      {},
    )
    expect(group(rows, 'grains').total).toBe(0)
  })
})
