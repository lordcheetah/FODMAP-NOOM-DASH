import { useEffect, useState } from 'react'
import { Dumbbell, Activity, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useWorkouts, useWorkoutSearch } from '@/lib/db/workouts'
import { useExercises, useExerciseSearch } from '@/lib/db/exercises'
import {
  EXERCISE_CATEGORIES,
  EXERCISE_CATEGORY_LABEL,
  disciplineLabel,
  type ExerciseCategory,
} from '@/lib/exercise/types'
import type { ExerciseRow, WorkoutRow } from '@/lib/db/types'
import { MartialArtsSafetyNote } from './MartialArtsSafetyNote'

// Derive the chip list from the single source of truth so a new category can't
// be silently missing here; label via the exhaustive EXERCISE_CATEGORY_LABEL.
const CATEGORIES: { value: ExerciseCategory; label: string }[] =
  EXERCISE_CATEGORIES.map((value) => ({
    value,
    label: EXERCISE_CATEGORY_LABEL[value],
  }))

const SEARCH_MIN = 2
const DEBOUNCE_MS = 300

function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

/** Group exercises by `subcategory` (discipline), preserving first-seen order. */
function groupByDiscipline(
  exercises: ExerciseRow[],
): { discipline: string; label: string; items: ExerciseRow[] }[] {
  const groups: { discipline: string; label: string; items: ExerciseRow[] }[] = []
  const byKey = new Map<string, ExerciseRow[]>()
  for (const e of exercises) {
    const key = e.subcategory ?? ''
    let bucket = byKey.get(key)
    if (!bucket) {
      bucket = []
      byKey.set(key, bucket)
      groups.push({ discipline: key, label: disciplineLabel(e.subcategory), items: bucket })
    }
    bucket.push(e)
  }
  return groups
}

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
  const [term, setTerm] = useState('')
  const debounced = useDebounced(term, DEBOUNCE_MS)
  const searching = debounced.trim().length >= SEARCH_MIN

  // Category browse (when not searching).
  const workouts = useWorkouts(category)
  const exercises = useExercises(category)
  // Name search across ALL categories (when there's a query ≥2 chars).
  const workoutHits = useWorkoutSearch(debounced)
  const exerciseHits = useExerciseSearch(debounced)

  const workoutList: WorkoutRow[] = searching
    ? (workoutHits.data ?? [])
    : (workouts.data ?? [])
  const exerciseList: ExerciseRow[] = searching
    ? (exerciseHits.data ?? [])
    : (exercises.data ?? [])
  const workoutsLoading = searching ? workoutHits.isLoading : workouts.isLoading
  const exercisesLoading = searching ? exerciseHits.isLoading : exercises.isLoading
  // Discipline grouping only makes sense in the martial-arts category browse.
  const isMartialArts = !searching && category === 'martial-arts'

  const renderWorkoutRow = (w: WorkoutRow) => (
    <li key={w.id}>
      <button
        type="button"
        onClick={() => onOpenWorkout(w.slug)}
        className="flex min-h-[44px] w-full items-center justify-between gap-2 py-2 text-left hover:bg-accent/50"
      >
        <span>
          <span className="block text-sm font-medium">{w.name}</span>
          <span className="block text-[11px] text-muted-foreground">
            <span>{EXERCISE_CATEGORY_LABEL[w.category]}</span>
            {w.format ? ` · ${w.format}` : ''}
            {w.duration_min ? ` · ${w.duration_min} min` : ''}
          </span>
        </span>
      </button>
    </li>
  )

  const renderExerciseRow = (e: ExerciseRow) => (
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
              : e.subcategory ?? EXERCISE_CATEGORY_LABEL[e.category]}
          </span>
        </span>
      </button>
    </li>
  )

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          inputMode="search"
          placeholder="Search workouts &amp; moves…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className="pl-9"
          aria-label="Search workouts and exercises"
        />
      </div>

      {!searching && (
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
      )}

      {isMartialArts && <MartialArtsSafetyNote />}

      <section className="rounded-lg border bg-card p-3 text-card-foreground">
        <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold">
          <Dumbbell className="h-4 w-4" /> Workouts
        </h3>
        {workoutsLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : workoutList.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {searching ? 'No matching workouts.' : 'No workouts here yet.'}
          </p>
        ) : (
          <ul className="divide-y">{workoutList.map(renderWorkoutRow)}</ul>
        )}
      </section>

      <section className="rounded-lg border bg-card p-3 text-card-foreground">
        <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold">
          <Activity className="h-4 w-4" /> Individual moves
        </h3>
        {exercisesLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : exerciseList.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {searching ? 'No matching moves.' : 'No exercises here yet.'}
          </p>
        ) : isMartialArts ? (
          // Group by discipline (subcategory) with a heading per discipline.
          <div className="space-y-3">
            {groupByDiscipline(exerciseList).map((group) => (
              <div key={group.discipline || 'general'}>
                <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </h4>
                <ul className="divide-y">{group.items.map(renderExerciseRow)}</ul>
              </div>
            ))}
          </div>
        ) : (
          <ul className="divide-y">{exerciseList.map(renderExerciseRow)}</ul>
        )}
      </section>
    </div>
  )
}
