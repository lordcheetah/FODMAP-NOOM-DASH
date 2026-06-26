import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EXERCISE_CATEGORY_LABEL, disciplineLabel } from '@/lib/exercise/types'
import type { ExerciseRow } from '@/lib/db/types'

/** A pill list of short string values (muscle groups / equipment). */
function Pills({ items }: { items: string[] }) {
  if (items.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((it) => (
        <span
          key={it}
          className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
        >
          {it}
        </span>
      ))}
    </div>
  )
}

export interface ExerciseCardProps {
  exercise: ExerciseRow
  /** Per-workout prescription chips (work/rest/reps/hold) when shown in a workout. */
  prescription?: string | null
  /** Per-workout note from `workout_exercises.note`. */
  note?: string | null
  className?: string
}

/**
 * One exercise: name, meta, instructions, and — mirroring the FODMAP
 * "never hide safety info" posture — `modifications` and `cautions` shown
 * VERBATIM and never collapsed. Cautions are visually distinct (amber/warning).
 */
export function ExerciseCard({
  exercise,
  prescription,
  note,
  className,
}: ExerciseCardProps) {
  const e = exercise
  return (
    <div className={cn('rounded-lg border bg-card p-3 text-card-foreground', className)}>
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-semibold">{e.name}</h4>
        {prescription && (
          <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {prescription}
          </span>
        )}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span>{EXERCISE_CATEGORY_LABEL[e.category]}</span>
        {e.subcategory && <span>· {disciplineLabel(e.subcategory)}</span>}
        {e.difficulty && <span>· {e.difficulty}</span>}
      </div>

      {(e.muscle_groups.length > 0 || e.equipment.length > 0) && (
        <div className="mt-2 space-y-1">
          <Pills items={e.muscle_groups} />
          <Pills items={e.equipment} />
        </div>
      )}

      {note && <p className="mt-2 text-xs italic text-muted-foreground">{note}</p>}

      {e.instructions.length > 0 && (
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-foreground/90">
          {e.instructions.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      )}

      {e.modifications.length > 0 && (
        <div className="mt-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Modifications
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-foreground/90">
            {e.modifications.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {e.cautions.length > 0 && (
        <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide">
            <AlertTriangle className="h-3.5 w-3.5" />
            Cautions
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
            {e.cautions.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
