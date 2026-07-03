import { useMemo } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FoodItemRow } from '@/components/diet/FoodItemRow'
import { noomColor, type MealType } from '@/lib/diet'
import { useFoodSearch } from '@/lib/db/foods'
import type { AddTarget } from './AddToLogDialog'

const MEAL_LABEL: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

/** Drop parenthetical qualifiers so "canned lentils (¼ cup)" searches "canned lentils". */
function cleanTerm(t: string): string {
  return t.replace(/\s*\(.*?\)\s*/g, ' ').trim()
}

export interface SuggestionPickerProps {
  open: boolean
  /** The suggestion label the user tapped (may carry a parenthetical qualifier). */
  term: string
  /** Meal the plan is filling — shown in the title and passed on to the add step. */
  meal: MealType
  onClose: () => void
  /** Called with the chosen food so the caller can open the add-to-log dialog. */
  onPick: (target: AddTarget) => void
}

/**
 * Resolve a plan SUGGESTION (a generic food name) to one of the user's actual
 * foods by searching, so it can be logged. Diet flags stay real (never
 * synthesized). No match → a hint to add it from the Meals tab first.
 */
export function SuggestionPicker({ open, term, meal, onClose, onPick }: SuggestionPickerProps) {
  const q = useMemo(() => (open ? cleanTerm(term) : ''), [open, term])
  const foods = useFoodSearch(q)
  const results = foods.data ?? []

  return (
    <Dialog
      open={open}
      onClose={onClose}
      variant="sheet"
      title={`Add “${term}”`}
      description={`to ${MEAL_LABEL[meal]}`}
    >
      <div className="space-y-2">
        {foods.isLoading && <p className="text-xs text-muted-foreground">Searching…</p>}

        {!foods.isLoading && results.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No match in your foods for “{q}”. Add it from the Meals tab (search,
            scan, or manual) and it’ll be loggable here next time.
          </p>
        )}

        {results.length > 0 && (
          <ul className="divide-y">
            {results.map((f) => (
              <li key={f.id}>
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
                  action={
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label={`Add ${f.name}`}
                      onClick={() => onPick({ name: f.name, food_id: f.id })}
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
    </Dialog>
  )
}
