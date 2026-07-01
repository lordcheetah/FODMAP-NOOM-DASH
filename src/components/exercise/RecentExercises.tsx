import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { useRecentExercises } from '@/lib/db/recents'
import type { ExerciseRow } from '@/lib/db/types'
import { LogActivityDialog } from './LogActivityDialog'

export interface RecentExercisesProps {
  date: string
}

/**
 * Quick re-log of the user's recently logged exercises. Tapping one opens the
 * same LogActivityDialog (prefilled with that exercise). Hidden when empty.
 */
export function RecentExercises({ date }: RecentExercisesProps) {
  const recents = useRecentExercises()
  const [selected, setSelected] = useState<ExerciseRow | null>(null)
  const items = recents.data ?? []
  if (items.length === 0) return null

  return (
    <section className="rounded-lg border bg-card p-3 text-card-foreground">
      <h3 className="mb-2 text-sm font-semibold">Recent</h3>
      <ul className="divide-y">
        {items.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => setSelected(e)}
              className="flex min-h-[44px] w-full items-center justify-between gap-2 py-2 text-left hover:bg-accent/50"
            >
              <span className="text-sm font-medium">{e.name}</span>
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <RotateCcw className="h-3 w-3" /> Log again
              </span>
            </button>
          </li>
        ))}
      </ul>

      {selected && (
        <LogActivityDialog
          open={selected !== null}
          onClose={() => setSelected(null)}
          exercise={selected}
          date={date}
          onLogged={() => setSelected(null)}
        />
      )}
    </section>
  )
}
