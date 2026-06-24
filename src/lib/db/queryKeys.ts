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
}
