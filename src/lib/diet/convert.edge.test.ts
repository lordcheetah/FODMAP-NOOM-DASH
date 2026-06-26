import { describe, it, expect } from 'vitest'
import {
  canonicalUnit,
  parseServingDesc,
  toGrams,
  unitFamily,
  WEIGHT_GRAMS,
  VOLUME_TSP,
  type NormalizedUnit,
} from './convert'

const food = (serving_desc: string, serving_grams: number | null) => ({
  serving_desc,
  serving_grams,
})

/**
 * Edge hardening for the unit->grams conversion layer. EXTENDS convert.test.ts:
 * concrete weight factors, volume interconversion math, count<->count rules,
 * mismatch -> null, parser corner cases, and an invariant property sweep
 * (never NaN/Infinity/negative/0-from-error — only a positive finite or null).
 */

describe('toGrams — weight factors are exact and concrete (no off-by density)', () => {
  // qty, unit, expected grams (food irrelevant for weight)
  const cases: Array<[number, NormalizedUnit, number]> = [
    [1, 'g', 1],
    [250, 'g', 250],
    [1, 'kg', 1000],
    [2.5, 'kg', 2500],
    [1, 'mg', 0.001],
    [500, 'mg', 0.5],
    [1, 'oz', 28.3495],
    [4, 'oz', 113.398],
    [16, 'oz', 453.592], // 16 oz == 1 lb exactly by the factor table
    [1, 'lb', 453.592],
    [2, 'lb', 907.184],
  ]
  it.each(cases)('toGrams(%s, %s) === %s', (qty, unit, expected) => {
    // Pass a food whose serving could NOT bridge a non-weight unit, to prove
    // weight never consults it.
    const g = toGrams(qty, unit, food('1 clove', 3))
    expect(g).not.toBeNull()
    expect(g as number).toBeCloseTo(expected, 3)
  })

  it('16 oz and 1 lb agree to the gram (factor-table consistency)', () => {
    const a = toGrams(16, 'oz', food('1 g', 1)) as number
    const b = toGrams(1, 'lb', food('1 g', 1)) as number
    expect(a).toBeCloseTo(b, 3)
  })

  it('mg ingredient is treated as weight, not confused with a count', () => {
    // 1000 mg = 1 g regardless of the food's serving (catches mg-vs-g mix-ups).
    expect(toGrams(1000, 'mg', food('whatever', null))).toBeCloseTo(1, 6)
  })
})

describe('toGrams — volume interconversion via the food serving bridge', () => {
  // The spec example: food serving "1 cup" = 30 g; ingredient "2 cup" -> 60 g.
  it('cup food / cup ingredient scales linearly (1 cup=30g -> 2 cup=60g)', () => {
    expect(toGrams(2, 'cup', food('1 cup', 30))).toBeCloseTo(60, 5)
  })

  // The spec example: food "1 tbsp"=14g; ingredient "1 tsp" -> 14/3 g.
  it('tsp ingredient against tbsp food bridges by tsp ratio (14g tbsp -> 14/3 g tsp)', () => {
    const g = toGrams(1, 'tsp', food('1 tbsp', 14)) as number
    expect(g).toBeCloseTo(14 / 3, 6)
  })

  it('floz ingredient against a cup food (1 cup=240g; 1 floz=1/8 cup=30g)', () => {
    expect(toGrams(1, 'floz', food('1 cup', 240))).toBeCloseTo(30, 5)
  })

  it('cup ingredient against a tsp food (1 tsp=5g; 1 cup=48 tsp=240g)', () => {
    expect(toGrams(1, 'cup', food('1 tsp', 5))).toBeCloseTo(240, 5)
  })

  it('ml <-> tsp ratio uses US customary tsp = 4.92892 mL', () => {
    // food: 1 ml = 1 g (water-ish); ingredient 1 tsp -> 4.92892 g
    expect(toGrams(1, 'tsp', food('1 ml', 1))).toBeCloseTo(4.92892, 4)
    // VOLUME_TSP table sanity (one source of truth)
    expect(VOLUME_TSP.tbsp).toBe(3)
    expect(VOLUME_TSP.cup).toBe(48)
    expect(VOLUME_TSP.floz).toBe(6)
  })

  it('fractional food serving carries through (1/2 cup=122g -> 1 cup ing=244g)', () => {
    expect(toGrams(1, 'cup', food('1/2 cup', 122))).toBeCloseTo(244, 5)
  })
})

