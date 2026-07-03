import { describe, it, expect, beforeEach } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { queryKeys } from './queryKeys'
import {
  buildAddFoodLogDefaults,
  buildDeleteFoodLogDefaults,
  buildUpsertDailyTargetsDefaults,
  buildSetPlanStateDefaults,
  OPTIMISTIC_PREFIX,
  type AddFoodLogVars,
  type DeleteFoodLogVars,
  type SetPlanStateVars,
  type UpsertDailyTargetsVars,
} from './mutationDefaults'
import type { FoodLogEntry } from './foodLog'
import type { DailyTargetsRow, FoodRow } from './types'

const USER = 'user-1'
const DATE = '2026-06-26'

function makeQc() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

function seedEntry(id: string): FoodLogEntry {
  return {
    id,
    user_id: USER,
    logged_on: DATE,
    meal: 'lunch',
    food_id: 'food-real',
    recipe_id: null,
    servings: 1,
    note: null,
    created_at: '2026-06-26T00:00:00.000Z',
    food: null,
    recipe: null,
  }
}

describe('food_log add — optimistic onMutate', () => {
  let qc: QueryClient
  beforeEach(() => {
    qc = makeQc()
    qc.setQueryData(queryKeys.foodLog(USER, DATE), [seedEntry('existing-1')])
  })

  it('appends an optimistic temp-id row with the logged fields', async () => {
    const defaults = buildAddFoodLogDefaults(qc)
    const vars: AddFoodLogVars = {
      userId: USER,
      date: DATE,
      meal: 'dinner',
      servings: 2,
      food_id: 'food-x',
    }
    const ctx = await defaults.onMutate(vars)

    const rows = qc.getQueryData<FoodLogEntry[]>(queryKeys.foodLog(USER, DATE))!
    expect(rows).toHaveLength(2)
    const added = rows[1]
    expect(added.id.startsWith(OPTIMISTIC_PREFIX)).toBe(true)
    expect(added.meal).toBe('dinner')
    expect(added.servings).toBe(2)
    expect(added.food_id).toBe('food-x')
    expect(ctx.previous).toHaveLength(1)
  })

  it('embeds a cached food so the row renders with its real FODMAP levels', async () => {
    const cachedFood: FoodRow = {
      id: 'food-x',
      user_id: USER,
      name: 'Apple',
      brand: null,
      serving_desc: '1 medium',
      serving_grams: 180,
      calories: 95,
      sodium_mg: 2,
      sat_fat_g: 0,
      potassium_mg: 195,
      fiber_g: 4,
      added_sugar_g: 0,
      fructose_level: 'high',
      fructans_level: 'low',
      noom_category: null,
      dash_group: 'fruits',
      source: null,
      barcode: null,
      created_at: '2026-06-01T00:00:00.000Z',
    }
    qc.setQueryData(queryKeys.foodSearch('app'), [cachedFood])

    const defaults = buildAddFoodLogDefaults(qc)
    await defaults.onMutate({
      userId: USER,
      date: DATE,
      meal: 'lunch',
      servings: 1,
      food_id: 'food-x',
    })
    const rows = qc.getQueryData<FoodLogEntry[]>(queryKeys.foodLog(USER, DATE))!
    const added = rows.find((r) => r.id.startsWith(OPTIMISTIC_PREFIX))!
    // Carries the REAL levels (high fructose), never a synthesized "safe".
    expect(added.food?.fructose_level).toBe('high')
    expect(added.food?.fructans_level).toBe('low')
  })

  it('rolls back on error', async () => {
    const defaults = buildAddFoodLogDefaults(qc)
    const vars: AddFoodLogVars = {
      userId: USER,
      date: DATE,
      meal: 'dinner',
      servings: 2,
      food_id: 'food-x',
    }
    const ctx = await defaults.onMutate(vars)
    defaults.onError(new Error('boom'), vars, ctx)
    const rows = qc.getQueryData<FoodLogEntry[]>(queryKeys.foodLog(USER, DATE))!
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('existing-1')
  })
})

