// Headless theme module.
//
// The app has two themes. Which one is active is a pure function of the user's
// last explicit choice (if any) and the OS preference as the fallback. No DOM,
// no storage, no React — the adapter hook does all of that.

export const THEMES = ['light', 'dark'] as const

export type Theme = (typeof THEMES)[number]

/** Storage key holding the user's explicit choice, if they have made one. */
export const THEME_KEY = 'boxcraft:theme'

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark'
}

/**
 * The theme to start in. An explicit stored choice always wins; otherwise the
 * OS preference decides. Anything unrecognised in storage counts as no choice.
 */
export function initialTheme(
  stored: string | null,
  prefersDark: boolean,
): Theme {
  if (isTheme(stored)) return stored
  return prefersDark ? 'dark' : 'light'
}

export function toggleTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark'
}
