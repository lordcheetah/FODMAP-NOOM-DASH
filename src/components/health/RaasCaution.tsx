import { cn } from '@/lib/utils'
import { useBodyProfile } from '@/lib/db/bodyMetrics'

/**
 * Caution shown next to potassium when the user has marked that they take a
 * RAAS-acting BP drug (ACE inhibitor / ARB / K-sparing diuretic). Those retain
 * potassium, so DASH's high-potassium load can raise blood potassium. Renders
 * nothing when the flag is off. Informational only — not medical advice.
 */
export function RaasCaution({ className }: { className?: string }) {
  const { data: profile } = useBodyProfile()
  if (!profile?.on_raas_drug) return null

  return (
    <p
      className={cn(
        'rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900',
        className,
      )}
    >
      You take a potassium-retaining BP medication. DASH’s high-potassium foods can
      raise blood potassium on these drugs — treat the potassium goal as guidance
      only and confirm your target with your prescriber. Not medical advice.
    </p>
  )
}
