import { describe, it, expect } from 'vitest'
import { noomColor } from './noomColor'

describe('noomColor', () => {
  it.each([
    // [calories, grams, expected]
    [10, 100, 'green'], // 0.1 cal/g — leafy greens
    [100, 100, 'green'], // exactly 1.0 cal/g (boundary, inclusive)
    [150, 100, 'yellow'], // 1.5 cal/g — lean protein / grains
    [240, 100, 'yellow'], // exactly 2.4 cal/g (boundary, inclusive)
    [241, 100, 'orange'], // just over 2.4 cal/g
    [500, 100, 'orange'], // 5.0 cal/g — oils / nuts
  ] as const)('classifies %i cal / %ig as %s', (cal, g, expected) => {
    expect(noomColor(cal, g)).toBe(expected)
  })

  it('returns null when grams is zero or negative', () => {
    expect(noomColor(100, 0)).toBeNull()
    expect(noomColor(100, -5)).toBeNull()
  })

  it('returns null for non-finite or negative calories', () => {
    expect(noomColor(NaN, 100)).toBeNull()
    expect(noomColor(-10, 100)).toBeNull()
    expect(noomColor(Infinity, 100)).toBeNull()
  })
})
