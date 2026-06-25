/**
 * EXTENDED hardening for the PURE OFF mapper. Complements openfoodfacts.test.ts
 * (the happy-path / single-feature cases) with:
 *   1. Health-safety property test: NO OFF input can ever yield a non-'unknown'
 *      FODMAP level (the single most important invariant of the scan flow).
 *   2. Unit-conversion table with concrete expected numbers (basis selection,
 *      salt vs sodium, kJ vs kcal, g→mg) and null (never 0) on missing fields.
 *
 * Pure logic only — no network, no Date, no DOM.
 */
import { describe, it, expect } from 'vitest'
import {
  mapOpenFoodFactsToFood,
  type OffProduct,
} from './openfoodfacts'
import { noomColor } from '@/lib/diet'

const BARCODE = '0000000000000'

// ---------------------------------------------------------------------------
// 1. HEALTH SAFETY: FODMAP is ALWAYS 'unknown', for EVERY plausible shape.
// ---------------------------------------------------------------------------
describe('mapOpenFoodFactsToFood — FODMAP is always unknown (property)', () => {
  // A broad spread of shapes: empty, partial, full, and deliberately garbage /
  // adversarial values (NaN, Infinity, negatives, strings smuggled via `any`,
  // and keys that *spell* fodmap words). None may resolve to a known level.
  const garbageNutriments: Record<string, unknown>[] = [
    {},
    { 'energy-kcal_100g': 100 },
    { 'energy-kcal_serving': 100 },
    { energy_100g: 2000 },
    { energy_serving: 500 },
    { sodium_100g: 0.5, salt_100g: 1, potassium_100g: 0.3, fiber_100g: 5 },
    // adversarial numeric values
    { 'energy-kcal_100g': Number.NaN },
    { 'energy-kcal_100g': Number.POSITIVE_INFINITY },
    { 'energy-kcal_100g': Number.NEGATIVE_INFINITY },
    { 'energy-kcal_100g': -500 },
    { sodium_100g: -1, salt_100g: -2, potassium_100g: -3 },
    // strings / objects smuggled through `any`
    { 'energy-kcal_100g': '999' as unknown as number },
    { sodium_100g: 'lots' as unknown as number },
    { fiber_100g: {} as unknown as number },
    { fiber_100g: null as unknown as number },
    // keys that look like fodmap data but are NOT consumed by the mapper
    { fructose_100g: 99 as unknown as number },
    { fructans_100g: 99 as unknown as number },
    { fodmap: 'low' as unknown as number },
  ]

  const productShapes: OffProduct[] = [
    {},
    { product_name: 'X' },
    { product_name: 'X', serving_quantity: 50 },
    { product_name: 'X', serving_size: '1 cup', serving_quantity: 240 },
    { generic_name: 'Generic only' },
    { brands: 'Acme, Other' },
    // top-level garbage / smuggled fodmap-ish props
    { product_name: 'X', fructose_level: 'low' } as unknown as OffProduct,
    { product_name: 'X', fructans_level: 'high' } as unknown as OffProduct,
    { product_name: 'X', ingredients_text: 'onion, garlic, wheat, honey, hfcs' },
  ]

  it.each(garbageNutriments.map((n, i) => [i, n] as const))(
    'nutriments shape #%i never produces a known FODMAP level',
    (_i, n) => {
      const m = mapOpenFoodFactsToFood(
        { product_name: 'P', nutriments: n as OffProduct['nutriments'] },
        BARCODE,
      )
      expect(m.fructose_level).toBe('unknown')
      expect(m.fructans_level).toBe('unknown')
    },
  )

  it.each(productShapes.map((p, i) => [i, p] as const))(
    'product shape #%i never produces a known FODMAP level',
    (_i, p) => {
      const m = mapOpenFoodFactsToFood(p, BARCODE)
      expect(m.fructose_level).toBe('unknown')
      expect(m.fructans_level).toBe('unknown')
      // And the literal can never be one of the known levels.
      expect(['low', 'moderate', 'high']).not.toContain(m.fructose_level)
      expect(['low', 'moderate', 'high']).not.toContain(m.fructans_level)
    },
  )

  it('combinatorial cross-product of shapes × nutriments stays unknown', () => {
    for (const p of productShapes) {
      for (const n of garbageNutriments) {
        const m = mapOpenFoodFactsToFood(
          { ...p, nutriments: n as OffProduct['nutriments'] },
          BARCODE,
        )
        expect(m.fructose_level).toBe('unknown')
        expect(m.fructans_level).toBe('unknown')
      }
    }
  })
})

