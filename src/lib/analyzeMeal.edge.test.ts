/**
 * Edge / hardening tests for the PURE photo→meal logic in `analyzeMeal.ts`.
 *
 * Extends `analyzeMeal.test.ts` (does not duplicate it). Focus:
 *   - `targetDimensions`: never-upscale invariant, orientation, exact-edge,
 *     huge inputs, rounding, zero/invalid guards (no NaN/0 → broken canvas).
 *   - `parseAnalyzeResponse`: defensive parsing drops (not coerces) bad items;
 *     never throws; and — health-critical — the output carries NO FODMAP/safety
 *     field even when the payload tries to inject one.
 *   - `analyzedItemToPrefill`: always 'unknown' on BOTH FODMAP axes regardless
 *     of injected input; correct name/grams/calories mapping.
 *
 * The single non-negotiable guarantee under test: no AI/photo-sourced item can
 * flow through this pure logic and emerge with a non-'unknown' FODMAP level or
 * a "safe" verdict.
 */
import { describe, expect, it } from 'vitest'
import {
  analyzedItemToPrefill,
  parseAnalyzeResponse,
  targetDimensions,
  type AnalyzedItem,
} from './analyzeMeal'

// ---------------------------------------------------------------------------
// targetDimensions — table-driven
// ---------------------------------------------------------------------------
describe('targetDimensions (edge / invariants)', () => {
  const MAX = 1568

  // [name, w, h, maxEdge?, expected]
  const cases: Array<{
    name: string
    w: number
    h: number
    maxEdge?: number
    out: { w: number; h: number }
  }> = [
    // never upscales — small inputs returned as-is (rounded)
    { name: 'tiny 1×1 unchanged', w: 1, h: 1, out: { w: 1, h: 1 } },
    { name: 'small landscape unchanged', w: 320, h: 240, out: { w: 320, h: 240 } },
    { name: 'small portrait unchanged', w: 240, h: 320, out: { w: 240, h: 320 } },
    { name: 'small square unchanged', w: 500, h: 500, out: { w: 500, h: 500 } },

    // exactly at the edge — unchanged (boundary)
    { name: 'long edge == max (landscape)', w: MAX, h: 1000, out: { w: MAX, h: 1000 } },
    { name: 'long edge == max (portrait)', w: 1000, h: MAX, out: { w: 1000, h: MAX } },
    { name: 'both edges == max', w: MAX, h: MAX, out: { w: MAX, h: MAX } },

    // one px over the edge — scales (boundary +1)
    { name: 'long edge max+1 landscape', w: MAX + 1, h: 100, out: { w: MAX, h: 100 } },

    // large inputs — scaled to fit, aspect preserved
    { name: 'huge landscape 4000×3000', w: 4000, h: 3000, out: { w: 1568, h: 1176 } },
    { name: 'huge portrait 3000×4000', w: 3000, h: 4000, out: { w: 1176, h: 1568 } },
    { name: 'huge square 6000×6000', w: 6000, h: 6000, out: { w: 1568, h: 1568 } },
    { name: 'extreme panorama 12000×1000', w: 12000, h: 1000, out: { w: 1568, h: 131 } },

    // custom maxEdge
    { name: 'custom maxEdge 1000', w: 2000, h: 1000, maxEdge: 1000, out: { w: 1000, h: 500 } },
    { name: 'custom maxEdge 100, short side rounds to >=1', w: 5000, h: 30, maxEdge: 100, out: { w: 100, h: 1 } },

    // non-integer inputs round sanely
    { name: 'fractional input rounds', w: 100.4, h: 200.6, out: { w: 100, h: 201 } },

    // invalid / non-positive / non-finite → safe 1×1 (never 0/NaN into canvas)
    { name: 'zero width → 1×1', w: 0, h: 500, out: { w: 1, h: 1 } },
    { name: 'zero height → 1×1', w: 500, h: 0, out: { w: 1, h: 1 } },
    { name: 'both zero → 1×1', w: 0, h: 0, out: { w: 1, h: 1 } },
    { name: 'negative width → 1×1', w: -100, h: 100, out: { w: 1, h: 1 } },
    { name: 'NaN width → 1×1', w: NaN, h: 100, out: { w: 1, h: 1 } },
    { name: 'Infinity height → 1×1', w: 100, h: Infinity, out: { w: 1, h: 1 } },
    { name: '-Infinity width → 1×1', w: -Infinity, h: 100, out: { w: 1, h: 1 } },
  ]

  for (const c of cases) {
    it(c.name, () => {
      const got =
        c.maxEdge === undefined
          ? targetDimensions(c.w, c.h)
          : targetDimensions(c.w, c.h, c.maxEdge)
      expect(got).toEqual(c.out)
    })
  }

  it('INVARIANT: never upscales — output long edge <= input long edge (sampled)', () => {
    const samples: Array<[number, number]> = [
      [10, 10],
      [100, 1],
      [1568, 1568],
      [1569, 1],
      [4000, 3000],
      [12000, 1000],
      [1, 12000],
    ]
    for (const [w, h] of samples) {
      const { w: ow, h: oh } = targetDimensions(w, h)
      expect(Math.max(ow, oh)).toBeLessThanOrEqual(Math.max(w, h))
    }
  })

  it('INVARIANT: output is always a positive finite integer pair (no NaN/0)', () => {
    const samples: Array<[number, number, number?]> = [
      [4000, 3000],
      [1, 1],
      [12000, 1, 100],
      [0, 0],
      [NaN, 50],
      [Infinity, Infinity],
      [-5, -5],
    ]
    for (const [w, h, m] of samples) {
      const out = m === undefined ? targetDimensions(w, h) : targetDimensions(w, h, m)
      expect(Number.isInteger(out.w)).toBe(true)
      expect(Number.isInteger(out.h)).toBe(true)
      expect(out.w).toBeGreaterThanOrEqual(1)
      expect(out.h).toBeGreaterThanOrEqual(1)
    }
  })

  it('INVARIANT: long edge of a scaled-down image lands exactly on maxEdge', () => {
    // Anything strictly over the cap must have its long edge clamped to maxEdge.
    expect(Math.max(...Object.values(targetDimensions(4000, 3000)))).toBe(1568)
    expect(Math.max(...Object.values(targetDimensions(3000, 4000)))).toBe(1568)
    expect(Math.max(...Object.values(targetDimensions(2000, 2000, 999)))).toBe(999)
  })
})

