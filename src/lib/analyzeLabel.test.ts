import { describe, expect, it } from 'vitest'

import {
  labelToPrefill,
  parseLabelResponse,
  type LabelNutrition,
} from './analyzeLabel'

describe('parseLabelResponse', () => {
  const valid = {
    name: 'Crunchy Granola',
    serving_desc: '2/3 cup (55 g)',
    serving_grams: 55,
    calories: 230,
    sodium_mg: 160,
    sat_fat_g: 1.5,
    potassium_mg: 200,
    fiber_g: 4,
    added_sugar_g: 7,
  }

  it('parses a fully-populated label', () => {
    expect(parseLabelResponse(valid)).toEqual<LabelNutrition>(valid)
  })

  it('maps missing/null fields to null and missing name to null', () => {
    expect(
      parseLabelResponse({ serving_desc: '1 bar' }),
    ).toEqual<LabelNutrition>({
      name: null,
      serving_desc: '1 bar',
      serving_grams: null,
      calories: null,
      sodium_mg: null,
      sat_fat_g: null,
      potassium_mg: null,
      fiber_g: null,
      added_sugar_g: null,
    })
  })

  it('coerces malformed / negative / NaN numbers to null', () => {
    const out = parseLabelResponse({
      serving_desc: 'x',
      serving_grams: 'lots',
      calories: -10,
      sodium_mg: Number.NaN,
      potassium_mg: Infinity,
      fiber_g: '4',
    })
    expect(out.serving_grams).toBeNull()
    expect(out.calories).toBeNull()
    expect(out.sodium_mg).toBeNull()
    expect(out.potassium_mg).toBeNull()
    expect(out.fiber_g).toBeNull()
  })

  it('never throws on non-object / garbage input (safe default)', () => {
    const empty: LabelNutrition = {
      name: null,
      serving_desc: '',
      serving_grams: null,
      calories: null,
      sodium_mg: null,
      sat_fat_g: null,
      potassium_mg: null,
      fiber_g: null,
      added_sugar_g: null,
    }
    expect(parseLabelResponse(null)).toEqual(empty)
    expect(parseLabelResponse(undefined)).toEqual(empty)
    expect(parseLabelResponse('nope')).toEqual(empty)
    expect(parseLabelResponse(42)).toEqual(empty)
    expect(parseLabelResponse([])).toEqual(empty)
  })

  it('empty/whitespace serving_desc becomes empty string', () => {
    expect(parseLabelResponse({ serving_desc: '   ' }).serving_desc).toBe('')
  })
})

describe('labelToPrefill', () => {
  const base: LabelNutrition = {
    name: 'Oat Crackers',
    serving_desc: '5 crackers (30 g)',
    serving_grams: 30,
    calories: 130,
    sodium_mg: 150,
    sat_fat_g: 0.5,
    potassium_mg: 60,
    fiber_g: 3,
    added_sugar_g: 1,
  }

  it('maps nutrition straight through and tags the source', () => {
    const p = labelToPrefill(base)
    expect(p.name).toBe('Oat Crackers')
    expect(p.serving_desc).toBe('5 crackers (30 g)')
    expect(p.serving_grams).toBe(30)
    expect(p.calories).toBe(130)
    expect(p.sodium_mg).toBe(150)
    expect(p.sat_fat_g).toBe(0.5)
    expect(p.potassium_mg).toBe(60)
    expect(p.fiber_g).toBe(3)
    expect(p.added_sugar_g).toBe(1)
    expect(p.source).toMatch(/nutrition label/i)
    expect(p.brand).toBeNull()
    expect(p.barcode).toBe('')
  })

  it('falls back to a generic name + serving when absent', () => {
    const p = labelToPrefill({ ...base, name: null, serving_desc: '' })
    expect(p.name).toBe('Packaged food')
    expect(p.serving_desc).toBe('1 serving')
  })

  it('HEALTH-SAFETY: FODMAP is ALWAYS unknown', () => {
    expect(labelToPrefill(base).fructose_level).toBe('unknown')
    expect(labelToPrefill(base).fructans_level).toBe('unknown')

    // Even when the (untrusted) input smuggles low/safe-looking keys, the
    // whitelisted rebuild drops them and FODMAP stays unknown.
    const injected = {
      ...base,
      fructose_level: 'low',
      fructans_level: 'low',
      safe: true,
      low_fodmap_safe: true,
    } as unknown as LabelNutrition
    const p = labelToPrefill(injected)
    expect(p.fructose_level).toBe('unknown')
    expect(p.fructans_level).toBe('unknown')
    // No smuggled key survives the rebuild.
    expect(Object.keys(p)).not.toContain('safe')
    expect(Object.keys(p)).not.toContain('low_fodmap_safe')
  })

  it('property: FODMAP unknown regardless of injected level on any axis', () => {
    const levels = ['low', 'moderate', 'high', 'unknown', 'safe', '']
    for (const fr of levels) {
      for (const fn of levels) {
        const p = labelToPrefill({
          ...base,
          fructose_level: fr,
          fructans_level: fn,
        } as unknown as LabelNutrition)
        expect(p.fructose_level).toBe('unknown')
        expect(p.fructans_level).toBe('unknown')
      }
    }
  })
})
