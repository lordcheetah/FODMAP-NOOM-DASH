import { cn } from '@/lib/utils'

/**
 * Medical disclaimer + the "unknown = not verified, never safe" rule. Kept
 * visible on any meal/diet screen. Copy is centralized here so every page
 * shows the same wording (and the e2e `not medical advice` assertion holds).
 */
export function Disclaimer({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        'px-1 text-[11px] leading-relaxed text-muted-foreground',
        className,
      )}
    >
      This app is an informational tool, not medical advice. FODMAP data is
      sourced from public references and may be incomplete. Items shown as “Not
      verified” are not confirmed safe.
    </p>
  )
}
