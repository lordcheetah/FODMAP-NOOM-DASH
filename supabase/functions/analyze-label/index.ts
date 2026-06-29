/**
 * Edge Function: analyze-label (Deno) — server-side Claude vision.
 *
 * Reads a packaged food's NUTRITION FACTS panel from a photo and extracts the
 * EXACT per-serving nutrition (calories, sodium, sat fat, potassium, fiber,
 * added sugar) plus the serving description/grams and product name if visible.
 *
 * A Nutrition Facts label does NOT carry FODMAP (fructose/fructans) data, so the
 * response schema has NO FODMAP/safety field and the prompt forbids assessing
 * diet/safety. A label-scanned food therefore stays "Not verified" (FODMAP
 * unknown), never "Safe" — exactly like a barcode lookup — until the user sets
 * the levels manually. Mirrors analyze-meal.
 *
 * ── Required secrets / env ─────────────────────────────────────────────────
 *   ANTHROPIC_API_KEY   Anthropic key — SERVER-ONLY (same secret as analyze-meal):
 *                         supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
 *                       Never a VITE_ var, never in the client bundle, never
 *                       committed. The function rejects unauthenticated callers
 *                       (401) so it cannot be abused as a free Claude proxy.
 *   SUPABASE_URL        Auto-injected in the Functions runtime (used to verify
 *   SUPABASE_ANON_KEY   the caller's JWT). Provide via --env-file for local serve.
 *
 * ── Deploy / run ───────────────────────────────────────────────────────────
 *   supabase functions deploy analyze-label
 *   supabase functions serve analyze-label   # local; loads supabase/functions/.env
 *
 * ── Contract ───────────────────────────────────────────────────────────────
 *   POST { image_base64: string, media_type: "image/jpeg"|"image/png"|"image/webp" }
 *   200  { ...LabelNutrition }       per-serving fields, null for anything off-label
 *   401  { error: "unauthorized" }   missing/invalid JWT
 *   400  { error: "bad_request" }    missing/invalid body
 *   502  { error: "analyze_failed" } Claude non-2xx, refusal, or unparseable body
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, jsonResponse, preflight } from '../_shared/cors.ts'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-opus-4-8'
const MAX_TOKENS = 1024

const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/**
 * Structured-output schema. CRITICAL: no FODMAP/safety/allergen/diet field — the
 * model only transcribes the Nutrition Facts panel's per-serving numbers.
 */
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'name',
    'serving_desc',
    'serving_grams',
    'calories',
    'sodium_mg',
    'sat_fat_g',
    'potassium_mg',
    'fiber_g',
    'added_sugar_g',
  ],
  properties: {
    name: { type: ['string', 'null'] },
    serving_desc: { type: 'string' },
    serving_grams: { type: ['number', 'null'] },
    calories: { type: ['number', 'null'] },
    sodium_mg: { type: ['number', 'null'] },
    sat_fat_g: { type: ['number', 'null'] },
    potassium_mg: { type: ['number', 'null'] },
    fiber_g: { type: ['number', 'null'] },
    added_sugar_g: { type: ['number', 'null'] },
  },
} as const

const PROMPT = [
  'Read the Nutrition Facts panel in this photo and extract the PER-SERVING values.',
  'Give serving_desc as the serving size text (e.g. "1 cup (240 mL)", "2 cookies"),',
  'and serving_grams as the serving weight in grams if the label states it.',
  'Extract calories, sodium (convert to mg), saturated fat (g), potassium (convert to mg),',
  'dietary fiber (g), and added sugars (g) — all PER SERVING, not per container.',
  'Use null for any value that is not printed on the label — never guess, and never use 0 to mean unknown.',
  'Identify the product name from the packaging if it is visible, else use null.',
  'Do NOT assess dietary safety, FODMAP content, allergens, or healthiness in any way —',
  'only transcribe what the Nutrition Facts panel states.',
].join(' ')

interface ParsedBody {
  image_base64: string
  media_type: string
}

function parseBody(raw: unknown): ParsedBody | null {
  if (typeof raw !== 'object' || raw === null) return null
  const b = raw as Record<string, unknown>
  if (typeof b.image_base64 !== 'string' || b.image_base64.length === 0) {
    return null
  }
  if (
    typeof b.media_type !== 'string' ||
    !ALLOWED_MEDIA_TYPES.includes(b.media_type)
  ) {
    return null
  }
  return { image_base64: b.image_base64, media_type: b.media_type }
}

/** Pull the JSON text block out of a Claude messages response. */
function extractText(content: unknown): string | null {
  if (!Array.isArray(content)) return null
  for (const block of content) {
    if (
      block &&
      typeof block === 'object' &&
      (block as { type?: unknown }).type === 'text' &&
      typeof (block as { text?: unknown }).text === 'string'
    ) {
      return (block as { text: string }).text
    }
  }
  return null
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return preflight()
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405)
  }

  // ── Auth gate: verify the caller's Supabase JWT before any Claude call.
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return jsonResponse({ error: 'unauthorized' }, 401)
  }
  const token = authHeader.slice('Bearer '.length)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: 'analyze_failed' }, 502)
  }
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData?.user) {
    return jsonResponse({ error: 'unauthorized' }, 401)
  }

  // ── Body validation.
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonResponse({ error: 'bad_request' }, 400)
  }
  const body = parseBody(raw)
  if (!body) return jsonResponse({ error: 'bad_request' }, 400)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    // Misconfiguration: do not leak which secret is missing.
    return jsonResponse({ error: 'analyze_failed' }, 502)
  }

  // ── Claude vision call. Image BEFORE text; structured output via output_config.
  let upstream: Response
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        output_config: { format: { type: 'json_schema', schema: SCHEMA } },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: body.media_type,
                  data: body.image_base64,
                },
              },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
      }),
    })
  } catch (err) {
    console.error('analyze-label: upstream fetch failed', String(err))
    return jsonResponse({ error: 'analyze_failed' }, 502)
  }

  if (!upstream.ok) {
    // Log status only — never the body (could echo back the key in error envelopes).
    console.error('analyze-label: Claude returned', upstream.status)
    return jsonResponse({ error: 'analyze_failed' }, 502)
  }

  let result: {
    stop_reason?: string
    content?: unknown
  }
  try {
    result = await upstream.json()
  } catch {
    return jsonResponse({ error: 'analyze_failed' }, 502)
  }

  // Refusal: do not read content blindly.
  if (result.stop_reason === 'refusal') {
    console.error('analyze-label: Claude refused the request')
    return jsonResponse({ error: 'analyze_failed' }, 502)
  }

  const text = extractText(result.content)
  if (text == null) {
    return jsonResponse({ error: 'analyze_failed' }, 502)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return jsonResponse({ error: 'analyze_failed' }, 502)
  }

  // The schema guarantees the label object; pass it straight through (the client
  // re-validates defensively and hard-sets FODMAP to unknown).
  const label =
    parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}

  return new Response(JSON.stringify(label), {
    status: 200,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })
})
