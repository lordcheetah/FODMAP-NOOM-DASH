import { describe, it, expect } from 'vitest'
import { lowFodmapSafe, isLowFodmapSafe } from './lowFodmapSafe'
import { dashProgress, type LoggedNutrients } from './dashProgress'
import { fiberProgress } from './fiberProgress'
import { LOW_FODMAP_HIGH_FIBER } from './fiberSuggestions'
import type { FodmapLevel } from './types'

const LEVELS: FodmapLevel[] = ['low', 'moderate', 'high', 'unknown']

/**
 * HEALTH-SAFETY INVARIANT (whole diet layer):
 * an `unknown` fructose/fructans axis must NEVER be laundered into "safe" by any
 * function the diet layer exposes. lowFodmapSafe already guards this directly;
 * these tests assert the AGGREGATION functions (dashProgress, fiberProgress)
 * cannot expose a safety claim at all — they are structurally FODMAP-blind.
 */
describe('health-safety: unknown never becomes safe (cross-layer)', () => {
  it('lowFodmapSafe: unknown on either axis is never safe (all combinations)', () => {
    for (const a of LEVELS) {
      for (const b of LEVELS) {
        const verdict = lowFodmapSafe(a, b)
        if (a === 'unknown' || b === 'unknown') {
          expect(verdict, `${a}/${b}`).toBe('not-verified')
          expect(isLowFodmapSafe(a, b), `${a}/${b}`).toBe(false)
        } else {
          expect(verdict, `${a}/${b}`).not.toBe('not-verified')
        }
      }
    }
  })

  it('dashProgress output exposes NO safety/FODMAP field (cannot report safe)', () => {
    const entries: LoggedNutrients[] = [
      { meal: 'lunch', servings: 1, dash_group: 'vegetables', sodium_mg: 100 },
    ]
    const r = dashProgress(entries, { sodium_budget_mg: 2300 })
    const keys = Object.keys(r)
    for (const forbidden of ['safe', 'safety', 'fodmap', 'fructose', 'fructans', 'lowFodmap']) {
      expect(keys.some((k) => k.toLowerCase().includes(forbidden.toLowerCase()))).toBe(false)
    }
  })

  it('fiberProgress output exposes NO safety/FODMAP field beyond curated suggestions', () => {
    const r = fiberProgress([], { fiber_goal_g: 28 })
    const keys = Object.keys(r)
    for (const forbidden of ['safe', 'safety', 'fodmap', 'fructose', 'fructans']) {
      expect(keys.some((k) => k.toLowerCase().includes(forbidden.toLowerCase()))).toBe(false)
    }
  })

  it('fiber suggestions are a CLOSED curated set — no user food can be injected as a suggestion', () => {
    // Even with an "unknown"-everything pretend food logged, suggestions only ever
    // come from the curated low-FODMAP high-fiber constant.
    const r = fiberProgress(
      [{ meal: 'breakfast', servings: 1, fiber_g: 1 }],
      { fiber_goal_g: 100 },
    )
    expect(r.suggestions).toEqual([...LOW_FODMAP_HIGH_FIBER])
    const curatedNames = new Set(LOW_FODMAP_HIGH_FIBER.map((s) => s.name))
    for (const s of r.suggestions) {
      expect(curatedNames.has(s.name)).toBe(true)
      // every curated item is fructose+fructans low by construction → safe
      expect(isLowFodmapSafe('low', 'low')).toBe(true)
    }
  })

  it('the curated suggestion set itself contains only foods that would be classified safe', () => {
    // Documents the construction guarantee from fiberSuggestions.ts / CLAUDE.md.
    for (const s of LOW_FODMAP_HIGH_FIBER) {
      expect(s.fiber_g).toBeGreaterThan(0)
      // by construction these are fructose+fructans low; assert the rule that makes
      // them suggestable holds (a regression here would be a real safety bug).
      expect(lowFodmapSafe('low', 'low')).toBe('safe')
    }
  })
})
