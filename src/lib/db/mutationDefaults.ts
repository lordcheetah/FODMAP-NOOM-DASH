/**
 * Mutation defaults registry — the supabase-calling `mutationFn` bodies for
 * every offline-capable write live here, keyed by a stable `mutationKey`.
 *
 * Why here and not inline in the hooks: a paused mutation persisted to
 * IndexedDB loses its `mutationFn` (functions don't serialize). On reload,
 * `resumePausedMutations()` finds the function ONLY by looking up the default
 * registered for the mutation's key. So every write must be registered via
 * `setMutationDefaults(key, { mutationFn, onMutate, onError, onSettled })`
 * BEFORE resume runs. `registerMutationDefaults` does that; it is called once at
 * module load from `src/lib/offline/queryClient.ts`.
 *
 * Two cross-cutting rules:
 *  - `mutationFn` must NOT read `useAuth()` (no React context exists on resume).
 *    Every variable type carries `userId`, injected by the hook at `mutate()`
 *    time so it persists with the paused mutation.
 *  - Health-safety: optimistic rows carry the food's REAL FODMAP levels (or
 *    `'unknown'`). We never synthesize a `'low'`/"safe" value offline. A custom
 *    food created offline keeps fructose/fructans defaulting to `'unknown'`.
 */
import type { QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { MealType } from '@/lib/diet'
import { mutationKeys, queryKeys } from './queryKeys'
import type {
  AddLogEntryInput,
  FoodLogEntry,
  UpdateLogEntryInput,
} from './foodLog'
import type { DailyTargetsInput } from './dailyTargets'
import type { CreateFoodInput } from './foods'
import type { AddWorkoutLogInput, WorkoutLogEntry } from './workoutLog'
import type {
  DailyTargetsRow,
  FoodLogRow,
  FoodRow,
  WorkoutLogExerciseRow,
  WorkoutLogRow,
} from './types'

// ---------------------------------------------------------------------------
// Variable types: the hook injects `userId` so the mutationFn never needs
// React context (works on resume-after-reload with no component mounted).
// ---------------------------------------------------------------------------

export type AddFoodLogVars = AddLogEntryInput & { userId: string }
export type UpdateFoodLogVars = UpdateLogEntryInput & { userId: string }
export type DeleteFoodLogVars = { id: string; date: string; userId: string }
export type UpsertDailyTargetsVars = DailyTargetsInput & { userId: string }
export type CreateFoodVars = CreateFoodInput & { userId: string }
export type AddWorkoutLogVars = AddWorkoutLogInput & { userId: string }
export type UpdateWorkoutLogVars = {
  id: string
  date: string
  userId: string
  name?: string | null
  duration_sec?: number | null
  rounds_completed?: number | null
  notes?: string | null
  completed?: boolean
}
export type DeleteWorkoutLogVars = { id: string; date: string; userId: string }

/** Marker prefix for optimistic (not-yet-synced) rows. */
export const OPTIMISTIC_PREFIX = 'optimistic-'

/** A mint of a temp id for an optimistically-inserted row. */
function tempId(): string {
  return OPTIMISTIC_PREFIX + crypto.randomUUID()
}

/** True for ids that only exist in the local cache (never reached the server). */
function isOptimisticId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_PREFIX)
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

// ---------------------------------------------------------------------------
// Optimistic context shapes (used for rollback in onError).
// ---------------------------------------------------------------------------

type FoodLogCtx = {
  previous: FoodLogEntry[] | undefined
  userId: string
  date: string
}
type DailyTargetsCtx = {
  previous: DailyTargetsRow | null | undefined
  userId: string
}
type WorkoutLogCtx = {
  previousDay: WorkoutLogEntry[] | undefined
  previousHistory: WorkoutLogEntry[] | undefined
  userId: string
  date: string
}

// ---------------------------------------------------------------------------
// food_log: add / update / delete
// ---------------------------------------------------------------------------

