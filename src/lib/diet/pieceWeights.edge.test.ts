import { describe, it, expect } from 'vitest'
import { PIECE_GRAMS, normalizeFoodName, pieceGrams } from './pieceWeights'

/**
 * Edge hardening for the per-piece weight table. EXTENDS pieceWeights.test.ts:
 * - exhaustive sweep of EVERY (food, noun) entry against the documented USDA
 *   values (catches a typo'd weight or a renamed key),
 * - every value is a positive finite number (no NaN/Infinity/<=0 / null),
 * - normalization robustness (mixed case + interior/edge whitespace + the exact
 *   `foods.json` display names the table targets),
 * - unknown food / unknown noun / null inputs -> null (stays UNCONVERTIBLE),
 * - deep immutability (top-level + each per-food map frozen, mutation rejected).
 *
 * Pure-data only — no FODMAP, no grams math here (that lives in convert.edge).
 */

// The complete cited table, mirrored here so a change to the source MUST be a
// deliberate matching change here too (this is the "frozen contract" guard).
const EXPECTED: Record<string, Record<string, number>> = {
  'onion, raw': { small: 70, medium: 110, large: 150 },
  carrot: { medium: 61, large: 72 },
  'scallion/green onion, white part': { scallion: 15 },
  'tomato, fresh': { plum: 62 },
  'lime, whole/wedge': { lime: 67 },
  'butter/boston bibb lettuce': { head: 163, leaf: 7.5 },
  'bell pepper, red': { small: 74, medium: 119, large: 164 },
  cucumber: { small: 158 },
}

describe('PIECE_GRAMS — exhaustive contract sweep (every cited entry)', () => {
  it('table keys are EXACTLY the documented set (no drift)', () => {
    expect(new Set(Object.keys(PIECE_GRAMS))).toEqual(new Set(Object.keys(EXPECTED)))
  })

  const rows: Array<[string, string, number]> = []
  for (const [food, nouns] of Object.entries(EXPECTED)) {
    for (const [noun, grams] of Object.entries(nouns)) rows.push([food, noun, grams])
  }

  it.each(rows)('pieceGrams(%s, %s) === %s g', (food, noun, grams) => {
    expect(pieceGrams(food, noun)).toBe(grams)
  })

  it('per-food noun sets match exactly (no extra/missing nouns)', () => {
    for (const [food, nouns] of Object.entries(EXPECTED)) {
      expect(new Set(Object.keys(PIECE_GRAMS[food]))).toEqual(new Set(Object.keys(nouns)))
    }
  })

  it('every weight is a positive finite number (never NaN/Infinity/<=0)', () => {
    for (const nouns of Object.values(PIECE_GRAMS)) {
      for (const grams of Object.values(nouns)) {
        expect(typeof grams).toBe('number')
        expect(Number.isFinite(grams as number)).toBe(true)
        expect(grams as number).toBeGreaterThan(0)
      }
    }
  })
})

describe('pieceGrams — newly covered nouns the unit test omitted', () => {
  // existing test covers bell pepper "small" only; cover the other two sizes.
  it('bell pepper medium/large resolve', () => {
    expect(pieceGrams('Bell pepper, red', 'medium')).toBe(119)
    expect(pieceGrams('Bell pepper, red', 'large')).toBe(164)
  })

  it('every cited entry resolves through pieceGrams against its DISPLAY name', () => {
    // Use the real, mixed-case foods.json display names (not the normalized keys)
    // to prove the normalize-on-lookup path covers the actual seed names.
    const display: Array<[string, string, number]> = [
      ['Onion, raw', 'medium', 110],
      ['Carrot', 'large', 72],
      ['Scallion/green onion, white part', 'scallion', 15],
      ['Tomato, fresh', 'plum', 62],
      ['Lime, whole/wedge', 'lime', 67],
      ['Butter/Boston bibb lettuce', 'head', 163],
      ['Bell pepper, red', 'large', 164],
      ['Cucumber', 'small', 158],
    ]
    for (const [name, noun, g] of display) expect(pieceGrams(name, noun)).toBe(g)
  })
})

describe('normalizeFoodName — robustness', () => {
  const cases: Array<[string, string]> = [
    ['  Onion, RAW ', 'onion, raw'],
    ['CUCUMBER', 'cucumber'],
    ['\tTomato, Fresh\n', 'tomato, fresh'],
    ['Bell Pepper, Red', 'bell pepper, red'],
    ['Butter/Boston Bibb Lettuce', 'butter/boston bibb lettuce'],
  ]
  it.each(cases)('normalizeFoodName(%j) === %j', (input, expected) => {
    expect(normalizeFoodName(input)).toBe(expected)
  })

  it('pieceGrams matches case/whitespace insensitively via normalize', () => {
    expect(pieceGrams('   ONION, raw  ', 'large')).toBe(150)
    expect(pieceGrams('cArRoT', 'medium')).toBe(61)
    // interior whitespace is NOT collapsed — only trimmed/lowercased — so a name
    // with collapsed/expanded interior spacing that doesn't match a key misses.
    expect(pieceGrams('onion,  raw', 'small')).toBeNull() // double interior space
  })
})

describe('pieceGrams — misses stay UNCONVERTIBLE (null, never 0)', () => {
  const nullCases: Array<[string, number | null]> = [
    ['unknown food', pieceGrams('Dragonfruit', 'small')],
    ['known food, noun not cited (onion head)', pieceGrams('Onion, raw', 'head')],
    ['known food, noun not cited (carrot small)', pieceGrams('Carrot', 'small')],
    ['known food, noun not cited (cucumber large)', pieceGrams('Cucumber', 'large')],
    ['known food, noun not cited (lettuce small)', pieceGrams('Butter/Boston bibb lettuce', 'small')],
    ['kale bunch intentionally absent', pieceGrams('Kale, raw', 'bunch')],
    ['noun is a weight unit, not a piece', pieceGrams('Onion, raw', 'g')],
    ['empty noun', pieceGrams('Onion, raw', '')],
    ['null food name', pieceGrams(null, 'small')],
    ['undefined food name', pieceGrams(undefined, 'small')],
    ['empty food name', pieceGrams('', 'small')],
  ]
  it.each(nullCases)('%s -> null', (_label, result) => {
    expect(result).toBeNull()
  })

  it('a miss is strictly null (not 0, not undefined, not NaN)', () => {
    const r = pieceGrams('Onion, raw', 'head')
    expect(r).toBeNull()
    expect(r).not.toBe(0)
  })
})

describe('PIECE_GRAMS — deep immutability', () => {
  it('top-level + every per-food map is frozen', () => {
    expect(Object.isFrozen(PIECE_GRAMS)).toBe(true)
    for (const key of Object.keys(PIECE_GRAMS)) {
      expect(Object.isFrozen(PIECE_GRAMS[key])).toBe(true)
    }
  })

  it('adding a new food key is rejected (frozen top-level)', () => {
    expect(() => {
      // @ts-expect-error proving runtime immutability of the frozen table
      PIECE_GRAMS['new food'] = { small: 1 }
    }).toThrow()
    expect('new food' in PIECE_GRAMS).toBe(false)
  })

  it('mutating an existing weight is rejected and value is unchanged', () => {
    expect(() => {
      // @ts-expect-error proving runtime immutability of a per-food map
      PIECE_GRAMS.carrot.medium = 999
    }).toThrow()
    expect(PIECE_GRAMS.carrot.medium).toBe(61)
  })
})
