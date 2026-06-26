/**
 * Client wrapper for the `analyze-meal` Edge Function (Claude vision).
 *
 * Three clearly separated pieces (mirrors the "pure logic, thin shell" rule):
 *   - `targetDimensions` — PURE downscale math (no DOM/canvas). Unit-tested.
 *   - `downscaleToJpegBase64` — thin canvas shell around it (DOM-only).
 *   - `analyzeMeal` — network: downscale → attach the user's JWT → POST → parse.
 *
 * HEALTH-SAFETY (non-negotiable): an `AnalyzedItem` carries NO FODMAP/safety
 * field. The AI only identifies foods + estimates portions/calories. FODMAP
 * stays unknown ("Not verified") until the user matches the item to a cited DB
 * food or sets the levels manually. Nothing here can produce a "Safe" verdict.
 *
 * The captured image is sent to the Edge Function (which forwards it to
 * Anthropic) and is NOT persisted by the app.
 */
import { supabase } from '@/lib/supabase'
import type { MappedFood } from '@/lib/openfoodfacts'

export type Confidence = 'low' | 'medium' | 'high'

export interface AnalyzedItem {
  name: string
  quantity_desc: string
  estimated_grams: number | null
  estimated_calories: number | null
  confidence: Confidence
}

/** Max long-edge in pixels for the uploaded image (cost/payload lever). */
const MAX_EDGE = 1568
/** JPEG quality for the re-encode. */
const JPEG_QUALITY = 0.8

/**
 * PURE: scale (width, height) so the longer edge is at most `maxEdge`, never
 * upscaling, preserving aspect ratio. Non-finite/≤0 input returns a safe 1×1.
 */
export function targetDimensions(
  width: number,
  height: number,
  maxEdge = MAX_EDGE,
): { w: number; h: number } {
  const okW = Number.isFinite(width) && width > 0
  const okH = Number.isFinite(height) && height > 0
  if (!okW || !okH) return { w: 1, h: 1 }

  const longEdge = Math.max(width, height)
  if (longEdge <= maxEdge) {
    return { w: Math.round(width), h: Math.round(height) }
  }
  const scale = maxEdge / longEdge
  return {
    w: Math.max(1, Math.round(width * scale)),
    h: Math.max(1, Math.round(height * scale)),
  }
}

/** Load a File/Blob into an HTMLImageElement (DOM). */
function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read the image.'))
    }
    img.src = url
  })
}

/**
 * Downscale a chosen/captured image and re-encode it as JPEG, returned as
 * base64 (no `data:` prefix) plus its media_type. DOM-only — keep it out of the
 * pure-logic tests.
 */
export async function downscaleToJpegBase64(
  blob: Blob,
): Promise<{ base64: string; media_type: 'image/jpeg' }> {
  const img = await loadImage(blob)
  const { w, h } = targetDimensions(img.naturalWidth, img.naturalHeight)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process the image.')
  ctx.drawImage(img, 0, 0, w, h)

  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  const base64 = dataUrl.split(',')[1] ?? ''
  if (!base64) throw new Error('Could not encode the image.')
  return { base64, media_type: 'image/jpeg' }
}

/**
 * PURE: map an AI-identified item to the `MappedFood` prefill that
 * `ProductReviewForm` consumes for the "add as custom food" branch.
 *
 * HEALTH-SAFETY: FODMAP is literal `'unknown'` on both axes (the type forbids
 * anything else), so a custom photo food can never read as "Safe". The source
 * string flags the estimate as AI-derived and unverified.
 */
export function analyzedItemToPrefill(item: AnalyzedItem): MappedFood {
  return {
    name: item.name,
    brand: null,
    serving_desc: item.quantity_desc || '1 serving',
    serving_grams: item.estimated_grams,
    calories: item.estimated_calories,
    sodium_mg: null,
    sat_fat_g: null,
    potassium_mg: null,
    fiber_g: null,
    added_sugar_g: null,
    source: 'Photo estimate (AI) — verify',
    barcode: '',
    fructose_level: 'unknown',
    fructans_level: 'unknown',
  }
}

/** Defensive shape check — drop anything that is not a well-formed item. */
function isAnalyzedItem(v: unknown): v is AnalyzedItem {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  if (typeof o.name !== 'string' || o.name.trim() === '') return false
  if (typeof o.quantity_desc !== 'string') return false
  if (
    o.confidence !== 'low' &&
    o.confidence !== 'medium' &&
    o.confidence !== 'high'
  ) {
    return false
  }
  const numOrNull = (x: unknown) =>
    x === null || (typeof x === 'number' && Number.isFinite(x))
  if (!numOrNull(o.estimated_grams)) return false
  if (!numOrNull(o.estimated_calories)) return false
  return true
}

/** A non-negative finite number, else null (grams must be > 0 to be usable). */
function positiveOrNull(x: unknown): number | null {
  return typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null
}
function nonNegativeOrNull(x: unknown): number | null {
  return typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null
}

/**
 * Parse a function response body into typed items, dropping malformed entries.
 *
 * Treats the AI response as an untrusted boundary: each surviving item is
 * rebuilt from ONLY the five known fields, so any extra/adversarial keys the
 * model might emit (e.g. a smuggled `fructose_level`/`safe`) cannot ride
 * through to downstream logic. Out-of-range numbers (negative grams/calories)
 * are coerced to null rather than feeding bad NOOM/nutrient math.
 */
export function parseAnalyzeResponse(body: unknown): AnalyzedItem[] {
  if (typeof body !== 'object' || body === null) return []
  const items = (body as { items?: unknown }).items
  if (!Array.isArray(items)) return []
  return items.filter(isAnalyzedItem).map(
    (it): AnalyzedItem => ({
      name: it.name,
      quantity_desc: it.quantity_desc,
      estimated_grams: positiveOrNull(it.estimated_grams),
      estimated_calories: nonNegativeOrNull(it.estimated_calories),
      confidence: it.confidence,
    }),
  )
}

/**
 * Analyze a meal photo: downscale → POST to the Edge Function with the user's
 * access token → return typed items. Returns [] when no food is recognized.
 * THROWS a user-facing error when unconfigured, signed out, or the call fails.
 */
export async function analyzeMeal(file: Blob): Promise<AnalyzedItem[]> {
  if (!supabase) {
    throw new Error('Photo recognition needs a connected account.')
  }

  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) {
    throw new Error('Sign in to use photo recognition.')
  }

  const { base64, media_type } = await downscaleToJpegBase64(file)

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
  if (!supabaseUrl) {
    throw new Error('Photo recognition needs a connected account.')
  }

  let res: Response
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/analyze-meal`, {
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
    throw new Error('Could not analyze the photo. Try again.')
  }

  let parsed: unknown
  try {
    parsed = await res.json()
  } catch {
    throw new Error('Could not analyze the photo. Try again.')
  }
  return parseAnalyzeResponse(parsed)
}
