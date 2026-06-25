import { useEffect, useMemo, useState } from 'react'
import { Plus, ScanBarcode, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { FoodItemRow, type NutrientChip } from '@/components/diet/FoodItemRow'
import { noomColor, recipeRollup, type MealType } from '@/lib/diet'
import { useFoodSearch } from '@/lib/db/foods'
import { useRecipeSearch } from '@/lib/db/recipes'
import type { FoodRow, RecipeRow } from '@/lib/db/types'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { AddToLogDialog, type AddTarget } from './AddToLogDialog'
import { ScanFlow } from './ScanFlow'

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
 * computed NOOM dot, FODMAP badge and nutrient chips, plus an Add affordance
 * opening the AddToLogDialog. Recipe verdicts come from `recipeRollup` over the
 * embedded ingredients (worst-case FODMAP axes + averaged density). When a
 * recipe is "not verified" due to unlinked ingredients, the subtitle says why
 * and the badge stays neutral — an unknown component never reads as "safe".
 */
export function FoodSearch({ date, mealContext }: FoodSearchProps) {
  const { user } = useAuth()
  const [term, setTerm] = useState('')
  const debounced = useDebounced(term, DEBOUNCE_MS)
  const [target, setTarget] = useState<AddTarget | null>(null)
  const [scanOpen, setScanOpen] = useState(false)
  // Scanning saves a user-custom food, so it requires a connected, signed-in account.
  const canScan = isSupabaseConfigured && !!user

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

      <div className="flex gap-2">
        <div className="relative flex-1">
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
        {canScan && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setScanOpen(true)}
            aria-label="Scan barcode"
          >
            <ScanBarcode className="h-4 w-4" />
            Scan
          </Button>
        )}
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
              {results.recipes.map(({ recipe: r, ingredients }) => {
                const rollup = recipeRollup(ingredients)
                const baseSubtitle = `Recipe${r.servings ? ` · ${r.servings} servings` : ''}`
                const subtitle =
                  rollup.safety === 'not-verified' && rollup.unlinkedCount > 0
                    ? `${baseSubtitle} · not verified: ${rollup.unlinkedCount} unlinked ingredient${
                        rollup.unlinkedCount === 1 ? '' : 's'
                      }`
                    : baseSubtitle
                return (
                  <li key={`recipe-${r.id}`}>
                    <FoodItemRow
                      name={r.name}
                      subtitle={subtitle}
                      // Computed from ingredient roll-up (averaged density); null = unknown dot.
                      noom={rollup.noomColor}
                      fructose={rollup.fructoseLevel}
                      fructans={rollup.fructansLevel}
                      safety={rollup.safety}
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
                )
              })}
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

      {canScan && (
        <ScanFlow
          open={scanOpen}
          onClose={() => setScanOpen(false)}
          date={date}
          mealContext={mealContext}
        />
      )}
    </section>
  )
}
