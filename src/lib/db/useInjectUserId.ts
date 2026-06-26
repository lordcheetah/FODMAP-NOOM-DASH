import { useMemo } from 'react'
import type { UseMutationResult } from '@tanstack/react-query'
import { useAuth } from '@/lib/auth'

/**
 * Wrap a `useMutation` result so callers keep the EXISTING call signature
 * (`mutate(input)` / `mutateAsync(input)` with no `userId`) while the registered
 * default `mutationFn` receives `userId` in its variables.
 *
 * Why inject here instead of reading `useAuth()` inside the mutationFn: the
 * mutationFn runs outside React (on resume-after-reload, with no component
 * mounted), so it cannot use context. Capturing `userId` into the variables at
 * `mutate()` time means it is persisted WITH the paused mutation and is present
 * when the write replays.
 *
 * Generics: `TInput` is the public (userId-less) input components pass; `TVars`
 * is the internal variable type the registered default expects (must be
 * `TInput & { userId: string }`). Throws at call time when signed out, matching
 * the old "Not signed in." guard.
 */
export function useInjectUserId<
  TData,
  TError,
  TInput,
  TVars extends TInput & { userId: string },
  TContext,
>(
  result: UseMutationResult<TData, TError, TVars, TContext>,
): UseMutationResult<TData, TError, TInput, TContext> {
  const { user } = useAuth()
  const userId = user?.id

  return useMemo(() => {
    const withUser = (input: TInput): TVars => {
      if (!userId) throw new Error('Not signed in.')
      return { ...input, userId } as unknown as TVars
    }
    return {
      ...result,
      mutate: (input: TInput, options?: Parameters<typeof result.mutate>[1]) =>
        result.mutate(withUser(input), options),
      mutateAsync: (
        input: TInput,
        options?: Parameters<typeof result.mutateAsync>[1],
      ) => result.mutateAsync(withUser(input), options),
    } as unknown as UseMutationResult<TData, TError, TInput, TContext>
    // result identity changes on each render of useMutation; depend on it +
    // userId so the wrapper tracks the latest mutation state.
  }, [result, userId])
}
