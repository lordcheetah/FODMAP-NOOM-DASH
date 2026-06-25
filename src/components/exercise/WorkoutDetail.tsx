import { ArrowLeft, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useWorkout, type WorkoutWithExercises } from '@/lib/db/workouts'
import { ExerciseCard } from './ExerciseCard'
import { prescriptionLabel } from './prescription'

export interface WorkoutDetailProps {
  slug: string
  onBack: () => void
  /** Launch the routine player with the loaded workout. */
  onStart: (workout: WorkoutWithExercises) => void
}

/**
 * A workout's meta + ordered exercise list with prescriptions, each exercise's
 * cautions + modifications shown verbatim (via ExerciseCard). A prominent Start
 * launches the player. Null-guarded for the offline/demo shell.
 */
export function WorkoutDetail({ slug, onBack, onStart }: WorkoutDetailProps) {
  const query = useWorkout(slug)
  const data = query.data ?? null
  const workout = data?.workout ?? null
  const exercises = data?.exercises ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button size="sm" variant="ghost" onClick={onBack} aria-label="Back to browse">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button
          onClick={() => data && onStart(data)}
          disabled={!data || exercises.length === 0}
          aria-label="Start workout"
        >
          <Play className="h-4 w-4" /> Start
        </Button>
      </div>

      {query.isLoading && (
        <p className="text-xs text-muted-foreground">Loading workout…</p>
      )}

      {!query.isLoading && !workout && (
        <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          Workout not found. It may not be seeded yet.
        </p>
      )}

      {workout && (
        <>
          <section className="rounded-lg border bg-card p-4 text-card-foreground">
            <h2 className="text-lg font-semibold">{workout.name}</h2>
            <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <span className="capitalize">{workout.category}</span>
              <span>· {workout.format}</span>
              {workout.duration_min != null && <span>· {workout.duration_min} min</span>}
              {workout.rounds != null && <span>· {workout.rounds} rounds</span>}
            </div>
            {workout.description && (
              <p className="mt-2 text-sm text-foreground/90">{workout.description}</p>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">
              Exercises ({exercises.length})
            </h3>
            {exercises.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No exercises linked to this workout yet.
              </p>
            ) : (
              <ol className="space-y-2">
                {exercises.map((we) => (
                  <li key={we.id}>
                    <ExerciseCard
                      exercise={we.exercise}
                      prescription={prescriptionLabel(we)}
                      note={we.note}
                    />
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  )
}
