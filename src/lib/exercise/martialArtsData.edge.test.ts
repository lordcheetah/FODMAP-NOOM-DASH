import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  DIFFICULTIES,
  EXERCISE_CATEGORIES,
  EXERCISE_CATEGORY_LABEL,
  EXERCISE_DEFAULT_TYPES,
  WORKOUT_FORMATS,
} from './types'

/**
 * Data-integrity & injury-safety hardening for the martial-arts seed files.
 *
 * EXTENDS `martialArtsData.test.ts` (cross-ref) and `types.test.ts` (enum/label).
 * This file deliberately does NOT re-assert what those cover; it adds the deeper
 * shape, value-set, and SAFETY-CONTENT invariants:
 *   - schema/shape of every MA exercise & workout (kebab-case slugs, enum value
 *     sets, numeric/null discipline, ordered resolvable workout exercises),
 *   - global slug uniqueness incl. base collisions (asserted with the offending
 *     slug, not just a boolean),
 *   - the health-adjacent rule for this domain: EVERY MA technique carries a
 *     non-empty `cautions` array (striking / kicking / throwing / breakfall /
 *     sparring must never ship without injury cautions).
 *
 * Gates gracefully (skips) if the MA files are absent so the suite stays green
 * before the data lands. Vitest cwd = repo root, where data/ lives.
 */

interface MaExercise {
  slug: string
  name: string
  category: string
  subcategory?: string | null
  muscle_groups?: unknown
  equipment?: unknown
  difficulty?: string
  instructions?: unknown
  modifications?: unknown
  cautions?: unknown
  default_type?: string
  default_reps?: unknown
  default_duration_sec?: unknown
  default_hold_sec?: unknown
}
interface MaWorkout {
  slug: string
  name: string
  category: string
  description?: string
  duration_min?: unknown
  format?: string
  rounds?: unknown
  exercises?: { exercise_slug: string; order?: unknown }[]
}
interface BaseLite {
  slug: string
}

function repoPath(rel: string): string {
  return resolve(process.cwd(), rel)
}
function loadJson<T>(rel: string): T {
  return JSON.parse(readFileSync(repoPath(rel), 'utf8')) as T
}
const lc = (s: string) => s.trim().toLowerCase()
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/

const MA_EX = 'data/martial_arts_exercises.json'
const MA_WO = 'data/martial_arts_workouts.json'
const hasMaFiles = existsSync(repoPath(MA_EX)) && existsSync(repoPath(MA_WO))

/** Disciplines the MA dataset is expected to draw from (sane set guard). */
const KNOWN_DISCIPLINES = new Set([
  'boxing',
  'muay-thai',
  'kickboxing',
  'bjj',
  'karate',
  'taekwondo',
  'judo',
])

/** Words that mark a technique as contact/impact => MUST carry cautions. */
const RISK_WORDS = [
  'strik',
  'kick',
  'punch',
  'jab',
  'cross',
  'hook',
  'uppercut',
  'throw',
  'breakfall',
  'fall',
  'spar',
  'knee',
  'teep',
  'block',
  'bag',
  'mitt',
]

const isNumOrNull = (v: unknown) => v === null || typeof v === 'number'

