import { describe, it, expect } from 'vitest'
import {
  recipeRollup,
  rollupBadgeAxes,
  type RollupFood,
  type RollupIngredient,
} from './recipeRollup'
import { lowFodmapSafe } from './lowFodmapSafe'
import { NOOM_DENSITY_THRESHOLDS } from './noomColor'
import type { FodmapLevel } from './types'

/**
 * EXTENDED safety + math hardening for recipeRollup / rollupBadgeAxes.
 *
 * The base file (recipeRollup.test.ts) already covers the 16-combo
 * single-ingredient equivalence and the headline example cases. This file adds
 * PROPERTY-STYLE invariants over combinations of ingredients so a false "safe"
 * can't slip through any path, plus boundary math for the averaged NOOM density.
 * No source is modified here; any failure documents a real bug.
 */

const LEVELS: FodmapLevel[] = ['low', 'moderate', 'high', 'unknown']
const KNOWN_LEVELS: FodmapLevel[] = ['low', 'moderate', 'high']

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

/** Every 2-axis combo as a single linked ingredient (16 of them). */
const ALL_AXIS_COMBOS: RollupIngredient[] = LEVELS.flatMap((fr) =>
  LEVELS.map((fn) => linked(fr, fn)),
)

describe('recipeRollup — headline safety invariant (no false safe)', () => {
  // INVARIANT 1: if ANY ingredient is unlinked (food === null), the recipe can
  // never be reported safe, and the badge axes can never re-derive safe.
  it('any unlinked ingredient => never safe (every base combo + unlinked)', () => {
    for (const base of ALL_AXIS_COMBOS) {
      const r = recipeRollup([base, unlinked])
      expect(r.safety).not.toBe('safe')
      expect(r.isComplete).toBe(false)
      const axes = rollupBadgeAxes(r)
      expect(lowFodmapSafe(axes.fructose, axes.fructans)).not.toBe('safe')
    }
  })

  // INVARIANT 2: if ANY axis on ANY ingredient is unknown, never safe.
  it('any unknown axis => never safe (paired against every base combo)', () => {
    const unknownIngredients: RollupIngredient[] = [
      linked('unknown', 'low'),
      linked('low', 'unknown'),
      linked('unknown', 'unknown'),
    ]
    for (const base of ALL_AXIS_COMBOS) {
      for (const u of unknownIngredients) {
        const r = recipeRollup([base, u])
        expect(r.safety).not.toBe('safe')
        expect(r.isComplete).toBe(false)
        const axes = rollupBadgeAxes(r)
        expect(lowFodmapSafe(axes.fructose, axes.fructans)).not.toBe('safe')
      }
    }
  })

  // INVARIANT 3 (the strong property): across the FULL power-set-ish space of
  // 1-3 ingredients drawn from {all 16 linked combos} U {unlinked}, the ONLY
  // recipes ever marked 'safe' are those where every ingredient is linked AND
  // every axis is low. Equivalently: safe <=> all linked & all-low.
  it('safe IFF every ingredient is linked and every axis is low (3-ingredient space)', () => {
    const pool: RollupIngredient[] = [...ALL_AXIS_COMBOS, unlinked]

    const isAllLinkedAllLow = (ings: RollupIngredient[]): boolean =>
      ings.length > 0 &&
      ings.every(
        (i) =>
          i.food !== null &&
          i.food.fructose_level === 'low' &&
          i.food.fructans_level === 'low',
      )

    // Exhaustive over pairs and a sampled set of triples (full triples = 17^3
    // ~ 4913 combos; we run them all since each call is trivial and pure).
    for (const a of pool) {
      for (const b of pool) {
        const pair = [a, b]
        const safePair = recipeRollup(pair).safety === 'safe'
        expect(safePair).toBe(isAllLinkedAllLow(pair))
        for (const c of pool) {
          const trip = [a, b, c]
          const safeTrip = recipeRollup(trip).safety === 'safe'
          expect(safeTrip).toBe(isAllLinkedAllLow(trip))
        }
      }
    }
  })

  // INVARIANT 4: rollupBadgeAxes can NEVER make a non-safe rollup look safe.
  // (Re-derive safety from the displayed axes; it must not be 'safe' unless the
  // rollup itself is 'safe'.)
  it('badge axes never re-derive safe for a non-safe rollup (full 3-ingredient space)', () => {
    const pool: RollupIngredient[] = [...ALL_AXIS_COMBOS, unlinked]
    for (const a of pool) {
      for (const b of pool) {
        for (const c of pool) {
          const r = recipeRollup([a, b, c])
          const axes = rollupBadgeAxes(r)
          const badgeSafety = lowFodmapSafe(axes.fructose, axes.fructans)
          if (r.safety !== 'safe') {
            expect(badgeSafety).not.toBe('safe')
          }
        }
      }
    }
  })
})

