import { describe, expect, it } from 'vitest'
import { DEFAULT_SOURCE } from './useScene'
import { createBox } from './document'

/**
 * Parse a document's HTML the way the render adapter will, so assertions read
 * behavior (what ends up in the scene) rather than string internals.
 */
function parse(source: string): Document {
  return new DOMParser().parseFromString(source, 'text/html')
}

describe('createBox', () => {
  it('drops a div into the canvas with a generated class', () => {
    const { source, className } = createBox(DEFAULT_SOURCE, {
      kind: 'point',
      x: 20,
      y: 30,
    })

    expect(className).toBe('box-1')

    const doc = parse(source)
    const canvas = doc.querySelector('.canvas')
    const box = doc.querySelector('.box-1')
    expect(box).not.toBeNull()
    // The box is a child of the canvas, never a sibling.
    expect(box?.parentElement).toBe(canvas)
    expect(box?.tagName).toBe('DIV')
  })

  it('appends a canvas-relative starter rule to the end of <style>', () => {
    const { source } = createBox(DEFAULT_SOURCE, { kind: 'point', x: 20, y: 30 })

    const doc = parse(source)
    const styleText = doc.querySelector('style')?.textContent ?? ''

    // The rule exists and carries the absolute-position starter properties.
    expect(styleText).toMatch(/\.box-1\s*\{/)
    expect(styleText).toMatch(/position:\s*absolute/)
    expect(styleText).toMatch(/left:\s*20px/)
    expect(styleText).toMatch(/top:\s*30px/)
    expect(styleText).toMatch(/width:\s*100px/)
    expect(styleText).toMatch(/height:\s*100px/)
    expect(styleText).toMatch(/background:/)

    // Appended after the seeded .canvas rule, not before it.
    expect(styleText.indexOf('.box-1')).toBeGreaterThan(
      styleText.indexOf('.canvas'),
    )
  })

  it('sizes a box to the marquee rect when given one', () => {
    const { source } = createBox(DEFAULT_SOURCE, {
      kind: 'rect',
      left: 12,
      top: 8,
      width: 220,
      height: 140,
    })

    const styleText = parse(source).querySelector('style')?.textContent ?? ''
    expect(styleText).toMatch(/left:\s*12px/)
    expect(styleText).toMatch(/top:\s*8px/)
    expect(styleText).toMatch(/width:\s*220px/)
    expect(styleText).toMatch(/height:\s*140px/)
  })

  it('lands the cursor on an empty line inside the new rule', () => {
    const { source, cursor } = createBox(DEFAULT_SOURCE, {
      kind: 'point',
      x: 0,
      y: 0,
    })

    const ruleStart = source.indexOf('.box-1')
    const ruleBodyOpen = source.indexOf('{', ruleStart)
    const ruleBodyClose = source.indexOf('}', ruleStart)

    // Cursor sits inside the rule body...
    expect(cursor).toBeGreaterThan(ruleBodyOpen)
    expect(cursor).toBeLessThan(ruleBodyClose)
    // ...past every generated property, ready to type the next one.
    expect(cursor).toBeGreaterThan(source.indexOf('background:'))
    // ...and on its own blank, indented line (not mid-token).
    expect(source.slice(0, cursor)).toMatch(/\n[ \t]*$/)
  })

  it('numbers boxes by the highest existing box number', () => {
    const first = createBox(DEFAULT_SOURCE, { kind: 'point', x: 0, y: 0 })
    const second = createBox(first.source, { kind: 'point', x: 10, y: 10 })

    expect(second.className).toBe('box-2')

    const doc = parse(second.source)
    expect(doc.querySelectorAll('.canvas > div')).toHaveLength(2)
    expect(doc.querySelector('.box-2')).not.toBeNull()
  })
})
