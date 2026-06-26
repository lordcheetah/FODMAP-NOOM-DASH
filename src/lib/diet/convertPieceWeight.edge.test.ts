import { describe, it, expect } from 'vitest'
import { toGrams, type NormalizedUnit } from './convert'

/**
 * Edge hardening for the COUNT-fallback piece-weight branch of `toGrams`, the
 * path added in Phase 3. EXTENDS convert.edge.test.ts (which never exercises the
 * `food.name` fallback). Focus:
 *   - a count noun that does NOT match the food serving but HAS a table entry ->
 *     grams = quantity * gramsPerPiece, INDEPENDENT of serving_grams,
 *   - `food.name` omitted -> branch skipped -> null (no silent guess),
 *   - when the noun DOES match the food serving, the existing same-noun path wins
 *     (NO double application of the piece weight / no regression),
 *   - a count noun with neither a serving match nor a table entry -> null,
 *   - never NaN/Infinity/<=0 — only a positive finite number or null.
 *
 * NUTRITION accuracy only; FODMAP roll-up is untouched (no grams there).
 */

// The real foods.json shapes for the targeted produce: all have VOLUME or
// wedge servings, so the ingredient's piece noun (small/medium/head/plum/
// scallion/lime) genuinely does NOT match -> exercises the fallback table.
const ONION = { name: 'Onion, raw', serving_desc: '1/2 cup chopped', serving_grams: 80 }
const CARROT = { name: 'Carrot', serving_desc: '1/2 cup chopped', serving_grams: 64 }
const SCALLION = {
  name: 'Scallion/green onion, white part',
  serving_desc: '2 tbsp sliced',
  serving_grams: 12,
}
const TOMATO = { name: 'Tomato, fresh', serving_desc: '1/2 cup chopped', serving_grams: 90 }
const LIME = { name: 'Lime, whole/wedge', serving_desc: '1 wedge', serving_grams: 7 }
const LETTUCE = {
  name: 'Butter/Boston bibb lettuce',
  serving_desc: '1 cup (leaves)',
  serving_grams: 50,
}
const BELL = { name: 'Bell pepper, red', serving_desc: '1/2 cup chopped', serving_grams: 75 }
const CUCUMBER = { name: 'Cucumber', serving_desc: '1 cup sliced', serving_grams: 104 }

describe('toGrams — piece-weight fallback hits (qty * gramsPerPiece, cited)', () => {
  const cases: Array<[string, number, NormalizedUnit, typeof ONION, number]> = [
    ['onion small', 1, 'small', ONION, 70],
    ['onion 2 medium', 2, 'medium', ONION, 220],
    ['onion 0.5 large', 0.5, 'large', ONION, 75],
    ['carrot 2 medium (lettuce-wraps case)', 2, 'medium', CARROT, 122],
    ['carrot 1 large', 1, 'large', CARROT, 72],
    ['scallion x2 (frittata case)', 2, 'scallion', SCALLION, 30],
    ['tomato 4 plum (tabbouleh case)', 4, 'plum', TOMATO, 248],
    ['lime 1 whole', 1, 'lime', LIME, 67],
    ['lettuce 1 head (wrap case)', 1, 'head', LETTUCE, 163],
    ['lettuce 3 leaf', 3, 'leaf', LETTUCE, 22.5],
    ['bell pepper 1 small', 1, 'small', BELL, 74],
    ['cucumber 1 small', 1, 'small', CUCUMBER, 158],
  ]
  it.each(cases)('%s -> %s g', (_label, qty, unit, food, expected) => {
    const g = toGrams(qty, unit, food)
    expect(g).not.toBeNull()
    expect(g as number).toBeCloseTo(expected, 5)
  })

  it('piece weight is INDEPENDENT of serving_grams (whole-piece, not scaled)', () => {
    // Same onion, same "1 small", arbitrary differing serving_grams -> still 70 g.
    const a = toGrams(1, 'small', { name: 'Onion, raw', serving_desc: '1/2 cup chopped', serving_grams: 80 })
    const b = toGrams(1, 'small', { name: 'Onion, raw', serving_desc: '1/2 cup chopped', serving_grams: 200 })
    expect(a).toBeCloseTo(70, 6)
    expect(b).toBeCloseTo(70, 6)
  })
})

