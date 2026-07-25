// Headless palette module.
//
// A palette is a named set of colour tokens; the theme (light/dark) is a
// separate axis on top of it, so every palette ships both variants. Which
// palette is active is a pure function of the user's last explicit choice, with
// Paper as the fallback. No DOM, no storage, no React — the adapter hook does
// all of that. The token values themselves live in src/index.css, keyed by
// `[data-palette]`; this module only names the palettes.

export const PALETTES = [
  { id: 'paper', label: 'Paper' },
  { id: 'graphite', label: 'Graphite' },
] as const

export type Palette = (typeof PALETTES)[number]['id']

/** The palette used when the user has never chosen one. */
export const DEFAULT_PALETTE: Palette = 'paper'

/** Storage key holding the user's explicit choice, if they have made one. */
export const PALETTE_KEY = 'boxcraft:palette'

/**
 * The tokens a palette preview swatch shows, surface-to-ink: page, panel,
 * border, accent, text. Five boxes is enough to tell two palettes apart
 * without turning the picker into a colour reference.
 */
export const SWATCH_TOKENS = [
  '--bg',
  '--panel',
  '--line',
  '--accent',
  '--text',
] as const

export function isPalette(value: unknown): value is Palette {
  return PALETTES.some(function matches(palette) {
    return palette.id === value
  })
}

/**
 * The palette to start in. An explicit stored choice always wins; anything
 * unrecognised in storage counts as no choice.
 */
export function initialPalette(stored: string | null): Palette {
  return isPalette(stored) ? stored : DEFAULT_PALETTE
}

export function paletteLabel(palette: Palette): string {
  return (
    PALETTES.find(function byId(entry) {
      return entry.id === palette
    })?.label ?? palette
  )
}
