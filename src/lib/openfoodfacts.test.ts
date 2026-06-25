import { describe, it, expect } from 'vitest'
import { mapOpenFoodFactsToFood, type OffProduct } from './openfoodfacts'
import { noomColor } from '@/lib/diet'

const BARCODE = '3017624010701'

describe('mapOpenFoodFactsToFood', () => {
  it('per-100g only: serving_grams=100, serving_desc="100 g", nutrients from _100g', () => {
    const product: OffProduct = {
      product_name: 'Test Spread',
      brands: 'Brand A, Brand B',
      nutriments: {
        'energy-kcal_100g': 539,
        sodium_100g: 0.107,
        'saturated-fat_100g': 12.1,
        fiber_100g: 3.4,
        potassium_100g: 0.42,
        'added-sugars_100g': 56.3,
      },
    }
    const m = mapOpenFoodFactsToFood(product, BARCODE)
    expect(m.serving_grams).toBe(100)
    expect(m.serving_desc).toBe('100 g')
    expect(m.calories).toBe(539)
    expect(m.sodium_mg).toBeCloseTo(107, 5)
    expect(m.sat_fat_g).toBe(12.1)
    expect(m.fiber_g).toBe(3.4)
    expect(m.potassium_mg).toBeCloseTo(420, 5)
    expect(m.added_sugar_g).toBe(56.3)
    expect(m.brand).toBe('Brand A')
  })

  it('per-serving present (no 100g): serving_grams=serving_quantity, nutrients from _serving', () => {
    const product: OffProduct = {
      product_name: 'Cookie',
      serving_size: '30 g',
      serving_quantity: 30,
      nutriments: {
        'energy-kcal_serving': 150,
        sodium_serving: 0.05,
        'saturated-fat_serving': 2,
        fiber_serving: 1.1,
        potassium_serving: 0.06,
        'added-sugars_serving': 8,
      },
    }
    const m = mapOpenFoodFactsToFood(product, BARCODE)
    expect(m.serving_grams).toBe(30)
    expect(m.serving_desc).toBe('30 g')
    expect(m.calories).toBe(150)
    expect(m.sodium_mg).toBeCloseTo(50, 5)
    expect(m.sat_fat_g).toBe(2)
    expect(m.fiber_g).toBe(1.1)
    expect(m.potassium_mg).toBeCloseTo(60, 5)
    expect(m.added_sugar_g).toBe(8)
  })

  it('salt → sodium mg when sodium absent (salt_100g=1.0 g → ~393 mg)', () => {
    const product: OffProduct = {
      product_name: 'Salty',
      nutriments: { 'energy-kcal_100g': 100, salt_100g: 1.0 },
    }
    const m = mapOpenFoodFactsToFood(product, BARCODE)
    expect(m.sodium_mg).toBeCloseTo(393, 5)
  })

  it('prefers sodium over salt when both present', () => {
    const product: OffProduct = {
      product_name: 'Both',
      nutriments: { 'energy-kcal_100g': 100, sodium_100g: 0.2, salt_100g: 1.0 },
    }
    const m = mapOpenFoodFactsToFood(product, BARCODE)
    expect(m.sodium_mg).toBeCloseTo(200, 5)
  })

  it('kJ → kcal when only energy_100g (kJ) present (×1/4.184)', () => {
    const product: OffProduct = {
      product_name: 'Energy kJ',
      nutriments: { energy_100g: 2000 },
    }
    const m = mapOpenFoodFactsToFood(product, BARCODE)
    expect(m.calories).toBeCloseTo(2000 / 4.184, 3)
    expect(m.serving_grams).toBe(100)
  })

  it('potassium normalized g → mg', () => {
    const product: OffProduct = {
      product_name: 'K',
      nutriments: { 'energy-kcal_100g': 50, potassium_100g: 0.3 },
    }
    const m = mapOpenFoodFactsToFood(product, BARCODE)
    expect(m.potassium_mg).toBeCloseTo(300, 5)
  })

  it('missing nutrient fields → null (never 0)', () => {
    const product: OffProduct = {
      product_name: 'Sparse',
      nutriments: { 'energy-kcal_100g': 80 },
    }
    const m = mapOpenFoodFactsToFood(product, BARCODE)
    expect(m.calories).toBe(80)
    expect(m.sodium_mg).toBeNull()
    expect(m.sat_fat_g).toBeNull()
    expect(m.potassium_mg).toBeNull()
    expect(m.fiber_g).toBeNull()
    expect(m.added_sugar_g).toBeNull()
  })

  it('per-serving with unknown grams → serving_grams=null (noomColor returns null)', () => {
    const product: OffProduct = {
      product_name: 'No grams',
      serving_size: '1 piece',
      nutriments: { 'energy-kcal_serving': 120 },
    }
    const m = mapOpenFoodFactsToFood(product, BARCODE)
    expect(m.serving_grams).toBeNull()
    expect(m.serving_desc).toBe('1 piece')
    expect(m.calories).toBe(120)
    // Downstream NOOM cannot be computed without grams.
    expect(
      m.calories != null && m.serving_grams != null
        ? noomColor(m.calories, m.serving_grams)
        : null,
    ).toBeNull()
  })

  it('added sugar absent → null even when total sugars present (no substitution)', () => {
    const product: OffProduct = {
      product_name: 'Sugary',
      nutriments: { 'energy-kcal_100g': 200 },
    }
    const m = mapOpenFoodFactsToFood(product, BARCODE)
    expect(m.added_sugar_g).toBeNull()
  })

  it('FODMAP is ALWAYS unknown on every input', () => {
    const cases: OffProduct[] = [
      {},
      { product_name: 'A', nutriments: { 'energy-kcal_100g': 100 } },
      { product_name: 'B', serving_quantity: 50, nutriments: { 'energy-kcal_serving': 10 } },
    ]
    for (const p of cases) {
      const m = mapOpenFoodFactsToFood(p, BARCODE)
      expect(m.fructose_level).toBe('unknown')
      expect(m.fructans_level).toBe('unknown')
    }
  })

  it('empty/garbage product → safe non-empty defaults, all nutrients null, FODMAP unknown', () => {
    const m = mapOpenFoodFactsToFood({}, BARCODE)
    expect(m.name).toBe('Unknown product')
    expect(m.serving_desc.length).toBeGreaterThan(0)
    expect(m.brand).toBeNull()
    expect(m.calories).toBeNull()
    expect(m.sodium_mg).toBeNull()
    expect(m.fiber_g).toBeNull()
    expect(m.fructose_level).toBe('unknown')
    expect(m.fructans_level).toBe('unknown')
    expect(m.barcode).toBe(BARCODE)
    expect(m.source).toContain(BARCODE)
  })

  it('name falls back to generic_name then "Unknown product"', () => {
    expect(
      mapOpenFoodFactsToFood({ generic_name: 'Generic' }, BARCODE).name,
    ).toBe('Generic')
    expect(mapOpenFoodFactsToFood({ product_name: '   ' }, BARCODE).name).toBe(
      'Unknown product',
    )
  })

  it('NOOM sanity: 539 kcal / 100 g → orange (>2.4 cal/g)', () => {
    const m = mapOpenFoodFactsToFood(
      { product_name: 'X', nutriments: { 'energy-kcal_100g': 539 } },
      BARCODE,
    )
    expect(noomColor(m.calories!, m.serving_grams!)).toBe('orange')
  })
})
