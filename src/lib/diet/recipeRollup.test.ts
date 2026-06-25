import { describe, it, expect } from 'vitest'
import {
  recipeRollup,
  rollupBadgeAxes,
  type RollupFood,
  type RollupIngredient,
} from './recipeRollup'
import { lowFodmapSafe } from './lowFodmapSafe'
import type { FodmapLevel } from './types'

const LEVELS: FodmapLevel[] = ['low', 'moderate', 'high', 'unknown']

/** Build a linked ingredient with the given axes (no usable density by default). */
function linked(
  fructose_level: FodmapLevel,
  fructans_level: FodmapLevel,
  food: Partial<RollupFood> = {},
): RollupIngredient {
  return {
    food_id: 'f',
    food: {
      fructose_level,
      fructans_level,
      calories: null,
      serving_grams: null,
      ...food,
    },
  }
}

const unlinked: RollupIngredient = { food_id: null, food: null }

describe('recipeRollup — FODMAP safety aggregation', () => {
  // The provable-consistency guard the plan requires: a SINGLE linked ingredient
  // must agree with the established lowFodmapSafe across all 16 axis combos.
  //
  // Caveat (D2 "high dominates unknown"): lowFodmapSafe checks unknown FIRST, so
  // it returns 'not-verified' for {high, unknown}. recipeRollup checks known-high
  // FIRST (a known-high ingredient is unsafe regardless of other gaps) and returns
  // 'avoid'. That divergence is intentional and exercised explicitly below; here
  // we assert equality on every combo EXCEPT the two where one axis is high and
  // the other unknown, and that recipeRollup is at least as conservative there.
  it('single linked ingredient equals lowFodmapSafe for all 16 combos (high-dominates-unknown aside)', () => {
    const moreSevere: Record<string, number> = {
      safe: 0,
      caution: 1,
      'not-verified': 2,
      avoid: 3,
    }
    for (const fructose of LEVELS) {
      for (const fructans of LEVELS) {
        const r = recipeRollup([linked(fructose, fructans)])
        expect(r.fructoseLevel).toBe(fructose)
        expect(r.fructansLevel).toBe(fructans)

        const expected = lowFodmapSafe(fructose, fructans)
        const isHighWithUnknown =
          (fructose === 'high' && fructans === 'unknown') ||
          (fructose === 'unknown' && fructans === 'high')
        if (isHighWithUnknown) {
          // D2: known-high wins; roll-up reports avoid, never the milder not-verified.
          expect(r.safety).toBe('avoid')
          expect(moreSevere[r.safety]).toBeGreaterThanOrEqual(moreSevere[expected])
        } else {
          expect(r.safety).toBe(expected)
        }
      }
    }
  })

  it('known high dominates an unlinked (unknown) ingredient -> avoid', () => {
    const r = recipeRollup([linked('high', 'low'), unlinked])
    expect(r.safety).toBe('avoid')
    expect(r.unlinkedCount).toBe(1)
  })

  it('known high dominates an unknown axis -> avoid', () => {
    const r = recipeRollup([linked('high', 'low'), linked('unknown', 'low')])
    expect(r.safety).toBe('avoid')
  })

  it('an unlinked ingredient with otherwise-safe foods -> not-verified, never safe', () => {
    const r = recipeRollup([linked('low', 'low'), unlinked])
    expect(r.safety).toBe('not-verified')
    expect(r.unlinkedCount).toBe(1)
    expect(r.linkedCount).toBe(1)
    expect(r.isComplete).toBe(false)
  })

  it('an unknown axis with otherwise-safe foods -> not-verified', () => {
    const r = recipeRollup([linked('low', 'low'), linked('low', 'unknown')])
    expect(r.safety).toBe('not-verified')
    expect(r.fructansLevel).toBe('unknown')
    expect(r.isComplete).toBe(false)
  })

  it('all low and all linked -> safe and complete', () => {
    const r = recipeRollup([linked('low', 'low'), linked('low', 'low')])
    expect(r.safety).toBe('safe')
    expect(r.unlinkedCount).toBe(0)
    expect(r.isComplete).toBe(true)
  })

  it('moderate (no high/unknown/unlinked) -> caution', () => {
    const r = recipeRollup([linked('low', 'low'), linked('moderate', 'low')])
    expect(r.safety).toBe('caution')
    expect(r.fructoseLevel).toBe('moderate')
    expect(r.isComplete).toBe(true)
  })

  it('empty ingredient list -> not-verified default, never safe', () => {
    const r = recipeRollup([])
    expect(r.safety).toBe('not-verified')
    expect(r.noomColor).toBeNull()
    expect(r.linkedCount).toBe(0)
    expect(r.unlinkedCount).toBe(0)
    expect(r.usableForDensityCount).toBe(0)
    expect(r.isComplete).toBe(false)
  })

  it('worst-case axis tracks unknown over known levels for display', () => {
    const r = recipeRollup([linked('low', 'low'), linked('unknown', 'moderate')])
    expect(r.fructoseLevel).toBe('unknown')
    expect(r.fructansLevel).toBe('moderate')
  })
})

