import { describe, it, expect } from 'vitest'
import { FODMAP_REFERENCE } from './fodmapReference'

describe('FODMAP_REFERENCE (memory aid)', () => {
  it('lists the canonical fructan triggers the owner named', () => {
    expect(FODMAP_REFERENCE.highFructans).toContain('onion')
    expect(FODMAP_REFERENCE.highFructans).toContain('garlic')
  })

  it('lists common excess-fructose fruits', () => {
    for (const f of ['apple', 'watermelon', 'pear']) {
      expect(FODMAP_REFERENCE.highFructose).toContain(f)
    }
  })

  it('offers low picks and no empty lists', () => {
    expect(FODMAP_REFERENCE.usuallyLow.length).toBeGreaterThan(0)
    expect(FODMAP_REFERENCE.highFructose.length).toBeGreaterThan(0)
    expect(FODMAP_REFERENCE.highFructans.length).toBeGreaterThan(0)
  })

  it('lists label-name aliases for the tracked axes', () => {
    expect(
      FODMAP_REFERENCE.fructansLabelNames.some((n) => n.includes('inulin')),
    ).toBe(true)
    expect(
      FODMAP_REFERENCE.fructoseLabelNames.some((n) => n.includes('HFCS')),
    ).toBe(true)
  })

  it('lists polyols (separate group) incl. sorbitol, for label-reading only', () => {
    expect(
      FODMAP_REFERENCE.polyolLabelNames.some((n) => n.startsWith('sorbitol')),
    ).toBe(true)
    expect(FODMAP_REFERENCE.polyolLabelNames.length).toBeGreaterThan(3)
  })
})
