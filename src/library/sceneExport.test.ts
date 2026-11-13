import { describe, expect, it } from 'vitest'
import { instrument } from '@/scene/document'
import { sceneBlob, sceneFilename, sceneHtml, slugify } from './sceneExport'

const SOURCE = `<!doctype html>
<html><head><style>.box-1 { color: red; }</style></head>
<body><div class="canvas"><div class="box-1"></div></div></body></html>`

describe('slugify', () => {
  it('lowercases a title and joins its words with dashes', () => {
    expect(slugify('Neon Ring')).toBe('neon-ring')
  })

  it('folds accents to their base letters', () => {
    expect(slugify('Café Crème')).toBe('cafe-creme')
  })

  it('collapses runs of punctuation and trims the ends', () => {
    expect(slugify('  --Glow!! / button (v2)--  ')).toBe('glow-button-v2')
  })

  it('falls back to "scene" when nothing usable is left', () => {
    expect(slugify('')).toBe('scene')
    expect(slugify('   ')).toBe('scene')
    expect(slugify('✨🎨')).toBe('scene')
  })

  it('caps the length without leaving a trailing dash', () => {
    const slug = slugify(`${'a'.repeat(59)} b`)
    expect(slug.length).toBeLessThanOrEqual(60)
    expect(slug.endsWith('-')).toBe(false)
  })
})

describe('sceneFilename', () => {
  it('names the file after the title', () => {
    expect(sceneFilename('Gradient card')).toBe('gradient-card.html')
  })

  it('names an untitled scene "scene.html"', () => {
    expect(sceneFilename('')).toBe('scene.html')
  })
})

describe('sceneHtml', () => {
  it('passes a clean source through byte-identical', () => {
    expect(sceneHtml(SOURCE)).toBe(SOURCE)
  })

  it('strips render-only instrumentation', () => {
    expect(instrument(SOURCE)).not.toBe(SOURCE)
    expect(sceneHtml(instrument(SOURCE))).toBe(SOURCE)
  })
})

describe('sceneBlob', () => {
  it('is an HTML blob holding the clean document', async () => {
    const blob = sceneBlob(instrument(SOURCE))
    expect(blob.type).toBe('text/html')
    expect(await blob.text()).toBe(SOURCE)
  })
})
