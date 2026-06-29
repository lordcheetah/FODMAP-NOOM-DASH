import { useEffect, useRef, useState } from 'react'
import type { MealType } from '@/lib/diet'
import {
  analyzeLabel,
  labelToPrefill,
  type LabelNutrition,
} from '@/lib/analyzeLabel'
import type { MappedFood } from '@/lib/openfoodfacts'
import type { FoodRow } from '@/lib/db/types'
import { ProductReviewForm } from './ProductReviewForm'
import { AddToLogDialog, type AddTarget } from './AddToLogDialog'

/**
 * Orchestrates: photograph a Nutrition Facts panel → analyze (Claude vision via
 * Edge Function) → review the EXACT per-serving nutrition in `ProductReviewForm`
 * (NOOM dot computed from calories ÷ grams; FODMAP "Not verified") → save as a
 * custom food → log it. Mirrors `PhotoMealFlow` but is single-item (one label =
 * one food), like a barcode scan.
 *
 * HEALTH-SAFETY: a Nutrition Facts label has no FODMAP (fructose/fructans) data,
 * so the prefilled food stays "Not verified," never "Safe," until the user sets
 * the levels manually. On any error / not-a-label result we fall back to a blank
 * manual-entry form rather than blocking. The photo is sent to Anthropic for
 * analysis and is not stored by the app.
 */
type Step =
  | { kind: 'idle' }
  | { kind: 'analyzing' }
  | { kind: 'review'; prefill: MappedFood | null }
  | { kind: 'log'; target: AddTarget }

export interface LabelScanFlowProps {
  open: boolean
  onClose: () => void
  date: string
  mealContext: MealType
}

export function LabelScanFlow({
  open,
  onClose,
  date,
  mealContext,
}: LabelScanFlowProps) {
  const [step, setStep] = useState<Step>({ kind: 'idle' })
  const fileRef = useRef<HTMLInputElement>(null)

  // Reset when the flow (re)opens and trigger the OS camera/file picker.
  useEffect(() => {
    if (open) {
      setStep({ kind: 'idle' })
      const id = setTimeout(() => fileRef.current?.click(), 0)
      return () => clearTimeout(id)
    }
  }, [open])

  const runAnalyze = (file: File) => {
    setStep({ kind: 'analyzing' })
    void analyzeLabel(file)
      .then((label: LabelNutrition) => {
        setStep({ kind: 'review', prefill: labelToPrefill(label) })
      })
      .catch(() => {
        // Not a readable label / network / refusal → fall back to manual entry
        // (empty form) rather than a dead end.
        setStep({ kind: 'review', prefill: null })
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

  const handleSaved = (food: FoodRow) => {
    setStep({ kind: 'log', target: { name: food.name, food_id: food.id } })
  }

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
        data-testid="label-input"
      />

      {/* Analyzing spinner. */}
      {open && step.kind === 'analyzing' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          role="status"
          aria-live="polite"
        >
          <p className="rounded-lg bg-background px-4 py-3 text-sm shadow-lg">
            Reading label…
          </p>
        </div>
      )}

      {/* Review the label nutrition as a custom food (FODMAP "Not verified"). */}
      <ProductReviewForm
        open={open && step.kind === 'review'}
        onClose={onClose}
        prefill={step.kind === 'review' ? step.prefill : null}
        barcode={null}
        labelNotice
        onSaved={handleSaved}
      />

      {/* Log the saved food. */}
      <AddToLogDialog
        open={open && step.kind === 'log'}
        onClose={onClose}
        target={step.kind === 'log' ? step.target : null}
        date={date}
        defaultMeal={mealContext}
      />
    </>
  )
}