describe('toGrams — fallback requires food.name (no silent guess)', () => {
  it('name omitted -> null even though the table HAS an entry', () => {
    // Strip name; the volume serving can\'t bridge a "small" count -> null.
    expect(toGrams(1, 'small', { serving_desc: '1/2 cup chopped', serving_grams: 80 })).toBeNull()
    expect(toGrams(2, 'medium', { serving_desc: '1/2 cup chopped', serving_grams: 64 })).toBeNull()
  })

  it('name present but NOT in the table -> null', () => {
    expect(
      toGrams(1, 'small', { name: 'Mystery Veg', serving_desc: '1/2 cup chopped', serving_grams: 80 }),
    ).toBeNull()
  })

  it('name + food in table but noun NOT cited for that food -> null', () => {
    // onion has no "head"; carrot has no "small"; cucumber has no "large".
    expect(toGrams(1, 'head', ONION)).toBeNull()
    expect(toGrams(1, 'small', CARROT)).toBeNull()
    expect(toGrams(1, 'large', CUCUMBER)).toBeNull()
  })
})

describe('toGrams — same-noun serving path WINS over the piece table (no double count)', () => {
  it('count serving that matches the noun uses the serving bridge, not the table', () => {
    // A hypothetical food served "1 medium (50 g)" linked to the carrot NAME:
    // the matching-noun path must scale by serving_grams (50), NOT use the table
    // carrot-medium 61 g. This proves the fallback never shadows a real match.
    const f = { name: 'Carrot', serving_desc: '1 medium', serving_grams: 50 }
    const g = toGrams(2, 'medium', f) as number
    expect(g).toBeCloseTo(100, 5) // 2 * 50 (serving bridge), not 2 * 61
    expect(g).not.toBeCloseTo(122, 1)
  })

  it('generic "count" ingredient against a count serving bridges (table not consulted)', () => {
    const f = { name: 'Onion, raw', serving_desc: '1 medium', serving_grams: 90 }
    // generic count matches single-piece count serving -> 90, not table 110.
    expect(toGrams(1, 'count', f)).toBeCloseTo(90, 5)
  })

  it('weight unit ignores both serving and the piece table', () => {
    // 100 g stays 100 g even with an onion name + a small-capable table entry.
    expect(toGrams(100, 'g', ONION)).toBeCloseTo(100, 6)
  })
})

describe('toGrams — fallback misses all return null (never NaN/0/Infinity)', () => {
  const nullCases: Array<[string, number | null]> = [
    // table food but the serving is volume AND noun absent from table
    ['onion "wedge" (not cited)', toGrams(1, 'wedge', ONION)],
    // qty guards still apply on the fallback path
    ['qty 0', toGrams(0, 'small', ONION)],
    ['qty negative', toGrams(-1, 'small', ONION)],
    ['qty NaN', toGrams(Number.NaN, 'small', ONION)],
    ['qty Infinity', toGrams(Number.POSITIVE_INFINITY, 'small', ONION)],
    // serving_grams guard runs BEFORE the fallback (count is not weight); even a
    // table-backed name returns null when serving_grams is unusable, because the
    // function bails on serving_grams before reaching the count branch.
    ['serving_grams null', toGrams(1, 'small', { name: 'Onion, raw', serving_desc: '1/2 cup chopped', serving_grams: null })],
    ['serving_grams 0', toGrams(1, 'small', { name: 'Onion, raw', serving_desc: '1/2 cup chopped', serving_grams: 0 })],
  ]
  it.each(nullCases)('%s -> null', (_label, result) => {
    expect(result).toBeNull()
  })
})

describe('PROPERTY: piece-weight fallback never yields NaN/Inf/<=0', () => {
  it('sweep of table foods x nouns x quantities is positive-finite or null', () => {
    const foods = [ONION, CARROT, SCALLION, TOMATO, LIME, LETTUCE, BELL, CUCUMBER]
    const nouns: NormalizedUnit[] = [
      'small', 'medium', 'large', 'head', 'leaf', 'scallion', 'plum', 'lime', 'wedge', 'count',
    ]
    const qtys = [0, -1, 0.25, 1, 2, 12, Number.NaN, Number.POSITIVE_INFINITY]
    let checked = 0
    for (const f of foods) {
      for (const u of nouns) {
        for (const q of qtys) {
          const r = toGrams(q, u, f)
          checked += 1
          if (r === null) continue
          expect(Number.isFinite(r)).toBe(true)
          expect(r).toBeGreaterThan(0)
        }
      }
    }
    expect(checked).toBe(foods.length * nouns.length * qtys.length)
  })
})
