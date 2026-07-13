import { describe, it, expect } from 'vitest'
import { attachJs } from './attach-js'

// A scene mirroring the seed: a box on the canvas and one shared <script> at
// the end of <body> holding user code.
const SCENE = `<!doctype html>
<html>
  <head>
    <style>
      .box-1 { position: absolute; }
    </style>
  </head>
  <body>
    <div class="canvas">
      <div class="box-1"></div>
    </div>
    <script>
      console.log('BoxCraft scene loaded');
    </script>
  </body>
</html>
`

// A scene with a box but no <script> at all.
const NO_SCRIPT = `<!doctype html>
<html>
  <head>
    <style>
      .box-1 { position: absolute; }
    </style>
  </head>
  <body>
    <div class="canvas">
      <div class="box-1"></div>
    </div>
  </body>
</html>
`

describe('attachJs', () => {
  it("adds a real id to the box's opening tag", () => {
    const { source } = attachJs(SCENE, 'box-1')
    expect(source).toContain('<div class="box-1" id="box-1"></div>')
  })

  it('generates a getElementById wiring line with the auto-derived var name', () => {
    const { source } = attachJs(SCENE, 'box-1')
    expect(source).toContain("const box1 = document.getElementById('box-1');")
  })

  it('appends the wiring into the existing shared <script>, not a second one', () => {
    const { source } = attachJs(SCENE, 'box-1')
    // The user's existing script code is preserved and only one <script> exists.
    expect(source).toContain("console.log('BoxCraft scene loaded');")
    expect(source.match(/<script>/g)).toHaveLength(1)
  })

  it('lands the cursor on an empty indented line just below the wiring', () => {
    const { source, cursorOffset } = attachJs(SCENE, 'box-1')

    const wiringEnd = source.indexOf("getElementById('box-1');") + "getElementById('box-1');".length
    // Cursor sits after the wiring line, inside the script...
    expect(cursorOffset).toBeGreaterThan(wiringEnd)
    expect(cursorOffset).toBeLessThan(source.indexOf('</script>'))
    // ...on an empty whitespace line, ready to type real code (not mid-line).
    expect(source.slice(0, cursorOffset)).toMatch(/\n[ \t]*$/)
  })

  it('does not duplicate the id or the const line when re-attaching', () => {
    const once = attachJs(SCENE, 'box-1').source
    const { source: twice } = attachJs(once, 'box-1')

    expect(twice.match(/id="box-1"/g)).toHaveLength(1)
    expect(twice.match(/getElementById\('box-1'\)/g)).toHaveLength(1)
  })

  it('creates a shared <script> at the end of <body> when none exists', () => {
    const { source } = attachJs(NO_SCRIPT, 'box-1')

    expect(source).toContain("const box1 = document.getElementById('box-1');")
    expect(source.match(/<script>/g)).toHaveLength(1)
    // The script lands inside the body, before </body>.
    expect(source.indexOf('<script>')).toBeLessThan(source.indexOf('</body>'))
    expect(source.indexOf('</div>')).toBeLessThan(source.indexOf('<script>'))
  })

  it('preserves quirky surrounding formatting verbatim (never reserializes)', () => {
    const quirky =
      '<html><head><style>.box-1{position:absolute}</style></head><body>' +
      '<div  class="canvas"><div class="box-1"></div></div>' +
      '<script>console.log("hi")</script></body></html>'

    const { source } = attachJs(quirky, 'box-1')

    // Untouched fragments survive byte-for-byte.
    expect(source).toContain('<style>.box-1{position:absolute}</style>')
    expect(source).toContain('<div  class="canvas">')
    expect(source).toContain('console.log("hi")')
    // Only additions: the id and the wiring line.
    expect(source).toContain('<div class="box-1" id="box-1">')
    expect(source).toContain("const box1 = document.getElementById('box-1');")
  })

  it('reports re-attach and points the cursor at the existing wiring line', () => {
    const once = attachJs(SCENE, 'box-1').source
    const result = attachJs(once, 'box-1')

    expect(result.alreadyAttached).toBe(true)
    // The cursor lands on the existing const line (no new edit needed).
    const lineStart = once.lastIndexOf('\n', result.cursorOffset) + 1
    expect(once.slice(lineStart)).toMatch(/^\s*const box1 = document\.getElementById\('box-1'\);/)
  })
})