describe('rollupBadgeAxes — badge agrees with rollup.safety', () => {
  // The badge maps axes -> safety via lowFodmapSafe, so the coerced axes must
  // re-derive the SAME safety the roll-up reported. This is the health-critical
  // guard against a "not verified" recipe rendering as "Safe".
  it('coerced axes re-derive the rollup safety for an unlinked-but-low recipe', () => {
    const rollup = recipeRollup([linked('low', 'low'), unlinked])
    expect(rollup.safety).toBe('not-verified')
    const axes = rollupBadgeAxes(rollup)
    expect(lowFodmapSafe(axes.fructose, axes.fructans)).toBe('not-verified')
  })

  it('leaves axes untouched when they already imply the same safety', () => {
    const safe = rollupBadgeAxes(recipeRollup([linked('low', 'low')]))
    expect(lowFodmapSafe(safe.fructose, safe.fructans)).toBe('safe')

    const avoid = rollupBadgeAxes(recipeRollup([linked('high', 'low'), unlinked]))
    expect(lowFodmapSafe(avoid.fructose, avoid.fructans)).toBe('avoid')

    const caution = rollupBadgeAxes(recipeRollup([linked('moderate', 'low')]))
    expect(lowFodmapSafe(caution.fructose, caution.fructans)).toBe('caution')
  })
})

describe('recipeRollup — NOOM averaged density', () => {
  it('averages per-ingredient densities and runs through noomColor thresholds', () => {
    // densities 0.5 and 2.0 -> mean 1.25 -> yellow (>1.0, <=2.4)
    const r = recipeRollup([
      linked('low', 'low', { calories: 50, serving_grams: 100 }), // 0.5
      linked('low', 'low', { calories: 200, serving_grams: 100 }), // 2.0
    ])
    expect(r.noomColor).toBe('yellow')
    expect(r.usableForDensityCount).toBe(2)
  })

  it('skips ingredients lacking usable calories+grams when averaging', () => {
    // Only the 0.5-density ingredient counts -> green.
    const r = recipeRollup([
      linked('low', 'low', { calories: 50, serving_grams: 100 }), // 0.5
      linked('low', 'low', { calories: 500, serving_grams: null }), // skipped
      linked('low', 'low'), // skipped (both null)
    ])
    expect(r.noomColor).toBe('green')
    expect(r.usableForDensityCount).toBe(1)
  })

  it('returns null NOOM color when no ingredient is usable for density', () => {
    const r = recipeRollup([linked('low', 'low'), unlinked])
    expect(r.noomColor).toBeNull()
    expect(r.usableForDensityCount).toBe(0)
  })

  it('zero-calorie usable ingredient counts and yields green', () => {
    const r = recipeRollup([linked('low', 'low', { calories: 0, serving_grams: 240 })])
    expect(r.usableForDensityCount).toBe(1)
    expect(r.noomColor).toBe('green')
  })

  it('high-density ingredient pushes the mean to orange', () => {
    const r = recipeRollup([linked('low', 'low', { calories: 900, serving_grams: 100 })])
    expect(r.noomColor).toBe('orange')
  })
})
