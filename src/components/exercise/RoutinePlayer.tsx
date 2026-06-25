import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronLeft,
  Pause,
  Play,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  expandWorkout,
  type ExpandExercise,
  type WorkoutStep,
} from '@/lib/exercise'
import type { WorkoutWithExercises } from '@/lib/db/workouts'
import { useIntervalTimer } from './useIntervalTimer'
import { useWakeLock } from './useWakeLock'
import { CueController } from './cues'

export interface RoutinePlayerProps {
  workout: WorkoutWithExercises
  /** Exit the player without logging. */
  onExit: () => void
  /** Finish — opens the complete dialog with elapsed seconds + rounds. */
  onFinish: (result: { durationSec: number; roundsCompleted: number | null }) => void
}

/** Map joined workout_exercises → the pure expander's ExpandExercise input. */
function toExpandExercises(workout: WorkoutWithExercises): ExpandExercise[] {
  return workout.exercises.map((we) => ({
    exerciseId: we.exercise.id,
    name: we.exercise.name,
    defaultType: we.exercise.default_type,
    workSec: we.work_sec ?? we.exercise.default_duration_sec ?? null,
    restSec: we.rest_sec ?? null,
    reps: we.reps ?? we.exercise.default_reps ?? null,
    holdSec: we.hold_sec ?? we.exercise.default_hold_sec ?? null,
    note: we.note ?? null,
  }))
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

const PREPARE_SEC = 10

/**
 * Guided routine player. Calls `expandWorkout` ONCE (all step/interval math lives
 * in that pure function) and owns only the ticking clock (via useIntervalTimer)
 * and presentation. Big current-step display, next-up preview, round badge, step
 * progress, pause/resume/skip/previous, finish. Opt-in audio + vibration cues and
 * a best-effort screen wake lock, both initialized inside the Start gesture.
 *
 * AMRAP: the expanded list is one pass; the player loops it, counts completed
 * loops, and time-boxes from `duration_min`.
 */
export function RoutinePlayer({ workout, onExit, onFinish }: RoutinePlayerProps) {
  const w = workout.workout
  const isAmrap = w.format === 'amrap'

  const steps: WorkoutStep[] = useMemo(
    () =>
      expandWorkout({
        format: w.format,
        rounds: w.rounds,
        durationMin: w.duration_min,
        defaultWorkSec: w.default_work_sec,
        defaultRestSec: w.default_rest_sec,
        prepareSec: PREPARE_SEC,
        exercises: toExpandExercises(workout),
      }),
    [workout, w],
  )

  const [stepIndex, setStepIndex] = useState(0)
  const [amrapLoops, setAmrapLoops] = useState(0)
  // Latest loop count for callbacks captured by long-lived effects (the AMRAP
  // cap interval closes over `doFinish` at creation, when amrapLoops was 0).
  const amrapLoopsRef = useRef(0)
  const [soundOn, setSoundOn] = useState(false)
  const [finished, setFinished] = useState(false)

  const cuesRef = useRef<CueController | null>(null)
  if (cuesRef.current === null) cuesRef.current = new CueController()
  const cues = cuesRef.current

  const wakeLock = useWakeLock()
  const startedAtRef = useRef<number>(Date.now())

  // AMRAP time-box: total seconds from duration_min.
  const amrapCapSec = isAmrap && w.duration_min ? w.duration_min * 60 : null
  const [amrapElapsed, setAmrapElapsed] = useState(0)

  const current = steps[stepIndex] ?? null
  const next = steps[stepIndex + 1] ?? null

  // On mount: init cues + wake lock from the (implied) Start gesture that opened
  // the player. Sound stays off until the user toggles it.
  useEffect(() => {
    startedAtRef.current = Date.now()
    void wakeLock.request()
    return () => {
      void wakeLock.release()
      cues.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const elapsedSec = () => Math.round((Date.now() - startedAtRef.current) / 1000)

  const doFinish = () => {
    if (finished) return
    setFinished(true)
    cues.finish()
    void wakeLock.release()
    onFinish({
      durationSec: elapsedSec(),
      roundsCompleted: isAmrap ? amrapLoopsRef.current : w.rounds ?? null,
    })
  }

  const advance = () => {
    cues.stepChange()
    setStepIndex((i) => {
      const last = steps.length - 1
      if (i < last) return i + 1
      // End of the pass.
      if (isAmrap) {
        // Loop the single pass; count a completed loop. Time-box check below.
        // Mirror into the ref so the cap-interval's doFinish reads the live count.
        setAmrapLoops((n) => {
          const next = n + 1
          amrapLoopsRef.current = next
          return next
        })
        return 0
      }
      // Non-amrap: finished. Defer to effect to avoid setState-in-render races.
      return i
    })
  }

  // Detect non-amrap end (advance past last step).
  const goNext = () => {
    const last = steps.length - 1
    if (stepIndex >= last && !isAmrap) {
      doFinish()
      return
    }
    advance()
  }

  // Timer drives auto-advance for timed steps; reps/hold-as-reps untimed steps
  // wait for the manual "Done" press.
  const timer = useIntervalTimer({
    durationSec: current?.durationSec ?? null,
    // Step identity: index plus AMRAP loop count so the clock re-arms on every
    // step change AND on the AMRAP loop-back (where index returns to 0, or stays
    // 0 for a single-step pass) even when the duration is unchanged.
    stepKey: `${stepIndex}:${amrapLoops}`,
    onComplete: goNext,
    onTick: (rem) => {
      if (rem <= 3 && rem > 0) cues.countdownTick()
    },
  })

  // AMRAP elapsed clock + cap enforcement (wall-clock based).
  useEffect(() => {
    if (!isAmrap || amrapCapSec == null) return
    const id = window.setInterval(() => {
      const e = elapsedSec()
      setAmrapElapsed(e)
      if (e >= amrapCapSec) {
        window.clearInterval(id)
        doFinish()
      }
    }, 500)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAmrap, amrapCapSec])

  const prev = () => {
    if (stepIndex === 0) return
    cues.stepChange()
    setStepIndex((i) => Math.max(0, i - 1))
  }

  const toggleSound = () => {
    setSoundOn((on) => {
      const next = !on
      cues.setEnabled(next)
      return next
    })
  }

  if (!current) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center text-card-foreground">
        <p className="text-sm text-muted-foreground">
          This workout has no steps to play.
        </p>
        <Button className="mt-4" onClick={onExit}>
          Back
        </Button>
      </div>
    )
  }

  const isTimed = current.durationSec != null
  const stepLabelKind =
    current.kind === 'rest'
      ? 'Rest'
      : current.kind === 'prepare'
        ? 'Get ready'
        : current.kind === 'hold'
          ? 'Hold'
          : current.kind === 'work'
            ? 'Work'
            : 'Reps'

  const roundText = current.round != null && current.totalRounds != null
    ? `Round ${current.round} of ${current.totalRounds}`
    : isAmrap
      ? `Loop ${amrapLoops + 1}`
      : null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button
          size="sm"
          variant="ghost"
          onClick={onExit}
          aria-label="Exit workout"
        >
          <X className="h-4 w-4" /> Exit
        </Button>
        <span className="text-xs font-medium text-muted-foreground">{w.name}</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={toggleSound}
          aria-label={soundOn ? 'Mute cues' : 'Enable sound cues'}
          aria-pressed={soundOn}
        >
          {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </Button>
      </div>

      {/* Step progress */}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Workout progress"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={stepIndex + 1}
      >
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
        />
      </div>

      {/* Current step — large display */}
      <section
        className={cn(
          'rounded-xl border p-6 text-center',
          current.kind === 'rest'
            ? 'bg-muted'
            : current.kind === 'prepare'
              ? 'bg-amber-50 dark:bg-amber-950/30'
              : 'bg-card',
        )}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {stepLabelKind}
          {roundText ? ` · ${roundText}` : ''}
        </p>
        <h2 className="mt-1 text-2xl font-bold" aria-live="polite">
          {current.label}
        </h2>

        {isTimed ? (
          <div
            className="mt-4 text-6xl font-bold tabular-nums"
            aria-live="polite"
            aria-label={`${timer.remainingSec} seconds remaining`}
          >
            {fmtTime(timer.remainingSec)}
          </div>
        ) : (
          <div className="mt-4">
            <div className="text-5xl font-bold tabular-nums">
              {current.reps != null ? `× ${current.reps}` : 'Reps'}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Do your reps, then tap Done.
            </p>
          </div>
        )}

        {current.note && (
          <p className="mt-3 text-sm italic text-muted-foreground">{current.note}</p>
        )}

        <p className="mt-4 text-[11px] text-muted-foreground">
          Step {stepIndex + 1} of {steps.length}
        </p>
      </section>

      {/* Next up */}
      {next && (
        <p className="text-center text-xs text-muted-foreground">
          Next: <span className="font-medium text-foreground">{next.label}</span>
          {next.durationSec != null ? ` · ${next.durationSec}s` : ''}
        </p>
      )}

      {/* AMRAP loop control + time-box */}
      {isAmrap && (
        <div className="rounded-lg border bg-card p-3 text-center text-card-foreground">
          <p className="text-sm">
            Loops completed: <span className="font-semibold">{amrapLoops}</span>
            {amrapCapSec != null && (
              <span className="ml-2 text-muted-foreground">
                {fmtTime(Math.max(0, amrapCapSec - amrapElapsed))} left
              </span>
            )}
          </p>
        </div>
      )}

      {/* Controls */}
      <div className="grid grid-cols-4 gap-2">
        <Button
          variant="outline"
          size="lg"
          onClick={prev}
          disabled={stepIndex === 0}
          aria-label="Previous step"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={timer.togglePause}
          disabled={!isTimed}
          aria-label={timer.paused ? 'Resume' : 'Pause'}
        >
          {timer.paused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={goNext}
          aria-label={isTimed ? 'Skip step' : 'Mark done'}
        >
          {isTimed ? <SkipForward className="h-5 w-5" /> : <Check className="h-5 w-5" />}
        </Button>
        <Button
          variant="default"
          size="lg"
          onClick={doFinish}
          aria-label="Finish workout"
        >
          <Check className="h-5 w-5" /> End
        </Button>
      </div>
    </div>
  )
}
