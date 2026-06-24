import type { NoomColor } from './types'

/**
 * NOOM caloric-density thresholds (calories per gram).
 * green: <= 1.0 cal/g | yellow: > 1.0 and <= 2.4 cal/g | orange: > 2.4 cal/g
 *
 * Defined in ONE place so the whole app stays consistent. See CLAUDE.md.
 */
export const NOOM_DENSITY_THRESHOLDS = {
  greenMax: 1.0,
  yellowMax: 2.4,
} as const

/**
 * Compute a food's NOOM color from its calories and weight in grams.
 *
 * Returns `null` when density can't be computed (non-positive grams or calories),
 * so callers can render "unknown" rather than a misleading color.
 */
export function noomColor(calories: number, grams: number): NoomColor | null {
  if (!Number.isFinite(calories) || !Number.isFinite(grams)) return null
  if (grams <= 0 || calories < 0) return null

  const density = calories / grams
  if (density <= NOOM_DENSITY_THRESHOLDS.greenMax) return 'green'
  if (density <= NOOM_DENSITY_THRESHOLDS.yellowMax) return 'yellow'
  return 'orange'
}
