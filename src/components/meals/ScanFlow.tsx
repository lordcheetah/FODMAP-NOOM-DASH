import { useEffect, useState } from 'react'
import type { MealType } from '@/lib/diet'
import { scanIngredientsForTriggers } from '@/lib/diet'
import {
  fetchProductByBarcode,
  mapOpenFoodFactsToFood,
  type MappedFood,
  type OffProduct,
} from '@/lib/openfoodfacts'
import { useFoodByBarcode } from '@/lib/db/foods'
import type { FoodRow } from '@/lib/db/types'
import { BarcodeScanner } from './BarcodeScanner'
import { ProductReviewForm } from './ProductReviewForm'
import { AddToLogDialog, type AddTarget } from './AddToLogDialog'

/**
 * Orchestrates: scan → reuse existing food OR fetch OFF → review/create → log.
 * Keeps `FoodSearch` thin; mirrors its `AddTarget` + `AddToLogDialog` reuse.
 *
 * Resolution order after a decode:
 *   1. `useFoodByBarcode` — if the user already saved this barcode, skip straight
 *      to the add dialog (dedup; never re-create).
 *   2. else `fetchProductByBarcode`:
 *        'found'     → ProductReviewForm prefilled from the pure mapper.
 *        'not-found' → ProductReviewForm empty (manual entry), barcode preserved.
 *        'error'     → treated as manual entry too (offline fallback), barcode kept.
 */
type Step =
  | { kind: 'scanning' }
  | { kind: 'looking-up'; barcode: string }
  | {
      kind: 'review'
      barcode: string | null
      prefill: MappedFood | null
      triggerHints: string[]
      notFound: boolean
    }
  | { kind: 'log'; target: AddTarget }

export interface ScanFlowProps {
  open: boolean
  onClose: () => void
  date: string
  mealContext: MealType
}

export function ScanFlow({ open, onClose, date, mealContext }: ScanFlowProps) {
  const [step, setStep] = useState<Step>({ kind: 'scanning' })
  const [fetching, setFetching] = useState(false)

  // Reset to the scanner whenever the flow (re)opens.
  useEffect(() => {
    if (open) setStep({ kind: 'scanning' })
  }, [open])

  const lookupBarcode =
    step.kind === 'looking-up' ? step.barcode : null
  const existing = useFoodByBarcode(lookupBarcode)

  // When the existing-food lookup resolves, branch to reuse or OFF fetch.
  useEffect(() => {
    if (step.kind !== 'looking-up') return
    if (existing.isLoading) return

    const found = existing.data
    if (found) {
      setStep({ kind: 'log', target: { name: found.name, food_id: found.id } })
      return
    }
    // Not saved yet → fetch OFF (once). Guard against the flow closing mid-fetch
    // so we don't setState on a hidden/unmounted flow.
    const barcode = step.barcode
    let ignore = false
    setFetching(true)
    void fetchProductByBarcode(barcode)
      .then((res) => {
        if (ignore) return
        const product: OffProduct | null =
          res.status === 'found' ? res.product : null
        const prefill = product
          ? mapOpenFoodFactsToFood(product, barcode)
          : null
        const triggerHints = product
          ? scanIngredientsForTriggers(product.ingredients_text)
          : []
        setStep({
          kind: 'review',
          barcode,
          prefill,
          triggerHints,
          // 'not-found' and 'error' (offline) both fall back to manual entry.
          notFound: res.status !== 'found',
        })
      })
      .finally(() => {
        if (!ignore) setFetching(false)
      })
    return () => {
      ignore = true
    }
  }, [step, existing.isLoading, existing.data])

  const handleDetected = (barcode: string) => {
    setStep({ kind: 'looking-up', barcode })
  }

  const handleManual = () => {
    setStep({
      kind: 'review',
      barcode: null, // manual entry: no barcode required
      prefill: null,
      triggerHints: [],
      notFound: false,
    })
  }

  const handleSaved = (food: FoodRow) => {
    setStep({ kind: 'log', target: { name: food.name, food_id: food.id } })
  }

  return (
    <>
      <BarcodeScanner
        open={open && step.kind === 'scanning'}
        onClose={onClose}
        onDetected={handleDetected}
        onManual={handleManual}
      />

      {/* Brief lookup/fetch indicator between scan and review. */}
      {open && (step.kind === 'looking-up' || fetching) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          role="status"
          aria-live="polite"
        >
          <p className="rounded-lg bg-background px-4 py-3 text-sm shadow-lg">
            Looking up product…
          </p>
        </div>
      )}

      <ProductReviewForm
        open={open && step.kind === 'review'}
        onClose={onClose}
        prefill={step.kind === 'review' ? step.prefill : null}
        barcode={step.kind === 'review' ? step.barcode : null}
        triggerHints={step.kind === 'review' ? step.triggerHints : undefined}
        notFound={step.kind === 'review' ? step.notFound : undefined}
        onSaved={handleSaved}
      />

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
