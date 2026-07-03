import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FoodItemRow } from '@/components/diet/FoodItemRow'
import { recipeRollup, type MealType } from '@/lib/diet'
import { useRecipeSearch } from '@/lib/db/recipes'
import type { AddTarget } from './AddToLogDialog'

const MEAL_LABEL: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

export interface RecipePickerProps {
  open: boolean
  /** Recipe search term (already cleaned of leftovers/either-or notes). */
  term: string
  /** Meal slot this menu item fills — passed on to the add step. */
  meal: MealType
  onClose: () => void
  onPick: (target: AddTarget) => void
}

/**
 * Resolve a NOOM sample-day meal name to a seeded recipe by searching, so it can
 * be logged. Diet verdicts come from `recipeRollup` (worst-case FODMAP + averaged
 * density) — an unverified recipe never reads "safe". No match → a hint.
 */
export function RecipePicker({ open, term, meal, onClose, onPick }: RecipePickerProps) {
  const recipes = useRecipeSearch(open ? term : '')
  const results = recipes.data ?? []

  return (
    <Dialog
      open={open}
      onClose={onClose}
      variant="sheet"
      title={`Find “${term}”`}
      description={`Log to ${MEAL_LABEL[meal]}`}
    >
      <div className="space-y-2">
        {recipes.isLoading && <p className="text-xs text-muted-foreground">Searching…</p>}

        {!recipes.isLoading && results.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No matching recipe found for “{term}”. It may not be seeded yet — you can
            still build it from foods on the Meals tab.
          </p>
        )}

        {results.length > 0 && (
          <ul className="divide-y">
            {results.map(({ recipe, ingredients }) => {
              const rollup = recipeRollup(ingredients)
              return (
                <li key={recipe.id}>
                  <FoodItemRow
                    name={recipe.name}
                    subtitle={`Recipe${recipe.servings ? ` · ${recipe.servings} servings` : ''}`}
                    noom={rollup.noomColor}
                    fructose={rollup.fructoseLevel}
                    fructans={rollup.fructansLevel}
                    safety={rollup.safety}
                    action={
                      <Button
                        size="icon"
                        variant="outline"
                        aria-label={`Add ${recipe.name}`}
                        onClick={() => onPick({ name: recipe.name, recipe_id: recipe.id })}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    }
                  />
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Dialog>
  )
}