describe('toGrams — count<->count rules', () => {
  it('same noun scales linearly (1 large egg=50g -> 3 large=150g)', () => {
    expect(toGrams(3, 'large', food('1 large egg', 50))).toBeCloseTo(150, 5)
  })

  it('exact-noun match (1 clove=3g -> 4 cloves=12g)', () => {
    expect(toGrams(4, 'clove', food('1 clove (3 g)', 3))).toBeCloseTo(12, 5)
  })

  it('generic "count" ingredient matches any single-piece count serving', () => {
    expect(toGrams(2, 'count', food('1 clove', 3))).toBeCloseTo(6, 5)
  })

  it('multi-piece count food serving divides correctly (2 crackers=14g -> 5 crackers=35g)', () => {
    expect(toGrams(5, 'cracker', food('2 crackers', 14))).toBeCloseTo(35, 5)
  })
})

describe('toGrams — MISMATCH and guard cases all return null (never NaN/0/Infinity)', () => {
  const nullCases: Array<[string, number | null]> = [
    // mismatched count nouns
    ['olive ingredient vs clove food', toGrams(1, 'olive', food('1 clove', 3))],
    ['wedge ingredient vs egg food', toGrams(1, 'wedge', food('1 large egg', 50))],
    // count ingredient vs volume food serving
    ['clove ingredient vs cup food', toGrams(1, 'clove', food('1/2 cup chopped', 60))],
    // volume ingredient vs weight-only food serving (no volume bridge)
    ['cup ingredient vs oz food', toGrams(0.25, 'cup', food('1 oz', 28))],
    // volume ingredient vs count food serving with no volume alt
    ['cup ingredient vs egg food', toGrams(1, 'cup', food('1 large egg', 50))],
    // missing / non-positive serving_grams
    ['serving_grams null', toGrams(1, 'cup', food('1 cup', null))],
    ['serving_grams 0', toGrams(1, 'cup', food('1 cup', 0))],
    ['serving_grams negative', toGrams(1, 'cup', food('1 cup', -5))],
    // unparseable food serving_desc
    ['junk food serving_desc', toGrams(1, 'cup', food('whatever', 100))],
    // non-positive / non-finite quantity
    ['quantity 0', toGrams(0, 'oz', food('1 oz', 28))],
    ['quantity negative', toGrams(-2, 'cup', food('1 cup', 100))],
    ['quantity NaN', toGrams(Number.NaN, 'oz', food('1 oz', 28))],
    ['quantity Infinity', toGrams(Number.POSITIVE_INFINITY, 'oz', food('1 oz', 28))],
  ]
  it.each(nullCases)('%s -> null', (_label, result) => {
    expect(result).toBeNull()
  })
})

describe('canonicalUnit — junk and alias hardening', () => {
  it('junk / unrecognized -> null', () => {
    expect(canonicalUnit('pinch')).toBeNull()
    expect(canonicalUnit('handful')).toBeNull()
    expect(canonicalUnit('   ')).toBeNull()
    expect(canonicalUnit(undefined)).toBeNull()
    expect(canonicalUnit('42')).toBeNull()
  })

  it('strips unlisted trailing plural s (stalks -> stalk)', () => {
    expect(canonicalUnit('stalks')).toBe('stalk')
  })

  it('aliases resolve (gram/gm, tablespoon/tbs, pieces)', () => {
    expect(canonicalUnit('gm')).toBe('g')
    expect(canonicalUnit('tbs')).toBe('tbsp')
    expect(canonicalUnit('pieces')).toBe('count')
  })

  // Multi-word unit aliases resolve correctly: canonicalUnit tries the full
  // (possibly multi-word) string against UNIT_ALIASES before per-token lookup,
  // so "fluid ounce(s)" maps to the VOLUME unit 'floz' (which must bridge through
  // the food serving), not the WEIGHT unit 'oz' from the bare "ounces" token.
  it('resolves multi-word "fluid ounce(s)" to the volume unit floz', () => {
    expect(canonicalUnit('fluid ounces')).toBe('floz')
    expect(canonicalUnit('fluid ounce')).toBe('floz')
    expect(canonicalUnit('fl-oz')).toBe('floz') // single-token form also works
    // a bare "ounce(s)" is still weight oz
    expect(canonicalUnit('ounces')).toBe('oz')
  })
})

