import { useState } from 'react'
import { ArrowLeft, ClipboardCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useExercise } from '@/lib/db/exercises'
import { ExerciseCard } from './ExerciseCard'
import { LogActivityDialog } from './LogActivityDialog'

export interface ExerciseDetailProps {
  slug: string
  /** Local YYYY-MM-DD for an ad-hoc log. */
  date: string
  onBack: () => void
  /** Called after a successful ad-hoc log (e.g. to return to browse). */
  onLogged?: () => void
}

/**
 * A single exercise/move: instructions + cautions/modifications (verbatim via
 * `ExerciseCard`) plus a "Log this exercise" action that records it as an ad-hoc
 * session for today (no parent workout). This is how an individual move — e.g. a
 * treadmill walk — gets recorded without running the guided player.
 */
export function ExerciseDetail({ slug, date, onBack, onLogged }: ExerciseDetailProps) {
  const { data: exercise, isLoading } = useExercise(slug)
  const [logOpen, setLogOpen] = useState(false)

  return (
    <div className="space-y-3">
      <Button type="button" variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !exercise ? (
        <p className="text-sm text-muted-foreground">Exercise not found.</p>
      ) : (
        <>
          <ExerciseCard exercise={exercise} />
          <Button type="button" className="w-full" onClick={() => setLogOpen(true)}>
            <ClipboardCheck className="h-4 w-4" /> Log this exercise
          </Button>
          <LogActivityDialog
            open={logOpen}
            onClose={() => setLogOpen(false)}
            exercise={exercise}
            date={date}
            onLogged={onLogged}
          />
        </>
      )}
    </div>
  )
}
