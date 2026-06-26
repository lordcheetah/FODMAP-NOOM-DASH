/**
 * Shared CORS helpers for Supabase Edge Functions.
 *
 * The browser calls these functions cross-origin, so every response (including
 * the OPTIONS preflight) must carry the CORS headers. The JWT gate inside each
 * function is the real protection; allowing any origin here is acceptable
 * because an unauthenticated caller is rejected before any upstream work.
 */
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** A 204 preflight response with the CORS headers. */
export function preflight(): Response {
  return new Response(null, { status: 204, headers: corsHeaders })
}

/** JSON response helper that always merges in the CORS + content-type headers. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })
}