describe('parseServingDesc — corner cases', () => {
  it('fractions and decimals', () => {
    expect(parseServingDesc('1/2 cup')).toEqual({ qty: 0.5, unit: 'cup' })
    expect(parseServingDesc('0.75 cup')).toEqual({ qty: 0.75, unit: 'cup' })
    expect(parseServingDesc('2 1/2 cups')).toEqual({ qty: 2.5, unit: 'cup' })
  })

  it('plural / aliased units', () => {
    expect(parseServingDesc('2 cups')).toEqual({ qty: 2, unit: 'cup' })
    expect(parseServingDesc('1 tbsp.')).toEqual({ qty: 1, unit: 'tbsp' })
    expect(parseServingDesc('3 tablespoons')).toEqual({ qty: 3, unit: 'tbsp' })
    expect(parseServingDesc('2 ounces')).toEqual({ qty: 2, unit: 'oz' })
  })

  it('parentheticals: keeps primary count noun, captures volume alt', () => {
    expect(parseServingDesc('1 clove (3 g)')).toMatchObject({ qty: 1, unit: 'clove' })
    const stalk = parseServingDesc('1 stalk (about 1/4 cup)')
    expect(stalk).toMatchObject({ qty: 1, unit: 'stalk' })
    expect(stalk?.alt).toEqual({ qty: 0.25, unit: 'cup' })
  })

  it('trailing prep words after a unit are ignored', () => {
    expect(parseServingDesc('2 cup spinach, chopped')).toEqual({ qty: 2, unit: 'cup' })
    expect(parseServingDesc('1 cup raw')).toEqual({ qty: 1, unit: 'cup' })
  })

  it('no leading quantity defaults qty to 1', () => {
    expect(parseServingDesc('cup')).toEqual({ qty: 1, unit: 'cup' })
  })

  it('junk / empty -> null', () => {
    expect(parseServingDesc('')).toBeNull()
    expect(parseServingDesc('   ')).toBeNull()
    expect(parseServingDesc('a pinch')).toBeNull()
    expect(parseServingDesc('to taste')).toBeNull()
    // @ts-expect-error guard against non-string at runtime
    expect(parseServingDesc(null)).toBeNull()
  })

  it('unparseable primary but parenthetical weight/volume becomes primary', () => {
    // "splash (2 tbsp)" -> splash is junk, alt 2 tbsp promotes to primary
    expect(parseServingDesc('1 splash (2 tbsp)')).toEqual({ qty: 2, unit: 'tbsp' })
  })
})

describe('PROPERTY: toGrams returns a positive finite number OR null — never NaN/Inf/<=0', () => {
  const units: NormalizedUnit[] = [
    'g', 'kg', 'mg', 'oz', 'lb',
    'ml', 'l', 'tsp', 'tbsp', 'cup', 'floz',
    'count', 'clove', 'large', 'egg', 'olive', 'slice',
  ]
  const servings = [
    '1 cup',
    '1/2 cup',
    '1 tbsp',
    '1 tsp',
    '1 oz',
    '3 oz',
    '1 large egg',
    '1 clove (3 g)',
    '1 stalk (about 1/4 cup)',
    '1 ml',
    'whatever', // unparseable
    '',
  ]
  const grams = [null, 0, -5, 1, 28.3495, 100, 240, Number.NaN]
  const quantities = [0, -1, 0.5, 1, 3, 1000, Number.NaN, Number.POSITIVE_INFINITY]

  // Deterministic full cross-product sweep (16*12*8*8 = ~12k cases) in one test.
  it('holds across a deterministic cross-product sweep', () => {
    let checked = 0
    for (const u of units) {
      for (const sd of servings) {
        for (const sg of grams) {
          for (const q of quantities) {
            const r = toGrams(q, u, food(sd, sg as number | null))
            checked += 1
            if (r === null) continue
            expect(Number.isFinite(r)).toBe(true)
            expect(Number.isNaN(r)).toBe(false)
            expect(r).toBeGreaterThan(0)
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(10000)
  })
})

describe('WEIGHT_GRAMS / unitFamily one-source-of-truth sanity', () => {
  it('published gram factors', () => {
    expect(WEIGHT_GRAMS.g).toBe(1)
    expect(WEIGHT_GRAMS.kg).toBe(1000)
    expect(WEIGHT_GRAMS.mg).toBe(0.001)
    expect(WEIGHT_GRAMS.oz).toBeCloseTo(28.3495, 4)
    expect(WEIGHT_GRAMS.lb).toBeCloseTo(453.592, 3)
  })
  it('families', () => {
    expect(unitFamily('mg')).toBe('weight')
    expect(unitFamily('floz')).toBe('volume')
    expect(unitFamily('egg')).toBe('count')
  })
})
