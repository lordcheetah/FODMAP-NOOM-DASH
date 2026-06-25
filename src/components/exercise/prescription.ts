/**
 * Per-workout exercise prescription chip text. Pure helper kept out of
 * `ExerciseCard.tsx` so that component file only exports React components
 * (satisfies `react-refresh/only-export-components`).
 */

/** Build a short prescription chip string from a workout_exercises row. */
export function prescriptionLabel(p: {
  work_sec: number | null
  rest_sec: number | null
  reps: number | null
  hold_sec: number | null
}): string | null {
  const parts: string[] = []
  if (p.reps != null) parts.push(`${p.reps} reps`)
  if (p.hold_sec != null) parts.push(`hold ${p.hold_sec}s`)
  if (p.work_sec != null) parts.push(`${p.work_sec}s work`)
  if (p.rest_sec != null) parts.push(`${p.rest_sec}s rest`)
  return parts.length > 0 ? parts.join(' · ') : null
}
