import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface MartialArtsSafetyNoteProps {
  className?: string
}

/**
 * Martial-arts injury-safety note, distinct from the page-level diet/medical
 * disclaimer. Pure presentational component (no data deps) so it's trivially
 * testable. Mirrors ExerciseCard's cautions styling (amber/warning box). Render
 * only for the martial-arts category. Copy must never imply the app replaces a
 * qualified instructor or supervised sparring.
 */
export function MartialArtsSafetyNote({ className }: MartialArtsSafetyNoteProps) {
  return (
    <div
      role="note"
      aria-label="Martial arts safety"
      className={cn(
        'rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200',
        className,
      )}
    >
      <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide">
        <AlertTriangle className="h-3.5 w-3.5" />
        Martial arts safety
      </p>
      <p className="mt-1 text-xs leading-relaxed">
        These are informational fundamentals, not a substitute for a qualified
        instructor. Warm up first, use proper form, and don't spar without
        supervision and consent. Stop if you feel pain.
      </p>
    </div>
  )
}
