import { useCallback, useEffect, useRef } from 'react'

/**
 * Best-effort screen wake lock for the routine player. Keeps the phone screen on
 * while a workout runs. Entirely optional: unsupported browsers are a no-op, and
 * the lock is re-acquired on `visibilitychange → visible` (the OS releases it
 * when the tab is hidden). Released on `release()` / unmount.
 */
type WakeLockSentinelLike = { release: () => Promise<void> }
type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> }
}

export function useWakeLock() {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null)
  const wantRef = useRef(false)

  const request = useCallback(async () => {
    wantRef.current = true
    const nav = navigator as WakeLockNavigator
    if (!nav.wakeLock) return
    try {
      sentinelRef.current = await nav.wakeLock.request('screen')
    } catch {
      /* ignore — best effort */
    }
  }, [])

  const release = useCallback(async () => {
    wantRef.current = false
    try {
      await sentinelRef.current?.release()
    } catch {
      /* ignore */
    }
    sentinelRef.current = null
  }, [])

  // Re-acquire when the tab becomes visible again (OS drops it when hidden).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && wantRef.current) {
        void request()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      void release()
    }
  }, [request, release])

  return { request, release }
}