// ---------------------------------------------------------------------------
// 2. UNIT CONVERSIONS — concrete expected numbers, table-driven.
// ---------------------------------------------------------------------------
type ConvCase = {
  name: string
  product: OffProduct
  expect: {
    serving_grams: number | null
    serving_desc?: string
    calories: number | null
    sodium_mg?: number | null
    potassium_mg?: number | null
    sat_fat_g?: number | null
    fiber_g?: number | null
    added_sugar_g?: number | null
  }
}

const convCases: ConvCase[] = [
  {
    name: 'kcal_100g used directly, 100 g basis',
    product: { nutriments: { 'energy-kcal_100g': 250 } },
    expect: { serving_grams: 100, serving_desc: '100 g', calories: 250 },
  },
  {
    name: 'energy_100g (kJ) → kcal ÷ 4.184, basis still 100 g',
    product: { nutriments: { energy_100g: 1000 } },
    expect: { serving_grams: 100, calories: 1000 / 4.184 },
  },
  {
    name: 'kcal_100g preferred over kJ when both present',
    product: { nutriments: { 'energy-kcal_100g': 100, energy_100g: 9999 } },
    expect: { serving_grams: 100, calories: 100 },
  },
  {
    name: 'per-serving basis when no _100g energy; grams from serving_quantity',
    product: {
      serving_size: '40 g',
      serving_quantity: 40,
      nutriments: { 'energy-kcal_serving': 88 },
    },
    expect: { serving_grams: 40, serving_desc: '40 g', calories: 88 },
  },
  {
    name: 'per-serving kJ → kcal',
    product: {
      serving_quantity: 30,
      nutriments: { energy_serving: 418.4 },
    },
    expect: { serving_grams: 30, calories: 100 },
  },
  {
    name: 'sodium_100g g → mg ×1000',
    product: { nutriments: { 'energy-kcal_100g': 10, sodium_100g: 0.25 } },
    expect: { serving_grams: 100, calories: 10, sodium_mg: 250 },
  },
  {
    name: 'salt_100g → sodium mg ×393 when sodium absent',
    product: { nutriments: { 'energy-kcal_100g': 10, salt_100g: 2 } },
    expect: { serving_grams: 100, calories: 10, sodium_mg: 786 },
  },
  {
    name: 'sodium preferred over salt (both present)',
    product: {
      nutriments: { 'energy-kcal_100g': 10, sodium_100g: 0.1, salt_100g: 5 },
    },
    expect: { serving_grams: 100, calories: 10, sodium_mg: 100 },
  },
  {
    name: 'sodium_serving g → mg on serving basis',
    product: {
      serving_quantity: 20,
      nutriments: { 'energy-kcal_serving': 5, sodium_serving: 0.03 },
    },
    expect: { serving_grams: 20, calories: 5, sodium_mg: 30 },
  },
  {
    name: 'salt_serving → sodium mg ×393 on serving basis',
    product: {
      serving_quantity: 20,
      nutriments: { 'energy-kcal_serving': 5, salt_serving: 1 },
    },
    expect: { serving_grams: 20, calories: 5, sodium_mg: 393 },
  },
  {
    name: 'potassium_100g g → mg ×1000',
    product: { nutriments: { 'energy-kcal_100g': 10, potassium_100g: 0.45 } },
    expect: { serving_grams: 100, calories: 10, potassium_mg: 450 },
  },
  {
    name: 'sat fat / fiber / added sugar pass through unchanged (100g)',
    product: {
      nutriments: {
        'energy-kcal_100g': 10,
        'saturated-fat_100g': 3.5,
        fiber_100g: 7.2,
        'added-sugars_100g': 1.1,
      },
    },
    expect: {
      serving_grams: 100,
      calories: 10,
      sat_fat_g: 3.5,
      fiber_g: 7.2,
      added_sugar_g: 1.1,
    },
  },
  {
    name: 'missing nutrients → null (never 0) on 100g basis',
    product: { nutriments: { 'energy-kcal_100g': 10 } },
    expect: {
      serving_grams: 100,
      calories: 10,
      sodium_mg: null,
      potassium_mg: null,
      sat_fat_g: null,
      fiber_g: null,
      added_sugar_g: null,
    },
  },
  {
    name: 'serving basis with unknown grams → serving_grams null',
    product: {
      serving_size: '1 piece',
      nutriments: { 'energy-kcal_serving': 120 },
    },
    expect: { serving_grams: null, serving_desc: '1 piece', calories: 120 },
  },
  {
    name: 'no energy at all → serving basis, calories null',
    product: { serving_quantity: 50, nutriments: { fiber_serving: 2 } },
    expect: { serving_grams: 50, calories: null, fiber_g: 2 },
  },
  {
    name: 'completely empty product → serving basis, all null, default desc',
    product: {},
    expect: { serving_grams: null, serving_desc: '1 serving', calories: null },
  },
  {
    name: 'zero energy is a real value (0 kcal), not treated as missing',
    product: { nutriments: { 'energy-kcal_100g': 0 } },
    expect: { serving_grams: 100, calories: 0 },
  },
  {
    name: 'zero sodium is a real value (0 mg), not null',
    product: { nutriments: { 'energy-kcal_100g': 10, sodium_100g: 0 } },
    expect: { serving_grams: 100, calories: 10, sodium_mg: 0 },
  },
]

