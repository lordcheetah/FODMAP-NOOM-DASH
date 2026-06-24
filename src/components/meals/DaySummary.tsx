import { cn } from '@/lib/utils'
import {
  dashProgress,
  fiberProgress,
  noomColor,
  DASH_GROUPS,
  type DashGroup,
  type LoggedNutrients,
  type NoomColor,
} from '@/lib/diet'
import { NOOM_DOT_CLASS } from '@/components/diet/NoomDot'
import { Disclaimer } from '@/components/diet/Disclaimer'
import { toLoggedNutrients, type FoodLogEntry } from '@/lib/db/foodLog'
import type { DailyTargetsRow } from '@/lib/db/types'

const MEAL_LABEL: Record<string, string> = {
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

const NOOM_COLORS: readonly NoomColor[] = ['green', 'yellow', 'orange']

function round(n: number, digits = 0): number {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

function Bar({ value, max, over }: { value: number; max: number | null; over?: boolean }) {
  const pct = max && max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn('h-full rounded-full', over ? 'bg-destructive' : 'bg-primary')}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export interface DaySummaryProps {
  entries: FoodLogEntry[]
  targets: DailyTargetsRow | null
}

/**
 * Running totals for the day: calories vs budget, NOOM color mix, DASH servings
 * + sodium budget, and fiber (daily + per-meal) with the low-FODMAP high-fiber
 * suggestions when there's a gap. All math comes from `@/lib/diet`.
 */
export function DaySummary({ entries, targets }: DaySummaryProps) {
  const nutrients: LoggedNutrients[] = entries.map(toLoggedNutrients)

  // Calories
  const calories = entries.reduce((sum, e) => {
    const cal = e.food?.calories ?? e.recipe?.cal_per_serving ?? 0
    return sum + cal * e.servings
  }, 0)
  const calorieBudget = targets?.calorie_budget ?? null
  const calOver = calorieBudget != null && calories > calorieBudget

  // NOOM mix — count items per color (uncolored when grams unknown).
  const noomCounts: Record<NoomColor | 'unknown', number> = {
    green: 0,
    yellow: 0,
    orange: 0,
    unknown: 0,
  }
  for (const e of entries) {
    const f = e.food
    const color =
      f && f.calories != null && f.serving_grams != null
        ? noomColor(f.calories, f.serving_grams)
        : null
    noomCounts[color ?? 'unknown'] += 1
  }

  const dash = dashProgress(nutrients, {
    sodium_budget_mg: targets?.sodium_budget_mg ?? null,
    dash_serving_goals: targets?.dash_serving_goals ?? {},
  })

  const fiber = fiberProgress(nutrients, {
    fiber_goal_g: targets?.fiber_goal_g ?? null,
    fiber_per_meal_g: targets?.fiber_per_meal_g ?? null,
  })

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4 text-card-foreground">
      <h3 className="text-sm font-semibold">Day summary</h3>

      {/* Calories */}
      <div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">Calories</span>
          <span className={cn('tabular-nums', calOver && 'text-destructive')}>
            {round(calories)}
            {calorieBudget != null && (
              <span className="text-muted-foreground"> / {calorieBudget}</span>
            )}
          </span>
        </div>
        {calorieBudget != null && (
          <div className="mt-1">
            <Bar value={calories} max={calorieBudget} over={calOver} />
            {calOver && (
              <p className="mt-1 text-xs text-destructive">
                Over budget by {round(calories - calorieBudget)} cal.
              </p>
            )}
          </div>
        )}
      </div>

      {/* NOOM color mix */}
      <div>
        <p className="text-sm font-medium">NOOM color mix</p>
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          {NOOM_COLORS.map((c) => (
            <span key={c} className="flex items-center gap-1.5">
              <span className={cn('inline-block h-3 w-3 rounded-full', NOOM_DOT_CLASS[c])} />
              <span className="tabular-nums">{noomCounts[c]}</span>
              <span className="capitalize text-muted-foreground">{c}</span>
            </span>
          ))}
          {noomCounts.unknown > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full border border-muted-foreground/40 bg-muted" />
              <span className="tabular-nums">{noomCounts.unknown}</span>
              <span className="text-muted-foreground">uncolored</span>
            </span>
          )}
        </div>
      </div>

      {/* DASH */}
      <div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">Sodium</span>
          <span className={cn('tabular-nums', dash.sodiumOverBudget && 'text-destructive')}>
            {round(dash.sodiumMg)}
            {dash.sodiumBudgetMg != null && (
              <span className="text-muted-foreground"> / {dash.sodiumBudgetMg} mg</span>
            )}
          </span>
        </div>
        {dash.sodiumBudgetMg != null && (
          <div className="mt-1">
            <Bar value={dash.sodiumMg} max={dash.sodiumBudgetMg} over={dash.sodiumOverBudget} />
            {dash.sodiumOverBudget && (
              <p className="mt-1 text-xs text-destructive">Over sodium budget.</p>
            )}
          </div>
        )}
        <p className="mt-3 text-sm font-medium">DASH servings</p>
        <ul className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {DASH_GROUPS.map((g) => {
            const got = dash.servingsByGroup[g]
            const goal = dash.goalsByGroup[g]
            return (
              <li key={g} className="flex justify-between">
                <span className="text-muted-foreground">{DASH_GROUP_LABEL[g]}</span>
                <span className="tabular-nums">
                  {round(got, 2)}
                  {goal != null && <span className="text-muted-foreground"> / {goal}</span>}
                </span>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Fiber */}
      <div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">Fiber</span>
          <span className={cn('tabular-nums', fiber.meetsGoal && fiber.goalG != null && 'text-noom-green')}>
            {round(fiber.totalFiberG, 1)} g
            {fiber.goalG != null && (
              <span className="text-muted-foreground"> / {fiber.goalG} g</span>
            )}
          </span>
        </div>
        {fiber.goalG != null && (
          <div className="mt-1">
            <Bar value={fiber.totalFiberG} max={fiber.goalG} />
          </div>
        )}
        <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {fiber.byMeal.map((m) => (
            <li key={m.meal} className="flex justify-between">
              <span className="text-muted-foreground">{MEAL_LABEL[m.meal]}</span>
              <span className={cn('tabular-nums', !m.meetsTarget && m.targetG != null && 'text-muted-foreground')}>
                {round(m.fiberG, 1)}
                {m.targetG != null && <span className="text-muted-foreground"> / {m.targetG} g</span>}
              </span>
            </li>
          ))}
        </ul>

        {fiber.dailyGapG > 0 && (
          <div className="mt-3 rounded-md border border-noom-green/30 bg-noom-green/10 p-3">
            <p className="text-xs font-medium">
              {round(fiber.dailyGapG, 1)} g fiber to go. Low-FODMAP high-fiber options:
            </p>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {fiber.suggestions.map((s) => (
                <li
                  key={s.name}
                  className="rounded bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground"
                  title={s.note}
                >
                  {s.name}{' '}
                  <span className="font-medium text-foreground">{s.fiber_g}g</span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[10px] text-muted-foreground">
              These are fructose/fructans-low picks (static guidance, not a claim about your
              other foods).
            </p>
          </div>
        )}
      </div>

      <Disclaimer />
    </section>
  )
}
