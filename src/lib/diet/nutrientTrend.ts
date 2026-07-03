import { dashProgress, type LoggedNutrients } from './dashProgress'

/**
 * Per-day totals for the blood-pressure nutrients, for a weekly trend. Reuses
 * `dashProgress` so the daily numbers match the day summary exactly (per-serving
 * fields × servings; missing nutrients count as 0).
 */

/** A resolved log entry tagged with the local day it belongs to (YYYY-MM-DD). */
export type DatedNutrients = LoggedNutrients & { date: string }

export interface DayNutrientTotals {
  date: string
  sodiumMg: number
  potassiumMg: number
  satFatG: number
}

/**
 * Total sodium / potassium / saturated fat per day across `dates`, in the given
 * order. Days with no entries appear with zeros so the trend has no gaps, and a
 * day present in `entries` but absent from `dates` is ignored (the caller owns
 * the window).
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
    const dash = dashProgress(byDate.get(date) ?? [], {})
    return {
      date,
      sodiumMg: dash.sodiumMg,
      potassiumMg: dash.potassiumMg,
      satFatG: dash.satFatG,
    }
  })
}
