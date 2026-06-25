import { useEffect, useMemo, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NoomDot } from '@/components/diet/NoomDot'
import { FodmapBadge } from '@/components/diet/FodmapBadge'
import { noomColor, type FodmapLevel } from '@/lib/diet'
import { useCreateFood, type CreateFoodInput } from '@/lib/db/foods'
import type { MappedFood } from '@/lib/openfoodfacts'
import type { FoodRow } from '@/lib/db/types'

/**
 * Review / create a scanned (or manually entered) product as a user-custom food.
 *
 * HEALTH-SAFETY: FODMAP defaults to 'unknown' on both axes and the badge reads
 * "Not verified" — NEVER "Safe" — until the user EXPLICITLY sets BOTH axes to a
 * known level via the optional selectors. OFF data can never set these. The NOOM
 * dot is COMPUTED from the edited calories + serving grams (null grams → unknown
 * dot), never read from OFF. A possible-trigger hint (ingredient keywords) is
 * non-authoritative and is shown for awareness only.
 */
export interface ProductReviewFormProps {
  open: boolean
  onClose: () => void
  /** Mapper output to prefill from; null = empty manual-entry form. */
  prefill: MappedFood | null
  /** Barcode to tag the saved food with (preserved even on manual entry). */
  barcode: string | null
  /** Non-authoritative ingredient trigger labels to surface (optional). */
  triggerHints?: string[]
  /** Optional banner when OFF had no product. */
  notFound?: boolean
  /** Called with the created food row so the caller can open the add-to-log dialog. */
  onSaved: (food: FoodRow) => void
}

const FODMAP_OPTIONS: FodmapLevel[] = ['unknown', 'low', 'moderate', 'high']

