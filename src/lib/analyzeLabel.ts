/**
 * Client wrapper for the `analyze-label` Edge Function (Claude vision).
 *
 * The user photographs a packaged food's Nutrition Facts panel; Claude reads the
 * EXACT per-serving nutrition. This complements barcode (OFF lookup) and
 * photo→meal (visual estimate) with label-accurate numbers.
 *
 * Two clearly separated pieces (mirrors the "pure logic, thin shell" rule):
 *   - `parseLabelResponse` / `labelToPrefill` — PURE, unit-tested. The mapper
 *     hard-sets FODMAP to 'unknown' and rebuilds a whitelisted object, so a
 *     smuggled `fructose_level`/`safe` key cannot ride through.
 *   - `analyzeLabel` — network: downscale → attach the user's JWT → POST → parse.
 *
 * HEALTH-SAFETY (non-negotiable): a Nutrition Facts label carries NO FODMAP
 * (fructose/fructans) data. A label-scanned food gets `fructose_level` /
 * `fructans_level` = 'unknown' → "Not verified," NEVER "Safe" — exactly like a
 * barcode lookup. Nothing here can produce a "Safe" verdict.
 *
 * The captured image is sent to the Edge Function (which forwards it to
 * Anthropic) and is NOT persisted by the app.
 */
import { supabase } from '@/lib/supabase'
import { downscaleToJpegBase64 } from '@/lib/analyzeMeal'
import type { MappedFood } from '@/lib/openfoodfacts'

/** The per-serving nutrition transcribed from a Nutrition Facts panel. */
export interface LabelNutrition {
  name: string | null
  serving_desc: string
  serving_grams: number | null
  calories: number | null
  sodium_mg: number | null
  sat_fat_g: number | null
  potassium_mg: number | null
  fiber_g: number | null
  added_sugar_g: number | null
}

/** A finite, non-negative number, else null (never NaN, never invented). */
function nonNegativeOrNull(x: unknown): number | null {
  return typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null
}

/** A non-empty trimmed string, else null. */
function stringOrNull(x: unknown): string | null {
  return typeof x === 'string' && x.trim() !== '' ? x.trim() : null
}

/**
 * PURE: parse a function response body into a typed `LabelNutrition`.
 *
 * Treats the AI response as an untrusted boundary: the result is rebuilt from
 * ONLY the known fields, so any extra/adversarial keys the model might emit
 * (e.g. a smuggled `fructose_level`/`safe`) cannot ride through. Out-of-range or
 * malformed numbers coerce to null. NEVER throws — a non-object yields a safe
 * default with an empty serving_desc.
 */
export function parseLabelResponse(body: unknown): LabelNutrition {
  const o =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : {}
  return {
    name: stringOrNull(o.name),
    serving_desc: stringOrNull(o.serving_desc) ?? '',
    serving_grams: nonNegativeOrNull(o.serving_grams),
    calories: nonNegativeOrNull(o.calories),
    sodium_mg: nonNegativeOrNull(o.sodium_mg),
    sat_fat_g: nonNegativeOrNull(o.sat_fat_g),
    potassium_mg: nonNegativeOrNull(o.potassium_mg),
    fiber_g: nonNegativeOrNull(o.fiber_g),
    added_sugar_g: nonNegativeOrNull(o.added_sugar_g),
  }
}

/**
 * PURE: map a `LabelNutrition` to the `MappedFood` prefill that
 * `ProductReviewForm` consumes for the "add as custom food" branch.
 *
 * HEALTH-SAFETY: FODMAP is literal `'unknown'` on both axes (the type forbids
 * anything else), so a label-scanned food can never read as "Safe". The object
 * is rebuilt from a whitelist of known fields — accepting `LabelNutrition` keeps
 * the surface narrow, but even an `unknown`-typed input could not smuggle a
 * level through. The source string flags the data as photo-derived.
 */
export function labelToPrefill(label: LabelNutrition): MappedFood {
  return {
    name: label.name ?? 'Packaged food',
    brand: null,
    serving_desc: label.serving_desc || '1 serving',
    serving_grams: label.serving_grams,
    calories: label.calories,
    sodium_mg: label.sodium_mg,
    sat_fat_g: label.sat_fat_g,
    potassium_mg: label.potassium_mg,
    fiber_g: label.fiber_g,
    added_sugar_g: label.added_sugar_g,
    source: 'Nutrition label (photo) — verify',
    barcode: '',
    fructose_level: 'unknown',
    fructans_level: 'unknown',
  }
}

/**
 * Scan a Nutrition Facts photo: downscale → POST to the Edge Function with the
 * user's access token → return typed per-serving nutrition.
 * THROWS a user-facing error when unconfigured, signed out, or the call fails.
 */
export async function analyzeLabel(file: Blob): Promise<LabelNutrition> {
  if (!supabase) {
    throw new Error('Label scanning needs a connected account.')
  }

  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) {
    throw new Error('Sign in to use label scanning.')
  }

  const { base64, media_type } = await downscaleToJpegBase64(file)

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
  if (!supabaseUrl) {
    throw new Error('Label scanning needs a connected account.')
  }

  let res: Response
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/analyze-label`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ image_base64: base64, media_type }),
    })
  } catch {
    throw new Error('Could not reach the server. Check your connection.')
  }

  if (!res.ok) {
    if (res.status === 401) throw new Error('Your session expired — sign in again.')
    throw new Error('Could not read the label. Try again.')
  }

  let parsed: unknown
  try {
    parsed = await res.json()
  } catch {
    throw new Error('Could not read the label. Try again.')
  }
  return parseLabelResponse(parsed)
}
