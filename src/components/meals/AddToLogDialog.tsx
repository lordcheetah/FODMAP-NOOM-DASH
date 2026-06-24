import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog } from '@/components/ui/dialog'
import { MEAL_ORDER, type MealType } from '@/lib/diet'
import { useAddLogEntry } from '@/lib/db/foodLog'

const MEAL_LABEL: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

export interface AddTarget {
  name: string
  food_id?: string | null
  recipe_id?: string | null
}

export interface AddToLogDialogProps {
  open: boolean
  onClose: () => void
  /** The food/recipe being added (null when the dialog is closed). */
  target: AddTarget | null
  date: string
  /** Default meal = the page's current meal context. */
  defaultMeal: MealType
}

const MIN_SERVINGS = 0.25
const STEP = 0.25

/**
 * Pick a meal type + servings, then add the item to the day's log via
 * `useAddLogEntry`. On success the dialog closes and query invalidation
 * refreshes the log + summary.
 */
export function AddToLogDialog({
  open,
  onClose,
  target,
  date,
  defaultMeal,
}: AddToLogDialogProps) {
  const [meal, setMeal] = useState<MealType>(defaultMeal)
  const [servings, setServings] = useState('1')
  const addEntry = useAddLogEntry()

  // Reset form each time the dialog opens for a new target.
  useEffect(() => {
    if (open) {
      setMeal(defaultMeal)
      setServings('1')
      addEntry.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultMeal, target])

  const parsed = Number(servings)
  const valid = Number.isFinite(parsed) && parsed >= MIN_SERVINGS

  const handleConfirm = () => {
    if (!target || !valid) return
    addEntry.mutate(
      {
        date,
        meal,
        servings: parsed,
        food_id: target.food_id ?? null,
        recipe_id: target.recipe_id ?? null,
      },
      { onSuccess: () => onClose() },
    )
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      variant="sheet"
      title="Add to log"
      description={target?.name}
    >
      <div className="space-y-4">
        <div>
          <Label>Meal</Label>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {MEAL_ORDER.map((m) => (
              <Button
                key={m}
                type="button"
                size="sm"
                variant={m === meal ? 'default' : 'outline'}
                onClick={() => setMeal(m)}
              >
                {MEAL_LABEL[m]}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <Label htmlFor="servings">Servings</Label>
          <Input
            id="servings"
            type="number"
            inputMode="decimal"
            min={MIN_SERVINGS}
            step={STEP}
            value={servings}
            onChange={(e) => setServings(e.target.value)}
            className="mt-2"
          />
          {!valid && (
            <p className="mt-1 text-xs text-destructive">
              Enter at least {MIN_SERVINGS} servings.
            </p>
          )}
        </div>

        {addEntry.isError && (
          <p className="text-xs text-destructive">
            Could not add entry. {(addEntry.error as Error)?.message}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!valid || !target || addEntry.isPending}
          >
            {addEntry.isPending ? 'Adding…' : 'Add'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
