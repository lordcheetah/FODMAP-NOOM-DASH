import { useMemo, useState } from 'react'
import { CornerDownRight, Undo2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useFoodLog } from '@/lib/db/foodLog'
import { useDailyTargets } from '@/lib/db/dailyTargets'
import { useSyncedSet } from '@/lib/db/planState'
import {
  buildMealPlan,
  recipeDashServings,
  DEFAULT_DASH_GOALS,
  PLAN_MEALS,
  type DashGroup,
  type MealType,
  type PlanLoggedItem,
} from '@/lib/diet'
import { AddToLogDialog, type AddTarget } from './AddToLogDialog'
import { SuggestionPicker } from './SuggestionPicker'

const MEAL_LABEL: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
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

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
function todayISO(): string {
  const d = new Date()
  const tz = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - tz).toISOString().slice(0, 10)
}

export interface MealPlanGuideProps {
  /** Local YYYY-MM-DD to plan (defaults to today). */
  date?: string
}

/**
 * Guided per-meal plan: distributes the day's DASH serving goals across meals,
 * subtracts what's already logged, and lists low-FODMAP suggestions to fill each
 * gap. A food type can be deferred to the next meal. Suggestions are a
 * non-authoritative low-FODMAP (fructose/fructans) aid, not a product verdict.
 */
export function MealPlanGuide({ date }: MealPlanGuideProps) {
  const day = date ?? todayISO()
  const log = useFoodLog(day)
  const { data: targets } = useDailyTargets()
  // Synced per day so deferrals survive a reload and follow you across devices.
  const { set: deferred, toggle: toggleDefer } = useSyncedSet(`mealplan:defers:${day}`)
  // Tapping a suggestion resolves it to a real food (picker) → add-to-log dialog.
  const [pick, setPick] = useState<{ term: string; meal: MealType } | null>(null)
  const [target, setTarget] = useState<AddTarget | null>(null)
  const [targetMeal, setTargetMeal] = useState<MealType>('breakfast')

  const goals = useMemo(() => {
    const g = targets?.dash_serving_goals
    return g && Object.keys(g).length > 0 ? g : DEFAULT_DASH_GOALS
  }, [targets])
  const usingDefaults = !(
    targets?.dash_serving_goals && Object.keys(targets.dash_serving_goals).length > 0
  )

  const logged: PlanLoggedItem[] = useMemo(
    () =>
      (log.data ?? []).flatMap((e): PlanLoggedItem[] => {
        if (e.food) {
          return [{ meal: e.meal, dashGroup: e.food.dash_group ?? null, servings: e.servings }]
        }
        if (e.recipe) {
          // A recipe credits each DASH group its ingredients cover (per serving ×
          // logged servings), so recipes count toward the plan's targets too.
          const per = recipeDashServings(e.recipe.recipe_ingredients ?? [], e.recipe.servings)
          return Object.entries(per).map(([g, s]) => ({
            meal: e.meal,
            dashGroup: g as DashGroup,
            servings: (s ?? 0) * e.servings,
          }))
        }
        return []
      }),
    [log.data],
  )

  const plan = useMemo(
    () => buildMealPlan(goals, targets?.fiber_per_meal_g ?? null, logged, deferred),
    [goals, targets?.fiber_per_meal_g, logged, deferred],
  )

  if (!isSupabaseConfigured) {
    return (
      <section className="rounded-lg border bg-card p-4 text-card-foreground">
        <h3 className="text-sm font-semibold">Meal plan</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Sign in to plan your meals against your DASH goals.
        </p>
      </section>
    )
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-card p-4 text-card-foreground">
        <h2 className="text-lg font-semibold">Today's plan</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          What to aim for at each meal to hit your DASH goals — with low-FODMAP
          ideas to fill the gaps. Tap “defer” to push a food type to a later meal.
        </p>
        {usingDefaults && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Using default DASH serving goals (~2,000 kcal). Set your own in Meals →
            Targets to tailor this.
          </p>
        )}
      </section>

      {PLAN_MEALS.map((meal, idx) => {
        const slot = plan.find((s) => s.meal === meal)!
        const isLast = idx === PLAN_MEALS.length - 1
        return (
          <section key={meal} className="rounded-lg border bg-card p-4 text-card-foreground">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold">{MEAL_LABEL[meal]}</h3>
              {slot.fiberTargetG != null && (
                <span className="text-[11px] text-muted-foreground">
                  fiber ~{slot.fiberTargetG} g
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{slot.noomHint}</p>

            {slot.groups.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Nothing specific to aim for here — eat to appetite, green-leaning.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {slot.groups.map((g) => {
                  const met = g.gap <= 0
                  const key = `${meal}:${g.group}`
                  return (
                    <li key={g.group} className="rounded-md border p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">
                          {DASH_GROUP_LABEL[g.group]}
                          {g.deferredIn && (
                            <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                              (moved here)
                            </span>
                          )}
                        </span>
                        <span
                          className={cn(
                            'text-xs tabular-nums',
                            met ? 'text-noom-green' : 'text-muted-foreground',
                          )}
                        >
                          {met ? '✓ ' : ''}
                          {round1(g.logged)} / {round1(g.target)}
                        </span>
                      </div>

                      {!met && g.suggestions.length > 0 && (
                        <ul className="mt-1.5 flex flex-wrap gap-1">
                          {g.suggestions.map((s) => (
                            <li key={s}>
                              <button
                                type="button"
                                onClick={() => setPick({ term: s, meal })}
                                className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                                title={`Log ${s} to ${MEAL_LABEL[meal]}`}
                              >
                                + {s}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}

                      {!met && !isLast && (
                        <button
                          type="button"
                          onClick={() => toggleDefer(key, true)}
                          className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground underline underline-offset-2"
                        >
                          <CornerDownRight className="h-3 w-3" />
                          Defer to next meal
                        </button>
                      )}
                      {g.deferredIn && (
                        <button
                          type="button"
                          onClick={() => toggleDefer(prevMealKey(meal, g.group), false)}
                          className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground underline underline-offset-2"
                        >
                          <Undo2 className="h-3 w-3" />
                          Undo defer
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )
      })}

      <p className="text-[10px] text-muted-foreground">
        Suggestions are a general low-FODMAP (fructose/fructans) memory aid, not a
        verdict about any specific product. Tap one to log it to that meal.
      </p>

      <SuggestionPicker
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
        date={day}
        defaultMeal={targetMeal}
      />
    </div>
  )
}

/** The defer key at the meal BEFORE `meal` for a group (to undo a carry-in). */
function prevMealKey(meal: MealType, group: DashGroup): string {
  const i = PLAN_MEALS.indexOf(meal)
  const prev = PLAN_MEALS[Math.max(0, i - 1)]
  return `${prev}:${group}`
}