async function addFoodLogFn(vars: AddFoodLogVars): Promise<FoodLogRow> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('food_log')
    .insert({
      user_id: vars.userId,
      logged_on: vars.date,
      meal: vars.meal,
      servings: vars.servings,
      food_id: vars.food_id ?? null,
      recipe_id: vars.recipe_id ?? null,
      note: vars.note ?? null,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as FoodLogRow
}

function buildAddFoodLogDefaults(qc: QueryClient) {
  return {
    mutationFn: addFoodLogFn,
    onMutate: async (vars: AddFoodLogVars): Promise<FoodLogCtx> => {
      const key = queryKeys.foodLog(vars.userId, vars.date)
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<FoodLogEntry[]>(key)
      // Resolve the embedded food/recipe from any already-cached search/recipe
      // result so the optimistic row renders with REAL FODMAP/NOOM/nutrients.
      // If we can't resolve it, embed null — the UI shows it as pending/
      // approximate, NEVER as "safe".
      const food = vars.food_id ? findCachedFood(qc, vars.food_id) : null
      const optimistic: FoodLogEntry = {
        id: tempId(),
        user_id: vars.userId,
        logged_on: vars.date,
        meal: vars.meal,
        food_id: vars.food_id ?? null,
        recipe_id: vars.recipe_id ?? null,
        servings: vars.servings,
        note: vars.note ?? null,
        created_at: new Date().toISOString(),
        food,
        recipe: null,
      }
      qc.setQueryData<FoodLogEntry[]>(key, (old = []) => [...old, optimistic])
      return { previous, userId: vars.userId, date: vars.date }
    },
    onError: (_e: unknown, _vars: AddFoodLogVars, ctx?: FoodLogCtx) => {
      if (ctx) qc.setQueryData(queryKeys.foodLog(ctx.userId, ctx.date), ctx.previous)
    },
    onSettled: (_d: unknown, _e: unknown, vars: AddFoodLogVars) => {
      void qc.invalidateQueries({
        queryKey: queryKeys.foodLog(vars.userId, vars.date),
      })
    },
  }
}

/** Scan cached food searches / barcode lookups for a food by id. */
function findCachedFood(qc: QueryClient, foodId: string): FoodRow | null {
  const matches = qc.getQueriesData<FoodRow[] | FoodRow | null>({})
  for (const [, data] of matches) {
    if (!data) continue
    if (Array.isArray(data)) {
      const hit = data.find((f) => f && typeof f === 'object' && 'id' in f && f.id === foodId)
      if (hit) return hit
    } else if (typeof data === 'object' && 'id' in data && data.id === foodId) {
      return data
    }
  }
  return null
}

async function updateFoodLogFn(vars: UpdateFoodLogVars): Promise<FoodLogRow | null> {
  // create-then-update while offline: the target is a still-paused insert; the
  // insert is what will run. Skip the network update of a temp id.
  if (isOptimisticId(vars.id)) return null
  const sb = requireSupabase()
  const patch: Partial<FoodLogRow> = {}
  if (vars.meal !== undefined) patch.meal = vars.meal
  if (vars.servings !== undefined) patch.servings = vars.servings
  if (vars.note !== undefined) patch.note = vars.note
  const { data, error } = await sb
    .from('food_log')
    .update(patch)
    .eq('id', vars.id)
    .select('*')
    .single()
  if (error) throw error
  return data as FoodLogRow
}

function buildUpdateFoodLogDefaults(qc: QueryClient) {
  return {
    mutationFn: updateFoodLogFn,
    onMutate: async (vars: UpdateFoodLogVars): Promise<FoodLogCtx> => {
      const key = queryKeys.foodLog(vars.userId, vars.date)
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<FoodLogEntry[]>(key)
      qc.setQueryData<FoodLogEntry[]>(key, (old = []) =>
        old.map((r) =>
          r.id === vars.id
            ? {
                ...r,
                ...(vars.meal !== undefined ? { meal: vars.meal as MealType } : {}),
                ...(vars.servings !== undefined ? { servings: vars.servings } : {}),
                ...(vars.note !== undefined ? { note: vars.note } : {}),
              }
            : r,
        ),
      )
      return { previous, userId: vars.userId, date: vars.date }
    },
    onError: (_e: unknown, _vars: UpdateFoodLogVars, ctx?: FoodLogCtx) => {
      if (ctx) qc.setQueryData(queryKeys.foodLog(ctx.userId, ctx.date), ctx.previous)
    },
    onSettled: (_d: unknown, _e: unknown, vars: UpdateFoodLogVars) => {
      void qc.invalidateQueries({
        queryKey: queryKeys.foodLog(vars.userId, vars.date),
      })
    },
  }
}

async function deleteFoodLogFn(vars: DeleteFoodLogVars): Promise<void> {
  // create-then-delete while offline: the row never reached the server (its
  // paused insert was cancelled by the optimistic removal). Skip the network
  // delete of a temp id so we don't fire a delete against a non-existent row.
  if (isOptimisticId(vars.id)) return
  const sb = requireSupabase()
  const { error } = await sb.from('food_log').delete().eq('id', vars.id)
  if (error) throw error
}

function buildDeleteFoodLogDefaults(qc: QueryClient) {
  return {
    mutationFn: deleteFoodLogFn,
    onMutate: async (vars: DeleteFoodLogVars): Promise<FoodLogCtx> => {
      const key = queryKeys.foodLog(vars.userId, vars.date)
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<FoodLogEntry[]>(key)
      qc.setQueryData<FoodLogEntry[]>(key, (old = []) =>
        old.filter((r) => r.id !== vars.id),
      )
      return { previous, userId: vars.userId, date: vars.date }
    },
    onError: (_e: unknown, _vars: DeleteFoodLogVars, ctx?: FoodLogCtx) => {
      if (ctx) qc.setQueryData(queryKeys.foodLog(ctx.userId, ctx.date), ctx.previous)
    },
    onSettled: (_d: unknown, _e: unknown, vars: DeleteFoodLogVars) => {
      void qc.invalidateQueries({
        queryKey: queryKeys.foodLog(vars.userId, vars.date),
      })
    },
  }
}

// ---------------------------------------------------------------------------
// daily_targets: upsert (singleton; last-write-wins)
// ---------------------------------------------------------------------------

async function upsertDailyTargetsFn(
  vars: UpsertDailyTargetsVars,
): Promise<DailyTargetsRow> {
  const sb = requireSupabase()
  const { userId, ...input } = vars
  const { data, error } = await sb
    .from('daily_targets')
    .upsert({ ...input, user_id: userId }, { onConflict: 'user_id' })
    .select('*')
    .single()
  if (error) throw error
  return data as DailyTargetsRow
}

function buildUpsertDailyTargetsDefaults(qc: QueryClient) {
  return {
    mutationFn: upsertDailyTargetsFn,
    onMutate: async (vars: UpsertDailyTargetsVars): Promise<DailyTargetsCtx> => {
      const key = queryKeys.dailyTargets(vars.userId)
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<DailyTargetsRow | null>(key)
      const { userId, ...patch } = vars
      qc.setQueryData<DailyTargetsRow | null>(key, (old) => ({
        ...(old ?? { user_id: userId }),
        ...patch,
        user_id: userId,
        updated_at: new Date().toISOString(),
      }) as DailyTargetsRow)
      return { previous, userId: vars.userId }
    },
    onError: (_e: unknown, _vars: UpsertDailyTargetsVars, ctx?: DailyTargetsCtx) => {
      if (ctx) qc.setQueryData(queryKeys.dailyTargets(ctx.userId), ctx.previous)
    },
    onSettled: (_d: unknown, _e: unknown, vars: UpsertDailyTargetsVars) => {
      void qc.invalidateQueries({ queryKey: queryKeys.dailyTargets(vars.userId) })
    },
  }
}

// ---------------------------------------------------------------------------
// foods: create (custom/scanned). Health-safety: FODMAP defaults to 'unknown'.
// ---------------------------------------------------------------------------

async function createFoodFn(vars: CreateFoodVars): Promise<FoodRow> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('foods')
    .insert({
      user_id: vars.userId,
      name: vars.name,
      brand: vars.brand ?? null,
      serving_desc: vars.serving_desc,
      serving_grams: vars.serving_grams ?? null,
      calories: vars.calories ?? null,
      sodium_mg: vars.sodium_mg ?? null,
      sat_fat_g: vars.sat_fat_g ?? null,
      potassium_mg: vars.potassium_mg ?? null,
      fiber_g: vars.fiber_g ?? null,
      added_sugar_g: vars.added_sugar_g ?? null,
      // NEVER inferred — only the user may set a known level. Defaults to
      // 'unknown' so an offline-created food is never shown as "safe".
      fructose_level: vars.fructose_level ?? 'unknown',
      fructans_level: vars.fructans_level ?? 'unknown',
      source: vars.source ?? null,
      barcode: vars.barcode ?? null,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as FoodRow
}

function buildCreateFoodDefaults(qc: QueryClient) {
  return {
    mutationFn: createFoodFn,
    // No optimistic write into search caches: search results are server-driven
    // and writing a food into them as if verified would risk an "unknown→safe"
    // render. Just invalidate so the new row surfaces once it lands.
    onSettled: (_d: unknown, _e: unknown, vars: CreateFoodVars) => {
      void qc.invalidateQueries({
        queryKey: queryKeys.foodByBarcode(vars.userId, vars.barcode ?? null),
      })
      void qc.invalidateQueries({ queryKey: ['foodSearch'] })
    },
  }
}

// ---------------------------------------------------------------------------
// workout_log: add / update / delete (date key + history key)
// ---------------------------------------------------------------------------

async function addWorkoutLogFn(vars: AddWorkoutLogVars): Promise<WorkoutLogRow> {
  const sb = requireSupabase()
  const { data: session, error: sessErr } = await sb
    .from('workout_log')
    .insert({
      user_id: vars.userId,
      performed_on: vars.date,
      workout_id: vars.workout_id ?? null,
      name: vars.name ?? null,
      duration_sec: vars.duration_sec ?? null,
      rounds_completed: vars.rounds_completed ?? null,
      calories_burned: vars.calories_burned ?? null,
      notes: vars.notes ?? null,
      completed: vars.completed ?? true,
    })
    .select('*')
    .single()
  if (sessErr) throw sessErr

  const session_row = session as WorkoutLogRow
  const children = vars.exercises ?? []
  if (children.length > 0) {
    const rows = children.map((c) => ({
      workout_log_id: session_row.id,
      exercise_id: c.exercise_id ?? null,
      name: c.name ?? null,
      position: c.position ?? null,
      sets: c.sets ?? null,
      reps: c.reps ?? null,
      duration_sec: c.duration_sec ?? null,
      hold_sec: c.hold_sec ?? null,
      score: c.score ?? null,
      notes: c.notes ?? null,
    }))
    const { error: childErr } = await sb
      .from('workout_log_exercises')
      .insert(rows)
    if (childErr) throw childErr
  }
  return session_row
}

function buildAddWorkoutLogDefaults(qc: QueryClient) {
  return {
    mutationFn: addWorkoutLogFn,
    onMutate: async (vars: AddWorkoutLogVars): Promise<WorkoutLogCtx> => {
      const dayKey = queryKeys.workoutLog(vars.userId, vars.date)
      const histKey = queryKeys.workoutLogHistory(vars.userId)
      await Promise.all([
        qc.cancelQueries({ queryKey: dayKey }),
        qc.cancelQueries({ queryKey: histKey }),
      ])
      const previousDay = qc.getQueryData<WorkoutLogEntry[]>(dayKey)
      const previousHistory = qc.getQueryData<WorkoutLogEntry[]>(histKey)
      const sessionId = tempId()
      const children: WorkoutLogExerciseRow[] = (vars.exercises ?? []).map((c) => ({
        id: tempId(),
        workout_log_id: sessionId,
        exercise_id: c.exercise_id ?? null,
        name: c.name ?? null,
        position: c.position ?? null,
        sets: c.sets ?? null,
        reps: c.reps ?? null,
        duration_sec: c.duration_sec ?? null,
        hold_sec: c.hold_sec ?? null,
        score: c.score ?? null,
        notes: c.notes ?? null,
      }))
      const optimistic: WorkoutLogEntry = {
        id: sessionId,
        user_id: vars.userId,
        performed_on: vars.date,
        workout_id: vars.workout_id ?? null,
        name: vars.name ?? null,
        duration_sec: vars.duration_sec ?? null,
        rounds_completed: vars.rounds_completed ?? null,
        calories_burned: vars.calories_burned ?? null,
        notes: vars.notes ?? null,
        completed: vars.completed ?? true,
        created_at: new Date().toISOString(),
        workout_log_exercises: children,
      }
      qc.setQueryData<WorkoutLogEntry[]>(dayKey, (old = []) => [...old, optimistic])
      qc.setQueryData<WorkoutLogEntry[]>(histKey, (old = []) => [optimistic, ...old])
      return { previousDay, previousHistory, userId: vars.userId, date: vars.date }
    },
    onError: (_e: unknown, _vars: AddWorkoutLogVars, ctx?: WorkoutLogCtx) => {
      if (!ctx) return
      qc.setQueryData(queryKeys.workoutLog(ctx.userId, ctx.date), ctx.previousDay)
      qc.setQueryData(queryKeys.workoutLogHistory(ctx.userId), ctx.previousHistory)
    },
    onSettled: (_d: unknown, _e: unknown, vars: AddWorkoutLogVars) => {
      void qc.invalidateQueries({ queryKey: queryKeys.workoutLog(vars.userId, vars.date) })
      void qc.invalidateQueries({ queryKey: queryKeys.workoutLogHistory(vars.userId) })
    },
  }
}

async function updateWorkoutLogFn(
  vars: UpdateWorkoutLogVars,
): Promise<WorkoutLogRow | null> {
  if (isOptimisticId(vars.id)) return null
  const sb = requireSupabase()
  const patch: Partial<WorkoutLogRow> = {}
  if (vars.name !== undefined) patch.name = vars.name
  if (vars.duration_sec !== undefined) patch.duration_sec = vars.duration_sec
  if (vars.rounds_completed !== undefined)
    patch.rounds_completed = vars.rounds_completed
  if (vars.notes !== undefined) patch.notes = vars.notes
  if (vars.completed !== undefined) patch.completed = vars.completed
  const { data, error } = await sb
    .from('workout_log')
    .update(patch)
    .eq('id', vars.id)
    .select('*')
    .single()
  if (error) throw error
  return data as WorkoutLogRow
}

function buildUpdateWorkoutLogDefaults(qc: QueryClient) {
  return {
    mutationFn: updateWorkoutLogFn,
    onMutate: async (vars: UpdateWorkoutLogVars): Promise<WorkoutLogCtx> => {
      const dayKey = queryKeys.workoutLog(vars.userId, vars.date)
      const histKey = queryKeys.workoutLogHistory(vars.userId)
      await Promise.all([
        qc.cancelQueries({ queryKey: dayKey }),
        qc.cancelQueries({ queryKey: histKey }),
      ])
      const previousDay = qc.getQueryData<WorkoutLogEntry[]>(dayKey)
      const previousHistory = qc.getQueryData<WorkoutLogEntry[]>(histKey)
      const patchRow = (r: WorkoutLogEntry): WorkoutLogEntry =>
        r.id === vars.id
          ? {
              ...r,
              ...(vars.name !== undefined ? { name: vars.name } : {}),
              ...(vars.duration_sec !== undefined
                ? { duration_sec: vars.duration_sec }
                : {}),
              ...(vars.rounds_completed !== undefined
                ? { rounds_completed: vars.rounds_completed }
                : {}),
              ...(vars.notes !== undefined ? { notes: vars.notes } : {}),
              ...(vars.completed !== undefined ? { completed: vars.completed } : {}),
            }
          : r
      qc.setQueryData<WorkoutLogEntry[]>(dayKey, (old = []) => old.map(patchRow))
      qc.setQueryData<WorkoutLogEntry[]>(histKey, (old = []) => old.map(patchRow))
      return { previousDay, previousHistory, userId: vars.userId, date: vars.date }
    },
    onError: (_e: unknown, _vars: UpdateWorkoutLogVars, ctx?: WorkoutLogCtx) => {
      if (!ctx) return
      qc.setQueryData(queryKeys.workoutLog(ctx.userId, ctx.date), ctx.previousDay)
      qc.setQueryData(queryKeys.workoutLogHistory(ctx.userId), ctx.previousHistory)
    },
    onSettled: (_d: unknown, _e: unknown, vars: UpdateWorkoutLogVars) => {
      void qc.invalidateQueries({ queryKey: queryKeys.workoutLog(vars.userId, vars.date) })
      void qc.invalidateQueries({ queryKey: queryKeys.workoutLogHistory(vars.userId) })
    },
  }
}

async function deleteWorkoutLogFn(vars: DeleteWorkoutLogVars): Promise<void> {
  if (isOptimisticId(vars.id)) return
  const sb = requireSupabase()
  const { error } = await sb.from('workout_log').delete().eq('id', vars.id)
  if (error) throw error
}

function buildDeleteWorkoutLogDefaults(qc: QueryClient) {
  return {
    mutationFn: deleteWorkoutLogFn,
    onMutate: async (vars: DeleteWorkoutLogVars): Promise<WorkoutLogCtx> => {
      const dayKey = queryKeys.workoutLog(vars.userId, vars.date)
      const histKey = queryKeys.workoutLogHistory(vars.userId)
      await Promise.all([
        qc.cancelQueries({ queryKey: dayKey }),
        qc.cancelQueries({ queryKey: histKey }),
      ])
      const previousDay = qc.getQueryData<WorkoutLogEntry[]>(dayKey)
      const previousHistory = qc.getQueryData<WorkoutLogEntry[]>(histKey)
      qc.setQueryData<WorkoutLogEntry[]>(dayKey, (old = []) =>
        old.filter((r) => r.id !== vars.id),
      )
      qc.setQueryData<WorkoutLogEntry[]>(histKey, (old = []) =>
        old.filter((r) => r.id !== vars.id),
      )
      return { previousDay, previousHistory, userId: vars.userId, date: vars.date }
    },
    onError: (_e: unknown, _vars: DeleteWorkoutLogVars, ctx?: WorkoutLogCtx) => {
      if (!ctx) return
      qc.setQueryData(queryKeys.workoutLog(ctx.userId, ctx.date), ctx.previousDay)
      qc.setQueryData(queryKeys.workoutLogHistory(ctx.userId), ctx.previousHistory)
    },
    onSettled: (_d: unknown, _e: unknown, vars: DeleteWorkoutLogVars) => {
      void qc.invalidateQueries({ queryKey: queryKeys.workoutLog(vars.userId, vars.date) })
      void qc.invalidateQueries({ queryKey: queryKeys.workoutLogHistory(vars.userId) })
    },
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register the `mutationFn` + optimistic handlers for every offline-capable
 * write. Idempotent (safe under StrictMode double-invoke): setMutationDefaults
 * just overwrites the entry for a key. MUST run before `resumePausedMutations()`
 * so paused mutations restored from IndexedDB find their `mutationFn` by key.
 *
 * Exported builders are reused by `mutationDefaults.test.ts` to drive
 * `onMutate`/`onError` directly without touching the network.
 */
export function registerMutationDefaults(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.addFoodLog, buildAddFoodLogDefaults(qc))
  qc.setMutationDefaults(mutationKeys.updateFoodLog, buildUpdateFoodLogDefaults(qc))
  qc.setMutationDefaults(mutationKeys.deleteFoodLog, buildDeleteFoodLogDefaults(qc))
  qc.setMutationDefaults(
    mutationKeys.upsertDailyTargets,
    buildUpsertDailyTargetsDefaults(qc),
  )
  qc.setMutationDefaults(mutationKeys.createFood, buildCreateFoodDefaults(qc))
  qc.setMutationDefaults(mutationKeys.addWorkoutLog, buildAddWorkoutLogDefaults(qc))
  qc.setMutationDefaults(
    mutationKeys.updateWorkoutLog,
    buildUpdateWorkoutLogDefaults(qc),
  )
  qc.setMutationDefaults(
    mutationKeys.deleteWorkoutLog,
    buildDeleteWorkoutLogDefaults(qc),
  )
}

export {
  buildAddFoodLogDefaults,
  buildUpdateFoodLogDefaults,
  buildDeleteFoodLogDefaults,
  buildUpsertDailyTargetsDefaults,
  buildCreateFoodDefaults,
  buildAddWorkoutLogDefaults,
  buildUpdateWorkoutLogDefaults,
  buildDeleteWorkoutLogDefaults,
}
