import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Pencil, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog } from '@/components/ui/dialog'
import { scanIngredientsForTriggers, type MealType } from '@/lib/diet'
import {
  searchProductsByName,
  mapOpenFoodFactsToFood,
  type MappedFood,
  type OffProduct,
} from '@/lib/openfoodfacts'
import type { FoodRow } from '@/lib/db/types'
import { ProductReviewForm } from './ProductReviewForm'
import { AddToLogDialog, type AddTarget } from './AddToLogDialog'

type Step =
  | { kind: 'search' }
  | {
      kind: 'review'
      prefill: MappedFood | null
      barcode: string | null
      triggerHints: string[]
      notFound: boolean
    }
  | { kind: 'log'; target: AddTarget }

export interface AddFoodFlowProps {
  open: boolean
  onClose: () => void
  date: string
  mealContext: MealType
}

function useDebounced(value: string, ms: number): string {
  const [d, setD] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setD(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return d
}

/**
 * Add a new food WITHOUT scanning: look it up by name in Open Food Facts (prefills
 * the review form, FODMAP still 'unknown'), or enter it all manually. Mirrors the
 * scan flow's review → log handoff.
 */
export function AddFoodFlow({ open, onClose, date, mealContext }: AddFoodFlowProps) {
  const [step, setStep] = useState<Step>({ kind: 'search' })
  const [term, setTerm] = useState('')
  const debounced = useDebounced(term.trim(), 400)

  // Reset to the search view each time the flow opens.
  useEffect(() => {
    if (open) {
      setStep({ kind: 'search' })
      setTerm('')
    }
  }, [open])

  const search = useQuery({
    queryKey: ['offSearch', debounced],
    enabled: open && step.kind === 'search' && debounced.length >= 2,
    meta: { persist: false },
    queryFn: () => searchProductsByName(debounced),
  })
  const results = search.data

  const pick = (product: OffProduct) => {
    const code = product.code ?? ''
    setStep({
      kind: 'review',
      prefill: mapOpenFoodFactsToFood(product, code),
      barcode: product.code || null,
      triggerHints: scanIngredientsForTriggers(product.ingredients_text),
      notFound: false,
    })
  }

  const enterManually = () =>
    setStep({ kind: 'review', prefill: null, barcode: null, triggerHints: [], notFound: true })

  const handleSaved = (food: FoodRow) =>
    setStep({ kind: 'log', target: { name: food.name, food_id: food.id } })

  return (
    <>
      <Dialog
        open={open && step.kind === 'search'}
        onClose={onClose}
        variant="sheet"
        title="Add a food"
        description="Look it up by name, or enter it manually."
      >
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              inputMode="search"
              autoFocus
              placeholder="Search a food database (min 2 characters)…"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="h-11 pl-9 text-base"
              aria-label="Search Open Food Facts by name"
            />
          </div>

          {debounced.length >= 2 && search.isLoading && (
            <p className="text-xs text-muted-foreground">Searching…</p>
          )}
          {results?.status === 'error' && (
            <p className="text-xs text-muted-foreground">
              Couldn’t reach the food database. Enter it manually below.
            </p>
          )}
          {results?.status === 'empty' && debounced.length >= 2 && !search.isLoading && (
            <p className="text-xs text-muted-foreground">
              No matches — try a different name, or enter it manually.
            </p>
          )}

          {results?.status === 'found' && (
            <ul className="max-h-72 divide-y overflow-y-auto">
              {results.products.map((p, i) => {
                const name = p.product_name?.trim() || p.generic_name?.trim() || 'Unknown'
                const brand = p.brands?.split(',')[0]?.trim()
                return (
                  <li key={`${p.code ?? 'x'}-${i}`}>
                    <button
                      type="button"
                      onClick={() => pick(p)}
                      className="flex w-full flex-col items-start gap-0.5 py-2 text-left hover:bg-accent/50"
                    >
                      <span className="text-sm font-medium">{name}</span>
                      {brand && <span className="text-xs text-muted-foreground">{brand}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          <p className="text-[11px] text-muted-foreground">
            Look-ups fill in nutrition only — you still set FODMAP (fructose/fructans)
            yourself; it’s never guessed. Data from Open Food Facts.
          </p>

          <div className="flex justify-end border-t pt-3">
            <Button type="button" variant="outline" onClick={enterManually}>
              <Pencil className="h-4 w-4" />
              Enter manually
            </Button>
          </div>
        </div>
      </Dialog>

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
