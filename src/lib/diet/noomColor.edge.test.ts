import { describe, it, expect } from 'vitest'
import { noomColor, NOOM_DENSITY_THRESHOLDS } from './noomColor'

describe('noomColor — edge cases (extends noomColor.test.ts)', () => {
  it.each([
    // [calories, grams, expected] — boundary lock-in
    [0, 100, 'green'], // 0 cal/g — density floor
    [99, 100, 'green'], // 0.99 just under green max
    [100, 100, 'green'], // exactly 1.0 (inclusive green)
    [101, 100, 'yellow'], // just over green max
    [239, 100, 'yellow'], // just under yellow max
    [240, 100, 'yellow'], // exactly 2.4 (inclusive yellow)
    [241, 100, 'orange'], // just over yellow max
  ] as const)('classifies %i cal / %ig as %s', (cal, g, expected) => {
    expect(noomColor(cal, g)).toBe(expected)
  })

  it('thresholds are the single source of truth (1.0 / 2.4)', () => {
    expect(NOOM_DENSITY_THRESHOLDS.greenMax).toBe(1.0)
    expect(NOOM_DENSITY_THRESHOLDS.yellowMax).toBe(2.4)
  })

  it.each([
    [100, 0], // zero grams
    [100, -5], // negative grams
    [100, NaN], // non-finite grams
    [100, Infinity], // infinite grams
    [NaN, 100], // non-finite calories
    [Infinity, 100], // infinite calories
    [-10, 100], // negative calories
  ] as const)('returns null for bad input (%s cal / %s g)', (cal, g) => {
    expect(noomColor(cal, g)).toBeNull()
  })
})
