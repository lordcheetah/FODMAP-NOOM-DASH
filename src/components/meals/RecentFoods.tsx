import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FoodItemRow } from '@/components/diet/FoodItemRow'
import { noomColor, type MealType } from '@/lib/diet'
import { useRecentFoods } from '@/lib/db/recents'
import { AddToLogDialog, type AddTarget } from './AddToLogDialog'

export interface RecentFoodsProps {
  date: string
  mealContext: MealType
}

/**
 * Quick re-add of the user's recently logged foods/recipes. Foods keep their
 * real NOOM dot + FODMAP badge (never synthesized). Tapping "+" opens the same
 * AddToLogDialog used by search. Hidden when there are no recents.
 */
export function RecentFoods({ date, mealContext }: RecentFoodsProps) {
  const recents = useRecentFoods()
  const [target, setTarget] = useState<AddTarget | null>(null)
  const items = recents.data ?? []
  if (items.length === 0) return null

  return (
    <section className="rounded-lg border bg-card p-4 text-card-foreground">
      <h3 className="mb-2 text-sm font-semibold">Recent</h3>
      <ul className="divide-y">
        {items.map((it) => (
          <li key={it.key}>
            <FoodItemRow
              name={it.name}
              subtitle={
                it.kind === 'recipe'
                  ? 'Recipe'
                  : [it.food?.brand, it.food?.serving_desc].filter(Boolean).join(' · ')
              }
              noom={
                it.food && it.food.calories != null && it.food.serving_grams != null
                  ? noomColor(it.food.calories, it.food.serving_grams)
                  : null
              }
              fructose={it.food?.fructose_level}
              fructans={it.food?.fructans_level}
              action={
                <Button
                  size="icon"
                  variant="outline"
                  aria-label={`Add ${it.name}`}
                  onClick={() =>
                    setTarget(
                      it.kind === 'food'
                        ? { name: it.name, food_id: it.food!.id }
                        : { name: it.name, recipe_id: it.recipe!.id },
                    )
                  }
                >
                  <Plus className="h-4 w-4" />
                </Button>
              }
            />
          </li>
        ))}
      </ul>

      <AddToLogDialog
        open={target !== null}
        onClose={() => setTarget(null)}
        target={target}
        date={date}
        defaultMeal={mealContext}
      />
    </section>
  )
}
