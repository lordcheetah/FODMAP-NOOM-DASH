import { cn } from '@/lib/utils'
import { useSchedule, toScheduleCycle } from '@/lib/db/schedule'
import { cycleWeekCount, todaysWorkout } from '@/lib/exercise'

export interface CycleViewProps {
  /** Open a workout's detail when a day with a workout is tapped. */
  onOpenWorkout: (slug: string) => void
  /** 1-based current week within the cycle (defaults to 1). */
  currentWeek?: number
  /** 1-based current day within the week (defaults to today's weekday, Mon=1). */
  currentDay?: number
}

/** Today's 1-based weekday with Monday = 1 … Sunday = 7. */
function todayWeekday(): number {
  const js = new Date().getDay() // Sun=0..Sat=6
  return js === 0 ? 7 : js
}

/**
 * The multi-week cycle as a weeks × days grid, highlighting today's suggested
 * workout. Tapping a day with a workout opens its detail. Null-guarded for the
 * offline/demo shell.
 */
// NOTE: `currentWeek` defaults to 1 and callers currently don't pass a real
// value — there's no cycle-start-date model yet, so "today's week" can't be
// derived. The week-1 highlight is a placeholder, NOT working multi-week
// tracking; wire this to a stored cycle start date when that model lands.
export function CycleView({ onOpenWorkout, currentWeek = 1, currentDay }: CycleViewProps) {
  const query = useSchedule()
  const loaded = query.data ?? null
  const cycle = toScheduleCycle(loaded)
  const day = currentDay ?? todayWeekday()

  const weeks = cycleWeekCount(cycle)
  const today = todaysWorkout(cycle, currentWeek, day)

  if (query.isLoading) {
    return <p className="text-xs text-muted-foreground">Loading cycle…</p>
  }

  if (!cycle || weeks === 0) {
    return (
      <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        No training cycle seeded yet.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {today && (
        <div className="rounded-lg border bg-primary/5 p-3 text-card-foreground">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Today's suggested workout
          </p>
          <button
            type="button"
            onClick={() => onOpenWorkout(today.slug)}
            className="mt-0.5 text-sm font-semibold text-primary hover:underline"
          >
            {today.name}
          </button>
        </div>
      )}

      <div className="space-y-3">
        {Array.from({ length: weeks }, (_, wi) => wi + 1).map((week) => (
          <section key={week} className="rounded-lg border bg-card p-3 text-card-foreground">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Week {week}
            </h4>
            <ul className="space-y-1">
              {cycle.days
                .filter((c) => c.week === week)
                .map((cell) => {
                  const isToday = week === currentWeek && cell.day === day
                  return (
                    <li key={`${cell.week}-${cell.day}`}>
                      <button
                        type="button"
                        onClick={() => cell.workout && onOpenWorkout(cell.workout.slug)}
                        disabled={!cell.workout}
                        className={cn(
                          'flex min-h-[40px] w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-sm',
                          isToday && 'ring-2 ring-primary',
                          cell.workout ? 'hover:bg-accent/50' : 'cursor-default opacity-70',
                        )}
                      >
                        <span className="text-muted-foreground">
                          {cell.label ?? `Day ${cell.day}`}
                        </span>
                        <span className={cn(cell.workout ? 'font-medium' : 'text-muted-foreground')}>
                          {cell.workout?.name ?? 'Rest'}
                        </span>
                      </button>
                    </li>
                  )
                })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
