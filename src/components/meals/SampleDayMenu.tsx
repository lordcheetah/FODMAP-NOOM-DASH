import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { isSupabaseConfigured } from '@/lib/supabase'
import { SAMPLE_DAYS, recipeSearchTerm, type MealType } from '@/lib/diet'
import { AddToLogDialog, type AddTarget } from './AddToLogDialog'
import { RecipePicker } from './RecipePicker'

const MEAL_LABEL: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

const MEAL_ORDER: readonly MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

function todayISO(): string {
  const d = new Date()
  const tz = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - tz).toISOString().slice(0, 10)
}
/** Map today's weekday (Mon=1…Sun=7) onto a 1..7 sample day. */
function todaySampleDay(): number {
  const js = new Date().getDay() // Sun=0..Sat=6
  return js === 0 ? 7 : js
}

/**
 * Browse the NOOM 7-day sample menu; tap a meal to find its seeded recipe and
 * log it to today (with FODMAP/NOOM roll-up shown in the picker). Inspiration
 * companion to the guided plan.
 */
export function SampleDayMenu() {
  const today = todayISO()
  const [day, setDay] = useState(todaySampleDay())
  const [pick, setPick] = useState<{ term: string; meal: MealType } | null>(null)
  const [target, setTarget] = useState<AddTarget | null>(null)
  const [targetMeal, setTargetMeal] = useState<MealType>('breakfast')

  if (!isSupabaseConfigured) return null

  const menu = SAMPLE_DAYS.find((d) => d.day === day) ?? SAMPLE_DAYS[0]
  const meals: { meal: MealType; name: string }[] = MEAL_ORDER.map((m) => ({
    meal: m,
    name: menu[m],
  }))

  return (
    <section className="rounded-lg border bg-card p-4 text-card-foreground">
      <h3 className="text-sm font-semibold">NOOM sample days</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        A week of meal ideas from the NOOM plan. Tap a meal to find its recipe and
        log it to today.
      </p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {SAMPLE_DAYS.map((d) => {
          const isToday = d.day === todaySampleDay()
          return (
            <Button
              key={d.day}
              size="sm"
              variant={d.day === day ? 'default' : 'outline'}
              onClick={() => setDay(d.day)}
              aria-pressed={d.day === day}
            >
              {d.day}
              {isToday && <span className="ml-1 text-[10px] opacity-80">today</span>}
            </Button>
          )
        })}
      </div>

      <ul className="mt-3 divide-y">
        {meals.map(({ meal, name }) => (
          <li key={meal} className="flex items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {MEAL_LABEL[meal]}
              </p>
              <button
                type="button"
                onClick={() => setPick({ term: recipeSearchTerm(name), meal })}
                className={cn(
                  'text-left text-sm font-medium text-primary hover:underline',
                )}
              >
                {name}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <RecipePicker
        open={pick !== null}
        term={pick?.term ?? ''}
        meal={pick?.meal ?? 'breakfast'}
        onClose={() => setPick(null)}
        onPick={(t) => {
          setTargetMeal(pick?.meal ?? 'breakfast')
          setTarget(t)
          setPick(null)
        }}
      />

      <AddToLogDialog
        open={target !== null}
        onClose={() => setTarget(null)}
        target={target}
        date={today}
        defaultMeal={targetMeal}
      />
    </section>
  )
}
