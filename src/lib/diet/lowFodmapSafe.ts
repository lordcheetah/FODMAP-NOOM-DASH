import type { FodmapLevel } from './types'

export type FodmapSafety = 'safe' | 'caution' | 'avoid' | 'not-verified'

/**
 * Determine low-FODMAP safety from the two axes this app tracks: fructose + fructans.
 *
 * SAFETY RULE (health app): a food is only "safe" when BOTH axes are explicitly `low`.
 * If either axis is `unknown`, the result is `not-verified` — NEVER "safe". A false
 * "safe" is the worst possible error here. See CLAUDE.md.
 *
 *   - 'safe'         : both fructose and fructans are low
 *   - 'avoid'        : either axis is high
 *   - 'caution'      : neither high, at least one moderate (and none unknown)
 *   - 'not-verified' : either axis is unknown
 */
export function lowFodmapSafe(
  fructose: FodmapLevel,
  fructans: FodmapLevel,
): FodmapSafety {
  if (fructose === 'unknown' || fructans === 'unknown') return 'not-verified'
  if (fructose === 'high' || fructans === 'high') return 'avoid'
  if (fructose === 'moderate' || fructans === 'moderate') return 'caution'
  return 'safe'
}

/** Convenience boolean: true ONLY when definitively safe. Unknown is never safe. */
export function isLowFodmapSafe(
  fructose: FodmapLevel,
  fructans: FodmapLevel,
): boolean {
  return lowFodmapSafe(fructose, fructans) === 'safe'
}