describe('recipeRollup — high dominates unknown / unlinked', () => {
  // For EVERY way an unverifiable ingredient can appear, a single known-high
  // ingredient forces 'avoid' (not the milder 'not-verified').
  it('known-high + any unverifiable ingredient => avoid', () => {
    const unverifiable: RollupIngredient[] = [
      unlinked,
      linked('unknown', 'low'),
      linked('low', 'unknown'),
      linked('unknown', 'unknown'),
    ]
    const highIngredients: RollupIngredient[] = [
      linked('high', 'low'),
      linked('low', 'high'),
      linked('high', 'high'),
      linked('high', 'moderate'),
    ]
    for (const h of highIngredients) {
      for (const u of unverifiable) {
        // order should not matter
        expect(recipeRollup([h, u]).safety).toBe('avoid')
        expect(recipeRollup([u, h]).safety).toBe('avoid')
      }
    }
  })

  it('known-high beats unknown even when the high food itself has the unknown axis', () => {
    // fructose high, fructans unknown on the SAME ingredient: high must win.
    const r = recipeRollup([linked('high', 'unknown')])
    expect(r.safety).toBe('avoid')
  })
})

describe('recipeRollup — worst-case per-axis severity for display', () => {
  // worstAxis among KNOWN levels = true max severity (low<moderate<high),
  // independent of ordering.
  it('reports the max known severity per axis across ingredients', () => {
    for (const x of KNOWN_LEVELS) {
      for (const y of KNOWN_LEVELS) {
        const expected =
          (['low', 'moderate', 'high'] as const).indexOf(x as 'low') >=
          (['low', 'moderate', 'high'] as const).indexOf(y as 'low')
            ? x
            : y
        const r1 = recipeRollup([linked(x, 'low'), linked(y, 'low')])
        const r2 = recipeRollup([linked(y, 'low'), linked(x, 'low')])
        expect(r1.fructoseLevel).toBe(expected)
        expect(r2.fructoseLevel).toBe(expected)
        // fructans axis aggregated independently
        const f1 = recipeRollup([linked('low', x), linked('low', y)])
        expect(f1.fructansLevel).toBe(expected)
      }
    }
  })

  it('unknown wins the display axis over any known level (both orders)', () => {
    for (const k of KNOWN_LEVELS) {
      expect(recipeRollup([linked(k, 'low'), linked('unknown', 'low')]).fructoseLevel).toBe(
        'unknown',
      )
      expect(recipeRollup([linked('unknown', 'low'), linked(k, 'low')]).fructoseLevel).toBe(
        'unknown',
      )
    }
  })

  it('per-axis aggregation is independent (fructose-high + fructans-high on different ingredients)', () => {
    const r = recipeRollup([linked('high', 'low'), linked('low', 'high')])
    expect(r.fructoseLevel).toBe('high')
    expect(r.fructansLevel).toBe('high')
    expect(r.safety).toBe('avoid')
  })
})

