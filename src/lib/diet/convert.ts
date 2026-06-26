/**
 * Unit -> grams conversion layer for recipe NUTRITION roll-up (DASH servings,
 * fiber, sodium, saturated fat, potassium, calories).
 *
 * Scope reminder (CLAUDE.md): this is NUTRITION accuracy only. It does NOT touch
 * the FODMAP roll-up (worst-case fructose/fructans), which does not depend on
 * grams. Anything we cannot convert returns `null` (UNCONVERTIBLE) so the caller
 * can flag the roll-up as approximate — never silently 0, never shown as exact.
 *
 * Factor tables + parser spec come from `.planning/phase3-conversion-research.md`
 * (NIST Handbook 44 / SP 811 for weight; US customary volume). Do not invent
 * factors here.
 *
 * Pure module — no React, no DB, no DOM.
 */
import { pieceGrams } from './pieceWeights'

/** Canonical (normalized) weight unit keys. */
export type WeightUnit = 'g' | 'kg' | 'mg' | 'oz' | 'lb'
/** Canonical (normalized) volume unit keys. */
export type VolumeUnit = 'ml' | 'l' | 'tsp' | 'tbsp' | 'cup' | 'floz'
/**
 * Count / serving-relative units. Each distinct noun is its own family and only
 * converts against a food whose serving uses the SAME noun (clove==clove, but
 * lime!=wedge). `count` is a generic fallback piece.
 */
export type CountUnit =
  | 'count'
  | 'slice'
  | 'egg'
  | 'clove'
  | 'leaf'
  | 'olive'
  | 'almond'
  | 'cashew'
  | 'nut'
  | 'pepper'
  | 'wedge'
  | 'pita'
  | 'muffin'
  | 'cake'
  | 'cracker'
  | 'spear'
  | 'stalk'
  | 'scoop'
  | 'spray'
  | 'bunch'
  | 'head'
  | 'avocado'
  | 'scallion'
  | 'plum'
  | 'lime'
  | 'medium'
  | 'small'
  | 'large'

export type NormalizedUnit = WeightUnit | VolumeUnit | CountUnit

/** A parsed serving description, e.g. "1 cup (240 g)" -> { qty: 1, unit: 'cup' }. */
export interface ParsedServing {
  qty: number
  unit: NormalizedUnit
  /**
   * Optional alternate amount captured from a parenthetical when the primary
   * unit is a count noun, e.g. celery "1 stalk (about 1/4 cup)" -> primary
   * { qty: 1, unit: 'stalk' }, alt { qty: 0.25, unit: 'cup' }. Lets cup-based
   * ingredients bridge through a count-served food's parenthetical volume.
   */
  alt?: { qty: number; unit: NormalizedUnit }
}

/** Unit family, used by `toGrams` to decide which conversion path applies. */
export type UnitFamily = 'weight' | 'volume' | 'count'

const WEIGHT_UNITS: ReadonlySet<NormalizedUnit> = new Set<NormalizedUnit>([
  'g',
  'kg',
  'mg',
  'oz',
  'lb',
])
const VOLUME_UNITS: ReadonlySet<NormalizedUnit> = new Set<NormalizedUnit>([
  'ml',
  'l',
  'tsp',
  'tbsp',
  'cup',
  'floz',
])

/** Family of a canonical unit. */
export function unitFamily(unit: NormalizedUnit): UnitFamily {
  if (WEIGHT_UNITS.has(unit)) return 'weight'
  if (VOLUME_UNITS.has(unit)) return 'volume'
  return 'count'
}

/**
 * Free-form unit text -> canonical unit. ONE source of truth. Single-letter
 * aliases (t/T/c) are intentionally omitted (t-vs-T ambiguity); the seed data
 * does not use them. Plurals are also stripped in `canonicalUnit` as a fallback.
 */
