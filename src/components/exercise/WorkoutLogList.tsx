import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  useWorkoutLog,
  useDeleteWorkoutLog,
  type WorkoutLogEntry,
} from '@/lib/db/workoutLog'

export interface WorkoutLogListProps {
  /** YYYY-MM-DD (local) — the day to show. */
  date: string
}

function fmtDuration(sec: number | null): string | null {
  if (sec == null) return null
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * The day's completed workout sessions with a remove control. Null-guarded for
 * the offline/demo shell (disabled query returns []).
 */
export function WorkoutLogList({ date }: WorkoutLogListProps) {
  const log = useWorkoutLog(date)
  const del = useDeleteWorkoutLog()
  const entries: WorkoutLogEntry[] = log.data ?? []

  return (
    <section className="rounded-lg border bg-card p-4 text-card-foreground">
      <h3 className="mb-2 text-sm font-semibold">Today's sessions</h3>

      {log.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}

      {!log.isLoading && entries.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No workouts logged yet today.
        </p>
      )}

      {entries.length > 0 && (
        <ul className="divide-y">
          {entries.map((e) => {
            const dur = fmtDuration(e.duration_sec)
            return (
              <li key={e.id} className="flex items-center justify-between gap-2 py-2">
                <div>
                  <p className="text-sm font-medium">{e.name ?? 'Workout'}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {dur && <>{dur}</>}
                    {e.rounds_completed != null && (
                      <> {dur ? '· ' : ''}{e.rounds_completed} rounds</>
                    )}
                    {e.workout_log_exercises.length > 0 && (
                      <> · {e.workout_log_exercises.length} exercises</>
                    )}
                    {e.calories_burned != null && (
                      <> · ~{Math.round(e.calories_burned)} cal</>
                    )}
                  </p>
                  {e.notes && (
                    <p className="text-[11px] italic text-muted-foreground">{e.notes}</p>
                  )}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove ${e.name ?? 'workout'}`}
                  disabled={del.isPending}
                  onClick={() => del.mutate({ id: e.id, date })}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