describe('mapOpenFoodFactsToFood — unit conversions (table)', () => {
  it.each(convCases)('$name', (c) => {
    const m = mapOpenFoodFactsToFood(c.product, BARCODE)
    const e = c.expect

    if (e.serving_grams === null) expect(m.serving_grams).toBeNull()
    else expect(m.serving_grams).toBe(e.serving_grams)

    if (e.serving_desc !== undefined) expect(m.serving_desc).toBe(e.serving_desc)

    if (e.calories === null) expect(m.calories).toBeNull()
    else expect(m.calories).toBeCloseTo(e.calories, 6)

    if (e.sodium_mg !== undefined) {
      if (e.sodium_mg === null) expect(m.sodium_mg).toBeNull()
      else expect(m.sodium_mg).toBeCloseTo(e.sodium_mg, 6)
    }
    if (e.potassium_mg !== undefined) {
      if (e.potassium_mg === null) expect(m.potassium_mg).toBeNull()
      else expect(m.potassium_mg).toBeCloseTo(e.potassium_mg, 6)
    }
    if (e.sat_fat_g !== undefined) {
      if (e.sat_fat_g === null) expect(m.sat_fat_g).toBeNull()
      else expect(m.sat_fat_g).toBe(e.sat_fat_g)
    }
    if (e.fiber_g !== undefined) {
      if (e.fiber_g === null) expect(m.fiber_g).toBeNull()
      else expect(m.fiber_g).toBe(e.fiber_g)
    }
    if (e.added_sugar_g !== undefined) {
      if (e.added_sugar_g === null) expect(m.added_sugar_g).toBeNull()
      else expect(m.added_sugar_g).toBe(e.added_sugar_g)
    }
  })
})

