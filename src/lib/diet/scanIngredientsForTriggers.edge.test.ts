/**
 * EXTENDED hardening for the PURE ingredient-text trigger scanner. Complements
 * scanIngredientsForTriggers.test.ts. Focus:
 *   - substring matching behavior (documented, incl. false-positive substrings),
 *   - synonym coverage (HFCS, inulin/chicory),
 *   - case-insensitivity over messy text,
 *   - the safety invariant: output is ONLY trigger labels; an empty result is
 *     NOT a safety signal, and the scanner can never emit 'safe'/'low'/etc.
 */
import { describe, it, expect } from 'vitest'
import { scanIngredientsForTriggers } from './scanIngredientsForTriggers'

const KNOWN_LABELS = [
  'wheat',
  'onion',
  'garlic',
  'inulin',
  'chicory root',
  'high-fructose corn syrup',
  'agave',
  'honey',
  'fructose',
]

// A safety-relevant value the scanner must NEVER produce, no matter the input.
const FORBIDDEN_OUTPUTS = ['safe', 'low', 'moderate', 'high', 'unknown', 'ok']

describe('scanIngredientsForTriggers — output is always a label subset', () => {
  it.each([
    'water',
    'onion, garlic, wheat, honey, agave, inulin, chicory root, fructose, hfcs',
    'ONION POWDER and Dehydrated GARLIC',
    'crystalline fructose',
    '',
    'salt, rice, oats, kiwi, raspberries, firm tofu, quinoa, chia',
  ])('input %j → only known labels, no safety tokens', (text) => {
    const r = scanIngredientsForTriggers(text)
    expect(Array.isArray(r)).toBe(true)
    for (const label of r) expect(KNOWN_LABELS).toContain(label)
    for (const forbidden of FORBIDDEN_OUTPUTS) expect(r).not.toContain(forbidden)
  })

  it('absence of triggers returns [] — explicitly NOT a "safe" signal', () => {
    // Low-FODMAP high-fiber foods from CLAUDE.md should produce NO triggers,
    // but the empty array must never be interpreted as a safety upgrade.
    const r = scanIngredientsForTriggers('oats, chia, kiwi, raspberries, quinoa')
    expect(r).toEqual([])
    // The contract: [] is "no flagged words", carrying zero safety meaning.
    expect(r.length).toBe(0)
  })
})

describe('scanIngredientsForTriggers — case & whitespace insensitivity', () => {
  it.each([
    ['WHEAT FLOUR', ['wheat']],
    ['Wheat Flour', ['wheat']],
    ['wHeAt', ['wheat']],
    ['  ONION  ', ['onion']],
    ['Garlic', ['garlic']],
    ['HONEY', ['honey']],
    ['Agave Syrup', ['agave']],
  ] as const)('%j → %j', (text, expected) => {
    expect(scanIngredientsForTriggers(text)).toEqual(expected)
  })
})

describe('scanIngredientsForTriggers — substring matching (documented behavior)', () => {
  it('matches "onion" inside "onion powder" / "green onions"', () => {
    expect(scanIngredientsForTriggers('onion powder')).toEqual(['onion'])
    expect(scanIngredientsForTriggers('green onions')).toEqual(['onion'])
  })

  it('matches "garlic" inside "garlic powder" / "roasted garlic"', () => {
    expect(scanIngredientsForTriggers('garlic powder')).toEqual(['garlic'])
    expect(scanIngredientsForTriggers('roasted garlic salt')).toEqual(['garlic'])
  })

  it('does NOT flag "wheat" inside the low-FODMAP grain "buckwheat" (word-boundary guard)', () => {
    // "wheat" uses a leading word-boundary match, so "buckwheat" (a low-FODMAP
    // grain) is not mis-flagged, while real wheat still is.
    expect(scanIngredientsForTriggers('buckwheat flour')).toEqual([])
    expect(scanIngredientsForTriggers('buckwheat groats, water')).toEqual([])
    expect(scanIngredientsForTriggers('whole wheat flour')).toEqual(['wheat'])
    expect(scanIngredientsForTriggers('wheat')).toEqual(['wheat'])
  })

  it('matches "agave" / "honey" anywhere in the string', () => {
    expect(scanIngredientsForTriggers('organic blue agave nectar')).toEqual([
      'agave',
    ])
    expect(scanIngredientsForTriggers('clover honey')).toEqual(['honey'])
  })
})

describe('scanIngredientsForTriggers — synonyms collapse to one label', () => {
  it.each([
    ['high fructose corn syrup', ['high-fructose corn syrup']],
    ['high-fructose corn syrup', ['high-fructose corn syrup']],
    ['HFCS', ['high-fructose corn syrup']],
    ['Contains hfcs and water', ['high-fructose corn syrup']],
  ] as const)('%j → %j', (text, expected) => {
    expect(scanIngredientsForTriggers(text)).toEqual(expected)
  })

  it('chicory root and inulin both flagged (inulin first by declaration order)', () => {
    expect(scanIngredientsForTriggers('chicory root extract (inulin)')).toEqual([
      'inulin',
      'chicory root',
    ])
  })

  it('"chicory" alone still matches the chicory root label', () => {
    expect(scanIngredientsForTriggers('roasted chicory')).toEqual([
      'chicory root',
    ])
  })
})

describe('scanIngredientsForTriggers — fructose vs HFCS de-duplication', () => {
  it('HFCS only → no bare "fructose" double-report', () => {
    expect(scanIngredientsForTriggers('high fructose corn syrup, water')).toEqual(
      ['high-fructose corn syrup'],
    )
  })

  it('HFCS + a genuine standalone fructose → both reported', () => {
    const r = scanIngredientsForTriggers(
      'high fructose corn syrup, crystalline fructose',
    )
    expect(r).toContain('high-fructose corn syrup')
    expect(r).toContain('fructose')
  })

  it('standalone fructose with no HFCS → fructose label kept', () => {
    expect(scanIngredientsForTriggers('fructose, citric acid')).toEqual([
      'fructose',
    ])
  })
})

describe('scanIngredientsForTriggers — empty/nullish & dedup', () => {
  it.each([null, undefined, '', '   '])(
    'nullish/empty input %j → [] (no crash)',
    (input) => {
      // '   ' is truthy so it runs the scan but finds nothing.
      expect(scanIngredientsForTriggers(input as string | null | undefined)).toEqual(
        [],
      )
    },
  )

  it('repeated triggers are deduped, kept in declaration order', () => {
    const r = scanIngredientsForTriggers(
      'onion, onion powder, dehydrated onion, garlic, garlic powder',
    )
    expect(r).toEqual(['onion', 'garlic'])
  })

  it('full kitchen-sink string returns each label once, in declaration order', () => {
    const r = scanIngredientsForTriggers(
      'Wheat, onion, garlic, inulin, chicory root, agave, honey, crystalline fructose, HFCS',
    )
    expect(r).toEqual([
      'wheat',
      'onion',
      'garlic',
      'inulin',
      'chicory root',
      'high-fructose corn syrup',
      'agave',
      'honey',
      'fructose',
    ])
  })
})
