import { useCallback, useEffect, useState } from 'react'

/**
 * A Set<string> mirrored to localStorage under `key`. For lightweight UI state
 * that should survive a reload (e.g. shopping-list checks, plan defers) without
 * a server round-trip. Per-device by design — the derived content it annotates
 * (DASH goals, the log) still syncs via Supabase.
 *
 * Reads lazily on mount, reloads when `key` changes (e.g. the planned date rolls
 * over), and writes on every mutation. All storage access is guarded so a
 * disabled/full localStorage degrades to in-memory only.
 */
function read(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key)
    const arr = raw ? JSON.parse(raw) : []
    return new Set(
      Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [],
    )
  } catch {
    return new Set()
  }
}

function write(key: string, set: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify([...set]))
  } catch {
    /* storage unavailable/full — keep working in-memory */
  }
}

export function usePersistentSet(key: string) {
  const [set, setSet] = useState<Set<string>>(() => read(key))

  // Reload when the key changes (writes only happen in the handlers below, so
  // there's no effect-ordering race that could clobber the new key's value).
  useEffect(() => {
    setSet(read(key))
  }, [key])

  const toggle = useCallback(
    (value: string, on?: boolean) => {
      setSet((prev) => {
        const next = new Set(prev)
        const want = on ?? !next.has(value)
        if (want) next.add(value)
        else next.delete(value)
        write(key, next)
        return next
      })
    },
    [key],
  )

  const clear = useCallback(() => {
    setSet(() => {
      const next = new Set<string>()
      write(key, next)
      return next
    })
  }, [key])

  return { set, toggle, clear }
}
