/**
 * Open Food Facts (OFF) barcode lookup + a PURE mapper to a FoodRow-shaped object.
 *
 * Two clearly separated pieces (mirrors the "pure logic, thin shell" rule used by
 * the diet lib):
 *   - `fetchProductByBarcode` — a thin, typed network wrapper. NOT unit-tested
 *     against the live API; never throws (returns 'not-found' / 'error').
 *   - `mapOpenFoodFactsToFood` — a PURE function (no network, no Date, no DOM,
 *     no randomness). Fully unit-tested.
 *
 * HEALTH-SAFETY (non-negotiable): OFF carries NO fructose/fructans data. The mapper
 * hard-codes `fructose_level='unknown'` and `fructans_level='unknown'` (literal
 * types, so a caller physically cannot smuggle a 'low' through it). A scanned
 * product can therefore never read as "Safe" — only the user, via the explicit
 * manual selectors in the review form, may set a known level. See CLAUDE.md.
 *
 * Attribution: OFF data is ODbL — surface "Data from Open Food Facts" on product
 * detail screens. We send `app_name`/`app_version` query params for courtesy
 * identification (browsers cannot set a custom User-Agent on fetch).
 */
import type { FoodRow } from '@/lib/db/types'

const OFF_BASE = 'https://world.openfoodfacts.org/api/v2/product'
const OFF_SEARCH = 'https://world.openfoodfacts.org/cgi/search.pl'
const APP_NAME = 'fodmap-noom-dash'
const APP_VERSION = '0.1'

/** kJ → kcal (1 kcal = 4.184 kJ). */
const KJ_TO_KCAL = 1 / 4.184
/** OFF stores sodium/salt in grams; sodium ≈ 39.3% of salt by mass. */
const SALT_G_TO_SODIUM_MG = 393
const G_TO_MG = 1000

/** Only request the fields the mapper + trigger scan actually read (payload lever). */
const FIELDS = [
  'code',
  'product_name',
  'generic_name',
  'brands',
  'serving_size',
  'serving_quantity',
  'nutriments',
  'ingredients_text',
].join(',')

/** Minimal typed view of the OFF v2 product payload we consume (all fields optional). */
export interface OffProduct {
  code?: string
  product_name?: string
  generic_name?: string
  brands?: string
  serving_size?: string
  serving_quantity?: number
  ingredients_text?: string
  nutriments?: {
    'energy-kcal_100g'?: number
    'energy-kcal_serving'?: number
    energy_100g?: number // kJ fallback
    energy_serving?: number // kJ fallback
    sodium_100g?: number // grams
    sodium_serving?: number // grams
    salt_100g?: number // grams
    salt_serving?: number // grams
    fiber_100g?: number // grams
    fiber_serving?: number // grams
    'saturated-fat_100g'?: number // grams
    'saturated-fat_serving'?: number // grams
    potassium_100g?: number // grams
    potassium_serving?: number // grams
    'added-sugars_100g'?: number // grams
    'added-sugars_serving'?: number // grams
  }
}

export interface OffFetchResult {
  status: 'found' | 'not-found' | 'error'
  product: OffProduct | null
}

/**
 * Look up a product on Open Food Facts by barcode. Anonymous GET (no key); a
 * simple CORS request (no preflight), so it is browser-callable.
 *
 * Never throws: 404 / `status:0` → 'not-found'; offline / network / parse failure
 * → 'error'. Callers fall back to manual entry on 'not-found' and offer a retry on
 * 'error'. Results are cached per-barcode by TanStack Query (see useFoodByBarcode-
 * adjacent flow); we add no runtime SW cache here.
 */
export async function fetchProductByBarcode(
  barcode: string,
): Promise<OffFetchResult> {
  const code = barcode.trim()
  if (!code) return { status: 'not-found', product: null }

  const url =
    `${OFF_BASE}/${encodeURIComponent(code)}` +
    `?fields=${FIELDS}&app_name=${APP_NAME}&app_version=${APP_VERSION}`

  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (res.status === 404) return { status: 'not-found', product: null }
    if (!res.ok) return { status: 'error', product: null }

    const body = (await res.json()) as {
      status?: number
      product?: OffProduct | null
    }
    if (body.status === 0 || !body.product) {
      return { status: 'not-found', product: null }
    }
    return { status: 'found', product: body.product }
  } catch {
    // Offline / DNS / CORS / JSON parse — surface as a retryable error, never throw.
    return { status: 'error', product: null }
  }
}

export interface OffSearchResult {
  status: 'found' | 'empty' | 'error'
  products: OffProduct[]
}

/**
 * Search Open Food Facts products by name (free-text). Anonymous GET, no key.
 * Never throws: non-OK / offline / parse failure → 'error'; no matches → 'empty'.
 * Returns products carrying a `code` (barcode) so a pick can prefill + dedup like
 * a scan. Only products with a usable name are kept.
 */
