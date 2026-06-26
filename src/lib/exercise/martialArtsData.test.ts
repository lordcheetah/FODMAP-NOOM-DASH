import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Data cross-ref validation for the martial-arts seed files — mirrors the seed's
 * resolution rules WITHOUT touching the DB, so unresolved slugs / collisions are
 * caught in CI before a seed run. Gates gracefully (skips) if the MA files are
 * absent so the suite stays green before the data lands.
 *
 * Vitest runs with cwd = repo root, where data/ lives.
 */
interface ExerciseSeedLite {
  slug: string
  category: string
  subcategory?: string | null
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

const MA_EX = 'data/martial_arts_exercises.json'
const MA_WO = 'data/martial_arts_workouts.json'
const hasMaFiles = existsSync(repoPath(MA_EX)) && existsSync(repoPath(MA_WO))

describe.skipIf(!hasMaFiles)('martial-arts seed data cross-ref', () => {
  const maExercises = loadJson<ExerciseSeedLite[]>(MA_EX)
  const maWorkouts = loadJson<WorkoutSeedLite[]>(MA_WO)
  const baseExercises = loadJson<ExerciseSeedLite[]>('data/exercises.json')
  const baseWorkouts = loadJson<WorkoutSeedLite[]>('data/workouts.json')

  it('every MA exercise is category=martial-arts with a non-empty subcategory', () => {
    for (const e of maExercises) {
      expect(e.category).toBe('martial-arts')
      expect((e.subcategory ?? '').trim().length).toBeGreaterThan(0)
    }
  })

  it('MA exercise slugs are unique (case-insensitive)', () => {
    const slugs = maExercises.map((e) => lc(e.slug))
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('no MA/base exercise slug collisions', () => {
    const base = new Set(baseExercises.map((e) => lc(e.slug)))
    const collisions = maExercises.map((e) => lc(e.slug)).filter((s) => base.has(s))
    expect(collisions).toEqual([])
  })

  it('no MA/base workout slug collisions', () => {
    const base = new Set(baseWorkouts.map((w) => lc(w.slug)))
    const collisions = maWorkouts.map((w) => lc(w.slug)).filter((s) => base.has(s))
    expect(collisions).toEqual([])
  })

  it('every MA workout exercise_slug resolves to an MA or base exercise', () => {
    const known = new Set([
      ...maExercises.map((e) => lc(e.slug)),
      ...baseExercises.map((e) => lc(e.slug)),
    ])
    const unresolved: string[] = []
    for (const w of maWorkouts) {
      for (const we of w.exercises ?? []) {
        if (!known.has(lc(we.exercise_slug))) {
          unresolved.push(`${w.slug} -> ${we.exercise_slug}`)
        }
      }
    }
    expect(unresolved).toEqual([])
  })

  it('every MA workout is category=martial-arts', () => {
    for (const w of maWorkouts) expect(w.category).toBe('martial-arts')
  })
})
