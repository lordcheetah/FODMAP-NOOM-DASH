import { describe, it, expect } from 'vitest'
import {
  canonicalUnit,
  parseServingDesc,
  toGrams,
  unitFamily,
  WEIGHT_GRAMS,
  type NormalizedUnit,
} from './convert'

const food = (serving_desc: string, serving_grams: number | null) => ({
  serving_desc,
  serving_grams,
})

describe('canonicalUnit', () => {
  it('normalizes weight aliases', () => {
    expect(canonicalUnit('oz')).toBe('oz')
    expect(canonicalUnit('oz.')).toBe('oz')
    expect(canonicalUnit('Ounces')).toBe('oz')
    expect(canonicalUnit('lb')).toBe('lb')
    expect(canonicalUnit('pounds')).toBe('lb')
  })

  it('normalizes volume aliases', () => {
    expect(canonicalUnit('tbsp.')).toBe('tbsp')
    expect(canonicalUnit('Tablespoons')).toBe('tbsp')
    expect(canonicalUnit('cups')).toBe('cup')
    expect(canonicalUnit('tsp')).toBe('tsp')
  })

  it('takes the first recognized token of a compound unit ("oz slice")', () => {
    expect(canonicalUnit('oz slice')).toBe('oz')
  })

  it('returns null for unrecognized units', () => {
    expect(canonicalUnit('bay leaf')).toBe('leaf') // leaf is a known count noun
    expect(canonicalUnit('lime')).toBeNull()
    expect(canonicalUnit('')).toBeNull()
    expect(canonicalUnit(null)).toBeNull()
  })
})

describe('parseServingDesc', () => {
  it('parses simple "<int> <unit>"', () => {
    expect(parseServingDesc('1 cup')).toEqual({ qty: 1, unit: 'cup' })
    expect(parseServingDesc('3 oz')).toEqual({ qty: 3, unit: 'oz' })
  })

  it('parses decimals', () => {
    expect(parseServingDesc('0.5 tsp')).toEqual({ qty: 0.5, unit: 'tsp' })
    expect(parseServingDesc('3.5 oz')).toEqual({ qty: 3.5, unit: 'oz' })
  })

  it('parses simple fractions', () => {
    expect(parseServingDesc('1/2 cup')).toEqual({ qty: 0.5, unit: 'cup' })
    expect(parseServingDesc('1/4 cup')).toEqual({ qty: 0.25, unit: 'cup' })
    expect(parseServingDesc('1/8 avocado')).toEqual({ qty: 0.125, unit: 'avocado' })
  })

  it('parses mixed numbers', () => {
    expect(parseServingDesc('1 1/2 cups')).toEqual({ qty: 1.5, unit: 'cup' })
  })

  it('parses unicode vulgar fractions', () => {
    expect(parseServingDesc('½ cup')).toEqual({ qty: 0.5, unit: 'cup' })
  })

  it('ignores trailing prep words', () => {
    expect(parseServingDesc('1/2 cup chopped')).toEqual({ qty: 0.5, unit: 'cup' })
    expect(parseServingDesc('1 cup sliced')).toEqual({ qty: 1, unit: 'cup' })
    expect(parseServingDesc('1 tsp grated')).toEqual({ qty: 1, unit: 'tsp' })
  })

  it('resolves size-adjective + count noun to the noun', () => {
    expect(parseServingDesc('1 large egg')).toEqual({ qty: 1, unit: 'egg' })
  })

  it('treats a standalone size word as the count unit', () => {
    expect(parseServingDesc('1 small')).toEqual({ qty: 1, unit: 'small' })
  })

  it('strips parentheticals and keeps the primary unit', () => {
    expect(parseServingDesc('1 clove (3 g)')).toMatchObject({ qty: 1, unit: 'clove' })
  })

  it('captures a volume parenthetical as alt when primary is a count noun', () => {
    const parsed = parseServingDesc('1 stalk (about 1/4 cup)')
    expect(parsed).toMatchObject({ qty: 1, unit: 'stalk' })
    expect(parsed?.alt).toEqual({ qty: 0.25, unit: 'cup' })
  })

  it('returns null when nothing resolves to a unit', () => {
    expect(parseServingDesc('not a serving')).toBeNull()
    expect(parseServingDesc('')).toBeNull()
  })
})

describe('unitFamily', () => {
  it('classifies families', () => {
    expect(unitFamily('oz')).toBe('weight')
    expect(unitFamily('cup')).toBe('volume')
    expect(unitFamily('clove')).toBe('count')
  })
})

