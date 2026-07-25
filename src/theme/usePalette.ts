import { useCallback, useEffect, useState } from 'react'
import { initialPalette, PALETTE_KEY, type Palette } from './palette'

// Storage can throw (private mode, blocked cookies); a missing preference is
// never worth failing the app over, so both directions degrade to no-op.
function readStoredPalette(): string | null {
  try {
    return localStorage.getItem(PALETTE_KEY)
  } catch {
    return null
  }
}

function storePalette(palette: Palette) {
  try {
    localStorage.setItem(PALETTE_KEY, palette)
  } catch {
    // ignore
  }
}

/**
 * React/DOM adapter over the pure palette module: holds the active palette and
 * mirrors it onto <html data-palette>, which is what the token blocks in
 * index.css key off. Choosing a palette is always explicit, so every change is
 * persisted.
 *
 * The pre-paint script in index.html sets the same attribute up front so the
 * page never flashes the default palette. Keep the two in sync.
 */
export function usePalette() {
  const [palette, setPalette] = useState<Palette>(function resolveInitial() {
    return initialPalette(readStoredPalette())
  })

  useEffect(
    function applyPalette() {
      document.documentElement.dataset.palette = palette
    },
    [palette],
  )

  const select = useCallback(function select(next: Palette) {
    storePalette(next)
    setPalette(next)
  }, [])

  return { palette, select }
}
