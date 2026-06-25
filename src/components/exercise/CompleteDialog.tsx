import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog } from '@/components/ui/dialog'
import { useAddWorkoutLog } from '@/lib/db/workoutLog'
import type { WorkoutWithExercises } from '@/lib/db/workouts'

/** Local-time YYYY-MM-DD (avoids UTC off-by-one). Mirrors Meals.todayISO. */
function todayISO(): string {
  const d = new Date()
  const tz = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - tz).toISOString().slice(0, 10)
}

export interface CompleteDialogProps {
  open: boolean
  onClose: () => void
  /** The workout that was performed (null for an ad-hoc session). */
  workout: WorkoutWithExercises | null
  /** Elapsed seconds from the player clock. */
  durationSec: number
  /** Completed loops/rounds for amrap/rounds formats. */
  roundsCompleted?: number | null
  /** Called after a successful log write (e.g. to close the player). */
  onLogged?: () => void
}

/**
 * On finish, record the session via `useAddWorkoutLog` (workout id/slug + name
 * snapshot, date = today local) with optional per-exercise results. Confirm +
 * close invalidates the log query so the day's list refreshes.
 */
export function CompleteDialog({
  open,
  onClose,
  workout,
  durationSec,
  roundsCompleted,
  onLogged,
}: CompleteDialogProps) {
  const add = useAddWorkoutLog()
  const w = workout?.workout ?? null
  const exercises = workout?.exercises ?? []

  const [notes, setNotes] = useState('')
  const [rounds, setRounds] = useState('')
  // Per-exercise reps keyed by workout_exercises id.
  const [reps, setReps] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open) {
      setNotes('')
      setRounds(roundsCompleted != null ? String(roundsCompleted) : '')
      setReps({})
      add.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, roundsCompleted])

  const showRounds = w?.format === 'amrap' || w?.format === 'rounds' || w?.format === 'emom'

  const handleSave = () => {
    const parsedRounds = rounds.trim() === '' ? null : Number(rounds)
    const childInputs = exercises
      .map((we) => {
        const r = reps[we.id]
        const repVal = r != null && r.trim() !== '' ? Number(r) : null
        if (repVal == null) return null
        return {
          exercise_id: we.exercise.id,
          name: we.exercise.name,
          position: we.position,
          sets: null,
          reps: Number.isFinite(repVal) ? repVal : null,
          duration_sec: null,
          hold_sec: null,
          score: null,
          notes: null,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

    add.mutate(
      {
        date: todayISO(),
        workout_id: w?.id ?? null,
        name: w?.name ?? 'Workout',
        duration_sec: durationSec,
        rounds_completed:
          parsedRounds != null && Number.isFinite(parsedRounds) ? parsedRounds : null,
        notes: notes.trim() || null,
        completed: true,
        exercises: childInputs,
      },
      {
        onSuccess: () => {
          onClose()
          onLogged?.()
        },
      },
    )
  }

  const mins = Math.floor(durationSec / 60)
  const secs = durationSec % 60

  return (
    <Dialog
      open={open}
      onClose={onClose}
      variant="sheet"
      title="Log this workout"
      description={w?.name ?? 'Workout'}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Time: {mins}:{String(secs).padStart(2, '0')}
        </p>

        {showRounds && (
          <div>
            <Label htmlFor="rounds-completed">Rounds completed</Label>
            <Input
              id="rounds-completed"
              type="number"
              inputMode="numeric"
              min={0}
              value={rounds}
              onChange={(e) => setRounds(e.target.value)}
              className="mt-2"
            />
          </div>
        )}

        {exercises.length > 0 && (
          <div>
            <Label>Reps (optional)</Label>
            <ul className="mt-2 space-y-2">
              {exercises.map((we) => (
                <li key={we.id} className="flex items-center gap-2">
                  <span className="flex-1 text-sm">{we.exercise.name}</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    aria-label={`Reps for ${we.exercise.name}`}
                    value={reps[we.id] ?? ''}
                    onChange={(e) =>
                      setReps((prev) => ({ ...prev, [we.id]: e.target.value }))
                    }
                    className="w-24"
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <Label htmlFor="workout-notes">Notes</Label>
          <Input
            id="workout-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How did it go?"
            className="mt-2"
          />
        </div>

        {add.isError && (
          <p className="text-xs text-destructive">
            Could not log workout. {(add.error as Error)?.message}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Discard
          </Button>
          <Button type="button" onClick={handleSave} disabled={add.isPending}>
            {add.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
