/**
 * Central TanStack Query key factory for the meals data layer.
 * Keeps invalidation targets consistent across hooks.
 */
export const queryKeys = {
  foodSearch: (term: string) => ['foodSearch', term] as const,
  foodByBarcode: (userId: string | undefined, barcode: string | null) =>
    ['foodByBarcode', userId, barcode] as const,
  recipeSearch: (term: string) => ['recipeSearch', term] as const,
  recentFoods: (userId: string | undefined) => ['recentFoods', userId] as const,
  recentExercises: (userId: string | undefined) =>
    ['recentExercises', userId] as const,
  recipe: (id: string) => ['recipe', id] as const,
  foodLog: (userId: string | undefined, date: string) =>
    ['foodLog', userId, date] as const,
  dailyTargets: (userId: string | undefined) =>
    ['dailyTargets', userId] as const,

  // Exercise (Phase 2)
  exercises: (category?: string) => ['exercises', category ?? 'all'] as const,
  exercise: (slug: string) => ['exercise', slug] as const,
  exerciseSearch: (term: string) => ['exerciseSearch', term] as const,
  workouts: (category?: string) => ['workouts', category ?? 'all'] as const,
  workout: (slug: string) => ['workout', slug] as const,
  workoutSearch: (term: string) => ['workoutSearch', term] as const,
  schedule: (name?: string) => ['schedule', name ?? 'default'] as const,
  workoutLog: (userId: string | undefined, date: string) =>
    ['workoutLog', userId, date] as const,
  workoutLogHistory: (userId: string | undefined) =>
    ['workoutLogHistory', userId] as const,
}

/**
 * Stable, serializable mutation keys for every offline-capable write.
 *
 * These are intentionally variable-FREE (no userId/date/id in the key): the
 * variables travel WITH the dehydrated paused mutation, while the key is only
 * used to look up the registered `mutationFn`/handlers on resume. A paused
 * mutation deserialized from IndexedDB has its `mutationFn` stripped, so it can
 * only resume after reload if a default is registered by this SAME key BEFORE
 * `resumePausedMutations()` runs (see `registerMutationDefaults`).
 */
export const mutationKeys = {
  addFoodLog: ['food_log', 'add'] as const,
  updateFoodLog: ['food_log', 'update'] as const,
  deleteFoodLog: ['food_log', 'delete'] as const,
  upsertDailyTargets: ['daily_targets', 'upsert'] as const,
  createFood: ['foods', 'create'] as const,
  addWorkoutLog: ['workout_log', 'add'] as const,
  updateWorkoutLog: ['workout_log', 'update'] as const,
  deleteWorkoutLog: ['workout_log', 'delete'] as const,
}
