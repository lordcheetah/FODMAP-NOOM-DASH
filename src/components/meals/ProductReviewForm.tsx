import { useEffect, useMemo, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NoomDot } from '@/components/diet/NoomDot'
import { FodmapBadge } from '@/components/diet/FodmapBadge'
import {
  noomColor,
  FODMAP_REFERENCE,
  type DashGroup,
  type FodmapLevel,
  type NoomCategory,
} from '@/lib/diet'
import {
  useCreateFood,
  useUpdateFood,
  type CreateFoodInput,
} from '@/lib/db/foods'
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
  /** Show the "AI read these numbers from a photo" notice (label-scan flow). */
  labelNotice?: boolean
  /**
   * Edit mode: an existing user-owned food to update in place. When set, all
   * fields (including DASH group and the food's OWN FODMAP levels) prefill from
   * it, and Save writes via `useUpdateFood` instead of creating a new row.
   */
  editFood?: FoodRow | null
  /** Called with the created/updated food row so the caller can react. */
  onSaved: (food: FoodRow) => void
}

const FODMAP_OPTIONS: FodmapLevel[] = ['unknown', 'low', 'moderate', 'high']

/** DASH group choices; '' = unclassified (contributes to no serving bucket). */
const DASH_GROUP_OPTIONS: { value: DashGroup; label: string }[] = [
  { value: 'grains', label: 'Grains' },
  { value: 'vegetables', label: 'Vegetables' },
  { value: 'fruits', label: 'Fruits' },
  { value: 'dairy', label: 'Dairy' },
  { value: 'meat-poultry-fish', label: 'Meat/Poultry/Fish' },
  { value: 'nuts-seeds-legumes', label: 'Nuts/Seeds/Legumes' },
  { value: 'fats-oils', label: 'Fats/Oils' },
  { value: 'sweets', label: 'Sweets' },
]

/** NOOM semantic category; NOOM *color* stays computed from cal/g, not this. */
const NOOM_CATEGORY_OPTIONS: { value: NoomCategory; label: string }[] = [
  { value: 'protein', label: 'Protein' },
  { value: 'whole-grain', label: 'Whole grain' },
  { value: 'non-starchy-veg', label: 'Non-starchy veg' },
  { value: 'starchy-veg', label: 'Starchy veg' },
  { value: 'fruit', label: 'Fruit' },
  { value: 'fat', label: 'Fat' },
  { value: 'freebie', label: 'Freebie' },
]

