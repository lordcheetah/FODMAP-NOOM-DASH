import { useState } from 'react'
import { Dumbbell, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useWorkouts } from '@/lib/db/workouts'
import { useExercises } from '@/lib/db/exercises'
import type { ExerciseCategory } from '@/lib/exercise/types'
import type { ExerciseRow, WorkoutRow } from '@/lib/db/types'

const CATEGORIES: { value: ExerciseCategory; label: string }[] = [
  { value: 'cardio', label: 'Cardio' },
  { value: 'strength', label: 'Strength' },
  { value: 'dynamic', label: 'Dynamic' },
  { value: 'stretch', label: 'Stretch' },
  { value: 'yoga', label: 'Yoga' },
  { value: 'back', label: 'Back' },
]

export interface WorkoutBrowserProps {
  /** Open a workout's detail view. */
  onOpenWorkout: (slug: string) => void
  /** Open a single exercise's detail (optional). */
  onOpenExercise?: (slug: string) => void
}

/**
 * Browse workouts + exercises by category. Mobile-first chips and big tap rows.
 * Renders empty/disabled states (offline/demo shell) without throwing.
 */
export function WorkoutBrowser({ onOpenWorkout, onOpenExercise }: WorkoutBrowserProps) {
  const [category, setCategory] = useState<ExerciseCategory | undefined>(undefined)

  const workouts = useWorkouts(category)
  const exercises = useExercises(category)

  const workoutList: WorkoutRow[] = workouts.data ?? []
  const exerciseList: ExerciseRow[] = exercises.data ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Exercise categories">
        <Button
          size="sm"
          variant={category === undefined ? 'default' : 'outline'}
          onClick={() => setCategory(undefined)}
          aria-pressed={category === undefined}
        >
          All
        </Button>
        {CATEGORIES.map((c) => (
          <Button
            key={c.value}
            size="sm"
            variant={category === c.value ? 'default' : 'outline'}
            onClick={() => setCategory(c.value)}
            aria-pressed={category === c.value}
          >
            {c.label}
          </Button>
        ))}
      </div>

      <section className="rounded-lg border bg-card p-3 text-card-foreground">
        <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold">
          <Dumbbell className="h-4 w-4" /> Workouts
        </h3>
        {workouts.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : workoutList.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No workouts here yet.
          </p>
        ) : (
          <ul className="divide-y">
            {workoutList.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() => onOpenWorkout(w.slug)}
                  className="flex min-h-[44px] w-full items-center justify-between gap-2 py-2 text-left hover:bg-accent/50"
                >
                  <span>
                    <span className="block text-sm font-medium">{w.name}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      <span className="capitalize">{w.category}</span>
                      {w.format ? ` · ${w.format}` : ''}
                      {w.duration_min ? ` · ${w.duration_min} min` : ''}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border bg-card p-3 text-card-foreground">
        <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold">
          <Activity className="h-4 w-4" /> Individual moves
        </h3>
        {exercises.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : exerciseList.length === 0 ? (
          <p className="text-xs text-muted-foreground">No exercises here yet.</p>
        ) : (
          <ul className="divide-y">
            {exerciseList.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onOpenExercise?.(e.slug)}
                  disabled={!onOpenExercise}
                  className={cn(
                    'flex min-h-[44px] w-full items-center justify-between gap-2 py-2 text-left',
                    onOpenExercise ? 'hover:bg-accent/50' : 'cursor-default',
                  )}
                >
                  <span>
                    <span className="block text-sm font-medium">{e.name}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {e.muscle_groups.length > 0
                        ? e.muscle_groups.join(', ')
                        : e.subcategory ?? e.category}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
