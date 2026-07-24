import { useCallback, useEffect, useState } from 'react'
import { initialTheme, THEME_KEY, toggleTheme, type Theme } from './theme'

function prefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

// Storage can throw (private mode, blocked cookies); a missing preference is
// never worth failing the app over, so both directions degrade to no-op.
function readStoredTheme(): string | null {
  try {
    return localStorage.getItem(THEME_KEY)
  } catch {
    return null
  }
}

function storeTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // ignore
  }
}

/**
 * React/DOM adapter over the pure theme module: holds the active theme and
 * mirrors it onto <html> — the `dark` class is what Tailwind's dark variant
 * keys off, and `color-scheme` makes native UI (scrollbars, form controls)
 * follow along. The initial value comes from storage or the OS; toggling is an
 * explicit choice and is persisted.
 *
 * The pre-paint script in index.html applies the same class up front so the
 * page never flashes light before React mounts. Keep the two in sync.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(function resolveInitial() {
    return initialTheme(readStoredTheme(), prefersDark())
  })

  useEffect(
    function applyTheme() {
      const root = document.documentElement
      root.classList.toggle('dark', theme === 'dark')
      root.style.colorScheme = theme
    },
    [theme],
  )

  const toggle = useCallback(function toggle() {
    setTheme(function flip(current) {
      const next = toggleTheme(current)
      storeTheme(next)
      return next
    })
  }, [])

  return { theme, toggle }
}