// ---------------------------------------------------------------------------
// parseAnalyzeResponse — defensive parsing
// ---------------------------------------------------------------------------
describe('parseAnalyzeResponse (edge / defensive)', () => {
  const valid: AnalyzedItem = {
    name: 'Apple',
    quantity_desc: '1 medium',
    estimated_grams: 180,
    estimated_calories: 95,
    confidence: 'high',
  }

  it('never throws on wildly malformed payloads → []', () => {
    const garbage: unknown[] = [
      undefined,
      null,
      42,
      'string',
      true,
      [],
      [valid], // top-level array, no { items }
      {},
      { items: null },
      { items: 42 },
      { items: 'nope' },
      { items: {} },
      { notItems: [valid] },
      { items: [undefined, null, 1, 'x', true, []] },
    ]
    for (const g of garbage) {
      expect(() => parseAnalyzeResponse(g)).not.toThrow()
      expect(Array.isArray(parseAnalyzeResponse(g))).toBe(true)
    }
  })

  it('drops items missing each required field (table-driven)', () => {
    const bad: Array<Record<string, unknown>> = [
      { ...valid, name: undefined }, // missing name
      { ...valid, name: 123 }, // wrong type name
      { ...valid, name: '   ' }, // whitespace-only name (trim === '')
      { ...valid, quantity_desc: undefined }, // missing desc
      { ...valid, quantity_desc: 5 }, // wrong type desc
      { ...valid, confidence: undefined }, // missing confidence
      { ...valid, confidence: 'maybe' }, // bad enum
      { ...valid, confidence: 'HIGH' }, // wrong case (enum is lowercase)
      { ...valid, confidence: 1 }, // wrong type
      { ...valid, estimated_grams: 'lots' }, // non-number grams
      { ...valid, estimated_calories: 'many' }, // non-number calories
      { ...valid, estimated_grams: NaN }, // NaN not finite
      { ...valid, estimated_calories: Infinity }, // Infinity not finite
      { ...valid, estimated_grams: undefined }, // undefined (not number, not null)
    ]
    // Every bad row must be dropped; the lone valid row survives.
    const body = { items: [...bad, valid] }
    expect(parseAnalyzeResponse(body)).toEqual([valid])
  })

  it('does NOT coerce — numeric-string grams stays dropped, not parsed to 180', () => {
    const res = parseAnalyzeResponse({
      items: [{ ...valid, estimated_grams: '180' }],
    })
    expect(res).toEqual([])
  })

  it('accepts null grams/calories but rejects non-finite numbers', () => {
    expect(
      parseAnalyzeResponse({
        items: [{ ...valid, estimated_grams: null, estimated_calories: null }],
      }),
    ).toEqual([{ ...valid, estimated_grams: null, estimated_calories: null }])
  })

  it('coerces out-of-range numbers to null (negative grams → null; 0 calories kept)', () => {
    // Range guard: grams must be > 0 to be usable; calories may be 0 (water,
    // black coffee). Negative/non-finite values become null, not bad NOOM math.
    const weird = { ...valid, estimated_grams: -50, estimated_calories: 0 }
    expect(parseAnalyzeResponse({ items: [weird] })).toEqual([
      { ...valid, estimated_grams: null, estimated_calories: 0 },
    ])
    const zeroGrams = { ...valid, estimated_grams: 0 }
    expect(parseAnalyzeResponse({ items: [zeroGrams] })[0].estimated_grams).toBeNull()
    const negCals = { ...valid, estimated_calories: -10 }
    expect(parseAnalyzeResponse({ items: [negCals] })[0].estimated_calories).toBeNull()
  })

  it('strips extra/unknown fields — rebuilds a whitelisted object', () => {
    const withExtra = {
      ...valid,
      bogus: 'ignored',
      nested: { a: 1 },
      arr: [1, 2, 3],
    }
    const [out] = parseAnalyzeResponse({ items: [withExtra] })
    expect(Object.keys(out).sort()).toEqual([
      'confidence',
      'estimated_calories',
      'estimated_grams',
      'name',
      'quantity_desc',
    ])
    expect(out.name).toBe('Apple')
    expect(out.estimated_grams).toBe(180)
    expect(out.confidence).toBe('high')
  })

  it('HEALTH-SAFETY: parsed items carry NO FODMAP/safety field even when injected', () => {
    const injected = {
      ...valid,
      // adversarial keys an upstream/AI could try to smuggle in:
      fructose_level: 'low',
      fructans_level: 'low',
      low_fodmap_safe: true,
      safe: true,
      verdict: 'safe',
    }
    const out = parseAnalyzeResponse({ items: [injected] })
    expect(out).toHaveLength(1)
    const item = out[0]
    // The parser rebuilds a whitelisted object, so injected keys are GONE at
    // runtime, not merely absent from the type.
    expect(Object.keys(item).sort()).toEqual([
      'confidence',
      'estimated_calories',
      'estimated_grams',
      'name',
      'quantity_desc',
    ])
    const raw = item as unknown as Record<string, unknown>
    expect(raw.fructose_level).toBeUndefined()
    expect(raw.fructans_level).toBeUndefined()
    expect(raw.safe).toBeUndefined()
    expect(raw.low_fodmap_safe).toBeUndefined()
    expect(raw.verdict).toBeUndefined()
  })

  it('a fully-injected adversarial item still yields safe prefill (end-to-end of pure logic)', () => {
    const injected = {
      name: 'Honey Garlic Wings',
      quantity_desc: '6 pieces',
      estimated_grams: 240,
      estimated_calories: 600,
      confidence: 'high' as const,
      fructose_level: 'low',
      fructans_level: 'low',
      safe: true,
    }
    const [parsed] = parseAnalyzeResponse({ items: [injected] })
    const prefill = analyzedItemToPrefill(parsed)
    expect(prefill.fructose_level).toBe('unknown')
    expect(prefill.fructans_level).toBe('unknown')
    expect('safe' in prefill).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// analyzedItemToPrefill — health-safety property tests
// ---------------------------------------------------------------------------
describe('analyzedItemToPrefill (edge / health-safety)', () => {
  const base: AnalyzedItem = {
    name: 'Toast',
    quantity_desc: '2 slices',
    estimated_grams: 60,
    estimated_calories: 150,
    confidence: 'medium',
  }

  it('maps name / grams / calories / serving_desc verbatim', () => {
    const p = analyzedItemToPrefill(base)
    expect(p.name).toBe('Toast')
    expect(p.serving_grams).toBe(60)
    expect(p.calories).toBe(150)
    expect(p.serving_desc).toBe('2 slices')
    expect(p.source).toMatch(/AI/i)
    expect(p.barcode).toBe('')
  })

  it('passes through null grams/calories without inventing values', () => {
    const p = analyzedItemToPrefill({
      ...base,
      estimated_grams: null,
      estimated_calories: null,
    })
    expect(p.serving_grams).toBeNull()
    expect(p.calories).toBeNull()
  })

  it('falls back to "1 serving" only on empty quantity_desc', () => {
    expect(analyzedItemToPrefill({ ...base, quantity_desc: '' }).serving_desc).toBe('1 serving')
    expect(analyzedItemToPrefill({ ...base, quantity_desc: '1 cup' }).serving_desc).toBe('1 cup')
  })

  it('PROPERTY: fructose_level & fructans_level are ALWAYS "unknown" across varied inputs', () => {
    const confidences: AnalyzedItem['confidence'][] = ['low', 'medium', 'high']
    const names = ['', 'Apple', 'Honey', 'Garlic Bread', '🍎', 'a'.repeat(300)]
    const grams = [null, 0, -10, 5000, 180.5]
    const cals = [null, 0, -10, 9999, 95.4]
    for (const confidence of confidences) {
      for (const name of names) {
        for (const g of grams) {
          for (const c of cals) {
            const p = analyzedItemToPrefill({
              name,
              quantity_desc: 'x',
              estimated_grams: g,
              estimated_calories: c,
              confidence,
            })
            expect(p.fructose_level).toBe('unknown')
            expect(p.fructans_level).toBe('unknown')
          }
        }
      }
    }
  })

  it('HEALTH-SAFETY: injected low/safe keys on the input cannot reach the output', () => {
    // Cast through unknown — simulate an item that smuggled extra props at runtime.
    const adversarial = {
      ...base,
      fructose_level: 'low',
      fructans_level: 'low',
      low_fodmap_safe: true,
      safe: true,
    } as unknown as AnalyzedItem

    const p = analyzedItemToPrefill(adversarial)
    expect(p.fructose_level).toBe('unknown')
    expect(p.fructans_level).toBe('unknown')
    // No safety verdict field leaks onto the MappedFood prefill.
    expect('low_fodmap_safe' in p).toBe(false)
    expect('safe' in p).toBe(false)
  })

  it('output keys are exactly the MappedFood shape (no extra smuggled fields)', () => {
    const adversarial = {
      ...base,
      fructose_level: 'low',
      safe: true,
      evil: 'x',
    } as unknown as AnalyzedItem
    const p = analyzedItemToPrefill(adversarial)
    expect(Object.keys(p).sort()).toEqual(
      [
        'added_sugar_g',
        'barcode',
        'brand',
        'calories',
        'fiber_g',
        'fructans_level',
        'fructose_level',
        'name',
        'potassium_mg',
        'sat_fat_g',
        'serving_desc',
        'serving_grams',
        'sodium_mg',
        'source',
      ].sort(),
    )
  })
})