describe('food_log delete — optimistic onMutate', () => {
  let qc: QueryClient
  beforeEach(() => {
    qc = makeQc()
    qc.setQueryData(queryKeys.foodLog(USER, DATE), [
      seedEntry('keep-1'),
      seedEntry('drop-1'),
    ])
  })

  it('removes the targeted row', async () => {
    const defaults = buildDeleteFoodLogDefaults(qc)
    const vars: DeleteFoodLogVars = { id: 'drop-1', date: DATE, userId: USER }
    await defaults.onMutate(vars)
    const rows = qc.getQueryData<FoodLogEntry[]>(queryKeys.foodLog(USER, DATE))!
    expect(rows.map((r) => r.id)).toEqual(['keep-1'])
  })

  it('rolls back on error', async () => {
    const defaults = buildDeleteFoodLogDefaults(qc)
    const vars: DeleteFoodLogVars = { id: 'drop-1', date: DATE, userId: USER }
    const ctx = await defaults.onMutate(vars)
    defaults.onError(new Error('boom'), vars, ctx)
    const rows = qc.getQueryData<FoodLogEntry[]>(queryKeys.foodLog(USER, DATE))!
    expect(rows.map((r) => r.id)).toEqual(['keep-1', 'drop-1'])
  })

  it('mutationFn skips the network for an optimistic (temp) id (create-then-delete offline)', async () => {
    // A temp id means the row never reached the server (its paused insert is
    // what runs). The delete must resolve WITHOUT a network call — regardless
    // of whether Supabase is configured — so it never fires against a
    // non-existent row.
    const defaults = buildDeleteFoodLogDefaults(qc)
    await expect(
      defaults.mutationFn({
        id: `${OPTIMISTIC_PREFIX}abc`,
        date: DATE,
        userId: USER,
      }),
    ).resolves.toBeUndefined()
  })
})

describe('daily_targets upsert — optimistic onMutate', () => {
  let qc: QueryClient
  beforeEach(() => {
    qc = makeQc()
  })

  it('merges the patch and stamps updated_at over a null cache', async () => {
    const defaults = buildUpsertDailyTargetsDefaults(qc)
    const vars: UpsertDailyTargetsVars = {
      userId: USER,
      calorie_budget: 2000,
      fiber_goal_g: 30,
    }
    await defaults.onMutate(vars)
    const row = qc.getQueryData<DailyTargetsRow>(queryKeys.dailyTargets(USER))!
    expect(row.user_id).toBe(USER)
    expect(row.calorie_budget).toBe(2000)
    expect(row.fiber_goal_g).toBe(30)
    expect(typeof row.updated_at).toBe('string')
  })

  it('rolls back to the previous targets on error', async () => {
    const previous: DailyTargetsRow = {
      user_id: USER,
      calorie_budget: 1800,
      sodium_budget_mg: 2300,
      potassium_goal_mg: 4700,
      sat_fat_limit_g: 13,
      fiber_goal_g: 25,
      fiber_per_meal_g: 8,
      dash_serving_goals: {},
      updated_at: '2026-06-01T00:00:00.000Z',
    }
    qc.setQueryData(queryKeys.dailyTargets(USER), previous)
    const defaults = buildUpsertDailyTargetsDefaults(qc)
    const vars: UpsertDailyTargetsVars = { userId: USER, calorie_budget: 9999 }
    const ctx = await defaults.onMutate(vars)
    defaults.onError(new Error('boom'), vars, ctx)
    const row = qc.getQueryData<DailyTargetsRow>(queryKeys.dailyTargets(USER))!
    expect(row.calorie_budget).toBe(1800)
  })
})

describe('plan_state set — optimistic onMutate', () => {
  let qc: QueryClient
  beforeEach(() => {
    qc = makeQc()
  })

  it('replaces the key values optimistically', async () => {
    qc.setQueryData(queryKeys.planState(USER, 'shopping:checked'), ['a'])
    const defaults = buildSetPlanStateDefaults(qc)
    const vars: SetPlanStateVars = {
      userId: USER,
      key: 'shopping:checked',
      values: ['a', 'b'],
    }
    await defaults.onMutate(vars)
    expect(
      qc.getQueryData<string[]>(queryKeys.planState(USER, 'shopping:checked')),
    ).toEqual(['a', 'b'])
  })

  it('rolls back to the previous values on error', async () => {
    qc.setQueryData(queryKeys.planState(USER, 'k'), ['x'])
    const defaults = buildSetPlanStateDefaults(qc)
    const vars: SetPlanStateVars = { userId: USER, key: 'k', values: ['x', 'y', 'z'] }
    const ctx = await defaults.onMutate(vars)
    defaults.onError(new Error('boom'), vars, ctx)
    expect(qc.getQueryData<string[]>(queryKeys.planState(USER, 'k'))).toEqual(['x'])
  })
})

// Note: the FODMAP "unknown is never coerced to safe" contract for createFood is
// verified against a mocked Supabase client in mutationDefaults.health.test.ts.
