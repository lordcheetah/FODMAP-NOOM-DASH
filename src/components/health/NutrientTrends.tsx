import { cn } from '@/lib/utils'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useFoodLogRange, toLoggedNutrients } from '@/lib/db/foodLog'
import { useDailyTargets } from '@/lib/db/dailyTargets'
import { nutrientTrend, type DatedNutrients } from '@/lib/diet'
import { RaasCaution } from './RaasCaution'

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
/** Single-letter weekday for a YYYY-MM-DD (local). */
function narrowDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })
}
function round(n: number, digits = 0): number {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

/** ceiling = stay under (sodium, sat fat); floor = reach it (potassium). */
type TargetKind = 'ceiling' | 'floor'

interface NutrientSpec {
  key: 'sodium' | 'potassium' | 'satfat'
  label: string
  unit: string
  digits: number
  kind: TargetKind
  values: number[]
  target: number | null
}

function NutrientBlock({ spec, dates }: { spec: NutrientSpec; dates: string[] }) {
  const { values, target, kind, unit, digits } = spec
  const scaleMax = Math.max(...values, target ?? 0, 1)
  const loggedDays = values.filter((v) => v > 0)
  const avg = loggedDays.length ? loggedDays.reduce((a, b) => a + b, 0) / loggedDays.length : 0
  const today = values[values.length - 1] ?? 0

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">{spec.label}</span>
        <span className="text-xs text-muted-foreground">
          today <span className="tabular-nums text-foreground">{round(today, digits)}</span>
          {' · '}avg <span className="tabular-nums text-foreground">{round(avg, digits)}</span> {unit}
          {target != null && (
            <>
              {' · '}
              {kind === 'ceiling' ? 'limit' : 'goal'}{' '}
              <span className="tabular-nums">{target}</span>
            </>
          )}
        </span>
      </div>

      {/* 7 day bars with an optional dashed target line. */}
      <div className="relative mt-2 flex h-14 items-end gap-1">
        {target != null && target <= scaleMax && (
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-muted-foreground/50"
            style={{ bottom: `${(target / scaleMax) * 100}%` }}
            aria-hidden
          />
        )}
        {values.map((v, i) => {
          const h = scaleMax > 0 ? (v / scaleMax) * 100 : 0
          const over = kind === 'ceiling' && target != null && v > target
          const met = kind === 'floor' && target != null && v >= target && v > 0
          return (
            <div
              key={dates[i]}
              className="flex-1 rounded-t"
              style={{ height: `${Math.max(h, v > 0 ? 4 : 0)}%` }}
              title={`${narrowDay(dates[i])}: ${round(v, digits)} ${unit}`}
            >
              <div
                className={cn(
                  'h-full w-full rounded-t',
                  over ? 'bg-destructive' : met ? 'bg-noom-green' : 'bg-primary/70',
                )}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-1 flex gap-1">
        {dates.map((d) => (
          <span key={d} className="flex-1 text-center text-[9px] text-muted-foreground">
            {narrowDay(d)}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * Weekly trend for the blood-pressure nutrients — sodium (ceiling), potassium
 * (floor), saturated fat (ceiling) — over the last 7 days, each as day bars with
 * a dashed target line. Totals reuse `dashProgress` via `nutrientTrend`, so they
 * match the day summary. Read-only; no medical advice.
 */
export function NutrientTrends() {
  const end = todayISO()
  const start = addDays(end, -(DAYS - 1))
  const dates = Array.from({ length: DAYS }, (_, i) => addDays(start, i))

  const range = useFoodLogRange(start, end)
  const { data: targets } = useDailyTargets()

  const dated: DatedNutrients[] = (range.data ?? []).map((e) => ({
    ...toLoggedNutrients(e),
    date: e.logged_on,
  }))
  const trend = nutrientTrend(dated, dates)
  const hasAny = dated.length > 0

  const specs: NutrientSpec[] = [
    {
      key: 'sodium',
      label: 'Sodium',
      unit: 'mg',
      digits: 0,
      kind: 'ceiling',
      values: trend.map((d) => d.sodiumMg),
      target: targets?.sodium_budget_mg ?? null,
    },
    {
      key: 'potassium',
      label: 'Potassium',
      unit: 'mg',
      digits: 0,
      kind: 'floor',
      values: trend.map((d) => d.potassiumMg),
      target: targets?.potassium_goal_mg ?? null,
    },
    {
      key: 'satfat',
      label: 'Saturated fat',
      unit: 'g',
      digits: 1,
      kind: 'ceiling',
      values: trend.map((d) => d.satFatG),
      target: targets?.sat_fat_limit_g ?? null,
    },
  ]

  return (
    <section className="rounded-lg border bg-card p-4 text-card-foreground">
      <h3 className="text-sm font-semibold">This week — blood-pressure nutrients</h3>

      {!isSupabaseConfigured && (
        <p className="mt-2 text-xs text-muted-foreground">
          Sign in to see your weekly trends.
        </p>
      )}

      {isSupabaseConfigured && !hasAny && (
        <p className="mt-2 text-xs text-muted-foreground">
          No meals logged in the last 7 days yet.
        </p>
      )}

      {isSupabaseConfigured && hasAny && (
        <div className="mt-3 space-y-4">
          {specs.map((spec) => (
            <NutrientBlock key={spec.key} spec={spec} dates={dates} />
          ))}
          <RaasCaution />
          <p className="text-[10px] text-muted-foreground">
            Green = potassium goal met; red = over a ceiling. Averages cover days
            you logged. Sodium/potassium are the main levers for blood pressure.
          </p>
        </div>
      )}
    </section>
  )
}
