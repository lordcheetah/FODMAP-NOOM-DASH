import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FoodItemRow, type NutrientChip } from '@/components/diet/FoodItemRow'
import {
  MEAL_ORDER,
  noomColor,
  recipeRollup,
  type MealType,
} from '@/lib/diet'
import {
  useDeleteLogEntry,
  type FoodLogEntry,
} from '@/lib/db/foodLog'

const MEAL_LABEL: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

function entryChips(entry: FoodLogEntry): NutrientChip[] {
  const chips: NutrientChip[] = [{ value: `×${entry.servings}`, label: 'servings' }]
  const f = entry.food
  if (f) {
    if (f.calories != null)
      chips.push({ value: `${Math.round(f.calories * entry.servings)}`, label: 'cal' })
    if (f.fiber_g != null)
      chips.push({ value: `${+(f.fiber_g * entry.servings).toFixed(1)}g`, label: 'fiber' })
    if (f.sodium_mg != null)
      chips.push({ value: `${Math.round(f.sodium_mg * entry.servings)}mg`, label: 'sodium' })
  } else if (entry.recipe?.cal_per_serving != null) {
    chips.push({
      value: `${Math.round(entry.recipe.cal_per_serving * entry.servings)}`,
      label: 'cal',
    })
  }
  return chips
}

export interface DailyLogProps {
  date: string
  entries: FoodLogEntry[]
  isLoading?: boolean
}

/**
 * The day's log grouped by meal. Each entry renders as a FoodItemRow (computed
 * NOOM dot + FODMAP badge for foods) with a remove control wired to
 * `useDeleteLogEntry`.
 */
export function DailyLog({ date, entries, isLoading }: DailyLogProps) {
  const del = useDeleteLogEntry()

  const byMeal = MEAL_ORDER.map((meal) => ({
    meal,
    items: entries.filter((e) => e.meal === meal),
  }))

  return (
    <section className="rounded-lg border bg-card p-4 text-card-foreground">
      <h3 className="mb-2 text-sm font-semibold">Daily log</h3>

      {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}

      {!isLoading && entries.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Nothing logged yet. Search above to add foods.
        </p>
      )}

      {!isLoading && entries.length > 0 && (
        <div className="space-y-3">
          {byMeal.map(({ meal, items }) => (
            <div key={meal}>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {MEAL_LABEL[meal]}
              </h4>
              {items.length === 0 ? (
                <p className="py-1 text-xs text-muted-foreground/70">—</p>
              ) : (
                <ul className="divide-y">
                  {items.map((entry) => {
                    const f = entry.food
                    const name = f?.name ?? entry.recipe?.name ?? 'Item'
                    // Recipe verdict from ingredient roll-up; foods use their own row.
                    const rollup = entry.recipe
                      ? recipeRollup(entry.recipe.recipe_ingredients)
                      : null
                    const recipeSubtitle =
                      rollup && rollup.safety === 'not-verified' && rollup.unlinkedCount > 0
                        ? `Recipe · not verified: ${rollup.unlinkedCount} unlinked ingredient${
                            rollup.unlinkedCount === 1 ? '' : 's'
                          }`
                        : 'Recipe'
                    return (
                      <li key={entry.id}>
                        <FoodItemRow
                          name={name}
                          subtitle={f?.serving_desc ?? (entry.recipe ? recipeSubtitle : undefined)}
                          noom={
                            f
                              ? f.calories != null && f.serving_grams != null
                                ? noomColor(f.calories, f.serving_grams)
                                : null
                              : (rollup?.noomColor ?? null)
                          }
                          fructose={f ? f.fructose_level : rollup?.fructoseLevel}
                          fructans={f ? f.fructans_level : rollup?.fructansLevel}
                          safety={f ? undefined : rollup?.safety}
                          chips={entryChips(entry)}
                          action={
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Remove ${name}`}
                              disabled={del.isPending}
                              onClick={() => del.mutate({ id: entry.id, date })}
                            >
                              <Trash2 className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          }
                        />
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
