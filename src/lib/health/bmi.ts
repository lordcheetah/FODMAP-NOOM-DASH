/**
 * Pure body-metric math: unit conversions + BMI + category. No diet rules here.
 *
 * Canonical storage is METRIC (kg, cm); the UI converts for display. BMI is
 * weight(kg) / height(m)². Note: BMI itself is the SAME formula and the adult
 * category thresholds are the SAME regardless of sex — we store `sex` for the
 * user's reference, but it does not change the BMI number or category.
 *
 * Not medical advice — BMI is a rough screening figure, not a diagnosis.
 */

export const LB_PER_KG = 2.2046226218
export const CM_PER_IN = 2.54

export function lbToKg(lb: number): number {
  return lb / LB_PER_KG
}
export function kgToLb(kg: number): number {
  return kg * LB_PER_KG
}
export function ftInToCm(ft: number, inch: number): number {
  return (ft * 12 + inch) * CM_PER_IN
}
/** Split centimeters into whole feet + inches (inches rounded to 0.1). */
export function cmToFtIn(cm: number): { ft: number; inch: number } {
  const totalIn = cm / CM_PER_IN
  const ft = Math.floor(totalIn / 12)
  const inch = Math.round((totalIn - ft * 12) * 10) / 10
  return { ft, inch }
}

/** BMI = kg / m². Returns null for missing/non-positive/non-finite inputs. */
export function bmi(
  weightKg: number | null | undefined,
  heightCm: number | null | undefined,
): number | null {
  if (weightKg == null || heightCm == null) return null
  if (!Number.isFinite(weightKg) || !Number.isFinite(heightCm)) return null
  if (weightKg <= 0 || heightCm <= 0) return null
  const m = heightCm / 100
  return weightKg / (m * m)
}

export type BmiCategory = 'underweight' | 'normal' | 'overweight' | 'obese'

/** Standard adult WHO categories: <18.5 / <25 / <30 / else. */
export function bmiCategory(b: number | null | undefined): BmiCategory | null {
  if (b == null || !Number.isFinite(b) || b <= 0) return null
  if (b < 18.5) return 'underweight'
  if (b < 25) return 'normal'
  if (b < 30) return 'overweight'
  return 'obese'
}

export const BMI_CATEGORY_LABEL: Record<BmiCategory, string> = {
  underweight: 'Underweight',
  normal: 'Normal',
  overweight: 'Overweight',
  obese: 'Obese',
}