export const UNIT_ALIASES: Readonly<Record<string, NormalizedUnit>> = {
  // weight
  g: 'g',
  gram: 'g',
  grams: 'g',
  gm: 'g',
  kg: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  mg: 'mg',
  milligram: 'mg',
  milligrams: 'mg',
  oz: 'oz',
  'oz.': 'oz',
  ounce: 'oz',
  ounces: 'oz',
  lb: 'lb',
  'lb.': 'lb',
  lbs: 'lb',
  'lbs.': 'lb',
  pound: 'lb',
  pounds: 'lb',
  // volume
  tsp: 'tsp',
  'tsp.': 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  tbsp: 'tbsp',
  'tbsp.': 'tbsp',
  tbs: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  cup: 'cup',
  cups: 'cup',
  floz: 'floz',
  'fl-oz': 'floz',
  'fluid ounce': 'floz',
  'fluid ounces': 'floz',
  ml: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  millilitre: 'ml',
  l: 'l',
  liter: 'l',
  liters: 'l',
  litre: 'l',
  // count nouns (singular keys; plurals handled by trailing-s strip below)
  count: 'count',
  piece: 'count',
  pieces: 'count',
  slice: 'slice',
  slices: 'slice',
  egg: 'egg',
  eggs: 'egg',
  clove: 'clove',
  cloves: 'clove',
  leaf: 'leaf',
  leaves: 'leaf',
  olive: 'olive',
  olives: 'olive',
  almond: 'almond',
  almonds: 'almond',
  cashew: 'cashew',
  cashews: 'cashew',
  nut: 'nut',
  nuts: 'nut',
  pepper: 'pepper',
  peppers: 'pepper',
  wedge: 'wedge',
  wedges: 'wedge',
  pita: 'pita',
  pitas: 'pita',
  muffin: 'muffin',
  muffins: 'muffin',
  cake: 'cake',
  cakes: 'cake',
  cracker: 'cracker',
  crackers: 'cracker',
  spear: 'spear',
  spears: 'spear',
  stalk: 'stalk',
  stalks: 'stalk',
  scoop: 'scoop',
  scoops: 'scoop',
  spray: 'spray',
  sprays: 'spray',
  bunch: 'bunch',
  bunches: 'bunch',
  head: 'head',
  heads: 'head',
  avocado: 'avocado',
  avocados: 'avocado',
  scallion: 'scallion',
  scallions: 'scallion',
  plum: 'plum',
  plums: 'plum',
  lime: 'lime',
  limes: 'lime',
  medium: 'medium',
  small: 'small',
  large: 'large',
}

/** Grams per 1 unit, for direct weight conversion (density-free, exact). */
export const WEIGHT_GRAMS: Readonly<Record<WeightUnit, number>> = {
  mg: 0.001,
  g: 1,
  kg: 1000,
  oz: 28.3495, // international avoirdupois ounce (NIST SP 811 App. B)
  lb: 453.592, // 1 lb = 16 oz (NIST SP 811)
}

/**
 * Teaspoons per 1 volume unit. The common volume<->volume path divides ingredient
 * volume by the food's serving volume expressed in a common sub-unit (tsp), so
 * absolute mL never enters and the US-vs-metric cup choice cancels. ml/l ratios
 * use US customary tsp = 4.92892 mL (NIST / US customary) for the rare fluid case.
 */
export const VOLUME_TSP: Readonly<Record<VolumeUnit, number>> = {
  tsp: 1,
  tbsp: 3, // 1 tbsp = 3 tsp
  cup: 48, // 1 cup = 48 tsp = 16 tbsp
  floz: 6, // 1 fl oz = 2 tbsp = 6 tsp
  ml: 1 / 4.92892, // US customary teaspoon = 4.92892 mL
  l: 1000 / 4.92892,
}

/** Modifier / prep words that follow a unit and never change it. Ignored. */
const PREP_WORDS: ReadonlySet<string> = new Set([
  'chopped',
  'sliced',
  'shredded',
  'diced',
  'minced',
  'grated',
  'cubed',
  'dry',
  'cooked',
  'raw',
  'kernels',
  'chunks',
  'halves',
  'leaves',
  'florets',
  'pitted',
  'crumbled',
  'fresh',
  'thinly',
])

/** Size adjectives that, when standalone, ARE the count unit (e.g. "1 small"). */
const SIZE_WORDS: ReadonlySet<NormalizedUnit> = new Set<NormalizedUnit>([
  'small',
  'medium',
  'large',
])

const VULGAR_FRACTIONS: Readonly<Record<string, number>> = {
  '½': 0.5,
  '¼': 0.25,
  '¾': 0.75,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅛': 0.125,
}

/** Canonicalize one raw unit token (already lowercased) -> canonical unit or null. */
export function canonicalUnit(raw: string | null | undefined): NormalizedUnit | null {
  if (raw == null) return null
  const token = raw.trim().toLowerCase()
  if (token.length === 0) return null
  // Try the full (possibly multi-word) unit first, so multi-word aliases like
  // "fluid ounce" aren't mis-read as their first token ("ounce" -> weight oz).
  const whole = lookupUnit(token)
  if (whole) return whole
  // `oz slice`, `large egg` etc.: take the first recognized token.
  const parts = token.split(/\s+/)
  for (const part of parts) {
    const hit = lookupUnit(part)
    if (hit) return hit
  }
  return null
}