/** Controlled numeric text → number|null (empty/invalid = null, never 0). */
function toNum(v: string): number | null {
  const t = v.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** One titled row of comma-separated reference foods. */
function RefList({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <p>
      <span className="font-medium">{title}:</span>{' '}
      <span className="text-muted-foreground">{items.join(', ')}</span>
    </p>
  )
}

export function ProductReviewForm({
  open,
  onClose,
  prefill,
  barcode,
  triggerHints,
  notFound,
  labelNotice,
  editFood,
  onSaved,
}: ProductReviewFormProps) {
  const createFood = useCreateFood()
  const updateFood = useUpdateFood()
  const isEdit = editFood != null

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
  const [dashGroup, setDashGroup] = useState<DashGroup | ''>('')
  const [dashServings, setDashServings] = useState('')
  const [noomCategory, setNoomCategory] = useState<NoomCategory | ''>('')
  // Set after an "Apply" save (keeps the sheet open); cleared on the next edit.
  const [justSaved, setJustSaved] = useState(false)
  const [showRef, setShowRef] = useState(false)
  // The grams the current nutrient numbers correspond to; lets a serving-size
  // change rescale them (a scan defaults to per-100 g).
  const [gramsBasis, setGramsBasis] = useState<number | null>(null)

  // (Re)load the form whenever it opens — from the edited food in edit mode, or
  // from the scan/manual prefill otherwise.
  useEffect(() => {
    if (!open) return
    const numStr = (n: number | null | undefined) =>
      n == null ? '' : String(n)
    if (editFood) {
      setName(editFood.name)
      setBrand(editFood.brand ?? '')
      setServingDesc(editFood.serving_desc)
      setServingGrams(numStr(editFood.serving_grams))
      setGramsBasis(editFood.serving_grams)
      setCalories(numStr(editFood.calories))
      setFiber(numStr(editFood.fiber_g))
      setSodium(numStr(editFood.sodium_mg))
      setSatFat(numStr(editFood.sat_fat_g))
      setPotassium(numStr(editFood.potassium_mg))
      setAddedSugar(numStr(editFood.added_sugar_g))
      // The user owns this food and set these levels — preserve, don't reset.
      setFructose(editFood.fructose_level)
      setFructans(editFood.fructans_level)
      setDashGroup(editFood.dash_group ?? '')
      setDashServings(editFood.dash_servings != null ? String(editFood.dash_servings) : '')
      setNoomCategory(editFood.noom_category ?? '')
    } else {
      setName(prefill?.name ?? '')
      setBrand(prefill?.brand ?? '')
      setServingDesc(prefill?.serving_desc ?? '')
      setServingGrams(numStr(prefill?.serving_grams))
      setGramsBasis(prefill?.serving_grams ?? null)
      setCalories(numStr(prefill?.calories))
      setFiber(numStr(prefill?.fiber_g))
      setSodium(numStr(prefill?.sodium_mg))
      setSatFat(numStr(prefill?.sat_fat_g))
      setPotassium(numStr(prefill?.potassium_mg))
      setAddedSugar(numStr(prefill?.added_sugar_g))
      // FODMAP is ALWAYS reset to unknown — prefill cannot carry a known level.
      setFructose('unknown')
      setFructans('unknown')
      setDashGroup('')
      setDashServings('')
      setNoomCategory('')
    }
    setJustSaved(false)
    createFood.reset()
    updateFood.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill, editFood])

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

  /**
   * When the serving grams is committed, scale the per-serving nutrient numbers
   * from the previous grams (e.g. a scan's 100 g) to the new amount, so entering
   * a real serving size rescales everything. Custom serving descriptions are left
   * alone; a "<n> g" one is kept in sync.
   */
  const rescaleToGrams = (newStr: string) => {
    const newG = toNum(newStr)
    if (newG == null || newG <= 0) return
    const basis = gramsBasis
    if (basis == null || basis <= 0) {
      setGramsBasis(newG) // establish a basis so later changes scale
      return
    }
    if (newG === basis) return
    const ratio = newG / basis
    const scale = (s: string): string => {
      const n = toNum(s)
      return n == null ? s : String(Number((n * ratio).toFixed(2)))
    }
    setCalories(scale)
    setFiber(scale)
    setSodium(scale)
    setSatFat(scale)
    setPotassium(scale)
    setAddedSugar(scale)
    setServingDesc((d) => {
      const t = d.trim().toLowerCase()
      return t === `${basis} g` || t === `${basis}g` ? `${newG} g` : d
    })
    setGramsBasis(newG)
  }

  const submit = (close: boolean) => {
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
      dash_group: dashGroup || null,
      dash_servings: dashGroup ? toNum(dashServings) : null,
      noom_category: noomCategory || null,
      // Note user-provided FODMAP in source when the user set a level.
      source: userSetFodmap
        ? [prefill?.source, 'FODMAP set by user'].filter(Boolean).join('; ')
        : (prefill?.source ?? null),
      barcode,
    }
    if (editFood) {
      // Editing keeps the food's existing barcode/source; the user is the
      // authority for their own row so FODMAP levels flow through as chosen.
      updateFood.mutate(
        { ...input, id: editFood.id, source: editFood.source, barcode: editFood.barcode },
        {
          onSuccess: (row) => {
            if (close) onSaved(row)
            else setJustSaved(true)
          },
        },
      )
    } else {
      // Create always closes into the add-to-log flow (Apply isn't offered).
      createFood.mutate(input, { onSuccess: (row) => onSaved(row) })
    }
  }

  const busy = createFood.isPending || updateFood.isPending
  const saveError = (createFood.error ?? updateFood.error) as Error | null
  const hasError = createFood.isError || updateFood.isError

  return (
    <Dialog
      open={open}
      onClose={onClose}
      variant="sheet"
      title={isEdit ? 'Edit food' : notFound ? 'Add product manually' : 'Review product'}
      description={barcode ? `Barcode ${barcode}` : undefined}
    >
      <div className="space-y-4" onInput={() => justSaved && setJustSaved(false)}>
        {notFound && (
          <p className="rounded-lg border bg-muted p-3 text-sm text-muted-foreground">
            {barcode
              ? 'Product not in Open Food Facts — enter it manually. The barcode is saved so re-scanning finds it next time.'
              : 'Enter the food’s details below. It’s saved to your foods so you can log it anytime.'}
          </p>
        )}

        {labelNotice && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
            AI read these numbers from a photo of the Nutrition Facts panel —
            double-check them before saving. The photo is sent to Anthropic for
            analysis and not stored.
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
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
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

          {/* Non-authoritative memory aid for hand-labeling. Collapsed by default. */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowRef((s) => !s)}
              className="text-xs font-medium underline underline-offset-2"
            >
              {showRef ? 'Hide' : 'Show'} common trigger foods (reminder)
            </button>
            {showRef && (
              <div className="mt-2 space-y-2 rounded-md border border-amber-200 bg-amber-100/40 p-2 text-[11px] dark:border-amber-800 dark:bg-amber-950/30">
                <p>
                  A general memory aid, not a verdict about this food — portion size
                  matters, and yours may differ. Fructose is often on the label;
                  fructans rarely are.
                </p>
                <RefList title="Often high fructose" items={FODMAP_REFERENCE.highFructose} />
                <RefList title="Often high fructans" items={FODMAP_REFERENCE.highFructans} />
                <RefList title="Usually low (both)" items={FODMAP_REFERENCE.usuallyLow} />

                <p className="pt-1 font-medium">On the ingredient label:</p>
                <RefList title="Fructose names" items={FODMAP_REFERENCE.fructoseLabelNames} />
                <RefList title="Fructans names" items={FODMAP_REFERENCE.fructansLabelNames} />
                <p>
                  <span className="font-medium">Polyols (sorbitol &amp; other “-ol” sugars):</span>{' '}
                  <span className="text-muted-foreground">
                    {FODMAP_REFERENCE.polyolLabelNames.join(', ')}
                  </span>{' '}
                  — a <span className="font-medium">separate</span> FODMAP group, not your
                  fructose/fructans trigger. Shown for label-reading only; leave the levels
                  above unchanged for these.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* DASH group + NOOM category — manual classification. DASH group is what
            makes a food count toward its daily serving target; leave blank to keep
            it unclassified (sodium/potassium still count). */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="pf-dash">DASH group</Label>
            <select
              id="pf-dash"
              value={dashGroup}
              onChange={(e) => setDashGroup(e.target.value as DashGroup | '')}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">— unclassified —</option>
              {DASH_GROUP_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="pf-noom">NOOM category</Label>
            <select
              id="pf-noom"
              value={noomCategory}
              onChange={(e) => setNoomCategory(e.target.value as NoomCategory | '')}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">— none —</option>
              {NOOM_CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Portion size: a large serving can be worth 2+ DASH servings. Only
            relevant once a DASH group is set. */}
        {dashGroup && (
          <div>
            <Label htmlFor="pf-dash-servings">DASH servings per serving</Label>
            <Input
              id="pf-dash-servings"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.5"
              value={dashServings}
              onChange={(e) => setDashServings(e.target.value)}
              placeholder="1 (standard)"
              className="mt-1"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              How many DASH {DASH_GROUP_OPTIONS.find((o) => o.value === dashGroup)?.label ?? ''}{' '}
              servings one serving of this food counts as — e.g. a big bowl of cereal
              ≈ 2, a large salad ≈ 2–3. Leave blank for a standard 1.
            </p>
          </div>
        )}

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
                onBlur={(e) => rescaleToGrams(e.target.value)}
                className="mt-1"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Change this to your serving and the nutrition rescales to match.
              </p>
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

        {hasError && (
          <p className="text-xs text-destructive">
            Could not save. {saveError?.message}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          {justSaved && !busy && (
            <span className="mr-auto text-xs font-medium text-noom-green">✓ Saved</span>
          )}
          <Button type="button" variant="ghost" onClick={onClose}>
            {isEdit ? 'Close' : 'Cancel'}
          </Button>
          {isEdit && (
            <Button
              type="button"
              variant="outline"
              onClick={() => submit(false)}
              disabled={!valid || busy}
            >
              {busy ? 'Saving…' : 'Apply'}
            </Button>
          )}
          <Button type="button" onClick={() => submit(true)} disabled={!valid || busy}>
            {busy ? 'Saving…' : isEdit ? 'Save & close' : 'Save & log'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
