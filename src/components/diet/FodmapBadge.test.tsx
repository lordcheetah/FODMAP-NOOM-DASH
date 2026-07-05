import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { FodmapBadge } from './FodmapBadge'
import type { FodmapLevel } from '@/lib/diet'

const LEVELS: FodmapLevel[] = ['low', 'moderate', 'high', 'unknown']

/** Render the badge and read its verdict (data-safety) + visible label text. */
function badge(fructose: FodmapLevel, fructans: FodmapLevel) {
  const { container } = render(<FodmapBadge fructose={fructose} fructans={fructans} />)
  const el = container.querySelector('[data-safety]')!
  return { verdict: el.getAttribute('data-safety'), text: (el.textContent ?? '').toLowerCase() }
}

/**
 * HEALTH-SAFETY (rendered): the badge a user actually SEES must never label an
 * unknown-FODMAP food "Safe". The diet-layer logic is covered in
 * healthSafety.test.ts; this asserts the component render (formerly an e2e check
 * against a demo row that no longer exists).
 */
describe('FodmapBadge — never renders unknown as safe', () => {
  it('unknown on either axis → "Not verified", never "Safe"', () => {
    for (const other of LEVELS) {
      for (const [f, fr] of [
        ['unknown', other],
        [other, 'unknown'],
      ] as [FodmapLevel, FodmapLevel][]) {
        const { verdict, text } = badge(f, fr)
        expect(verdict, `${f}/${fr}`).toBe('not-verified')
        expect(text, `${f}/${fr}`).toContain('not verified')
        expect(text, `${f}/${fr}`).not.toContain('safe')
      }
    }
  })

  it('both axes low → "Safe"', () => {
    const { verdict, text } = badge('low', 'low')
    expect(verdict).toBe('safe')
    expect(text).toContain('safe')
  })

  it('a known-high axis → "Avoid" (never safe)', () => {
    const { verdict } = badge('high', 'low')
    expect(verdict).toBe('avoid')
    expect(verdict).not.toBe('safe')
  })
})
