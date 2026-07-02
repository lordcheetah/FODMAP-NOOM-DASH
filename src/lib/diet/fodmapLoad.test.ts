import { describe, it, expect } from 'vitest'
import {
  fodmapMealLoad,
  recipeAxisLevel,
  FODMAP_LOAD_WEIGHT,
  type FodmapStackInput,
} from './fodmapLoad'
import type { FodmapLevel, MealType } from './types'

const item = (p: Partial<FodmapStackInput>): FodmapStackInput => ({
  meal: 'lunch',
  servings: 1,
  fructoseLevel: 'low',
  fructansLevel: 'low',
  ...p,
})

/** Pull the single meal's result out for terse assertions. */
function oneMeal(inputs: FodmapStackInput[], meal: MealType = 'lunch') {
  return fodmapMealLoad(inputs).find((m) => m.meal === meal)!
}

describe('fodmapMealLoad — stacking within a meal', () => {
  it('a single low serving stays low', () => {
    const m = oneMeal([item({ fructansLevel: 'low' })])
    expect(m.fructans.level).toBe('low')
    expect(m.flagged).toBe(false)
  })

  it('a single high food reads high', () => {
    const m = oneMeal([item({ fructansLevel: 'high' })])
    expect(m.fructans.level).toBe('high')
    expect(m.fructans.load).toBe(FODMAP_LOAD_WEIGHT.high)
    expect(m.flagged).toBe(true)
  })

  it('stacks individually-tolerable servings past a threshold', () => {
    // low + low + moderate on fructans = 1 + 1 + 4 = 6 > 3 → moderate
    const m = oneMeal([
      item({ fructansLevel: 'low' }),
      item({ fructansLevel: 'low' }),
      item({ fructansLevel: 'moderate' }),
    ])
    expect(m.fructans.load).toBe(6)
    expect(m.fructans.level).toBe('moderate')
  })

  it('two moderates stack toward high', () => {
    // 4 + 4 = 8 → still moderate (≤ 8); a third tips to high
    expect(
      oneMeal([item({ fructansLevel: 'moderate' }), item({ fructansLevel: 'moderate' })])
        .fructans.level,
    ).toBe('moderate')
    expect(
      oneMeal([
        item({ fructansLevel: 'moderate' }),
        item({ fructansLevel: 'moderate' }),
        item({ fructansLevel: 'moderate' }),
      ]).fructans.level,
    ).toBe('high')
  })

  it('scales load by servings', () => {
    // 4 servings of a low food = load 4 → past the low threshold (3) → moderate
    expect(oneMeal([item({ fructansLevel: 'low', servings: 4 })]).fructans.level).toBe(
      'moderate',
    )
  })

  it('coerces missing/invalid servings to 1', () => {
    const m = oneMeal([item({ fructansLevel: 'moderate', servings: 0 })])
    expect(m.fructans.load).toBe(FODMAP_LOAD_WEIGHT.moderate)
  })

  it('tracks fructose and fructans independently', () => {
    const m = oneMeal([item({ fructoseLevel: 'high', fructansLevel: 'low' })])
    expect(m.fructose.level).toBe('high')
    expect(m.fructans.level).toBe('low')
  })
})

describe('fodmapMealLoad — unknown propagation (never coerces to safe)', () => {
  it('an unknown-only axis is unknown, not low', () => {
    const m = oneMeal([item({ fructansLevel: 'unknown' })])
    expect(m.fructans.level).toBe('unknown')
    expect(m.fructans.load).toBe(0)
    expect(m.fructans.hasUnknown).toBe(true)
    expect(m.flagged).toBe(true)
  })

  it('low known + unknown reports unknown (true load may be higher)', () => {
    const m = oneMeal([item({ fructansLevel: 'low' }), item({ fructansLevel: 'unknown' })])
    expect(m.fructans.knownLevel).toBe('low')
    expect(m.fructans.level).toBe('unknown')
  })

  it('known-high + unknown stays high (unknown cannot strengthen the top warning)', () => {
    const m = oneMeal([
      item({ fructansLevel: 'high' }),
      item({ fructansLevel: 'unknown' }),
    ])
    expect(m.fructans.level).toBe('high')
    expect(m.fructans.hasUnknown).toBe(true)
  })
})

describe('fodmapMealLoad — grouping', () => {
  it('groups by meal and returns canonical order', () => {
    const out = fodmapMealLoad([
      item({ meal: 'dinner', fructansLevel: 'high' }),
      item({ meal: 'breakfast', fructoseLevel: 'high' }),
    ])
    expect(out.map((m) => m.meal)).toEqual(['breakfast', 'dinner'])
  })

  it('omits meals with no items and empty input', () => {
    expect(fodmapMealLoad([])).toEqual([])
    expect(fodmapMealLoad([item({ meal: 'snack' })]).map((m) => m.meal)).toEqual(['snack'])
  })
})

describe('recipeAxisLevel — roll-up bridge', () => {
  const cases: [FodmapLevel, boolean, FodmapLevel][] = [
    ['high', false, 'high'], // known-high dominates even when incomplete
    ['high', true, 'high'],
    ['unknown', true, 'unknown'],
    ['low', false, 'unknown'], // unlinked ingredient → can't verify low
    ['moderate', false, 'unknown'],
    ['low', true, 'low'], // fully verified low passes through
    ['moderate', true, 'moderate'],
  ]
  it.each(cases)('(%s, complete=%s) -> %s', (level, complete, expected) => {
    expect(recipeAxisLevel(level, complete)).toBe(expected)
  })
})
