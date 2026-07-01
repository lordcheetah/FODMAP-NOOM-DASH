import { useState } from 'react'
import { Dumbbell, ListChecks } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import type { WorkoutWithExercises } from '@/lib/db/workouts'
import { WorkoutBrowser } from '@/components/exercise/WorkoutBrowser'
import { WorkoutDetail } from '@/components/exercise/WorkoutDetail'
import { ExerciseDetail } from '@/components/exercise/ExerciseDetail'
import { RoutinePlayer } from '@/components/exercise/RoutinePlayer'
import { CompleteDialog } from '@/components/exercise/CompleteDialog'
import { CycleView } from '@/components/exercise/CycleView'
import { WorkoutLogList } from '@/components/exercise/WorkoutLogList'
import { RecentExercises } from '@/components/exercise/RecentExercises'

/** Local-time YYYY-MM-DD (avoids UTC off-by-one). Mirrors Meals.todayISO. */
function todayISO(): string {
  const d = new Date()
  const tz = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - tz).toISOString().slice(0, 10)
}

type View = 'browse' | 'cycle' | 'detail' | 'player' | 'exercise'

/**
 * Exercise page: browse by category, open a workout (cautions + modifications
 * verbatim), run the guided player, log the session, and view the 4-week cycle.
 * All step/interval math comes from `expandWorkout`; this page only orchestrates
 * view state. Renders empty/disabled states in the offline/demo shell.
 */
export default function Exercise() {
  const { user } = useAuth()
  const signedIn = !!user

  const [view, setView] = useState<View>('browse')
  const [activeSlug, setActiveSlug] = useState<string | null>(null)
  const [activeExerciseSlug, setActiveExerciseSlug] = useState<string | null>(null)
  const [playing, setPlaying] = useState<WorkoutWithExercises | null>(null)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [result, setResult] = useState<{ durationSec: number; roundsCompleted: number | null }>(
    { durationSec: 0, roundsCompleted: null },
  )

  const date = todayISO()

  const openWorkout = (slug: string) => {
    setActiveSlug(slug)
    setView('detail')
  }

  const openExercise = (slug: string) => {
    setActiveExerciseSlug(slug)
    setView('exercise')
  }

  const startPlayer = (workout: WorkoutWithExercises) => {
    setPlaying(workout)
    setView('player')
  }

  const handleFinish = (r: { durationSec: number; roundsCompleted: number | null }) => {
    setResult(r)
    setCompleteOpen(true)
  }

  return (
    <div className="space-y-4">
      {view !== 'player' && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Exercise</h2>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={view === 'cycle' ? 'default' : 'outline'}
                onClick={() => setView('cycle')}
              >
                <ListChecks className="h-4 w-4" /> Cycle
              </Button>
              <Button
                size="sm"
                variant={view === 'browse' ? 'default' : 'outline'}
                onClick={() => {
                  setView('browse')
                  setActiveSlug(null)
                }}
              >
                <Dumbbell className="h-4 w-4" /> Browse
              </Button>
            </div>
          </div>

          {!isSupabaseConfigured && (
            <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
              Exercise data needs a connected account. The app is running in
              offline/demo mode — set Supabase env vars and sign in to browse and
              log workouts.
            </p>
          )}

          {isSupabaseConfigured && !signedIn && (
            <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
              Sign in to browse workouts and log sessions.
            </p>
          )}

          <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
            This app is an informational tool, not medical advice. Stop and
            consult a professional if you feel pain. Follow each exercise's
            cautions.
          </p>
        </>
      )}

      {view === 'browse' && (
        <>
          <WorkoutBrowser onOpenWorkout={openWorkout} onOpenExercise={openExercise} />
          <RecentExercises date={date} />
          <WorkoutLogList date={date} />
        </>
      )}

      {view === 'cycle' && <CycleView onOpenWorkout={openWorkout} />}

      {view === 'exercise' && activeExerciseSlug && (
        <ExerciseDetail
          slug={activeExerciseSlug}
          date={date}
          onBack={() => setView('browse')}
          onLogged={() => setView('browse')}
        />
      )}

      {view === 'detail' && activeSlug && (
        <WorkoutDetail
          slug={activeSlug}
          onBack={() => setView('browse')}
          onStart={startPlayer}
        />
      )}

      {view === 'player' && playing && (
        <RoutinePlayer
          workout={playing}
          onExit={() => {
            setView('detail')
            setPlaying(null)
          }}
          onFinish={handleFinish}
        />
      )}

      <CompleteDialog
        open={completeOpen}
        onClose={() => setCompleteOpen(false)}
        workout={playing}
        durationSec={result.durationSec}
        roundsCompleted={result.roundsCompleted}
        onLogged={() => {
          setCompleteOpen(false)
          setPlaying(null)
          setView('browse')
        }}
      />
    </div>
  )
}
