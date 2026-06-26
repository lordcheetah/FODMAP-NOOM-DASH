/**
 * Per-piece gram weights for count-unit produce, used by `toGrams()` ONLY when
 * the ingredient's count noun does NOT match the linked food's serving noun
 * (e.g. ingredient "1 small [onion]" against a food served "1/2 cup chopped").
 *
 * Scope reminder (CLAUDE.md): NUTRITION accuracy only. This does NOT touch the
 * FODMAP roll-up (worst-case fructose/fructans), which never uses grams. Each
 * weight is an approximation — the caller still returns it only when matched,
 * and any food/noun NOT in this table stays UNCONVERTIBLE (null), so a roll-up
 * is flagged INCOMPLETE rather than silently 0.
 *
 * Every value is cited in `.planning/phase3-piece-weights.md` (primary source:
 * USDA FoodData Central SR Legacy / Foundation Foods portion data). All weights
 * are raw edible portion unless noted.
 *
 * Pure module — no React, no DB, no network, no DOM. Frozen constant.
 */

/**
 * Normalize a `foods.name` value for table lookup: trim surrounding whitespace
 * and lowercase. Keys in `PIECE_GRAMS` are stored in this normalized form, so
 * `pieceGrams` applies the same transform to its input before looking up.
 */
export function normalizeFoodName(name: string): string {
  return name.trim().toLowerCase()
}

/**
 * Normalized food name -> count noun -> grams per single piece.
 *
 * Noun keys are canonical `CountUnit` values (incl. the new `scallion`, `plum`,
 * `lime`). Only the count nouns actually used by current recipes (or directly
 * cited) are listed; everything else stays unconvertible by design.
 */
export const PIECE_GRAMS: Readonly<
  Record<string, Readonly<Partial<Record<string, number>>>>
> = Object.freeze({
  // USDA FDC SR Legacy, Onions raw (FDC 170000): 1 small 70 g, 1 medium 110 g,
  // 1 large 150 g. (Red onion has no separate SR portion; recipes link it here.)
  'onion, raw': Object.freeze({ small: 70, medium: 110, large: 150 }),

  // USDA FDC SR Legacy, Carrots raw (FDC 170393): 1 medium 61 g, 1 large 72 g.
  // (Recipes use only "medium"; small is unused, so it is intentionally omitted.)
  carrot: Object.freeze({ medium: 61, large: 72 }),

  // USDA FDC SR Legacy, Onions spring/scallions incl. tops & bulb, raw
  // (FDC 170005): 1 medium (4-1/8 in) = 15 g. The food row is "white part only"
  // (served 2 tbsp sliced = 12 g); 15 g for a whole stalk slightly over-counts
  // the white-only mass but is the closest cited public value (flagged in note).
  'scallion/green onion, white part': Object.freeze({ scallion: 15 }),

  // USDA FDC SR Legacy, Tomatoes red ripe raw year-round avg (FDC 170457):
  // 1 plum tomato = 62 g.
  'tomato, fresh': Object.freeze({ plum: 62 }),

  // USDA FDC SR Legacy, Limes raw (SR): 1 fruit (2 in dia) = 67 g. The recipe's
  // "1 lime" is the WHOLE fruit (food row is per-wedge); peel/flesh are mostly
  // discarded so this over-counts consumed mass, but per-gram nutrients are tiny.
  'lime, whole/wedge': Object.freeze({ lime: 67 }),

  // USDA FDC SR Legacy, Lettuce butterhead incl. boston & bibb, raw (FDC 168429):
  // 1 head (5 in dia) = 163 g; 1 leaf medium ~7.5 g.
  'butter/boston bibb lettuce': Object.freeze({ head: 163, leaf: 7.5 }),

  // USDA FDC SR Legacy, Peppers sweet red raw (SR): 1 small 74 g, 1 medium
  // 119 g, 1 large 164 g.
  'bell pepper, red': Object.freeze({ small: 74, medium: 119, large: 164 }),

  // USDA FDC SR Legacy, Cucumber with peel raw (FDC 168409): 1 small (6-3/8 in)
  // = 158 g.
  cucumber: Object.freeze({ small: 158 }),

  // Kale "1 bunch" is intentionally OMITTED: USDA SR has no bunch portion and
  // retail bunch mass is highly variable (~200-400 g); recipes also discard
  // stems. Leaving it unconvertible keeps the Kale Chips roll-up honestly
  // INCOMPLETE rather than carrying a shaky number (see note §2 recommendation).
})

/**
 * Grams per single piece for `(foodName, unit)`, or `null` when the table has no
 * entry. `unit` is a canonical `CountUnit` noun. Returns `null` (not 0) on a
 * miss so callers keep the ingredient UNCONVERTIBLE.
 */
export function pieceGrams(foodName: string | null | undefined, unit: string): number | null {
  if (typeof foodName !== 'string') return null
  const grams = PIECE_GRAMS[normalizeFoodName(foodName)]?.[unit]
  return typeof grams === 'number' && Number.isFinite(grams) && grams > 0 ? grams : null
}
