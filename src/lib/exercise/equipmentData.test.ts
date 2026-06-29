import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Data cross-ref validation for the equipment seed files (home cardio machines +
 * resistance bands) — mirrors the seed's resolution rules WITHOUT the DB so
 * unresolved slugs / collisions / missing safety cautions are caught in CI
 * before a seed run. Skips gracefully if the files are absent.
 *
 * Vitest runs with cwd = repo root, where data/ lives.
 */
interface ExerciseSeedLite {
  slug: string
  name: string
  category: string
  cautions?: string[]
}
interface WorkoutSeedLite {
  slug: string
  category: string
  exercises?: { exercise_slug: string }[]
}

function repoPath(rel: string): string {
  return resolve(process.cwd(), rel)
}
function loadJson<T>(rel: string): T {
  return JSON.parse(readFileSync(repoPath(rel), 'utf8')) as T
}
const lc = (s: string) => s.trim().toLowerCase()

const EQ_EX = 'data/equipment_exercises.json'
const EQ_WO = 'data/equipment_workouts.json'
const hasEqFiles = existsSync(repoPath(EQ_EX)) && existsSync(repoPath(EQ_WO))

// Equipment exercises reuse only existing exercise categories.
const ALLOWED_CATEGORIES = new Set(['cardio', 'strength'])

describe.skipIf(!hasEqFiles)('equipment seed data cross-ref', () => {
  const eqExercises = loadJson<ExerciseSeedLite[]>(EQ_EX)
  const eqWorkouts = loadJson<WorkoutSeedLite[]>(EQ_WO)
  const baseExercises = loadJson<ExerciseSeedLite[]>('data/exercises.json')
  const baseWorkouts = loadJson<WorkoutSeedLite[]>('data/workouts.json')
  // Other add-on packs the seed also merges (avoid cross-pack collisions too).
  const maExercises = existsSync(repoPath('data/martial_arts_exercises.json'))
    ? loadJson<ExerciseSeedLite[]>('data/martial_arts_exercises.json')
    : []
  const maWorkouts = existsSync(repoPath('data/martial_arts_workouts.json'))
    ? loadJson<WorkoutSeedLite[]>('data/martial_arts_workouts.json')
    : []

  it('every equipment exercise uses an existing category (cardio|strength)', () => {
    for (const e of eqExercises) {
      expect(ALLOWED_CATEGORIES.has(e.category)).toBe(true)
    }
  })

  it('equipment exercise slugs are unique (case-insensitive)', () => {
    const slugs = eqExercises.map((e) => lc(e.slug))
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('no equipment slug collisions with base or martial-arts exercises', () => {
    const others = new Set(
      [...baseExercises, ...maExercises].map((e) => lc(e.slug)),
    )
    const collisions = eqExercises.map((e) => lc(e.slug)).filter((s) => others.has(s))
    expect(collisions).toEqual([])
  })

  it('no equipment/base/MA workout slug collisions', () => {
    const others = new Set([...baseWorkouts, ...maWorkouts].map((w) => lc(w.slug)))
    const collisions = eqWorkouts.map((w) => lc(w.slug)).filter((s) => others.has(s))
    expect(collisions).toEqual([])
  })

  it('every equipment workout exercise_slug resolves to a known exercise', () => {
    const known = new Set(
      [...eqExercises, ...baseExercises, ...maExercises].map((e) => lc(e.slug)),
    )
    const unresolved: string[] = []
    for (const w of eqWorkouts) {
      for (const we of w.exercises ?? []) {
        if (!known.has(lc(we.exercise_slug))) {
          unresolved.push(`${w.slug} -> ${we.exercise_slug}`)
        }
      }
    }
    expect(unresolved).toEqual([])
  })

  it('every equipment workout uses an existing category (cardio|strength)', () => {
    for (const w of eqWorkouts) expect(ALLOWED_CATEGORIES.has(w.category)).toBe(true)
  })

  // Injury-safety: every equipment move must carry at least one caution.
  it('every equipment exercise has a non-empty cautions array', () => {
    const missing = eqExercises
      .filter((e) => !Array.isArray(e.cautions) || e.cautions.length === 0)
      .map((e) => e.slug)
    expect(missing).toEqual([])
  })
})
