import { cn } from '@/lib/utils'
import {
  dashProgress,
  dashTargetConflicts,
  dietConflicts,
  fiberProgress,
  fodmapMealLoad,
  noomColor,
  recipeAxisLevel,
  recipeNutrients,
  recipeRollup,
  DASH_GROUPS,
  type ConflictInput,
  type DashGroup,
  type DashTargetInput,
  type FodmapLevel,
  type FodmapStackInput,
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

/** Per-level chip styling for the stacked FODMAP load, matching FodmapBadge tones. */
const LEVEL_STYLE: Record<FodmapLevel, { label: string; className: string }> = {
  low: { label: 'low', className: 'bg-noom-green/15 text-noom-green border-noom-green/30' },
  moderate: {
    label: 'moderate',
    className: 'bg-noom-yellow/20 text-yellow-700 border-noom-yellow/40',
  },
  high: { label: 'high', className: 'bg-destructive/10 text-destructive border-destructive/30' },
  unknown: { label: 'not verified', className: 'bg-muted text-muted-foreground border-border' },
}

function LevelChip({ axis, level }: { axis: string; level: FodmapLevel }) {
  const s = LEVEL_STYLE[level]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
        s.className,
      )}
    >
      {axis}: {s.label}
    </span>
  )
}

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

  // Logged FOODS with no DASH group contribute sodium/potassium but land in no
  // serving bucket — an incomplete rollup that should announce itself rather than
  // read as a low-DASH day (mirrors the FODMAP "unknown" philosophy). Recipes are
  // excluded: they legitimately have no single group (covered by the approx note).
  const dashUnclassified = entries.filter(
    (e) => e.food != null && e.food.dash_group == null,
  ).length

  // Cross-diet conflicts over the day's FOODS (recipes carry no single DASH
  // group). NOOM color is computed from cal/g, matching the rest of the app.
  const conflicts = dietConflicts(
    entries.flatMap((e): ConflictInput[] => {
      const f = e.food
      if (!f) return []
      return [
        {
          name: f.name,
          meal: e.meal,
          fructoseLevel: f.fructose_level,
          fructansLevel: f.fructans_level,
          dashGroup: f.dash_group,
          noom:
            f.calories != null && f.serving_grams != null
              ? noomColor(f.calories, f.serving_grams)
              : null,
        },
      ]
    }),
  )

  // Day-level: DASH group goals met mostly via FODMAP-high foods.
  const dashConflicts = dashTargetConflicts(
    entries.flatMap((e): DashTargetInput[] => {
      const f = e.food
      if (!f) return []
      return [
        {
          dashGroup: f.dash_group,
          servings: e.servings,
          fructoseLevel: f.fructose_level,
          fructansLevel: f.fructans_level,
        },
      ]
    }),
    targets?.dash_serving_goals ?? {},
  )

  // FODMAP load stacked per meal. Foods use their own levels; recipes use a
  // worst-case roll-up bridged so a partially-unverified recipe never understates
  // to 'low' (known-high dominates, incompleteness → unknown).
  const mealLoads = fodmapMealLoad(
    entries.flatMap((e): FodmapStackInput[] => {
      if (e.food) {
        return [
          {
            meal: e.meal,
            servings: e.servings,
            fructoseLevel: e.food.fructose_level,
            fructansLevel: e.food.fructans_level,
          },
        ]
      }
      if (e.recipe) {
        const r = recipeRollup(e.recipe.recipe_ingredients ?? [])
        return [
          {
            meal: e.meal,
            servings: e.servings,
            fructoseLevel: recipeAxisLevel(r.fructoseLevel, r.isComplete),
            fructansLevel: recipeAxisLevel(r.fructansLevel, r.isComplete),
          },
        ]
      }
      return []
    }),
  )
  const flaggedLoads = mealLoads.filter((m) => m.flagged)

  const fiber = fiberProgress(nutrients, {
    fiber_goal_g: targets?.fiber_goal_g ?? null,
    fiber_per_meal_g: targets?.fiber_per_meal_g ?? null,
  })

  // Recipe nutrient roll-ups are approximate when any logged recipe has an
  // ingredient we could not convert to grams (dropped from the sum, never 0).
  // Tally so DASH/Fiber totals are never read as exact (CLAUDE.md health rule).
  let recipesAffected = 0
  let measuredAcross = 0
  let totalAcross = 0
  for (const e of entries) {
    if (!e.recipe) continue
    const n = recipeNutrients(e.recipe.recipe_ingredients ?? [], e.recipe.servings)
    if (!n.isComplete) {
      recipesAffected += 1
      measuredAcross += n.convertedCount
      totalAcross += n.totalCount
    }
  }
  const nutrientsApproximate = recipesAffected > 0

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4 text-card-foreground">
      <h3 className="text-sm font-semibold">Day summary</h3>

      {/* Cross-diet conflicts — surface disagreement between DASH / NOOM / FODMAP
          rather than averaging it away. */}
      {(conflicts.length > 0 || dashConflicts.length > 0) && (
        <div>
          <p className="text-sm font-medium">Heads up — diet conflicts</p>
          <ul className="mt-2 space-y-1.5">
            {conflicts.map((c, i) => (
              <li
                key={`${c.kind}-${c.foodName}-${i}`}
                className={cn(
                  'rounded-md border p-2 text-xs',
                  c.tone === 'warn'
                    ? 'border-amber-300 bg-amber-50 text-amber-900'
                    : 'border-noom-green/30 bg-noom-green/10',
                )}
              >
                <span className="font-medium">{c.foodName}</span>
                <span className="text-muted-foreground"> · {MEAL_LABEL[c.meal]}</span> —{' '}
                {c.message}
              </li>
            ))}
            {dashConflicts.map((c) => (
              <li
                key={`dash-${c.group}`}
                className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900"
              >
                {c.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* FODMAP load stacked per meal — flag meals where individually-tolerable
          servings add up, or an unverified food leaves the total uncertain. */}
      {flaggedLoads.length > 0 && (
        <div>
          <p className="text-sm font-medium">FODMAP load by meal</p>
          <ul className="mt-2 space-y-1.5">
            {flaggedLoads.map((m) => (
              <li key={m.meal} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">{MEAL_LABEL[m.meal]}</span>
                <span className="flex flex-wrap justify-end gap-1.5">
                  <LevelChip axis="Fructose" level={m.fructose.level} />
                  <LevelChip axis="Fructans" level={m.fructans.level} />
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Stacked across each meal — several tolerable servings can add up past a
            threshold. An estimate to calibrate to your own tolerance; “not verified”
            means an unknown food could push the total higher.
          </p>
        </div>
      )}

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

      {nutrientsApproximate && (
        <p className="text-xs text-muted-foreground">
          Includes recipe estimates — some recipe ingredients could not be measured
          {totalAcross > 0 && ` (${measuredAcross} of ${totalAcross} measured)`}, so
          fiber, sodium, saturated fat, and potassium totals are approximate.
        </p>
      )}

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
        {dashUnclassified > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {dashUnclassified} logged food{dashUnclassified === 1 ? '' : 's'} not
            classified for DASH — counted for sodium/potassium but no serving group.
            Edit the food to set its DASH group.
          </p>
        )}
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
