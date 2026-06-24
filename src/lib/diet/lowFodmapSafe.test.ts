import { describe, it, expect } from 'vitest'
import { lowFodmapSafe, isLowFodmapSafe } from './lowFodmapSafe'
import type { FodmapLevel } from './types'

describe('lowFodmapSafe', () => {
  it('is safe only when both fructose and fructans are low', () => {
    expect(lowFodmapSafe('low', 'low')).toBe('safe')
  })

  it('avoids when either axis is high', () => {
    expect(lowFodmapSafe('high', 'low')).toBe('avoid')
    expect(lowFodmapSafe('low', 'high')).toBe('avoid')
    expect(lowFodmapSafe('high', 'high')).toBe('avoid')
    expect(lowFodmapSafe('moderate', 'high')).toBe('avoid')
  })

  it('cautions when at least one axis is moderate and none high/unknown', () => {
    expect(lowFodmapSafe('moderate', 'low')).toBe('caution')
    expect(lowFodmapSafe('low', 'moderate')).toBe('caution')
    expect(lowFodmapSafe('moderate', 'moderate')).toBe('caution')
  })

  // HEALTH-SAFETY REGRESSION GUARD: unknown must NEVER read as safe.
  it('never reports safe when either axis is unknown', () => {
    const levels: FodmapLevel[] = ['low', 'moderate', 'high', 'unknown']
    for (const other of levels) {
      expect(lowFodmapSafe('unknown', other)).toBe('not-verified')
      expect(lowFodmapSafe(other, 'unknown')).toBe('not-verified')
      expect(isLowFodmapSafe('unknown', other)).toBe(false)
      expect(isLowFodmapSafe(other, 'unknown')).toBe(false)
    }
  })

  it('isLowFodmapSafe is true only for the definitively-safe case', () => {
    expect(isLowFodmapSafe('low', 'low')).toBe(true)
    expect(isLowFodmapSafe('moderate', 'low')).toBe(false)
    expect(isLowFodmapSafe('high', 'low')).toBe(false)
  })
})
