import { useState } from 'react'
import { ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MEAL_ORDER, type MealType } from '@/lib/diet'
import { useFoodLog } from '@/lib/db/foodLog'
import { useDailyTargets } from '@/lib/db/dailyTargets'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { FoodSearch } from '@/components/meals/FoodSearch'
import { RecentFoods } from '@/components/meals/RecentFoods'
import { DailyLog } from '@/components/meals/DailyLog'
import { DaySummary } from '@/components/meals/DaySummary'
import { TargetsForm } from '@/components/meals/TargetsForm'
import { Disclaimer } from '@/components/diet/Disclaimer'

const MEAL_LABEL: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

/** Local-time YYYY-MM-DD (avoids UTC off-by-one from toISOString). */
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

function formatLabel(iso: string): string {
  const today = todayISO()
  if (iso === today) return 'Today'
  if (iso === addDays(today, -1)) return 'Yesterday'
  if (iso === addDays(today, 1)) return 'Tomorrow'
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export default function Meals() {
  const { user } = useAuth()
  const [date, setDate] = useState(todayISO)
  const [meal, setMeal] = useState<MealType>('breakfast')
  const [targetsOpen, setTargetsOpen] = useState(false)

  const signedIn = !!user
  const log = useFoodLog(date)
  const targets = useDailyTargets()
  const entries = log.data ?? []

  return (
    <div className="space-y-4">
      {/* Date stepper + targets */}
      <section className="rounded-lg border bg-card p-3 text-card-foreground">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              aria-label="Previous day"
              onClick={() => setDate((d) => addDays(d, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <button
              type="button"
              onClick={() => setDate(todayISO())}
              className="min-w-[7rem] text-center"
              title="Jump to today"
            >
              <div className="text-sm font-semibold">{formatLabel(date)}</div>
              <div className="text-[11px] text-muted-foreground">{date}</div>
            </button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Next day"
              onClick={() => setDate((d) => addDays(d, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setTargetsOpen(true)}
            disabled={!signedIn}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Targets
          </Button>
        </div>

        {/* Meal context for "add" */}
        <div className="mt-3">
          <p className="mb-1 text-[11px] text-muted-foreground">Add to meal</p>
          <div className="grid grid-cols-4 gap-2">
            {MEAL_ORDER.map((m) => (
              <Button
                key={m}
                size="sm"
                variant={m === meal ? 'default' : 'outline'}
                onClick={() => setMeal(m)}
              >
                {MEAL_LABEL[m]}
              </Button>
            ))}
          </div>
        </div>
      </section>

      {!isSupabaseConfigured && (
        <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          Meal logging needs a connected account. The app is running in offline/demo mode —
          set Supabase env vars and sign in to log meals.
        </p>
      )}

      {isSupabaseConfigured && !signedIn && (
        <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          Sign in to search foods and log meals.
        </p>
      )}

      <FoodSearch date={date} mealContext={meal} />

      <RecentFoods date={date} mealContext={meal} />

      <DailyLog date={date} entries={entries} isLoading={log.isLoading} />

      <DaySummary entries={entries} targets={targets.data ?? null} />

      {/* Disclaimer also lives inside DaySummary; keep one at page level so it's
          always visible even before any data loads. */}
      <Disclaimer />

      <TargetsForm open={targetsOpen} onClose={() => setTargetsOpen(false)} />
    </div>
  )
}
