import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import {
  useBodyProfile,
  useUpsertBodyProfile,
  useWeightLog,
  useAddWeight,
  useDeleteWeight,
} from '@/lib/db/bodyMetrics'
import {
  bmi,
  bmiCategory,
  BMI_CATEGORY_LABEL,
  lbToKg,
  kgToLb,
  ftInToCm,
  cmToFtIn,
  type BmiCategory,
} from '@/lib/health/bmi'
import { sparklinePolyline } from '@/lib/health/sparkline'

const CATEGORY_CLASS: Record<BmiCategory, string> = {
  underweight: 'bg-amber-100 text-amber-900',
  normal: 'bg-noom-green/15 text-noom-green',
  overweight: 'bg-noom-yellow/20 text-yellow-700',
  obese: 'bg-destructive/10 text-destructive',
}

function fmt(n: number, digits = 1): string {
  return Number(n.toFixed(digits)).toString()
}
function todayISO(): string {
  const d = new Date()
  const tz = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - tz).toISOString().slice(0, 10)
}

/**
 * Weight tracking + BMI. Stores canonical metric (kg, cm); displays in the user's
 * chosen units (lb/kg, ft-in/cm). BMI + category come from the latest weight and
 * the profile height. Full history with delete. Not medical advice.
 */
export function WeightTracker() {
  const { user } = useAuth()
  const signedIn = !!user
  const profile = useBodyProfile()
  const upsertProfile = useUpsertBodyProfile()
  const weights = useWeightLog()
  const addWeight = useAddWeight()
  const delWeight = useDeleteWeight()

  const p = profile.data
  const weightUnit = p?.weight_unit === 'kg' ? 'kg' : 'lb'
  const heightUnit = p?.height_unit === 'cm' ? 'cm' : 'ftin'
  const heightCm = p?.height_cm ?? null

  const entries = weights.data ?? []
  const latestKg = entries[0]?.weight_kg ?? null
  const b = bmi(latestKg, heightCm)
  const cat = bmiCategory(b)

  // ── Weight entry state ────────────────────────────────────────────────────
  const [weightInput, setWeightInput] = useState('')
  const [dateInput, setDateInput] = useState(todayISO)

  const logWeight = () => {
    const v = Number(weightInput)
    if (!Number.isFinite(v) || v <= 0) return
    const kg = weightUnit === 'lb' ? lbToKg(v) : v
    addWeight.mutate(
      { weight_kg: Number(kg.toFixed(2)), recorded_on: dateInput || todayISO() },
      { onSuccess: () => setWeightInput('') },
    )
  }

  // ── Profile (height / sex / units) editing ────────────────────────────────
  const [showSettings, setShowSettings] = useState(false)
  const [ft, setFt] = useState('')
  const [inch, setInch] = useState('')
  const [cm, setCm] = useState('')
  const [sex, setSex] = useState('')

  // Seed the settings fields when the profile loads / settings opens.
  useEffect(() => {
    if (!showSettings) return
    setSex(p?.sex ?? '')
    if (heightCm != null) {
      const { ft: f, inch: i } = cmToFtIn(heightCm)
      setFt(String(f))
      setInch(String(i))
      setCm(fmt(heightCm))
    } else {
      setFt('')
      setInch('')
      setCm('')
    }
  }, [showSettings, p, heightCm])

  const saveProfile = () => {
    let height_cm: number | null = heightCm
    if (heightUnit === 'ftin') {
      const f = Number(ft)
      const i = Number(inch)
      if (Number.isFinite(f) || Number.isFinite(i)) {
        height_cm = ftInToCm(
          Number.isFinite(f) ? f : 0,
          Number.isFinite(i) ? i : 0,
        )
      }
    } else {
      const c = Number(cm)
      if (Number.isFinite(c) && c > 0) height_cm = c
    }
    upsertProfile.mutate(
      { height_cm: height_cm != null ? Number(height_cm.toFixed(2)) : null, sex: sex || null },
      { onSuccess: () => setShowSettings(false) },
    )
  }

  const setUnit = (patch: { weight_unit?: string; height_unit?: string }) => {
    upsertProfile.mutate(patch)
  }

  const displayWeight = (kg: number): string =>
    weightUnit === 'lb' ? `${fmt(kgToLb(kg))} lb` : `${fmt(kg)} kg`

  const displayHeight = (): string => {
    if (heightCm == null) return 'not set'
    if (heightUnit === 'cm') return `${fmt(heightCm)} cm`
    const { ft: f, inch: i } = cmToFtIn(heightCm)
    return `${f}′ ${fmt(i)}″`
  }

  if (!isSupabaseConfigured || !signedIn) {
    return (
      <section className="rounded-lg border bg-card p-4 text-card-foreground">
        <h3 className="text-sm font-semibold">Weight &amp; BMI</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Sign in to track your weight and BMI.
        </p>
      </section>
    )
  }

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4 text-card-foreground">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Weight &amp; BMI</h3>
        <Button size="sm" variant="ghost" onClick={() => setShowSettings((s) => !s)}>
          {showSettings ? 'Close' : 'Height / units'}
        </Button>
      </div>

      {/* BMI summary */}
      <div className="flex items-baseline gap-3">
        <div>
          <div className="text-2xl font-semibold">
            {b != null ? fmt(b) : '—'}
            <span className="ml-1 text-xs font-normal text-muted-foreground">BMI</span>
          </div>
          <div className="text-[11px] text-muted-foreground">
            {latestKg != null ? displayWeight(latestKg) : 'no weight yet'} · height{' '}
            {displayHeight()}
          </div>
        </div>
        {cat && (
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${CATEGORY_CLASS[cat]}`}
          >
            {BMI_CATEGORY_LABEL[cat]}
          </span>
        )}
      </div>
      {b == null && heightCm == null && (
        <p className="text-[11px] text-amber-700">
          Set your height (Height / units) to see your BMI.
        </p>
      )}

      {/* Trend: chronological (oldest→newest) weight sparkline. */}
      {entries.length >= 2 && (
        <div>
          <svg
            viewBox="0 0 240 40"
            className="h-10 w-full text-primary"
            preserveAspectRatio="none"
            role="img"
            aria-label="Weight trend"
          >
            <polyline
              points={sparklinePolyline(
                [...entries].reverse().map((e) => e.weight_kg),
                240,
                40,
              )}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <p className="text-[11px] text-muted-foreground">
            {(() => {
              const first = entries[entries.length - 1].weight_kg
              const dkg = latestKg != null ? latestKg - first : 0
              const d = weightUnit === 'lb' ? kgToLb(dkg) : dkg
              return `${d > 0 ? '+' : ''}${fmt(d)} ${weightUnit} over ${entries.length} entries`
            })()}
          </p>
        </div>
      )}

      {/* Log a weight */}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label htmlFor="weight-input">Weight ({weightUnit})</Label>
          <Input
            id="weight-input"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.1"
            value={weightInput}
            onChange={(e) => setWeightInput(e.target.value)}
            placeholder={weightUnit === 'lb' ? 'e.g. 170' : 'e.g. 77'}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="weight-date">Date</Label>
          <Input
            id="weight-date"
            type="date"
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
            className="mt-1"
          />
        </div>
        <Button type="button" onClick={logWeight} disabled={addWeight.isPending}>
          {addWeight.isPending ? '…' : 'Log'}
        </Button>
      </div>

      {/* Settings: height, sex, units */}
      {showSettings && (
        <div className="space-y-3 rounded-md border p-3">
          <div>
            <Label>Units</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={weightUnit === 'lb' ? 'default' : 'outline'}
                onClick={() => setUnit({ weight_unit: 'lb' })}
              >
                lb
              </Button>
              <Button
                size="sm"
                variant={weightUnit === 'kg' ? 'default' : 'outline'}
                onClick={() => setUnit({ weight_unit: 'kg' })}
              >
                kg
              </Button>
              <span className="w-2" />
              <Button
                size="sm"
                variant={heightUnit === 'ftin' ? 'default' : 'outline'}
                onClick={() => setUnit({ height_unit: 'ftin' })}
              >
                ft/in
              </Button>
              <Button
                size="sm"
                variant={heightUnit === 'cm' ? 'default' : 'outline'}
                onClick={() => setUnit({ height_unit: 'cm' })}
              >
                cm
              </Button>
            </div>
          </div>

          <div>
            <Label>Height</Label>
            {heightUnit === 'ftin' ? (
              <div className="mt-1 flex items-center gap-2">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  aria-label="Height feet"
                  value={ft}
                  onChange={(e) => setFt(e.target.value)}
                  placeholder="ft"
                  className="w-20"
                />
                <span className="text-sm">′</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  aria-label="Height inches"
                  value={inch}
                  onChange={(e) => setInch(e.target.value)}
                  placeholder="in"
                  className="w-20"
                />
                <span className="text-sm">″</span>
              </div>
            ) : (
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                aria-label="Height cm"
                value={cm}
                onChange={(e) => setCm(e.target.value)}
                placeholder="cm"
                className="mt-1 w-32"
              />
            )}
          </div>

          <div>
            <Label htmlFor="sex-select">Sex (optional)</Label>
            <select
              id="sex-select"
              value={sex}
              onChange={(e) => setSex(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Prefer not to say</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              BMI and its categories are the same regardless of sex — this is just
              for your records.
            </p>
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={saveProfile}
              disabled={upsertProfile.isPending}
            >
              {upsertProfile.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      )}

      {/* History */}
      {entries.length > 0 && (
        <div>
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            History
          </h4>
          <ul className="divide-y">
            {entries.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                <span>{w.recorded_on}</span>
                <span className="flex items-center gap-2">
                  <span className="font-medium">{displayWeight(w.weight_kg)}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Delete ${w.recorded_on} entry`}
                    disabled={delWeight.isPending}
                    onClick={() => delWeight.mutate({ id: w.id })}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        BMI is a rough screening figure, not a diagnosis or medical advice.
      </p>
    </section>
  )
}
