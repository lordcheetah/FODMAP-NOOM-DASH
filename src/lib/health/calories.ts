import type { ExerciseRow } from '@/lib/db/types'

/**
 * Rough calories-burned estimate via MET (Metabolic Equivalent of Task):
 *   kcal = MET × bodyWeightKg × hours.
 * MET values are approximate public figures (Compendium of Physical Activities
 * style); this is a screening estimate, not a measurement.
 */

type MetExercise = Pick<ExerciseRow, 'category' | 'subcategory' | 'name' | 'slug'>

/** Approximate MET for an exercise, inferred from category + name keywords. */
export function metForExercise(e: MetExercise): number {
  const s = `${e.slug ?? ''} ${e.name ?? ''}`.toLowerCase()
  switch (e.category) {
    case 'cardio': {
      if (/\bjog|jogging|running|\brun\b/.test(s)) return 7.0
      if (/brisk/.test(s)) return 4.3
      if (/walk/.test(s)) return 3.5
      if (/ebike|e-bike/.test(s)) return 4.0
      if (/bike|cycl|spin/.test(s)) return 7.0
      if (/row/.test(s)) return 6.0
      if (/stair/.test(s)) return 8.0
      return 6.0
    }
    case 'martial-arts':
      return 8.0
    case 'hiit':
      return 8.0
    case 'circuit':
    case 'dynamic':
      return 6.0
    case 'strength':
      return 4.0
    case 'stretch':
    case 'yoga':
    case 'back':
      return 2.5
    default:
      return 4.0
  }
}

export const KM_PER_MI = 1.609344
export function miToKm(mi: number): number {
  return mi * KM_PER_MI
}
export function kmToMi(km: number): number {
  return km / KM_PER_MI
}

/**
 * Pace = minutes per distance unit (min/mi or min/km depending on the distance
 * passed). Display-only. null for missing/non-positive inputs.
 */
export function paceMinPerUnit(
  distance: number | null | undefined,
  minutes: number | null | undefined,
): number | null {
  if (distance == null || minutes == null) return null
  if (!Number.isFinite(distance) || !Number.isFinite(minutes)) return null
  if (distance <= 0 || minutes <= 0) return null
  return minutes / distance
}

/** Format a pace (min per unit) as "m:ss". */
export function formatPace(pace: number | null): string | null {
  if (pace == null || !Number.isFinite(pace) || pace <= 0) return null
  const m = Math.floor(pace)
  const s = Math.round((pace - m) * 60)
  const mm = s === 60 ? m + 1 : m
  const ss = s === 60 ? 0 : s
  return `${mm}:${String(ss).padStart(2, '0')}`
}

/**
 * Rough multiplier on the flat MET estimate for treadmill/road incline: about
 * +5% energy per 1% grade, capped at 15% grade. Returns 1 when no incline.
 * This is a coarse adjustment, not the ACSM metabolic equation.
 */
export function inclineFactor(inclinePct: number | null | undefined): number {
  if (inclinePct == null || !Number.isFinite(inclinePct) || inclinePct <= 0) return 1
  return 1 + Math.min(inclinePct, 15) * 0.05
}

/** kcal = MET × kg × hours. Returns null for missing/non-positive inputs. */
export function caloriesBurned(
  met: number,
  weightKg: number | null | undefined,
  minutes: number | null | undefined,
): number | null {
  if (weightKg == null || minutes == null) return null
  if (!Number.isFinite(met) || !Number.isFinite(weightKg) || !Number.isFinite(minutes)) {
    return null
  }
  if (met <= 0 || weightKg <= 0 || minutes <= 0) return null
  return Math.round(met * weightKg * (minutes / 60))
}
