import { cn } from '@/lib/utils'
import { lowFodmapSafe, type FodmapLevel, type FodmapSafety } from '@/lib/diet'

/**
 * Label + color per FODMAP safety. SAFETY RULE: `not-verified` is NEVER green —
 * it is neutral. A false "safe" is the worst error in this health app. See
 * CLAUDE.md / lowFodmapSafe.
 */
const SAFETY: Record<FodmapSafety, { label: string; className: string }> = {
  safe: {
    label: 'Safe (fructose/fructans)',
    className: 'bg-noom-green/15 text-noom-green border-noom-green/30',
  },
  caution: {
    label: 'Caution',
    className: 'bg-noom-yellow/20 text-yellow-700 border-noom-yellow/40',
  },
  avoid: {
    label: 'Avoid',
    className: 'bg-destructive/10 text-destructive border-destructive/30',
  },
  'not-verified': {
    label: 'Not verified',
    className: 'bg-muted text-muted-foreground border-border',
  },
}

/** Short safety label only (no styling) — used where text is needed inline. */
export const SAFETY_LABEL: Record<FodmapSafety, string> = {
  safe: SAFETY.safe.label,
  caution: SAFETY.caution.label,
  avoid: SAFETY.avoid.label,
  'not-verified': SAFETY['not-verified'].label,
}

export interface FodmapBadgeProps {
  fructose: FodmapLevel
  fructans: FodmapLevel
  /**
   * Precomputed safety verdict. Pass this for aggregates (e.g. a recipe roll-up)
   * where the verdict is decided by precedence across many ingredients and can't
   * be reconstructed from two display axes — notably "avoid" when a known-high
   * ingredient coexists with an unknown one. When omitted, the verdict is derived
   * from the two axes via lowFodmapSafe (the single-food case).
   */
  safety?: FodmapSafety
  className?: string
}

/**
 * FODMAP safety badge. Uses the precomputed `safety` when given, otherwise
 * derives it from the two tracked axes (fructose + fructans). Exposes the
 * per-axis levels via `title` for transparency on tap/hover.
 */
export function FodmapBadge({ fructose, fructans, safety, className }: FodmapBadgeProps) {
  const verdict = safety ?? lowFodmapSafe(fructose, fructans)
  const { label, className: tone } = SAFETY[verdict]
  const title = `Fructose: ${fructose} · Fructans: ${fructans}`

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
        tone,
        className,
      )}
      title={title}
      aria-label={`${label}. ${title}`}
      data-safety={verdict}
    >
      {label}
    </span>
  )
}
