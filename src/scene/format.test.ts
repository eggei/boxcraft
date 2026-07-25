import { describe, expect, it } from 'vitest'
import { DEFAULT_SOURCE } from '@/scenes/sceneList'
import { createBox } from './document'
import { formatSource, isFormatted } from './format'

/** Strip every line's leading whitespace — the worst input a format can get. */
function flatten(source: string): string {
  return source
    .split('\n')
    .map((line) => line.trimStart())
    .join('\n')
}

describe('formatSource', () => {
  it('leaves an already-formatted document byte-identical', () => {
    expect(formatSource(DEFAULT_SOURCE)).toBe(DEFAULT_SOURCE)
  })

  it('restores the nesting indentation of a flattened document', () => {
    expect(formatSource(flatten(DEFAULT_SOURCE))).toBe(DEFAULT_SOURCE)
  })

  it('pulls over-indented lines back in', () => {
    const overIndented = DEFAULT_SOURCE.split('\n')
      .map((line) => (line.trim() ? '        ' + line : line))
      .join('\n')

    expect(formatSource(overIndented)).toBe(DEFAULT_SOURCE)
  })

  it('changes only whitespace, never the rendered document', () => {
    const messy = flatten(createBox(DEFAULT_SOURCE, { kind: 'point', x: 20, y: 30 }).source)
    const parse = (s: string) =>
      new DOMParser().parseFromString(s, 'text/html').body.innerHTML.replace(/\s+/g, ' ')

    expect(parse(formatSource(messy))).toBe(parse(messy))
  })

  it('is idempotent — formatting twice is formatting once', () => {
    const once = formatSource(flatten(DEFAULT_SOURCE))

    expect(formatSource(once)).toBe(once)
  })

  it('handles an empty document without throwing', () => {
    expect(formatSource('')).toBe('')
  })
})

describe('isFormatted', () => {
  it('is true for a document already at its formatted shape', () => {
    expect(isFormatted(DEFAULT_SOURCE)).toBe(true)
  })

  it('is false once a line is indented wrongly', () => {
    expect(isFormatted(flatten(DEFAULT_SOURCE))).toBe(false)
  })
})
