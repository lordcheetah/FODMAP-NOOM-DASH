import { dashProgress, type LoggedNutrients } from './dashProgress'
import { fiberProgress } from './fiberProgress'

/**
 * Per-day totals for the weekly trend — calories, the blood-pressure nutrients
 * (sodium / potassium / saturated fat), and fiber. Reuses `dashProgress` and
 * `fiberProgress` so the daily numbers match the day summary exactly
 * (per-serving fields × servings; missing nutrients count as 0).
 */

/** A resolved log entry tagged with the local day it belongs to (YYYY-MM-DD). */
export type DatedNutrients = LoggedNutrients & { date: string }

export interface DayNutrientTotals {
  date: string
  calories: number
  sodiumMg: number
  potassiumMg: number
  satFatG: number
  fiberG: number
}

/** Coerce a possibly null/undefined/non-finite value to a usable number. */
function num(v: number | null | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/**
 * Total calories / sodium / potassium / saturated fat / fiber per day across
 * `dates`, in the given order. Days with no entries appear with zeros so the
 * trend has no gaps, and a day present in `entries` but absent from `dates` is
 * ignored (the caller owns the window).
 */
export function nutrientTrend(
  entries: DatedNutrients[],
  dates: string[],
): DayNutrientTotals[] {
  const byDate = new Map<string, LoggedNutrients[]>()
  for (const e of entries) {
    const arr = byDate.get(e.date)
    if (arr) arr.push(e)
    else byDate.set(e.date, [e])
  }

  return dates.map((date) => {
    const nutrients = byDate.get(date) ?? []
    const dash = dashProgress(nutrients, {})
    const fiber = fiberProgress(nutrients, {})
    const calories = nutrients.reduce(
      (sum, n) => sum + num(n.calories) * num(n.servings),
      0,
    )
    return {
      date,
      calories,
      sodiumMg: dash.sodiumMg,
      potassiumMg: dash.potassiumMg,
      satFatG: dash.satFatG,
      fiberG: fiber.totalFiberG,
    }
  })
}
