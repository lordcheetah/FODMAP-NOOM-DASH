import { cn } from '@/lib/utils'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useFoodLogRange, toLoggedNutrients } from '@/lib/db/foodLog'
import { useDailyTargets } from '@/lib/db/dailyTargets'
import { dashServingsWeek, type DashGroup, type DatedNutrients } from '@/lib/diet'

const DAYS = 7

function todayISO(): string {
  const d = new Date()
  const tz = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - tz).toISOString().slice(0, 10)
}
function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + delta)
  const tz = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - tz).toISOString().slice(0, 10)
}
function round1(n: number): number {
  return Math.round(n * 10) / 10
}

const DASH_GROUP_LABEL: Record<DashGroup, string> = {
  grains: 'Grains',
  vegetables: 'Vegetables',
  fruits: 'Fruits',
  dairy: 'Dairy',
  'meat-poultry-fish': 'Meat/Fish',
  'nuts-seeds-legumes': 'Nuts/Legumes',
  'fats-oils': 'Fats/Oils',
  sweets: 'Sweets',
}

/**
 * Weekly DASH serving averages per food group — average servings/day over the
 * last 7 days vs the daily goal, with a progress bar (green once the average
 * reaches the goal). Counts reuse `dashProgress` via `dashServingsWeek`, so they
 * match the day summary. Read-only.
 */
export function DashServingsWeek() {
  const end = todayISO()
  const start = addDays(end, -(DAYS - 1))
  const dates = Array.from({ length: DAYS }, (_, i) => addDays(start, i))

  const range = useFoodLogRange(start, end)
  const { data: targets } = useDailyTargets()

  const dated: DatedNutrients[] = (range.data ?? []).map((e) => ({
    ...toLoggedNutrients(e),
    date: e.logged_on,
  }))
  const week = dashServingsWeek(dated, dates, targets?.dash_serving_goals ?? {})
  // Show groups you've set a goal for or logged anything toward.
  const rows = week.filter((r) => r.dailyGoal != null || r.total > 0)
  const hasAny = dated.length > 0

  return (
    <section className="rounded-lg border bg-card p-4 text-card-foreground">
      <h3 className="text-sm font-semibold">This week — DASH servings</h3>

      {!isSupabaseConfigured && (
        <p className="mt-2 text-xs text-muted-foreground">
          Sign in to see your weekly DASH servings.
        </p>
      )}

      {isSupabaseConfigured && (!hasAny || rows.length === 0) && (
        <p className="mt-2 text-xs text-muted-foreground">
          No meals logged in the last 7 days yet.
        </p>
      )}

      {isSupabaseConfigured && hasAny && rows.length > 0 && (
        <>
          <ul className="mt-3 space-y-2">
            {rows.map((r) => {
              const goal = r.dailyGoal
              const met = goal != null && r.avgPerDay >= goal
              const pct = goal && goal > 0 ? Math.min(100, (r.avgPerDay / goal) * 100) : 0
              return (
                <li key={r.group}>
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-muted-foreground">{DASH_GROUP_LABEL[r.group]}</span>
                    <span className={cn('tabular-nums', met && 'text-noom-green')}>
                      {round1(r.avgPerDay)}
                      {goal != null && <span className="text-muted-foreground"> / {goal}</span>}
                      <span className="text-muted-foreground"> /day</span>
                    </span>
                  </div>
                  {goal != null && (
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn('h-full rounded-full', met ? 'bg-noom-green' : 'bg-primary')}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Average servings per day over the last 7 days vs your daily DASH goal.
            Green once the average reaches the goal.
          </p>
        </>
      )}
    </section>
  )
}