// ---------------------------------------------------------------------------
// 3. BASIS SELECTION edge: 100g energy present forces 100g basis even when a
//    serving_quantity also exists (no cross-mixing of calorie/gram bases).
// ---------------------------------------------------------------------------
describe('mapOpenFoodFactsToFood — basis selection is consistent', () => {
  it('100g energy present → 100g basis, ignores serving_quantity grams', () => {
    const m = mapOpenFoodFactsToFood(
      {
        serving_size: '30 g',
        serving_quantity: 30,
        nutriments: {
          'energy-kcal_100g': 400,
          'energy-kcal_serving': 120,
          fiber_100g: 5,
          fiber_serving: 1.5,
        },
      },
      BARCODE,
    )
    // 100g basis wins: grams=100, calories=400, fiber from _100g.
    expect(m.serving_grams).toBe(100)
    expect(m.serving_desc).toBe('100 g')
    expect(m.calories).toBe(400)
    expect(m.fiber_g).toBe(5)
    // Density therefore comes from the 100g pair (400/100 = 4 cal/g → orange).
    expect(noomColor(m.calories!, m.serving_grams!)).toBe('orange')
  })

  it('kJ-only on 100g still selects 100g basis (energy_100g present)', () => {
    const m = mapOpenFoodFactsToFood(
      {
        serving_quantity: 30,
        nutriments: { energy_100g: 1, 'energy-kcal_serving': 999 },
      },
      BARCODE,
    )
    expect(m.serving_grams).toBe(100)
    expect(m.calories).toBeCloseTo(1 / 4.184, 6)
  })
})

// ---------------------------------------------------------------------------
// 4. Density boundary sanity through the mapper (noomColor coupling).
// ---------------------------------------------------------------------------
describe('mapOpenFoodFactsToFood — NOOM density coupling', () => {
  it.each([
    [90, 100, 'green'], // 0.9 cal/g
    [100, 100, 'green'], // exactly 1.0 cal/g
    [200, 100, 'yellow'], // 2.0 cal/g
    [240, 100, 'yellow'], // exactly 2.4 cal/g
    [250, 100, 'orange'], // 2.5 cal/g
  ] as const)('%i kcal / %i g → %s', (kcal, grams, expected) => {
    const m = mapOpenFoodFactsToFood(
      { nutriments: { 'energy-kcal_100g': kcal } },
      BARCODE,
    )
    expect(m.serving_grams).toBe(grams)
    expect(noomColor(m.calories!, m.serving_grams!)).toBe(expected)
  })

  it('no grams → noomColor cannot be computed (returns null)', () => {
    const m = mapOpenFoodFactsToFood(
      { serving_size: '1 unit', nutriments: { 'energy-kcal_serving': 200 } },
      BARCODE,
    )
    expect(m.serving_grams).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 5. Name/brand/source metadata robustness.
// ---------------------------------------------------------------------------
describe('mapOpenFoodFactsToFood — metadata', () => {
  it('brand takes first of comma list, trimmed; absent → null', () => {
    expect(
      mapOpenFoodFactsToFood({ brands: '  Acme ,  Other ' }, BARCODE).brand,
    ).toBe('Acme')
    expect(mapOpenFoodFactsToFood({ brands: '   ' }, BARCODE).brand).toBeNull()
    expect(mapOpenFoodFactsToFood({}, BARCODE).brand).toBeNull()
  })

  it('source string always carries the scanned barcode', () => {
    const m = mapOpenFoodFactsToFood({}, '7501234567890')
    expect(m.source).toContain('7501234567890')
    expect(m.barcode).toBe('7501234567890')
  })

  it('product_name preferred over generic_name', () => {
    expect(
      mapOpenFoodFactsToFood(
        { product_name: 'Real Name', generic_name: 'Generic' },
        BARCODE,
      ).name,
    ).toBe('Real Name')
  })
})