export async function searchProductsByName(term: string): Promise<OffSearchResult> {
  const q = term.trim()
  if (q.length < 2) return { status: 'empty', products: [] }

  const url =
    `${OFF_SEARCH}?search_terms=${encodeURIComponent(q)}` +
    `&search_simple=1&action=process&json=1&page_size=20` +
    `&fields=${FIELDS}&app_name=${APP_NAME}&app_version=${APP_VERSION}`

  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return { status: 'error', products: [] }
    const body = (await res.json()) as { products?: OffProduct[] }
    const products = (body.products ?? []).filter(
      (p) => (p.product_name?.trim() || p.generic_name?.trim())?.length,
    )
    return { status: products.length > 0 ? 'found' : 'empty', products }
  } catch {
    return { status: 'error', products: [] }
  }
}

/**
 * The mapper's output: a partial FoodRow the create-food form prefills. FODMAP is
 * literal-typed to 'unknown' so it is impossible to map OFF into a known level.
 */
export type MappedFood = Pick<
  FoodRow,
  | 'name'
  | 'brand'
  | 'serving_desc'
  | 'serving_grams'
  | 'calories'
  | 'sodium_mg'
  | 'sat_fat_g'
  | 'potassium_mg'
  | 'fiber_g'
  | 'added_sugar_g'
  | 'source'
> & {
  barcode: string
  fructose_level: 'unknown'
  fructans_level: 'unknown'
}

/** Finite number or null — never NaN, never invented. */
function num(v: number | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * PURE: map an OFF product to a FoodRow-shaped partial. No network/DOM/Date.
 *
 * NOOM basis (per research D5): prefer per-100g (most reliable on OFF) →
 * `calories = energy-kcal_100g`, `serving_grams = 100`, `serving_desc = "100 g"`.
 * Else per-serving → `energy-kcal_serving` + `serving_quantity` grams. If grams
 * are unknown, `serving_grams = null` so a downstream `noomColor` returns null
 * (unknown dot) rather than a fabricated density.
 *
 * Every missing nutrient maps to `null` (never 0 — a falsy 0 would read as
 * "contains none"). FODMAP is ALWAYS 'unknown'.
 */
export function mapOpenFoodFactsToFood(
  product: OffProduct,
  barcode: string,
): MappedFood {
  const n = product.nutriments ?? {}

  // Choose the basis: per-100g when energy-kcal_100g (or kJ) is present, else
  // per-serving. This keeps the (calories, grams) density pair internally
  // consistent — we never mix a per-100g calorie with a per-serving gram weight.
  const has100g =
    num(n['energy-kcal_100g']) != null || num(n.energy_100g) != null
  const basis: '100g' | 'serving' = has100g ? '100g' : 'serving'

  // Energy: prefer kcal; fall back to kJ → kcal.
  const kcal100 =
    num(n['energy-kcal_100g']) ??
    (num(n.energy_100g) != null ? n.energy_100g! * KJ_TO_KCAL : null)
  const kcalServing =
    num(n['energy-kcal_serving']) ??
    (num(n.energy_serving) != null ? n.energy_serving! * KJ_TO_KCAL : null)

  // Sodium mg: prefer sodium (g→mg ×1000), else derive from salt (g ×393).
  const sodium100 =
    num(n.sodium_100g) != null
      ? n.sodium_100g! * G_TO_MG
      : num(n.salt_100g) != null
        ? n.salt_100g! * SALT_G_TO_SODIUM_MG
        : null
  const sodiumServing =
    num(n.sodium_serving) != null
      ? n.sodium_serving! * G_TO_MG
      : num(n.salt_serving) != null
        ? n.salt_serving! * SALT_G_TO_SODIUM_MG
        : null

  // Potassium: OFF stores grams → ×1000 for mg.
  const potassium100 =
    num(n.potassium_100g) != null ? n.potassium_100g! * G_TO_MG : null
  const potassiumServing =
    num(n.potassium_serving) != null ? n.potassium_serving! * G_TO_MG : null

  let serving_desc: string
  let serving_grams: number | null
  let calories: number | null
  let sodium_mg: number | null
  let sat_fat_g: number | null
  let potassium_mg: number | null
  let fiber_g: number | null
  let added_sugar_g: number | null

  if (basis === '100g') {
    serving_grams = 100
    serving_desc = '100 g'
    calories = kcal100
    sodium_mg = sodium100
    potassium_mg = potassium100
    sat_fat_g = num(n['saturated-fat_100g'])
    fiber_g = num(n.fiber_100g)
    added_sugar_g = num(n['added-sugars_100g'])
  } else {
    serving_grams = num(product.serving_quantity)
    serving_desc = product.serving_size?.trim() || '1 serving'
    calories = kcalServing
    sodium_mg = sodiumServing
    potassium_mg = potassiumServing
    sat_fat_g = num(n['saturated-fat_serving'])
    fiber_g = num(n.fiber_serving)
    added_sugar_g = num(n['added-sugars_serving'])
  }

  const name =
    product.product_name?.trim() ||
    product.generic_name?.trim() ||
    'Unknown product'
  const brand = product.brands?.split(',')[0]?.trim() || null

  return {
    name,
    brand,
    serving_desc,
    serving_grams,
    calories,
    sodium_mg,
    sat_fat_g,
    potassium_mg,
    fiber_g,
    added_sugar_g,
    source: `Open Food Facts (ODbL), barcode ${barcode}`,
    barcode,
    fructose_level: 'unknown',
    fructans_level: 'unknown',
  }
}
