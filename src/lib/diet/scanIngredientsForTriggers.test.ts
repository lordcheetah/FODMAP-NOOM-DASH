import { describe, it, expect } from 'vitest'
import { scanIngredientsForTriggers } from './scanIngredientsForTriggers'

describe('scanIngredientsForTriggers', () => {
  it('matches single triggers', () => {
    expect(scanIngredientsForTriggers('Sugar, wheat flour, salt')).toEqual([
      'wheat',
    ])
    expect(scanIngredientsForTriggers('Dehydrated onion')).toEqual(['onion'])
    expect(scanIngredientsForTriggers('garlic powder')).toEqual(['garlic'])
  })

  it('is case-insensitive', () => {
    expect(scanIngredientsForTriggers('ONION, GARLIC')).toEqual([
      'onion',
      'garlic',
    ])
  })

  it('matches HFCS variants under one label', () => {
    expect(scanIngredientsForTriggers('high fructose corn syrup')).toEqual([
      'high-fructose corn syrup',
    ])
    expect(scanIngredientsForTriggers('Contains HFCS')).toEqual([
      'high-fructose corn syrup',
    ])
    expect(
      scanIngredientsForTriggers('high-fructose corn syrup, water'),
    ).toEqual(['high-fructose corn syrup'])
  })

  it('does not double-report bare "fructose" when only HFCS matched', () => {
    const r = scanIngredientsForTriggers('high fructose corn syrup')
    expect(r).toEqual(['high-fructose corn syrup'])
    expect(r).not.toContain('fructose')
  })

  it('reports standalone fructose', () => {
    expect(scanIngredientsForTriggers('crystalline fructose, water')).toEqual([
      'fructose',
    ])
  })

  it('matches inulin and chicory root', () => {
    expect(scanIngredientsForTriggers('chicory root fiber (inulin)')).toEqual([
      'inulin',
      'chicory root',
    ])
  })

  it('matches multiple triggers in declaration order, deduped', () => {
    const r = scanIngredientsForTriggers(
      'Wheat flour, onion, onion powder, honey, agave nectar',
    )
    expect(r).toEqual(['wheat', 'onion', 'agave', 'honey'])
  })

  it('returns [] for no matches — absence NEVER implies safe', () => {
    expect(scanIngredientsForTriggers('Water, salt, rice, carrot')).toEqual([])
  })

  it('returns [] for null/undefined/empty', () => {
    expect(scanIngredientsForTriggers(null)).toEqual([])
    expect(scanIngredientsForTriggers(undefined)).toEqual([])
    expect(scanIngredientsForTriggers('')).toEqual([])
  })

  it('never returns a FODMAP level (only string labels, not "low"/"safe")', () => {
    const r = scanIngredientsForTriggers('onion, garlic, water')
    expect(r).not.toContain('low')
    expect(r).not.toContain('safe')
    expect(Array.isArray(r)).toBe(true)
  })
})
