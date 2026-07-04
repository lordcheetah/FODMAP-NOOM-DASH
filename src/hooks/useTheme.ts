import { useCallback, useState } from 'react'

export type Theme = 'light' | 'dark'

/** The theme currently applied to <html> (set pre-paint by the index.html script). */
function currentTheme(): Theme {
  return typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark')
    ? 'dark'
    : 'light'
}

/**
 * Light/dark theme toggle. Reads the class the pre-paint script already applied
 * (from a saved choice or the system preference), and on change flips the `.dark`
 * class on <html> and persists the choice. Tailwind is configured `darkMode:
 * 'class'`, so all semantic tokens follow.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => currentTheme())

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    document.documentElement.classList.toggle('dark', next === 'dark')
    try {
      localStorage.setItem('theme', next)
    } catch {
      /* storage unavailable — in-memory only for this session */
    }
  }, [])

  const toggle = useCallback(
    () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark'),
    [setTheme],
  )

  return { theme, setTheme, toggle }
}
