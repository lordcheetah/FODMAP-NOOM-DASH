import { useEffect, useRef, useState } from 'react'
import type { MealType } from '@/lib/diet'
import {
  analyzeMeal,
  analyzedItemToPrefill,
  type AnalyzedItem,
} from '@/lib/analyzeMeal'
import type { FoodRow } from '@/lib/db/types'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Disclaimer } from '@/components/diet/Disclaimer'
import { ProductReviewForm } from './ProductReviewForm'
import { FoodMatchPicker } from './FoodMatchPicker'
import { AddToLogDialog, type AddTarget } from './AddToLogDialog'

/**
 * Orchestrates: capture a photo → analyze (Claude vision via Edge Function) →
 * review a LIST of items → per item, match to a real DB food (cited FODMAP/NOOM)
 * OR add as a custom food (FODMAP "Not verified") → log it. Mirrors `ScanFlow`'s
 * Step state machine, swapping "one barcode" for "a list of AI-identified items."
 *
 * HEALTH-SAFETY: nothing the AI returns is ever rendered as "Safe". An item is
 * either matched to a cited DB food or kept unknown ("Not verified"). Every item
 * is reviewed individually — there is no "log all" shortcut. The photo is sent
 * to Anthropic for analysis and is not stored by the app.
 */
type Step =
  | { kind: 'idle' }
  | { kind: 'analyzing' }
  | { kind: 'error'; message: string }
  | { kind: 'empty' }
  | { kind: 'review'; items: AnalyzedItem[]; index: number }
  | { kind: 'match'; items: AnalyzedItem[]; index: number }
  | { kind: 'custom'; items: AnalyzedItem[]; index: number }
  | { kind: 'log'; items: AnalyzedItem[]; index: number; target: AddTarget }

export interface PhotoMealFlowProps {
  open: boolean
  onClose: () => void
  date: string
  mealContext: MealType
}

// Neutral palette on purpose: this chip rates how confident the AI is about the
// IDENTIFICATION, not whether the food is diet-safe. Avoid green (it reads as a
// NOOM/"safe" signal). Low confidence gets an amber caution.
const CONFIDENCE_STYLE: Record<AnalyzedItem['confidence'], string> = {
  low: 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
  medium: 'bg-muted text-muted-foreground',
  high: 'bg-secondary text-secondary-foreground',
}

const PRIVACY_NOTICE =
  'AI estimate — review each item. Photos are sent to Anthropic for analysis and not stored.'

