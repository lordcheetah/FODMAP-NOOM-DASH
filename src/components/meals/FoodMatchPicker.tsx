import { useEffect, useMemo, useState } from 'react'
import { Check, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { FoodItemRow, type NutrientChip } from '@/components/diet/FoodItemRow'
import { noomColor } from '@/lib/diet'
import { useFoodSearch } from '@/lib/db/foods'
import type { FoodRow } from '@/lib/db/types'

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
  return chips
}

export interface FoodMatchPickerProps {
  /** Initial query — typically the AI-identified item name. */
  initialQuery?: string
  /** Called with the chosen DB food (carrying its real cited FODMAP/NOOM). */
  onPick: (food: FoodRow) => void
}

/**
 * Reusable debounced food-search list for matching an AI-identified item to a
 * real DB food. Reuses `useFoodSearch` + `FoodItemRow` (NoomDot + FodmapBadge),
 * so a matched food shows its CITED FODMAP/NOOM — never an AI-inferred verdict.
 */
export function FoodMatchPicker({ initialQuery = '', onPick }: FoodMatchPickerProps) {
  const [term, setTerm] = useState(initialQuery)
  const debounced = useDebounced(term, DEBOUNCE_MS)
  const foods = useFoodSearch(debounced)

  const tooShort = debounced.trim().length < MIN_CHARS
  const loading = !tooShort && foods.isLoading
  const results = useMemo(() => foods.data ?? [], [foods.data])

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          inputMode="search"
          placeholder="Search foods (min 2 characters)…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className="pl-9"
          aria-label="Search foods to match"
        />
      </div>

      {tooShort && (
        <p className="text-xs text-muted-foreground">
          Type at least {MIN_CHARS} characters to search.
        </p>
      )}
      {loading && <p className="text-xs text-muted-foreground">Searching…</p>}
      {!tooShort && !loading && results.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No matches. Add it as a custom food instead.
        </p>
      )}

      {results.length > 0 && (
        <ul className="max-h-72 divide-y overflow-y-auto">
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
                chips={foodChips(f)}
                action={
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label={`Choose ${f.name}`}
                    onClick={() => onPick(f)}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
