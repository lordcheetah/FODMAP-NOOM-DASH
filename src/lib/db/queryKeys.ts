/**
 * Central TanStack Query key factory for the meals data layer.
 * Keeps invalidation targets consistent across hooks.
 */
export const queryKeys = {
  foodSearch: (term: string) => ['foodSearch', term] as const,
  recipeSearch: (term: string) => ['recipeSearch', term] as const,
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
  schedule: (name?: string) => ['schedule', name ?? 'default'] as const,
  workoutLog: (userId: string | undefined, date: string) =>
    ['workoutLog', userId, date] as const,
  workoutLogHistory: (userId: string | undefined) =>
    ['workoutLogHistory', userId] as const,
}