/** Controlled numeric text → number|null (empty/invalid = null, never 0). */
function toNum(v: string): number | null {
  const t = v.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function ProductReviewForm({
  open,
  onClose,
  prefill,
  barcode,
  triggerHints,
  notFound,
  onSaved,
}: ProductReviewFormProps) {
  const createFood = useCreateFood()

  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [servingDesc, setServingDesc] = useState('')
  const [servingGrams, setServingGrams] = useState('')
  const [calories, setCalories] = useState('')
  const [fiber, setFiber] = useState('')
  const [sodium, setSodium] = useState('')
  const [satFat, setSatFat] = useState('')
  const [potassium, setPotassium] = useState('')
  const [addedSugar, setAddedSugar] = useState('')
  // Default 'unknown' on BOTH axes — the only safe default.
  const [fructose, setFructose] = useState<FodmapLevel>('unknown')
  const [fructans, setFructans] = useState<FodmapLevel>('unknown')

  // (Re)load the form whenever it opens for a new prefill.
  useEffect(() => {
    if (!open) return
    const numStr = (n: number | null | undefined) =>
      n == null ? '' : String(n)
    setName(prefill?.name ?? '')
    setBrand(prefill?.brand ?? '')
    setServingDesc(prefill?.serving_desc ?? '')
    setServingGrams(numStr(prefill?.serving_grams))
    setCalories(numStr(prefill?.calories))
    setFiber(numStr(prefill?.fiber_g))
    setSodium(numStr(prefill?.sodium_mg))
    setSatFat(numStr(prefill?.sat_fat_g))
    setPotassium(numStr(prefill?.potassium_mg))
    setAddedSugar(numStr(prefill?.added_sugar_g))
    // FODMAP is ALWAYS reset to unknown — prefill cannot carry a known level.
    setFructose('unknown')
    setFructans('unknown')
    createFood.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill])

  const caloriesNum = toNum(calories)
  const gramsNum = toNum(servingGrams)
  const liveNoom = useMemo(
    () =>
      caloriesNum != null && gramsNum != null
        ? noomColor(caloriesNum, gramsNum)
        : null,
    [caloriesNum, gramsNum],
  )

  const nameOk = name.trim().length > 0
  const servingOk = servingDesc.trim().length > 0
  const valid = nameOk && servingOk

  const userSetFodmap = fructose !== 'unknown' || fructans !== 'unknown'

  const handleSave = () => {
    if (!valid) return
    const input: CreateFoodInput = {
      name: name.trim(),
      brand: brand.trim() || null,
      serving_desc: servingDesc.trim(),
      serving_grams: gramsNum,
      calories: caloriesNum,
      sodium_mg: toNum(sodium),
      sat_fat_g: toNum(satFat),
      potassium_mg: toNum(potassium),
      fiber_g: toNum(fiber),
      added_sugar_g: toNum(addedSugar),
      fructose_level: fructose,
      fructans_level: fructans,
      // Note user-provided FODMAP in source when the user set a level.
      source: userSetFodmap
        ? [prefill?.source, 'FODMAP set by user'].filter(Boolean).join('; ')
        : (prefill?.source ?? null),
      barcode,
    }
    createFood.mutate(input, { onSuccess: (row) => onSaved(row) })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      variant="sheet"
      title={notFound ? 'Add product manually' : 'Review product'}
      description={barcode ? `Barcode ${barcode}` : undefined}
    >
      <div className="space-y-4">
        {notFound && (
          <p className="rounded-lg border bg-muted p-3 text-sm text-muted-foreground">
            Product not in Open Food Facts — enter it manually. The barcode is
            saved so re-scanning finds it next time.
          </p>
        )}

        {/* NOOM dot is COMPUTED live from calories + grams. */}
        <div className="flex items-center gap-2 rounded-lg border bg-card p-3">
          <NoomDot color={liveNoom} />
          <span className="text-xs text-muted-foreground">
            NOOM color is computed from calories ÷ serving grams
            {gramsNum == null && ' (set serving grams to compute it)'}
          </span>
        </div>

        {/* FODMAP not-verified notice + optional manual selectors. */}
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
          <p className="text-sm font-medium">FODMAP not verified</p>
          <p className="text-xs">
            Open Food Facts has no fructose/fructans data. This product stays
            unverified — set the levels manually only if you know them.
          </p>
          {triggerHints && triggerHints.length > 0 && (
            <p className="text-xs">
              Possible trigger{triggerHints.length > 1 ? 's' : ''} in ingredients:{' '}
              <span className="font-medium">{triggerHints.join(', ')}</span>. This
              is a non-authoritative hint, not a verified level.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <Label htmlFor="fructose">Fructose</Label>
              <select
                id="fructose"
                value={fructose}
                onChange={(e) => setFructose(e.target.value as FodmapLevel)}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {FODMAP_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="fructans">Fructans</Label>
              <select
                id="fructans"
                value={fructans}
                onChange={(e) => setFructans(e.target.value as FodmapLevel)}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {FODMAP_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="pt-1">
            <FodmapBadge fructose={fructose} fructans={fructans} />
          </div>
        </div>

        {/* Editable fields. */}
        <div className="grid grid-cols-1 gap-3">
          <div>
            <Label htmlFor="pf-name">Name</Label>
            <Input
              id="pf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
            />
            {!nameOk && (
              <p className="mt-1 text-xs text-destructive">Name is required.</p>
            )}
          </div>
          <div>
            <Label htmlFor="pf-brand">Brand</Label>
            <Input
              id="pf-brand"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="pf-serving">Serving</Label>
              <Input
                id="pf-serving"
                value={servingDesc}
                onChange={(e) => setServingDesc(e.target.value)}
                className="mt-1"
              />
              {!servingOk && (
                <p className="mt-1 text-xs text-destructive">Required.</p>
              )}
            </div>
            <div>
              <Label htmlFor="pf-grams">Serving grams</Label>
              <Input
                id="pf-grams"
                type="number"
                inputMode="decimal"
                value={servingGrams}
                onChange={(e) => setServingGrams(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="pf-cal">Calories</Label>
              <Input
                id="pf-cal"
                type="number"
                inputMode="decimal"
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="pf-fiber">Fiber (g)</Label>
              <Input
                id="pf-fiber"
                type="number"
                inputMode="decimal"
                value={fiber}
                onChange={(e) => setFiber(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="pf-sodium">Sodium (mg)</Label>
              <Input
                id="pf-sodium"
                type="number"
                inputMode="decimal"
                value={sodium}
                onChange={(e) => setSodium(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="pf-satfat">Sat fat (g)</Label>
              <Input
                id="pf-satfat"
                type="number"
                inputMode="decimal"
                value={satFat}
                onChange={(e) => setSatFat(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="pf-potassium">Potassium (mg)</Label>
              <Input
                id="pf-potassium"
                type="number"
                inputMode="decimal"
                value={potassium}
                onChange={(e) => setPotassium(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="pf-sugar">Added sugar (g)</Label>
              <Input
                id="pf-sugar"
                type="number"
                inputMode="decimal"
                value={addedSugar}
                onChange={(e) => setAddedSugar(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
        </div>

        {createFood.isError && (
          <p className="text-xs text-destructive">
            Could not save. {(createFood.error as Error)?.message}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!valid || createFood.isPending}
          >
            {createFood.isPending ? 'Saving…' : 'Save & log'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
