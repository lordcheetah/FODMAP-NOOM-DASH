import { useEffect, useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { FoodItemRow, type NutrientChip } from '@/components/diet/FoodItemRow'
import { noomColor, type MealType } from '@/lib/diet'
import { useFoodSearch } from '@/lib/db/foods'
import { useRecipeSearch } from '@/lib/db/recipes'
import type { FoodRow, RecipeRow } from '@/lib/db/types'
import { isSupabaseConfigured } from '@/lib/supabase'
import { AddToLogDialog, type AddTarget } from './AddToLogDialog'

const MIN_CHARS = 2
const DEBOUNCE_MS = 300

function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

function foodChips(f: FoodRow): NutrientChip[] {
  const chips: NutrientChip[] = []
  if (f.calories != null) chips.push({ value: `${Math.round(f.calories)}`, label: 'cal' })
  if (f.fiber_g != null) chips.push({ value: `${f.fiber_g}g`, label: 'fiber' })
  if (f.sodium_mg != null) chips.push({ value: `${Math.round(f.sodium_mg)}mg`, label: 'sodium' })
  return chips
}

function recipeChips(r: RecipeRow): NutrientChip[] {
  const chips: NutrientChip[] = []
  if (r.cal_per_serving != null)
    chips.push({ value: `${Math.round(r.cal_per_serving)}`, label: 'cal/serv' })
  return chips
}

export interface FoodSearchProps {
  date: string
  /** Default meal for the add dialog = the page's meal context. */
  mealContext: MealType
}

/**
 * Debounced food + recipe search. Each result renders as a FoodItemRow with a
 * computed NOOM dot, FODMAP badge (foods only) and nutrient chips, plus an Add
 * affordance opening the AddToLogDialog. Recipes whose grams are unknown render
 * an unknown NOOM dot — we never guess a color.
 */
export function FoodSearch({ date, mealContext }: FoodSearchProps) {
  const [term, setTerm] = useState('')
  const debounced = useDebounced(term, DEBOUNCE_MS)
  const [target, setTarget] = useState<AddTarget | null>(null)

  const foods = useFoodSearch(debounced)
  const recipes = useRecipeSearch(debounced)

  const tooShort = debounced.trim().length < MIN_CHARS
  const loading = !tooShort && (foods.isLoading || recipes.isLoading)
  const results = useMemo(
    () => ({ foods: foods.data ?? [], recipes: recipes.data ?? [] }),
    [foods.data, recipes.data],
  )
  const hasResults = results.foods.length > 0 || results.recipes.length > 0

  return (
    <section className="rounded-lg border bg-card p-4 text-card-foreground">
      <h3 className="mb-2 text-sm font-semibold">Search foods &amp; recipes</h3>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          inputMode="search"
          placeholder="Search (min 2 characters)…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className="pl-9"
          aria-label="Search foods and recipes"
        />
      </div>

      {!isSupabaseConfigured && (
        <p className="mt-3 text-xs text-muted-foreground">
          Search needs a connected account. Sign in to look up foods.
        </p>
      )}

      {isSupabaseConfigured && (
        <div className="mt-3">
          {tooShort && (
            <p className="text-xs text-muted-foreground">
              Type at least {MIN_CHARS} characters to search.
            </p>
          )}
          {loading && <p className="text-xs text-muted-foreground">Searching…</p>}
          {!tooShort && !loading && !hasResults && (
            <p className="text-xs text-muted-foreground">No matches.</p>
          )}

          {hasResults && (
            <ul className="divide-y">
              {results.foods.map((f) => (
                <li key={`food-${f.id}`}>
                  <FoodItemRow
                    name={f.name}
                    subtitle={[f.brand, f.serving_desc].filter(Boolean).join(' · ')}
                    noom={
                      f.calories != null && f.serving_grams != null
                        ? noomColor(f.calories, f.serving_grams)
                        : null
                    }
                    fructose={f.fructose_level}
                    fructans={f.fructans_level}
                    chips={foodChips(f)}
                    action={
                      <Button
                        size="icon"
                        variant="outline"
                        aria-label={`Add ${f.name}`}
                        onClick={() => setTarget({ name: f.name, food_id: f.id })}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    }
                  />
                </li>
              ))}
              {results.recipes.map((r) => (
                <li key={`recipe-${r.id}`}>
                  <FoodItemRow
                    name={r.name}
                    subtitle={`Recipe${r.servings ? ` · ${r.servings} servings` : ''}`}
                    // Recipe grams are unknown → unknown NOOM dot (never guess).
                    noom={null}
                    chips={recipeChips(r)}
                    action={
                      <Button
                        size="icon"
                        variant="outline"
                        aria-label={`Add ${r.name}`}
                        onClick={() => setTarget({ name: r.name, recipe_id: r.id })}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
