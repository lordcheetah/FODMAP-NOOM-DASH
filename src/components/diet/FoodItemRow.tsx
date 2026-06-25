import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { FodmapLevel, FodmapSafety, NoomColor } from '@/lib/diet'
import { NoomDot } from './NoomDot'
import { FodmapBadge } from './FodmapBadge'

export interface NutrientChip {
  label: string
  /** Already-formatted value, e.g. "7 cal", "2 g". */
  value: string
}

export interface FoodItemRowProps {
  name: string
  subtitle?: string
  /** Precomputed NOOM color, or null/undefined for an unknown dot. */
  noom?: NoomColor | null
  /** FODMAP axes; when omitted no badge is shown (e.g. recipes w/o roll-up). */
  fructose?: FodmapLevel
  fructans?: FodmapLevel
  /**
   * Precomputed safety verdict (for recipe roll-ups). When given, the badge uses
   * it directly instead of deriving from the axes — so e.g. a recipe with a
   * known-high + an unknown ingredient correctly reads "Avoid", not "Not verified".
   */
  safety?: FodmapSafety
  chips?: NutrientChip[]
  /** Trailing slot — e.g. an Add button or a Remove control. */
  action?: ReactNode
  className?: string
}

/**
 * Shared food/recipe presentation: NOOM dot + FODMAP safety badge + nutrient
 * chips + a trailing action. Used by both search results and the daily log so
 * the two views stay visually and behaviorally consistent (DRY).
 */
export function FoodItemRow({
  name,
  subtitle,
  noom,
  fructose,
  fructans,
  safety,
  chips,
  action,
  className,
}: FoodItemRowProps) {
  return (
    <div className={cn('flex items-center gap-3 py-2', className)}>
      <NoomDot color={noom} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-medium">{name}</span>
          {fructose !== undefined && fructans !== undefined && (
            <FodmapBadge fructose={fructose} fructans={fructans} safety={safety} />
          )}
        </div>
        {subtitle && (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        )}
        {chips && chips.length > 0 && (
          <ul className="mt-1 flex flex-wrap gap-1">
            {chips.map((c) => (
              <li
                key={c.label}
                className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
              >
                <span className="font-medium text-foreground">{c.value}</span>{' '}
                {c.label}
              </li>
            ))}
          </ul>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
