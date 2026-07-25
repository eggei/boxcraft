import { describe, expect, it } from 'vitest'
import { initialTheme, isTheme, THEMES, toggleTheme } from './theme'

describe('THEMES', () => {
  it('offers exactly light and dark', () => {
    expect(THEMES).toEqual(['light', 'dark'])
  })
})

describe('isTheme', () => {
  it('accepts the two themes and rejects anything else', () => {
    expect(isTheme('light')).toBe(true)
    expect(isTheme('dark')).toBe(true)
    expect(isTheme('system')).toBe(false)
    expect(isTheme(null)).toBe(false)
    expect(isTheme(undefined)).toBe(false)
  })
})

describe('initialTheme', () => {
  it('prefers an explicit stored choice over the OS preference', () => {
    expect(initialTheme('light', true)).toBe('light')
    expect(initialTheme('dark', false)).toBe('dark')
  })

  it('falls back to the OS preference with nothing stored', () => {
    expect(initialTheme(null, true)).toBe('dark')
    expect(initialTheme(null, false)).toBe('light')
  })

  it('treats an unrecognised stored value as no choice', () => {
    expect(initialTheme('midnight', true)).toBe('dark')
    expect(initialTheme('', false)).toBe('light')
  })
})

describe('toggleTheme', () => {
  it('flips between the two themes', () => {
    expect(toggleTheme('light')).toBe('dark')
    expect(toggleTheme('dark')).toBe('light')
  })

  it('round-trips back to where it started', () => {
    for (const theme of THEMES) {
      expect(toggleTheme(toggleTheme(theme))).toBe(theme)
    }
  })
})