describe('recipeRollup — averaged NOOM density math + boundaries', () => {
  // Exact threshold behavior: noomColor is <=1.0 green, <=2.4 yellow, else orange.
  // We construct means that land exactly on the boundaries.
  it('mean exactly at greenMax (1.0) is green (inclusive lower boundary)', () => {
    // densities 0.5 and 1.5 -> mean 1.0
    const r = recipeRollup([
      linked('low', 'low', { calories: 50, serving_grams: 100 }), // 0.5
      linked('low', 'low', { calories: 150, serving_grams: 100 }), // 1.5
    ])
    expect(r.noomColor).toBe('green')
  })

  it('mean just above greenMax is yellow', () => {
    // densities 1.0 and 1.04 -> mean 1.02 > 1.0
    const r = recipeRollup([
      linked('low', 'low', { calories: 100, serving_grams: 100 }), // 1.0
      linked('low', 'low', { calories: 104, serving_grams: 100 }), // 1.04
    ])
    expect(r.noomColor).toBe('yellow')
  })

  it('mean exactly at yellowMax (2.4) is yellow (inclusive)', () => {
    // densities 2.0 and 2.8 -> mean 2.4
    const r = recipeRollup([
      linked('low', 'low', { calories: 200, serving_grams: 100 }), // 2.0
      linked('low', 'low', { calories: 280, serving_grams: 100 }), // 2.8
    ])
    expect(r.noomColor).toBe('yellow')
  })

  it('mean just above yellowMax is orange', () => {
    // densities 2.4 and 2.42 -> mean 2.41 > 2.4
    const r = recipeRollup([
      linked('low', 'low', { calories: 240, serving_grams: 100 }), // 2.4
      linked('low', 'low', { calories: 242, serving_grams: 100 }), // 2.42
    ])
    expect(r.noomColor).toBe('orange')
  })

  it('uses the canonical thresholds (sanity-check the constants are wired)', () => {
    expect(NOOM_DENSITY_THRESHOLDS.greenMax).toBe(1.0)
    expect(NOOM_DENSITY_THRESHOLDS.yellowMax).toBe(2.4)
  })

  // grams <= 0 must be skipped (no divide-by-zero, no NaN, no Infinity color).
  it('ingredient with serving_grams === 0 is skipped (no NaN/Infinity)', () => {
    const r = recipeRollup([
      linked('low', 'low', { calories: 100, serving_grams: 0 }), // skipped
      linked('low', 'low', { calories: 50, serving_grams: 100 }), // 0.5 -> green
    ])
    expect(r.usableForDensityCount).toBe(1)
    expect(r.noomColor).toBe('green')
  })

  it('ingredient with negative serving_grams is skipped', () => {
    const r = recipeRollup([
      linked('low', 'low', { calories: 100, serving_grams: -5 }),
      linked('low', 'low', { calories: 50, serving_grams: 100 }),
    ])
    expect(r.usableForDensityCount).toBe(1)
    expect(r.noomColor).toBe('green')
  })

  it('ingredient with negative calories is skipped', () => {
    const r = recipeRollup([
      linked('low', 'low', { calories: -100, serving_grams: 100 }),
      linked('low', 'low', { calories: 50, serving_grams: 100 }),
    ])
    expect(r.usableForDensityCount).toBe(1)
    expect(r.noomColor).toBe('green')
  })

  it('non-finite calories/grams are skipped (NaN, Infinity)', () => {
    const r = recipeRollup([
      linked('low', 'low', { calories: Number.NaN, serving_grams: 100 }),
      linked('low', 'low', { calories: 100, serving_grams: Number.POSITIVE_INFINITY }),
      linked('low', 'low', { calories: 50, serving_grams: 100 }), // 0.5 only usable
    ])
    expect(r.usableForDensityCount).toBe(1)
    expect(r.noomColor).toBe('green')
  })

  it('only zero-grams ingredients => no usable density => null color (not NaN color)', () => {
    const r = recipeRollup([
      linked('low', 'low', { calories: 100, serving_grams: 0 }),
      linked('low', 'low', { calories: 200, serving_grams: 0 }),
    ])
    expect(r.usableForDensityCount).toBe(0)
    expect(r.noomColor).toBeNull()
  })

  it('density averaging ignores unlinked ingredients entirely', () => {
    const r = recipeRollup([
      linked('low', 'low', { calories: 50, serving_grams: 100 }), // 0.5
      unlinked,
      unlinked,
    ])
    expect(r.usableForDensityCount).toBe(1)
    expect(r.noomColor).toBe('green')
    // but unlinked still drives safety away from safe
    expect(r.safety).toBe('not-verified')
  })
})

describe('recipeRollup — counts and completeness bookkeeping', () => {
  it('linked/unlinked counts tally correctly in a mixed recipe', () => {
    const r = recipeRollup([
      linked('low', 'low'),
      linked('moderate', 'low'),
      unlinked,
      unlinked,
    ])
    expect(r.linkedCount).toBe(2)
    expect(r.unlinkedCount).toBe(2)
    expect(r.isComplete).toBe(false)
  })

  it('isComplete requires non-empty, all-linked, no-unknown (not necessarily safe)', () => {
    // all linked, no unknown, but contains high => complete yet avoid.
    const r = recipeRollup([linked('high', 'low'), linked('moderate', 'low')])
    expect(r.isComplete).toBe(true)
    expect(r.safety).toBe('avoid')
  })

  it('a single unknown axis breaks completeness even with all ingredients linked', () => {
    const r = recipeRollup([linked('low', 'low'), linked('low', 'unknown')])
    expect(r.linkedCount).toBe(2)
    expect(r.unlinkedCount).toBe(0)
    expect(r.isComplete).toBe(false)
  })
})