function lookupUnit(token: string): NormalizedUnit | null {
  if (token in UNIT_ALIASES) return UNIT_ALIASES[token]
  // Fallback: strip a trailing plural 's' (e.g. an unlisted "stalks").
  if (token.endsWith('s')) {
    const singular = token.slice(0, -1)
    if (singular in UNIT_ALIASES) return UNIT_ALIASES[singular]
  }
  return null
}

/** Parse a leading quantity token (fraction, mixed, decimal, vulgar). null = none. */
function parseLeadingQty(tokens: string[]): { qty: number; rest: string[] } | null {
  if (tokens.length === 0) return null
  const first = tokens[0]

  // Vulgar fraction as the only/first token (e.g. "½").
  if (first in VULGAR_FRACTIONS) {
    return { qty: VULGAR_FRACTIONS[first], rest: tokens.slice(1) }
  }

  // Mixed number "1 1/2".
  if (/^\d+$/.test(first) && tokens.length > 1 && /^\d+\/\d+$/.test(tokens[1])) {
    const whole = Number(first)
    const frac = parseSimpleFraction(tokens[1])
    if (frac != null) return { qty: whole + frac, rest: tokens.slice(2) }
  }

  // Simple fraction "1/2".
  if (/^\d+\/\d+$/.test(first)) {
    const frac = parseSimpleFraction(first)
    if (frac != null) return { qty: frac, rest: tokens.slice(1) }
  }

  // Decimal / integer.
  if (/^\d+(\.\d+)?$/.test(first)) {
    return { qty: Number(first), rest: tokens.slice(1) }
  }

  return null
}

function parseSimpleFraction(s: string): number | null {
  const m = /^(\d+)\/(\d+)$/.exec(s)
  if (!m) return null
  const num = Number(m[1])
  const den = Number(m[2])
  if (den === 0) return null
  return num / den
}

/** Pull the first volume/count amount out of a parenthetical, e.g. "about 1/4 cup". */
function parseAlt(inner: string): { qty: number; unit: NormalizedUnit } | null {
  const tokens = inner
    .toLowerCase()
    .replace(/[^\w./¼½¾⅓⅔⅛-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  // Try each position as a qty start (handles a leading "about").
  for (let i = 0; i < tokens.length; i += 1) {
    const parsed = parseLeadingQty(tokens.slice(i))
    if (!parsed) continue
    const unit = canonicalUnit(parsed.rest[0])
    if (unit && (unitFamily(unit) === 'volume' || unitFamily(unit) === 'weight')) {
      return { qty: parsed.qty, unit }
    }
  }
  return null
}

/**
 * Parse a `serving_desc` string into a single qty + canonical unit, or `null`
 * when it can't be resolved to a recognized unit.
 *
 * Handles: a leading number incl. simple fractions ("1/2"), mixed numbers
 * ("1 1/2"), decimals ("0.5"), and unicode vulgar fractions; a unit token;
 * size-adjective+noun ("1 large egg" -> egg); trailing prep words (ignored);
 * and a trailing parenthetical (captured as `alt` when it is a volume/weight
 * amount, otherwise dropped). When the primary unit is unrecognized but a
 * parenthetical volume/weight amount exists, that becomes the primary unit.
 */
export function parseServingDesc(serving_desc: string): ParsedServing | null {
  if (typeof serving_desc !== 'string') return null
  const lower = serving_desc.toLowerCase().trim()
  if (lower.length === 0) return null

  // Capture (and remove) parentheticals; remember the first usable one as alt.
  let alt: { qty: number; unit: NormalizedUnit } | undefined
  const stripped = lower
    .replace(/\(([^)]*)\)/g, (_full, inner: string) => {
      if (!alt) {
        const a = parseAlt(inner)
        if (a) alt = a
      }
      return ' '
    })
    .replace(/\s+/g, ' ')
    .trim()

  const tokens = stripped.split(/\s+/).filter(Boolean)
  const qtyParse = parseLeadingQty(tokens)
  const qty = qtyParse ? qtyParse.qty : 1
  const rest = qtyParse ? qtyParse.rest : tokens

  // Find the first non-prep token that resolves to a unit (skip size adjectives
  // only if a later noun resolves; otherwise the size word IS the unit).
  let unit: NormalizedUnit | null = null
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i]
    if (PREP_WORDS.has(token)) continue
    const hit = lookupUnit(token)
    if (!hit) continue
    if (SIZE_WORDS.has(hit)) {
      // Prefer a following count noun (e.g. "large egg" -> egg).
      const next = rest.slice(i + 1).map(lookupUnit).find(Boolean)
      unit = next && !SIZE_WORDS.has(next) ? next : hit
    } else {
      unit = hit
    }
    break
  }

  if (unit) {
    return alt ? { qty, unit, alt } : { qty, unit }
  }
  // Primary token unrecognized but a parenthetical gave us a volume/weight amount.
  if (alt) return { qty: alt.qty, unit: alt.unit }
  return null
}

