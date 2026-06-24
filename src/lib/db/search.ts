/**
 * Build a safe `ilike` "contains" pattern from user input.
 *
 * Escapes the LIKE wildcards (`%`, `_`) and the escape char (`\`) so the term
 * matches literally, then wraps it in `%…%`. Use only with the single-column
 * `.ilike(column, pattern)` form (supabase-js sends the value as a separate,
 * URL-encoded parameter, so PostgREST tokens like `,` `(` `)` `.` are safe).
 * Do NOT interpolate user input into a `.or(...)` string without quoting.
 */
export function likeContains(term: string): string {
  const escaped = term.replace(/[\\%_]/g, (ch) => `\\${ch}`)
  return `%${escaped}%`
}
