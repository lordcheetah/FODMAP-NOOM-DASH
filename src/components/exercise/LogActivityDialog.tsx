import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog } from '@/components/ui/dialog'
import { useAddWorkoutLog } from '@/lib/db/workoutLog'
import type { ExerciseRow } from '@/lib/db/types'

export interface LogActivityDialogProps {
  open: boolean
  onClose: () => void
  /** The exercise/activity being logged ad-hoc (no parent workout). */
  exercise: ExerciseRow
  /** Local YYYY-MM-DD to record the session under. */
  date: string
  onLogged?: () => void
}

/**
 * Quick-log a single exercise/activity as a session — e.g. "Treadmill walking,
 * 30 min" — via `useAddWorkoutLog` with `workout_id = null` and a name snapshot.
 * All fields are optional; minutes/reps prefill from the exercise's default
 * prescription as a hint. Appears in the day's `WorkoutLogList`.
 */
export function LogActivityDialog({
  open,
  onClose,
  exercise,
  date,
  onLogged,
}: LogActivityDialogProps) {
  const add = useAddWorkoutLog()
  const [minutes, setMinutes] = useState('')
  const [reps, setReps] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (open) {
      setMinutes(
        exercise.default_duration_sec != null
          ? String(Math.round(exercise.default_duration_sec / 60))
          : '',
      )
      setReps(exercise.default_reps != null ? String(exercise.default_reps) : '')
      setNotes('')
      add.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, exercise])

  const handleSave = () => {
    const mins = minutes.trim() === '' ? null : Number(minutes)
    const durationSec =
      mins != null && Number.isFinite(mins) && mins > 0 ? Math.round(mins * 60) : null
    const repVal = reps.trim() === '' ? null : Number(reps)
    const repsNum = repVal != null && Number.isFinite(repVal) && repVal > 0 ? repVal : null

    add.mutate(
      {
        date,
        workout_id: null,
        name: exercise.name,
        duration_sec: durationSec,
        completed: true,
        notes: notes.trim() || null,
        exercises: [
          {
            exercise_id: exercise.id,
            name: exercise.name,
            position: 1,
            sets: null,
            reps: repsNum,
            duration_sec: durationSec,
            hold_sec: null,
            score: null,
            notes: null,
          },
        ],
      },
      {
        onSuccess: () => {
          onClose()
          onLogged?.()
        },
      },
    )
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      variant="sheet"
      title="Log this exercise"
      description={exercise.name}
    >
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Records a session for today. Fill in whatever you tracked — all optional.
        </p>

        <div>
          <Label htmlFor="log-minutes">Minutes</Label>
          <Input
            id="log-minutes"
            type="number"
            inputMode="numeric"
            min={0}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder="e.g. 30"
            className="mt-2"
          />
        </div>

        <div>
          <Label htmlFor="log-reps">Reps</Label>
          <Input
            id="log-reps"
            type="number"
            inputMode="numeric"
            min={0}
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            placeholder="optional"
            className="mt-2"
          />
        </div>

        <div>
          <Label htmlFor="log-activity-notes">Notes</Label>
          <Input
            id="log-activity-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How did it go?"
            className="mt-2"
          />
        </div>

        {add.isError && (
          <p className="text-xs text-destructive">
            Could not log. {(add.error as Error)?.message}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={add.isPending}>
            {add.isPending ? 'Saving…' : 'Log it'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