describe('toGrams — weight (direct, density-free)', () => {
  it('converts oz directly, food irrelevant', () => {
    expect(toGrams(4, 'oz', food('1 slice', null))).toBeCloseTo(113.398, 2)
  })

  it('converts lb directly', () => {
    expect(toGrams(1, 'lb', food('3 oz', 85))).toBeCloseTo(453.592, 2)
  })

  it('uses the published gram factors', () => {
    expect(WEIGHT_GRAMS.oz).toBeCloseTo(28.3495, 4)
    expect(WEIGHT_GRAMS.kg).toBe(1000)
  })
})

describe('toGrams — volume via the food’s own serving bridge', () => {
  it('same unit (cup -> cup)', () => {
    // food: 1/2 cup = 122 g -> 1 cup ingredient = 244 g
    expect(toGrams(1, 'cup', food('1/2 cup', 122))).toBeCloseTo(244, 5)
  })

  it('different volume unit (tbsp ingredient, cup-served food)', () => {
    // food: 1 cup = 240 g; 16 tbsp = 1 cup -> 1 tbsp = 15 g
    expect(toGrams(1, 'tbsp', food('1 cup', 240))).toBeCloseTo(15, 5)
  })

  it('tsp ingredient against a tbsp-served food', () => {
    // food: 1 tbsp = 15 g; 1 tbsp = 3 tsp -> 1 tsp = 5 g
    expect(toGrams(1, 'tsp', food('1 tbsp', 15))).toBeCloseTo(5, 5)
  })

  it('bridges through a parenthetical volume alt (celery stalk)', () => {
    // food: 1 stalk (about 1/4 cup) = 40 g -> 1/2 cup ingredient = 80 g
    expect(toGrams(0.5, 'cup', food('1 stalk (about 1/4 cup)', 40))).toBeCloseTo(80, 5)
  })

  it('returns null when the food serving is weight-only', () => {
    expect(toGrams(0.25, 'cup', food('1 oz', 28))).toBeNull()
  })
})

describe('toGrams — count (same noun)', () => {
  it('same count noun (clove)', () => {
    // food: 1 clove (3 g) = 3 g -> 6 cloves = 18 g
    expect(toGrams(6, 'clove', food('1 clove (3 g)', 3))).toBeCloseTo(18, 5)
  })

  it('size word against a count-served food (large eggs)', () => {
    // food: 1 large egg = 50 g -> 3 large = 150 g
    expect(toGrams(3, 'large', food('1 large egg', 50))).toBeCloseTo(150, 5)
  })

  it('returns null when count noun is against a volume serving', () => {
    expect(toGrams(1, 'clove', food('1/2 cup chopped', 60))).toBeNull()
  })

  it('returns null for mismatched count nouns', () => {
    expect(toGrams(1, 'olive', food('1 clove', 3))).toBeNull()
  })
})

describe('toGrams — unconvertible / guards', () => {
  it('null when serving_grams missing', () => {
    expect(toGrams(1, 'cup', food('1 cup', null))).toBeNull()
    expect(toGrams(1, 'cup', food('1 cup', 0))).toBeNull()
  })

  it('null for non-positive / non-finite quantity', () => {
    expect(toGrams(0, 'oz', food('1 oz', 28))).toBeNull()
    expect(toGrams(-2, 'oz', food('1 oz', 28))).toBeNull()
    expect(toGrams(Number.NaN, 'oz', food('1 oz', 28))).toBeNull()
  })

  it('null when the food serving_desc cannot be parsed', () => {
    expect(toGrams(1, 'cup', food('whatever', 100))).toBeNull()
  })
})

describe('integration: recipe-style amounts', () => {
  const cases: Array<[number, NormalizedUnit, string, number | null, number | null]> = [
    // qty, unit, food serving_desc, food grams, expected grams
    [2, 'tbsp', '1 tbsp', 15, 30], // olive oil
    [4, 'oz', '1 oz', 28.3495, 113.398], // mozzarella via "oz slice" -> oz weight
    [2, 'cup', '1 cup', 30, 60], // spinach
    [1, 'lb', '3 oz', 85, 453.592], // salmon weight
  ]
  it.each(cases)('toGrams(%s, %s) over %s', (qty, unit, desc, grams, expected) => {
    const g = toGrams(qty, unit, food(desc, grams))
    if (expected == null) expect(g).toBeNull()
    else expect(g).toBeCloseTo(expected, 2)
  })
})