describe.skipIf(!hasMaFiles)('martial-arts data: shape & value-set integrity', () => {
  const maExercises = loadJson<MaExercise[]>(MA_EX)
  const baseExercises = loadJson<BaseLite[]>('data/exercises.json')

  it('exercises file is a non-empty array', () => {
    expect(Array.isArray(maExercises)).toBe(true)
    expect(maExercises.length).toBeGreaterThan(0)
  })

  it.each(maExercises.map((e) => [e.slug, e] as const))(
    'exercise %s has a valid slug/name/category/subcategory',
    (_slug, e) => {
      expect(typeof e.slug).toBe('string')
      expect(e.slug.length).toBeGreaterThan(0)
      expect(KEBAB.test(e.slug)).toBe(true)
      expect((e.name ?? '').trim().length).toBeGreaterThan(0)
      expect(e.category).toBe('martial-arts')
      expect(EXERCISE_CATEGORIES).toContain(e.category)
      const sub = (e.subcategory ?? '').trim()
      expect(sub.length).toBeGreaterThan(0)
      expect(KNOWN_DISCIPLINES.has(sub)).toBe(true)
    },
  )

  it.each(maExercises.map((e) => [e.slug, e] as const))(
    'exercise %s has valid difficulty/default_type and numeric measure fields',
    (_slug, e) => {
      expect(DIFFICULTIES).toContain(e.difficulty)
      expect(EXERCISE_DEFAULT_TYPES).toContain(e.default_type)
      expect(isNumOrNull(e.default_reps)).toBe(true)
      expect(isNumOrNull(e.default_duration_sec)).toBe(true)
      expect(isNumOrNull(e.default_hold_sec)).toBe(true)
    },
  )

  it.each(maExercises.map((e) => [e.slug, e] as const))(
    'exercise %s has a non-empty instructions array and array-typed list fields',
    (_slug, e) => {
      expect(Array.isArray(e.instructions)).toBe(true)
      expect((e.instructions as unknown[]).length).toBeGreaterThan(0)
      for (const s of e.instructions as unknown[]) {
        expect(typeof s).toBe('string')
        expect((s as string).trim().length).toBeGreaterThan(0)
      }
      // optional list fields, when present, must be string arrays
      for (const k of ['muscle_groups', 'equipment', 'modifications'] as const) {
        const v = e[k]
        if (v !== undefined) {
          expect(Array.isArray(v)).toBe(true)
          for (const item of v as unknown[]) expect(typeof item).toBe('string')
        }
      }
    },
  )

  it('default_type matches the populated measure field for each exercise', () => {
    const mismatches: string[] = []
    for (const e of maExercises) {
      const ok =
        (e.default_type === 'reps' && typeof e.default_reps === 'number') ||
        (e.default_type === 'duration' &&
          typeof e.default_duration_sec === 'number') ||
        (e.default_type === 'hold' && typeof e.default_hold_sec === 'number')
      if (!ok) mismatches.push(`${e.slug} (default_type=${e.default_type})`)
    }
    expect(mismatches).toEqual([])
  })

  it('MA exercise slugs are globally unique (no dup within MA, no base collision)', () => {
    const seen = new Map<string, number>()
    for (const e of maExercises) seen.set(lc(e.slug), (seen.get(lc(e.slug)) ?? 0) + 1)
    const dups = [...seen.entries()].filter(([, n]) => n > 1).map(([s]) => s)
    expect(dups).toEqual([])

    const base = new Set(baseExercises.map((e) => lc(e.slug)))
    const collisions = maExercises.map((e) => lc(e.slug)).filter((s) => base.has(s))
    expect(collisions).toEqual([])
  })

  it('every discipline in the dataset is from the known set', () => {
    const unknownDisc = [
      ...new Set(maExercises.map((e) => (e.subcategory ?? '').trim())),
    ].filter((d) => !KNOWN_DISCIPLINES.has(d))
    expect(unknownDisc).toEqual([])
  })
})

