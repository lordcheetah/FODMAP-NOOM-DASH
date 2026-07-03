import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog } from '@/components/ui/dialog'
import { DASH_GROUPS, type DashGroup } from '@/lib/diet'
import {
  useDailyTargets,
  useUpsertDailyTargets,
  type DailyTargetsInput,
} from '@/lib/db/dailyTargets'

/** DB defaults (mirror 0001_init.sql) used to prefill when no row exists yet. */
const DEFAULTS: Record<
  | 'calorie_budget'
  | 'sodium_budget_mg'
  | 'potassium_goal_mg'
  | 'sat_fat_limit_g'
  | 'fiber_goal_g'
  | 'fiber_per_meal_g',
  string
> = {
  calorie_budget: '',
  sodium_budget_mg: '2300',
  potassium_goal_mg: '4700', // DASH aim; a floor, not a ceiling
  sat_fat_limit_g: '13', // ~6% of 2,000 kcal; a ceiling
  fiber_goal_g: '28',
  fiber_per_meal_g: '8',
}

const DASH_GROUP_LABEL: Record<DashGroup, string> = {
  grains: 'Grains',
  vegetables: 'Vegetables',
  fruits: 'Fruits',
  dairy: 'Dairy',
  'meat-poultry-fish': 'Meat/Poultry/Fish',
  'nuts-seeds-legumes': 'Nuts/Seeds/Legumes',
  'fats-oils': 'Fats/Oils',
  sweets: 'Sweets',
}

function toStr(n: number | null | undefined): string {
  return n == null ? '' : String(n)
}

/** '' -> null; otherwise the parsed number (NaN -> null). */
function toNum(s: string): number | null {
  if (s.trim() === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export interface TargetsFormProps {
  open: boolean
  onClose: () => void
}

/**
 * Edit the user's daily_targets (calorie/sodium/fiber goals + per-group DASH
 * serving goals). Loads via `useDailyTargets`, prefilling DB defaults when no
 * row exists; saves via `useUpsertDailyTargets`. Summaries reflect new targets
 * after the mutation invalidates the query.
 */
export function TargetsForm({ open, onClose }: TargetsFormProps) {
  const { data: targets } = useDailyTargets()
  const upsert = useUpsertDailyTargets()

  const [calorie, setCalorie] = useState(DEFAULTS.calorie_budget)
  const [sodium, setSodium] = useState(DEFAULTS.sodium_budget_mg)
  const [potassium, setPotassium] = useState(DEFAULTS.potassium_goal_mg)
  const [satFat, setSatFat] = useState(DEFAULTS.sat_fat_limit_g)
  const [fiberDaily, setFiberDaily] = useState(DEFAULTS.fiber_goal_g)
  const [fiberMeal, setFiberMeal] = useState(DEFAULTS.fiber_per_meal_g)
  const [dash, setDash] = useState<Record<DashGroup, string>>(() =>
    Object.fromEntries(DASH_GROUPS.map((g) => [g, ''])) as Record<DashGroup, string>,
  )
  // Set after an "Apply" save (keeps the sheet open); cleared on the next edit.
  const [justSaved, setJustSaved] = useState(false)

  // (Re)load form state whenever the sheet opens or the row arrives.
  useEffect(() => {
    if (!open) return
    setCalorie(targets ? toStr(targets.calorie_budget) : DEFAULTS.calorie_budget)
    setSodium(targets ? toStr(targets.sodium_budget_mg) : DEFAULTS.sodium_budget_mg)
    setPotassium(
      targets ? toStr(targets.potassium_goal_mg) : DEFAULTS.potassium_goal_mg,
    )
    setSatFat(targets ? toStr(targets.sat_fat_limit_g) : DEFAULTS.sat_fat_limit_g)
    setFiberDaily(targets ? toStr(targets.fiber_goal_g) : DEFAULTS.fiber_goal_g)
    setFiberMeal(targets ? toStr(targets.fiber_per_meal_g) : DEFAULTS.fiber_per_meal_g)
    setDash(
      Object.fromEntries(
        DASH_GROUPS.map((g) => [g, toStr(targets?.dash_serving_goals?.[g])]),
      ) as Record<DashGroup, string>,
    )
    setJustSaved(false)
    upsert.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, targets])

  const submit = (close: boolean) => {
    const dash_serving_goals: Partial<Record<DashGroup, number>> = {}
    for (const g of DASH_GROUPS) {
      const n = toNum(dash[g])
      if (n != null) dash_serving_goals[g] = n
    }
    const input: DailyTargetsInput = {
      calorie_budget: toNum(calorie),
      sodium_budget_mg: toNum(sodium),
      potassium_goal_mg: toNum(potassium),
      sat_fat_limit_g: toNum(satFat),
      fiber_goal_g: toNum(fiberDaily),
      fiber_per_meal_g: toNum(fiberMeal),
      dash_serving_goals,
    }
    upsert.mutate(input, {
      onSuccess: () => {
        if (close) onClose()
        else setJustSaved(true)
      },
    })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      variant="sheet"
      title="Daily targets"
      description="Set calorie, sodium, potassium, saturated-fat, and fiber goals plus DASH serving goals."
    >
      <div className="space-y-4" onInput={() => justSaved && setJustSaved(false)}>
        <div className="grid grid-cols-2 gap-3">
          <Field id="calorie" label="Calorie budget" value={calorie} onChange={setCalorie} />
          <Field id="sodium" label="Sodium budget (mg)" value={sodium} onChange={setSodium} />
          <Field id="potassium" label="Potassium goal (mg/day)" value={potassium} onChange={setPotassium} />
          <Field id="satFat" label="Sat fat limit (g/day)" value={satFat} onChange={setSatFat} />
          <Field id="fiberDaily" label="Fiber goal (g/day)" value={fiberDaily} onChange={setFiberDaily} />
          <Field id="fiberMeal" label="Fiber per meal (g)" value={fiberMeal} onChange={setFiberMeal} />
        </div>

        <div>
          <p className="text-sm font-medium">DASH serving goals</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {DASH_GROUPS.map((g) => (
              <Field
                key={g}
                id={`dash-${g}`}
                label={DASH_GROUP_LABEL[g]}
                value={dash[g]}
                onChange={(v) => setDash((prev) => ({ ...prev, [g]: v }))}
              />
            ))}
          </div>
        </div>

        {upsert.isError && (
          <p className="text-xs text-destructive">
            Could not save. {(upsert.error as Error)?.message}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          {justSaved && !upsert.isPending && (
            <span className="mr-auto text-xs font-medium text-noom-green">✓ Saved</span>
          )}
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => submit(false)}
            disabled={upsert.isPending}
          >
            {upsert.isPending ? 'Saving…' : 'Apply'}
          </Button>
          <Button type="button" onClick={() => submit(true)} disabled={upsert.isPending}>
            {upsert.isPending ? 'Saving…' : 'Save & close'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1"
      />
    </div>
  )
}