/**
 * Convert `quantity` of `unit` (canonical) to grams, using the food's own
 * `(serving_desc, serving_grams)` pair as the density bridge. Returns `null`
 * (UNCONVERTIBLE) for every unresolved case — never 0, never a guess.
 *
 * - WEIGHT unit: grams = quantity * WEIGHT_GRAMS[unit] (direct; food unused).
 * - VOLUME unit: needs the food's serving to also be volume (directly or via a
 *   parenthetical alt). Bridges through tsp ratios * food.serving_grams.
 * - COUNT unit: needs the food's serving to be the SAME count noun.
 *   grams = (quantity / foodServingQty) * food.serving_grams.
 *   When the noun does NOT match the food's serving noun, fall back to a cited
 *   per-piece weight from `pieceGrams(food.name, unit)` (e.g. "1 small onion" ->
 *   70 g) when `food.name` is provided and the table has an entry. That weight
 *   is the WHOLE piece and is independent of `serving_grams`, so it is returned
 *   directly as `quantity * gramsPerPiece` (the caller divides by serving_grams
 *   for nutrient scaling). No entry -> null.
 * - else -> null.
 *
 * `food.name` is OPTIONAL: omit it and the piece-weight fallback is simply not
 * attempted (matching/volume/weight paths are unchanged).
 *
 * `quantity` non-finite or <= 0 -> null.
 */
export function toGrams(
  quantity: number,
  unit: NormalizedUnit,
  food: { name?: string; serving_desc: string; serving_grams: number | null },
): number | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null

  // Case 1: weight is exact and density-free; the food is irrelevant.
  if (unitFamily(unit) === 'weight') {
    return quantity * WEIGHT_GRAMS[unit as WeightUnit]
  }

  // Everything else needs the food's serving as a density/count bridge.
  if (food.serving_grams == null || !Number.isFinite(food.serving_grams) || food.serving_grams <= 0) {
    return null
  }
  const serving = parseServingDesc(food.serving_desc)
  if (!serving) return null

  if (unitFamily(unit) === 'volume') {
    // Prefer a volume primary serving unit; else a volume parenthetical alt.
    let servQty: number | null = null
    let servUnit: VolumeUnit | null = null
    if (unitFamily(serving.unit) === 'volume') {
      servQty = serving.qty
      servUnit = serving.unit as VolumeUnit
    } else if (serving.alt && unitFamily(serving.alt.unit) === 'volume') {
      servQty = serving.alt.qty
      servUnit = serving.alt.unit as VolumeUnit
    }
    if (servUnit == null || servQty == null || servQty <= 0) return null

    const ingTsp = quantity * VOLUME_TSP[unit as VolumeUnit]
    const servTsp = servQty * VOLUME_TSP[servUnit]
    if (servTsp <= 0) return null
    return (ingTsp / servTsp) * food.serving_grams
  }

  // Count: prefer the food's own serving as the bridge when it is also a count.
  // A specific noun must match exactly (clove==clove, lime!=wedge). A bare size
  // word (small/medium/large) or generic `count` matches any single-piece count
  // serving — e.g. ingredient "3 large [eggs]" against a food served "1 large
  // egg" -> egg.
  if (unitFamily(serving.unit) === 'count' && serving.qty > 0) {
    const ingIsGeneric = SIZE_WORDS.has(unit) || unit === 'count'
    const servIsGeneric = SIZE_WORDS.has(serving.unit) || serving.unit === 'count'
    if (serving.unit === unit || ingIsGeneric || servIsGeneric) {
      return (quantity / serving.qty) * food.serving_grams
    }
  }

  // Count fallback: the noun did not match the food's serving (or the serving is
  // volume/weight). Consult the cited per-piece table keyed by the food's name.
  // The weight is the WHOLE piece, independent of serving_grams, so apply it
  // directly. Requires `food.name`; otherwise this branch is skipped -> null.
  if (food.name != null) {
    const perPiece = pieceGrams(food.name, unit)
    if (perPiece != null) return quantity * perPiece
  }

  return null
}