describe.skipIf(!hasMaFiles)('martial-arts data: workout shape & resolution', () => {
  const maExercises = loadJson<MaExercise[]>(MA_EX)
  const maWorkouts = loadJson<MaWorkout[]>(MA_WO)
  const baseExercises = loadJson<BaseLite[]>('data/exercises.json')
  const baseWorkouts = loadJson<BaseLite[]>('data/workouts.json')

  const knownEx = new Set([
    ...maExercises.map((e) => lc(e.slug)),
    ...baseExercises.map((e) => lc(e.slug)),
  ])

  it('workouts file is a non-empty array', () => {
    expect(Array.isArray(maWorkouts)).toBe(true)
    expect(maWorkouts.length).toBeGreaterThan(0)
  })

  it.each(maWorkouts.map((w) => [w.slug, w] as const))(
    'workout %s has valid slug/name/category/format and a non-empty exercises list',
    (_slug, w) => {
      expect(KEBAB.test(w.slug)).toBe(true)
      expect((w.name ?? '').trim().length).toBeGreaterThan(0)
      expect(w.category).toBe('martial-arts')
      expect(WORKOUT_FORMATS).toContain(w.format)
      expect(Array.isArray(w.exercises)).toBe(true)
      expect((w.exercises ?? []).length).toBeGreaterThan(0)
    },
  )

  it('MA workout slugs are unique and never collide with base workout slugs', () => {
    const slugs = maWorkouts.map((w) => lc(w.slug))
    expect(new Set(slugs).size).toBe(slugs.length)
    const base = new Set(baseWorkouts.map((w) => lc(w.slug)))
    const collisions = slugs.filter((s) => base.has(s))
    expect(collisions).toEqual([])
  })

  it('every workout exercise has a numeric order and resolves to an MA or base exercise', () => {
    const unresolved: string[] = []
    const badOrder: string[] = []
    for (const w of maWorkouts) {
      for (const we of w.exercises ?? []) {
        if (typeof we.order !== 'number') badOrder.push(`${w.slug} -> ${we.exercise_slug}`)
        if (!knownEx.has(lc(we.exercise_slug)))
          unresolved.push(`${w.slug} -> ${we.exercise_slug}`)
      }
    }
    expect(badOrder).toEqual([])
    expect(unresolved).toEqual([])
  })

  it('workout exercise order values are a contiguous 1..N sequence per workout', () => {
    const offenders: string[] = []
    for (const w of maWorkouts) {
      const orders = (w.exercises ?? [])
        .map((we) => we.order as number)
        .sort((a, b) => a - b)
      const expected = orders.map((_, i) => i + 1)
      if (JSON.stringify(orders) !== JSON.stringify(expected)) {
        offenders.push(`${w.slug}: [${orders.join(',')}]`)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe.skipIf(!hasMaFiles)('martial-arts data: injury-safety invariant', () => {
  const maExercises = loadJson<MaExercise[]>(MA_EX)

  it('EVERY MA technique carries a non-empty cautions array', () => {
    const missing: string[] = []
    for (const e of maExercises) {
      const c = e.cautions
      if (!Array.isArray(c) || c.length < 1) missing.push(e.slug)
    }
    // If this fails, the listed slugs ship a martial-arts technique with no
    // injury cautions — a health-data-safety regression for the coder to fix.
    expect(missing).toEqual([])
  })

  it.each(maExercises.map((e) => [e.slug, e] as const))(
    'every caution string for %s is non-empty',
    (_slug, e) => {
      expect(Array.isArray(e.cautions)).toBe(true)
      for (const c of e.cautions as unknown[]) {
        expect(typeof c).toBe('string')
        expect((c as string).trim().length).toBeGreaterThan(0)
      }
    },
  )

  it('contact/impact techniques (strike/kick/throw/breakfall/spar) all have cautions', () => {
    const risky = maExercises.filter((e) => {
      const hay = `${lc(e.slug)} ${lc(e.name)}`
      return RISK_WORDS.some((w) => hay.includes(w))
    })
    // Sanity: the dataset should actually contain contact techniques.
    expect(risky.length).toBeGreaterThan(0)
    const missing = risky
      .filter((e) => !Array.isArray(e.cautions) || (e.cautions as unknown[]).length < 1)
      .map((e) => e.slug)
    expect(missing).toEqual([])
  })
})

describe('exercise category label map (martial-arts focus)', () => {
  it('maps martial-arts to "Martial Arts"', () => {
    expect(EXERCISE_CATEGORY_LABEL['martial-arts']).toBe('Martial Arts')
  })

  it('every category has a non-empty trimmed label', () => {
    for (const c of EXERCISE_CATEGORIES) {
      const label = EXERCISE_CATEGORY_LABEL[c]
      expect(typeof label).toBe('string')
      expect(label.trim().length).toBeGreaterThan(0)
    }
  })
})
