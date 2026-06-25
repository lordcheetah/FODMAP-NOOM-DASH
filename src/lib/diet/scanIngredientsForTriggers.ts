/**
 * PURE, non-authoritative ingredient-text trigger scan.
 *
 * Open Food Facts carries NO fructose/fructans grading, but its `ingredients_text`
 * may name obvious high-fructan / excess-fructose ingredients. We surface these as
 * a "possible trigger" HINT only.
 *
 * SAFETY RULE (non-negotiable, see CLAUDE.md): this is a warning aid, NOTHING more.
 *   - A match NEVER sets a FODMAP level — it only displays a caution.
 *   - The ABSENCE of a match means NOTHING. An ingredient list can be incomplete,
 *     and many high-FODMAP foods carry no flagged word. Absence must NEVER imply
 *     "safe" / "low". The only route to a known level is the user's explicit manual
 *     selection in the review form.
 */

/**
 * Known trigger phrases (fructans: wheat/onion/garlic/inulin/chicory/FOS;
 * excess fructose: HFCS/agave/honey/fructose). Matched case-insensitively as
 * substrings. `label` is what we show the user; `patterns` are the variants we
 * match (so "HFCS" and "high-fructose corn syrup" collapse to one label).
 */
const TRIGGERS: ReadonlyArray<{
  label: string
  patterns: readonly string[]
  /** Require a leading word boundary so e.g. "wheat" doesn't match the
   *  low-FODMAP grain "buckwheat" (over-warning the wrong direction). */
  boundary?: boolean
}> = [
  { label: 'wheat', patterns: ['wheat'], boundary: true },
  { label: 'onion', patterns: ['onion'] },
  { label: 'garlic', patterns: ['garlic'] },
  { label: 'inulin', patterns: ['inulin'] },
  { label: 'chicory root', patterns: ['chicory root', 'chicory'] },
  {
    label: 'high-fructose corn syrup',
    patterns: ['high fructose corn syrup', 'high-fructose corn syrup', 'hfcs'],
  },
  { label: 'agave', patterns: ['agave'] },
  { label: 'honey', patterns: ['honey'] },
  // Keep last and use a word-ish guard so "high-fructose corn syrup" doesn't also
  // double-report a bare "fructose"; we still want a standalone "fructose" listed.
  { label: 'fructose', patterns: ['fructose'] },
]

/**
 * Scan free-text ingredients for possible FODMAP triggers.
 *
 * @returns the matched trigger labels (deduped, in declaration order). An empty
 *   array means "no flagged words found" — it does NOT mean the food is safe.
 */
export function scanIngredientsForTriggers(
  ingredientsText: string | null | undefined,
): string[] {
  if (!ingredientsText) return []
  const haystack = ingredientsText.toLowerCase()

  const matched: string[] = []
  for (const trigger of TRIGGERS) {
    const hit = trigger.patterns.some((p) =>
      trigger.boundary
        ? new RegExp('\\b' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(haystack)
        : haystack.includes(p),
    )
    if (hit && !matched.includes(trigger.label)) {
      matched.push(trigger.label)
    }
  }
  // Avoid double-reporting bare "fructose" when only HFCS matched it.
  if (
    matched.includes('fructose') &&
    matched.includes('high-fructose corn syrup') &&
    !/\bfructose\b/.test(
      haystack.replace(/high[-\s]?fructose corn syrup|hfcs/g, ''),
    )
  ) {
    return matched.filter((m) => m !== 'fructose')
  }
  return matched
}
