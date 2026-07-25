import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PALETTE,
  initialPalette,
  isPalette,
  PALETTES,
  paletteLabel,
  SWATCH_TOKENS,
} from './palette'

describe('PALETTES', () => {
  it('offers Paper and Graphite', () => {
    expect(PALETTES.map((palette) => palette.id)).toEqual([
      'paper',
      'graphite',
    ])
  })

  it('labels every palette', () => {
    for (const palette of PALETTES) {
      expect(palette.label).toBeTruthy()
    }
  })

  it('defaults to one of the palettes on offer', () => {
    expect(isPalette(DEFAULT_PALETTE)).toBe(true)
  })
})

describe('SWATCH_TOKENS', () => {
  it('previews four to five tokens', () => {
    expect(SWATCH_TOKENS.length).toBeGreaterThanOrEqual(4)
    expect(SWATCH_TOKENS.length).toBeLessThanOrEqual(5)
  })

  it('names custom properties, since the preview resolves them via var()', () => {
    for (const token of SWATCH_TOKENS) {
      expect(token).toMatch(/^--[a-z-]+$/)
    }
  })
})

describe('isPalette', () => {
  it('accepts the palettes on offer and rejects anything else', () => {
    expect(isPalette('paper')).toBe(true)
    expect(isPalette('graphite')).toBe(true)
    expect(isPalette('dark')).toBe(false)
    expect(isPalette(null)).toBe(false)
    expect(isPalette(undefined)).toBe(false)
  })
})

describe('initialPalette', () => {
  it('prefers an explicit stored choice', () => {
    expect(initialPalette('graphite')).toBe('graphite')
    expect(initialPalette('paper')).toBe('paper')
  })

  it('treats nothing stored, or anything unrecognised, as no choice', () => {
    expect(initialPalette(null)).toBe(DEFAULT_PALETTE)
    expect(initialPalette('')).toBe(DEFAULT_PALETTE)
    expect(initialPalette('sepia')).toBe(DEFAULT_PALETTE)
  })
})

describe('paletteLabel', () => {
  it('resolves an id to its display label', () => {
    expect(paletteLabel('paper')).toBe('Paper')
    expect(paletteLabel('graphite')).toBe('Graphite')
  })
})
