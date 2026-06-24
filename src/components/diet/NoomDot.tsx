import { cn } from '@/lib/utils'
import { noomColor, type NoomColor } from '@/lib/diet'

/** Tailwind background class per NOOM color. Single source of truth for the dot. */
export const NOOM_DOT_CLASS: Record<NoomColor, string> = {
  green: 'bg-noom-green',
  yellow: 'bg-noom-yellow',
  orange: 'bg-noom-orange',
}

const NOOM_LABEL: Record<NoomColor, string> = {
  green: 'green (low calorie density)',
  yellow: 'yellow (medium calorie density)',
  orange: 'orange (high calorie density)',
}

export interface NoomDotProps {
  /** Precomputed color, or pass calories+grams to compute it here. */
  color?: NoomColor | null
  calories?: number | null
  grams?: number | null
  className?: string
}

/**
 * NOOM caloric-density dot. Color is COMPUTED from caloric density via
 * `noomColor` (never hand-labeled). When density can't be computed (unknown
 * grams), renders a neutral "unknown" dot — we never guess a color.
 */
export function NoomDot({ color, calories, grams, className }: NoomDotProps) {
  const resolved =
    color !== undefined
      ? color
      : calories != null && grams != null
        ? noomColor(calories, grams)
        : null

  return (
    <span
      className={cn(
        'inline-block h-3 w-3 shrink-0 rounded-full',
        resolved ? NOOM_DOT_CLASS[resolved] : 'border border-muted-foreground/40 bg-muted',
        className,
      )}
      title={resolved ? NOOM_LABEL[resolved] : 'NOOM color unknown'}
      aria-label={resolved ? `NOOM ${NOOM_LABEL[resolved]}` : 'NOOM color unknown'}
    />
  )
}