export function PhotoMealFlow({
  open,
  onClose,
  date,
  mealContext,
}: PhotoMealFlowProps) {
  const [step, setStep] = useState<Step>({ kind: 'idle' })
  const fileRef = useRef<HTMLInputElement>(null)

  // Reset when the flow (re)opens and trigger the OS camera/file picker.
  useEffect(() => {
    if (open) {
      setStep({ kind: 'idle' })
      // Defer so the hidden input is mounted before we click it.
      const id = setTimeout(() => fileRef.current?.click(), 0)
      return () => clearTimeout(id)
    }
  }, [open])

  const runAnalyze = (file: File) => {
    setStep({ kind: 'analyzing' })
    void analyzeMeal(file)
      .then((items) => {
        if (items.length === 0) {
          setStep({ kind: 'empty' })
          return
        }
        setStep({ kind: 'review', items, index: 0 })
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : 'Could not analyze the photo.'
        setStep({ kind: 'error', message })
      })
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Reset so picking the same file again re-fires change.
    e.target.value = ''
    if (!file) {
      onClose()
      return
    }
    runAnalyze(file)
  }

  const repick = () => fileRef.current?.click()

  // Advance to the next item, or close when past the last.
  const advance = (items: AnalyzedItem[], index: number) => {
    if (index + 1 < items.length) {
      setStep({ kind: 'review', items, index: index + 1 })
    } else {
      onClose()
    }
  }

  const handleMatched = (food: FoodRow) => {
    if (step.kind !== 'match') return
    setStep({
      kind: 'log',
      items: step.items,
      index: step.index,
      target: { name: food.name, food_id: food.id },
    })
  }

  const handleCustomSaved = (food: FoodRow) => {
    if (step.kind !== 'custom') return
    setStep({
      kind: 'log',
      items: step.items,
      index: step.index,
      target: { name: food.name, food_id: food.id },
    })
  }

  const reviewItem =
    step.kind === 'review' ? step.items[step.index] : null
  const customItem = step.kind === 'custom' ? step.items[step.index] : null

  return (
    <>
      {/* Hidden capture input — rear camera on phone, file picker on laptop. */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
        data-testid="photo-input"
      />

      {/* Analyzing spinner. */}
      {open && step.kind === 'analyzing' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          role="status"
          aria-live="polite"
        >
          <p className="rounded-lg bg-background px-4 py-3 text-sm shadow-lg">
            Analyzing photo…
          </p>
        </div>
      )}

      {/* Error → retry / cancel. */}
      <Dialog
        open={open && step.kind === 'error'}
        onClose={onClose}
        variant="sheet"
        title="Couldn’t analyze the photo"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {step.kind === 'error' ? step.message : ''}
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={repick}>
              Try another photo
            </Button>
          </div>
        </div>
      </Dialog>

      {/* No food recognized. */}
      <Dialog
        open={open && step.kind === 'empty'}
        onClose={onClose}
        variant="sheet"
        title="No food recognized"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            We couldn’t identify any food in that photo. Try another photo, or
            search and add it manually.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button type="button" onClick={repick}>
              Try another photo
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Per-item review: match to a DB food OR add as a custom food. */}
      <Dialog
        open={open && step.kind === 'review' && reviewItem != null}
        onClose={onClose}
        variant="sheet"
        title="Review recognized item"
        description={
          step.kind === 'review'
            ? `Item ${step.index + 1} of ${step.items.length}`
            : undefined
        }
      >
        {reviewItem && step.kind === 'review' && (
          <div className="space-y-4">
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
              {PRIVACY_NOTICE}
            </p>

            <div className="rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{reviewItem.name}</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                    CONFIDENCE_STYLE[reviewItem.confidence]
                  }`}
                >
                  {reviewItem.confidence} confidence
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {reviewItem.quantity_desc}
                {reviewItem.estimated_calories != null &&
                  ` · ~${Math.round(reviewItem.estimated_calories)} cal`}
                {reviewItem.estimated_grams != null &&
                  ` · ~${Math.round(reviewItem.estimated_grams)} g`}
              </p>
              {reviewItem.confidence === 'low' && (
                <p className="mt-1 text-[11px] text-amber-800">
                  Low confidence — double-check this identification.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2">
              <Button
                type="button"
                onClick={() =>
                  setStep({
                    kind: 'match',
                    items: step.items,
                    index: step.index,
                  })
                }
              >
                Match to a food
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setStep({
                    kind: 'custom',
                    items: step.items,
                    index: step.index,
                  })
                }
              >
                Add as custom food
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => advance(step.items, step.index)}
              >
                Skip
              </Button>
            </div>

            <Disclaimer />
          </div>
        )}
      </Dialog>

      {/* Match this item to a real DB food (cited FODMAP/NOOM). */}
      <Dialog
        open={open && step.kind === 'match'}
        onClose={() =>
          step.kind === 'match' &&
          setStep({ kind: 'review', items: step.items, index: step.index })
        }
        variant="sheet"
        title="Match to a food"
      >
        {step.kind === 'match' && (
          <div className="space-y-3">
            <FoodMatchPicker
              initialQuery={step.items[step.index]?.name ?? ''}
              onPick={handleMatched}
            />
            <Disclaimer />
          </div>
        )}
      </Dialog>

      {/* Add as a custom food — prefilled, FODMAP defaults to "Not verified". */}
      <ProductReviewForm
        open={open && step.kind === 'custom' && customItem != null}
        onClose={() =>
          step.kind === 'custom' &&
          setStep({ kind: 'review', items: step.items, index: step.index })
        }
        prefill={customItem ? analyzedItemToPrefill(customItem) : null}
        barcode={null}
        onSaved={handleCustomSaved}
      />

      {/* Log the chosen food, then advance to the next item. */}
      <AddToLogDialog
        open={open && step.kind === 'log'}
        onClose={() =>
          step.kind === 'log' && advance(step.items, step.index)
        }
        target={step.kind === 'log' ? step.target : null}
        date={date}
        defaultMeal={mealContext}
      />
    </>
  )
}
