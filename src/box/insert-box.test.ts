import { describe, it, expect } from 'vitest'
import { insertBox } from './insert-box'

// A minimal but realistic scene: a <style> to receive the rule and a .canvas
// to receive the <div>. Boxes are always children of the canvas (DESIGN.md §6).
const SCENE = `<!doctype html>
<html>
  <head>
    <style>
      .canvas { position: relative; width: 400px; height: 400px; }
    </style>
  </head>
  <body>
    <div class="canvas"></div>
  </body>
</html>
`

describe('insertBox', () => {
  it('inserts a <div class="box-1"> as a child of the canvas', () => {
    const { source } = insertBox(SCENE, { x: 10, y: 20, width: 100, height: 80 })

    // The new div lives inside the canvas element, before its closing tag.
    const canvasContent = source.slice(
      source.indexOf('<div class="canvas">') + '<div class="canvas">'.length,
      source.indexOf('</div>\n  </body>'),
    )
    expect(canvasContent).toContain('<div class="box-1">')
  })

  it('appends a .box-1 rule to the end of <style>', () => {
    const { source } = insertBox(SCENE, { x: 10, y: 20, width: 100, height: 80 })

    // The new rule sits inside <style>, after the existing .canvas rule.
    const styleContent = source.slice(
      source.indexOf('<style>') + '<style>'.length,
      source.indexOf('</style>'),
    )
    expect(styleContent).toContain('.box-1 {')
    expect(styleContent.indexOf('.canvas')).toBeLessThan(styleContent.indexOf('.box-1'))
  })

  it('writes the rect as canvas-relative absolute-position declarations', () => {
    const { source } = insertBox(SCENE, { x: 10, y: 20, width: 100, height: 80 })

    const rule = source.slice(source.indexOf('.box-1 {'), source.indexOf('}', source.indexOf('.box-1 {')))
    expect(rule).toContain('position: absolute;')
    expect(rule).toContain('left: 10px;')
    expect(rule).toContain('top: 20px;')
    expect(rule).toContain('width: 100px;')
    expect(rule).toContain('height: 80px;')
    // Auto background so the box is instantly visible (DESIGN.md §7).
    expect(rule).toMatch(/background:\s*\S+;/)
  })

  it('numbers the next box from the highest existing box in the document', () => {
    const withBoxes = SCENE.replace(
      '<div class="canvas"></div>',
      '<div class="canvas"><div class="box-1"></div><div class="box-2"></div></div>',
    )

    const { source } = insertBox(withBoxes, { x: 0, y: 0, width: 50, height: 50 })

    expect(source).toContain('<div class="box-3">')
    expect(source).toContain('.box-3 {')
    // The earlier boxes are untouched — still exactly one of each.
    expect(source.match(/class="box-1"/g)).toHaveLength(1)
  })

  it('preserves the surrounding document verbatim (never reserializes)', () => {
    // Deliberately quirky, non-canonical formatting: single-line style,
    // tabs, weird spacing, a comment, a trailing script. If any of this
    // survives unchanged, the transform is splicing text — not parsing and
    // re-emitting the whole document.
    const quirky = [
      '<!DOCTYPE html>',
      '<html><head>',
      '<style>body{margin:0}\t.canvas{position:relative;width:400px;height:400px}</style>',
      '</head><body>',
      '<!-- craft below -->',
      '<div  class="canvas"  ></div>',
      '<script>console.log("hi")</script>',
      '</body></html>',
    ].join('\n')

    const { source } = insertBox(quirky, { x: 5, y: 6, width: 7, height: 8 })

    expect(source).toContain('<style>body{margin:0}\t.canvas{position:relative;width:400px;height:400px}')
    expect(source).toContain('<!-- craft below -->')
    expect(source).toContain('<div  class="canvas"  >')
    expect(source).toContain('<script>console.log("hi")</script>')
    // Only additions: removing the two inserted fragments restores the original.
    expect(source).toContain('<div class="box-1"></div>')
    expect(source).toContain('.box-1 {')
  })

  it('returns a cursor offset inside the new rule, past its last property', () => {
    const { source, cursorOffset } = insertBox(SCENE, { x: 10, y: 20, width: 100, height: 80 })

    const ruleOpen = source.indexOf('.box-1 {')
    const ruleClose = source.indexOf('}', ruleOpen)
    // Cursor is within the braces...
    expect(cursorOffset).toBeGreaterThan(ruleOpen)
    expect(cursorOffset).toBeLessThan(ruleClose)
    // ...and after the generated properties, ready to type the next one.
    expect(cursorOffset).toBeGreaterThan(source.indexOf('background:'))
    // The text right before the cursor is whitespace on an empty line, not
    // mid-declaration — so typing lands a fresh property.
    expect(source.slice(0, cursorOffset)).toMatch(/\n[ \t]*$/)
  })
})
