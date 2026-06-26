import { describe, it, expect } from 'vitest'
import { PIECE_GRAMS, normalizeFoodName, pieceGrams } from './pieceWeights'

describe('normalizeFoodName', () => {
  it('lowercases and trims', () => {
    expect(normalizeFoodName('  Onion, RAW ')).toBe('onion, raw')
    expect(normalizeFoodName('Butter/Boston Bibb Lettuce')).toBe('butter/boston bibb lettuce')
  })
})

describe('pieceGrams — table hits (cited USDA values)', () => {
  it('onion small/medium/large', () => {
    expect(pieceGrams('Onion, raw', 'small')).toBe(70)
    expect(pieceGrams('Onion, raw', 'medium')).toBe(110)
    expect(pieceGrams('Onion, raw', 'large')).toBe(150)
  })

  it('carrot medium/large', () => {
    expect(pieceGrams('Carrot', 'medium')).toBe(61)
    expect(pieceGrams('Carrot', 'large')).toBe(72)
  })

  it('scallion whole stalk', () => {
    expect(pieceGrams('Scallion/green onion, white part', 'scallion')).toBe(15)
  })

  it('plum tomato', () => {
    expect(pieceGrams('Tomato, fresh', 'plum')).toBe(62)
  })

  it('whole lime', () => {
    expect(pieceGrams('Lime, whole/wedge', 'lime')).toBe(67)
  })

  it('bibb lettuce head + leaf', () => {
    expect(pieceGrams('Butter/Boston bibb lettuce', 'head')).toBe(163)
    expect(pieceGrams('Butter/Boston bibb lettuce', 'leaf')).toBe(7.5)
  })

  it('bell pepper small', () => {
    expect(pieceGrams('Bell pepper, red', 'small')).toBe(74)
  })

  it('cucumber small', () => {
    expect(pieceGrams('Cucumber', 'small')).toBe(158)
  })
})

describe('pieceGrams — normalization', () => {
  it('is case/whitespace insensitive on the food name', () => {
    expect(pieceGrams('  onion, RAW  ', 'small')).toBe(70)
    expect(pieceGrams('CUCUMBER', 'small')).toBe(158)
  })
})

describe('pieceGrams — misses return null (never 0, stays unconvertible)', () => {
  it('unknown food name', () => {
    expect(pieceGrams('Totally Unknown Food', 'small')).toBeNull()
  })

  it('known food but noun not in its table', () => {
    expect(pieceGrams('Onion, raw', 'head')).toBeNull()
    expect(pieceGrams('Cucumber', 'large')).toBeNull() // only small is cited
    expect(pieceGrams('Carrot', 'small')).toBeNull() // small omitted (unused)
  })

  it('null / non-string food name', () => {
    expect(pieceGrams(null, 'small')).toBeNull()
    expect(pieceGrams(undefined, 'small')).toBeNull()
  })

  it('kale bunch is intentionally absent (low-confidence)', () => {
    expect(pieceGrams('Kale, raw', 'bunch')).toBeNull()
  })
})

describe('PIECE_GRAMS — frozen constant (pure, immutable)', () => {
  it('top-level object is frozen', () => {
    expect(Object.isFrozen(PIECE_GRAMS)).toBe(true)
  })

  it('per-food noun maps are frozen', () => {
    for (const key of Object.keys(PIECE_GRAMS)) {
      expect(Object.isFrozen(PIECE_GRAMS[key])).toBe(true)
    }
  })

  it('mutation attempts do not take effect (strict-mode safety)', () => {
    expect(() => {
      // @ts-expect-error intentionally violating readonly to prove immutability
      PIECE_GRAMS['onion, raw'].small = 999
    }).toThrow()
    expect(PIECE_GRAMS['onion, raw'].small).toBe(70)
  })
})
