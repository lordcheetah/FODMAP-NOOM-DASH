/**
 * Shared diet-domain types.
 *
 * Project scope reminder: "FODMAP" in this app means FRUCTOSE and FRUCTANS ONLY.
 * See CLAUDE.md for the full rules.
 */

/** Confidence-bearing level for a single FODMAP axis. `unknown` must never read as "safe". */
export type FodmapLevel = 'low' | 'moderate' | 'high' | 'unknown'

/** NOOM classification, derived from caloric density (cal/g) — never hand-labeled. */
export type NoomColor = 'green' | 'yellow' | 'orange'

export type NoomCategory =
  | 'protein'
  | 'whole-grain'
  | 'non-starchy-veg'
  | 'starchy-veg'
  | 'fruit'
  | 'fat'
  | 'freebie'

/** DASH food groups tracked as daily servings. */
export type DashGroup =
  | 'grains'
  | 'vegetables'
  | 'fruits'
  | 'dairy'
  | 'meat-poultry-fish'
  | 'nuts-seeds-legumes'
  | 'fats-oils'
  | 'sweets'
