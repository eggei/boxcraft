import { describe, expect, it } from 'vitest'
import { DEFAULT_SOURCE } from '@/scenes/sceneList'
import {
  attachJs,
  boxAtOffset,
  createBox,
  createBoxProblem,
  detachJs,
  ensureRule,
  instrument,
  listBoxes,
  rename,
  resolveTokens,
  ruleRangeOf,
  serialize,
  validateBoxName,
  type BoxPlacement,
} from './document'
import { isFormatted } from './format'

/** createBox in a document that can take a box; fails the test otherwise. */
function placeBox(source: string, placement: BoxPlacement) {
  const result = createBox(source, placement)
  if (!result.ok) throw new Error(`createBox failed: ${result.problem}`)
  return result
}

/** DEFAULT_SOURCE with `n` boxes created in order, for identity-layer tests. */
function withBoxes(n: number): string {
  let source = DEFAULT_SOURCE
  for (let i = 0; i < n; i++) {
    source = placeBox(source, { kind: 'point', x: i * 10, y: i * 10 }).source
  }
  return source
}

/**
 * Parse a document's HTML the way the render adapter will, so assertions read
 * behavior (what ends up in the scene) rather than string internals.
 */
function parse(source: string): Document {
  return new DOMParser().parseFromString(source, 'text/html')
}

describe('createBox', () => {
  it('drops a div into the canvas with a generated class', () => {
    const { source, className } = placeBox(DEFAULT_SOURCE, {
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
    const { source } = placeBox(DEFAULT_SOURCE, { kind: 'point', x: 20, y: 30 })

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
    const { source } = placeBox(DEFAULT_SOURCE, {
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
    const { source, cursor } = placeBox(DEFAULT_SOURCE, {
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

  it('puts the box on its own indented line when the canvas is a one-liner', () => {
    // DEFAULT_SOURCE's canvas is `<div class="canvas"></div>` on one line.
    const once = placeBox(DEFAULT_SOURCE, { kind: 'point', x: 0, y: 0 }).source
    expect(once).toContain(
      '    <div class="canvas">\n      <div class="box-1"></div>\n    </div>\n',
    )

    // A second box goes below the first, the closing tag staying put.
    const twice = placeBox(once, { kind: 'point', x: 0, y: 0 }).source
    expect(twice).toContain(
      '    <div class="canvas">\n' +
        '      <div class="box-1"></div>\n' +
        '      <div class="box-2"></div>\n' +
        '    </div>\n',
    )
  })

  it('indents the new rule one level inside <style>, closing tag untouched', () => {
    const { source } = placeBox(DEFAULT_SOURCE, { kind: 'point', x: 0, y: 0 })
    expect(source).toContain(
      '      .canvas { position: relative; width: 400px; height: 400px; background: #fff; }\n' +
        '      .box-1 {\n' +
        '        position: absolute;\n',
    )
    expect(source).toContain('        background: #4f46e5;\n        \n      }\n    </style>')
  })

  it('generates code already in formatted shape, bar the landing line', () => {
    let source = DEFAULT_SOURCE
    for (let i = 0; i < 2; i++) {
      source = placeBox(source, { kind: 'point', x: 0, y: 0 }).source
      // What the editor does with the landing line once it is left unused.
      source = source.replace(/\n[ \t]+\n/, '\n')
      expect(isFormatted(source)).toBe(true)
    }
  })

  it('numbers boxes by the highest existing box number', () => {
    const first = placeBox(DEFAULT_SOURCE, { kind: 'point', x: 0, y: 0 })
    const second = placeBox(first.source, { kind: 'point', x: 10, y: 10 })

    expect(second.className).toBe('box-2')

    const doc = parse(second.source)
    expect(doc.querySelectorAll('.canvas > div')).toHaveLength(2)
    expect(doc.querySelector('.box-2')).not.toBeNull()
  })
})

describe('createBox without somewhere to draw', () => {
  const point: BoxPlacement = { kind: 'point', x: 0, y: 0 }

  it('reports a missing canvas instead of throwing', () => {
    const source = DEFAULT_SOURCE.replace('<div class="canvas"></div>', '<div></div>')
    expect(createBox(source, point)).toEqual({ ok: false, problem: 'no-canvas' })
    expect(createBoxProblem(source)).toBe('no-canvas')
  })

  it('reports a canvas that is still missing its closing tag', () => {
    const source = DEFAULT_SOURCE.replace(
      '<div class="canvas"></div>\n  </body>\n</html>\n',
      '<div class="canvas">',
    )
    expect(createBox(source, point)).toEqual({ ok: false, problem: 'unterminated-canvas' })
  })

  it('reports a missing <style> block', () => {
    const source = DEFAULT_SOURCE.replace(/<style>[\s\S]*<\/style>/, '')
    expect(createBox(source, point)).toEqual({ ok: false, problem: 'no-style' })
    expect(createBoxProblem(source)).toBe('no-style')
  })

  it('reports no problem for a drawable document', () => {
    expect(createBoxProblem(DEFAULT_SOURCE)).toBeNull()
  })
})

describe('listBoxes', () => {
  it('lists every box in document order with its public class', () => {
    const boxes = listBoxes(withBoxes(2))
    expect(boxes.map((b) => b.className)).toEqual(['box-1', 'box-2'])
  })

  it('gives each box a stable handle that is not its public class', () => {
    const boxes = listBoxes(withBoxes(2))
    const handles = boxes.map((b) => b.handle)

    // Handles are distinct and opaque (not the user-facing class name)...
    expect(new Set(handles).size).toBe(2)
    expect(handles).not.toContain('box-1')
    // ...and never leak into the document itself.
    const source = withBoxes(2)
    for (const handle of handles) expect(source).not.toContain(handle)
  })

  it('returns no boxes for a bare canvas', () => {
    expect(listBoxes(DEFAULT_SOURCE)).toEqual([])
  })
})

describe('canvas and box scanning', () => {
  /** A scene whose body is `body`, with one rule per class in `classes`. */
  const scene = (body: string, classes: string[] = []) => `<!doctype html>
<html>
  <head>
    <style>
${classes.map((c) => `      .${c} { color: red; }`).join('\n')}
    </style>
  </head>
  <body>
    ${body}
  </body>
</html>
`

  it('treats any element directly under the canvas as a box, not just divs', () => {
    const source = scene(
      '<div class="canvas"><span class="box-1"></span><section class="box-2"></section></div>',
    )
    expect(listBoxes(source).map((b) => b.className)).toEqual(['box-1', 'box-2'])

    const doc = parse(instrument(source))
    expect(doc.querySelector('span.box-1')?.getAttribute('data-bc')).toBe('bx_1')
    expect(doc.querySelector('section.box-2')?.getAttribute('data-bc')).toBe('bx_2')
  })

  it("finds a canvas whose class is single-quoted or unquoted", () => {
    const single = scene(`<div class='canvas'><div class='box-1'></div></div>`)
    const bare = scene('<div class=canvas><div class=box-1></div></div>')

    for (const source of [single, bare]) {
      expect(listBoxes(source).map((b) => b.className)).toEqual(['box-1'])
      const doc = parse(placeBox(source, { kind: 'point', x: 0, y: 0 }).source)
      expect(doc.querySelector('.box-2')?.parentElement).toBe(doc.querySelector('.canvas'))
    }
  })

  it('matches the canvas by whole class token only', () => {
    const source = scene(
      '<div class="canvas-wrap"><div class="box-9"></div></div>' +
        '<div class="stage canvas"><div class="box-1"></div></div>',
    )
    expect(listBoxes(source).map((b) => b.className)).toEqual(['box-1'])
  })

  it("counts only the canvas's direct children, not nested elements", () => {
    const source = scene(
      '<div class="canvas"><div class="box-1"><div class="eye"></div><span class="pupil"></span></div><div class="box-2"></div></div>',
    )
    expect(listBoxes(source).map((b) => b.className)).toEqual(['box-1', 'box-2'])
  })

  it('is not fooled by `<div` inside comments or attribute values', () => {
    const source = scene(
      '<div class="canvas"><!-- <div class="ghost"> --><div class="box-1" title="<div>"></div></div>',
    )
    expect(listBoxes(source).map((b) => b.className)).toEqual(['box-1'])
    // ...and a new box still lands inside the canvas, after the real child.
    const placed = placeBox(source, { kind: 'point', x: 0, y: 0 }).source
    expect(parse(placed).querySelectorAll('.canvas > div')).toHaveLength(2)
  })

  it('renames and wires single-quoted boxes in place', () => {
    const source = scene(`<div class="canvas"><span class='box-1'></span></div>`, ['box-1'])
    const handle = listBoxes(source)[0].handle

    const renamed = rename(source, handle, 'hero').source
    expect(renamed).toContain(`<span class='hero'>`)
    expect(renamed).toContain('.hero {')

    const attached = attachJs(renamed, handle).source
    expect(parse(attached).querySelector('span.hero')?.id).toBe('hero')

    const detached = detachJs(attached, handle).source
    expect(detached).toContain(`<span class='hero'>`)
  })

  it('adds an id before the `/>` of a self-closing box', () => {
    const source = scene('<div class="canvas"><img class="box-1" /></div>', ['box-1'])
    const attached = attachJs(source, listBoxes(source)[0].handle).source
    expect(attached).toContain('<img class="box-1" id="box-1" />')
  })
})

describe('instrument / serialize', () => {
  it('tags each rendered box with its handle for hit-testing', () => {
    const source = withBoxes(2)
    const rendered = instrument(source)

    const doc = parse(rendered)
    const boxes = listBoxes(source)
    for (const box of boxes) {
      const el = doc.querySelector(`.${box.className}`)
      expect(el?.getAttribute('data-bc')).toBe(box.handle)
    }
  })

  it('never puts instrumentation in the authored source', () => {
    expect(withBoxes(2)).not.toContain('data-bc')
  })

  it('serializes back to the exact clean source (instrumentation stripped)', () => {
    const source = withBoxes(2)
    // Round-trip: rendering adds hit-test attrs; serializing removes them.
    expect(serialize(instrument(source))).toBe(source)
    expect(serialize(source)).toBe(source)
    expect(serialize(instrument(source))).not.toContain('data-bc')
  })
})

describe('resolveTokens', () => {
  const tokenFor = (source: string, className: string) =>
    resolveTokens(source).find((t) => t.className === className)

  it('chips a managed class that resolves to a live box', () => {
    const source = withBoxes(1)
    expect(tokenFor(source, 'box-1')?.resolved).toBe(true)
  })

  it('errors a managed class whose box <div> was deleted, rule left behind', () => {
    // Remove the box element but keep its `.box-1` rule in <style>.
    const source = withBoxes(1).replace('<div class="box-1"></div>\n    ', '')
    expect(source).not.toContain('class="box-1"')
    expect(source).toContain('.box-1 {')

    expect(tokenFor(source, 'box-1')?.resolved).toBe(false)
  })

  it('re-chips a box <div> typed back in by hand', () => {
    const orphaned = withBoxes(1).replace('<div class="box-1"></div>\n    ', '')
    const retyped = orphaned.replace(
      '<div class="canvas">',
      '<div class="canvas"><div class="box-1"></div>',
    )
    expect(tokenFor(retyped, 'box-1')?.resolved).toBe(true)
  })

  it('leaves user-invented classes alone — never chipped, never errored', () => {
    // A box carrying an extra user class, plus a free `.active` rule.
    const source = withBoxes(1)
      .replace('class="box-1"', 'class="box-1 active"')
      .replace('</style>', '  .active { outline: 1px solid red; }\n    </style>')

    expect(tokenFor(source, 'box-1')?.resolved).toBe(true)
    expect(tokenFor(source, 'active')).toBeUndefined()
  })

  it('points each token at real occurrences of the class name', () => {
    const token = tokenFor(withBoxes(1), 'box-1')!
    // A live box has both a CSS selector and an HTML class occurrence.
    expect(token.ranges.length).toBeGreaterThanOrEqual(2)
    const source = withBoxes(1)
    for (const { from, to } of token.ranges) {
      expect(source.slice(from, to)).toBe('box-1')
    }
  })
})

describe('rename', () => {
  const handleOf = (source: string, className: string) =>
    listBoxes(source).find((b) => b.className === className)!.handle

  it('rewrites the CSS selector and the HTML class together', () => {
    const source = withBoxes(1)
    const { source: renamed } = rename(source, handleOf(source, 'box-1'), 'hero')

    const doc = parse(renamed)
    expect(doc.querySelector('.hero')).not.toBeNull()
    expect(doc.querySelector('.box-1')).toBeNull()
    expect(renamed).toMatch(/\.hero\s*\{/) // selector rewritten
    expect(renamed).not.toContain('box-1') // no stray occurrences left
  })

  it('leaves the box handle unchanged — tracking does not depend on the name', () => {
    const source = withBoxes(1)
    const handle = handleOf(source, 'box-1')
    const { source: renamed } = rename(source, handle, 'hero')

    const box = listBoxes(renamed)[0]
    expect(box.handle).toBe(handle)
    expect(box.className).toBe('hero')
  })

  it('keeps the renamed box resolving as a chip', () => {
    const source = withBoxes(1)
    const { source: renamed } = rename(source, handleOf(source, 'box-1'), 'hero')
    expect(resolveTokens(renamed).find((t) => t.className === 'hero')?.resolved).toBe(
      true,
    )
  })

  it('touches only the targeted box', () => {
    const source = withBoxes(2)
    const { source: renamed } = rename(source, handleOf(source, 'box-1'), 'hero')

    const doc = parse(renamed)
    expect(doc.querySelector('.hero')).not.toBeNull()
    expect(doc.querySelector('.box-2')).not.toBeNull() // sibling untouched
  })

  it('refuses a name another box already has, leaving the source alone', () => {
    const source = withBoxes(2)
    const result = rename(source, handleOf(source, 'box-1'), 'box-2')

    expect(result.problem).toBe('taken')
    expect(result.source).toBe(source)
    expect(listBoxes(result.source)).toHaveLength(2) // nothing merged
  })

  it('refuses names that would break the markup or the selector', () => {
    const source = withBoxes(1)
    for (const name of ['my box', 'a"b', '1st', '--x', 'a.b']) {
      const result = rename(source, handleOf(source, 'box-1'), name)
      expect(result.problem).toBe('invalid')
      expect(result.source).toBe(source)
    }
  })

  it('trims surrounding whitespace from an accepted name', () => {
    const source = withBoxes(1)
    const { source: renamed, problem } = rename(source, handleOf(source, 'box-1'), '  hero ')
    expect(problem).toBeUndefined()
    expect(parse(renamed).querySelector('.hero')).not.toBeNull()
  })
})

describe('validateBoxName', () => {
  const handleOf = (source: string, className: string) =>
    listBoxes(source).find((b) => b.className === className)!.handle

  it('accepts a fresh CSS identifier, including leading - and _', () => {
    const source = withBoxes(1)
    const handle = handleOf(source, 'box-1')
    for (const name of ['hero', '_hero', '-hero', 'hero-2', 'Hero_Two']) {
      expect(validateBoxName(source, handle, name)).toBeNull()
    }
  })

  it('accepts the box keeping its own name', () => {
    const source = withBoxes(1)
    expect(validateBoxName(source, handleOf(source, 'box-1'), 'box-1')).toBeNull()
  })

  it('reports an empty name', () => {
    const source = withBoxes(1)
    expect(validateBoxName(source, handleOf(source, 'box-1'), '   ')).toBe('empty')
  })

  it('refuses any class already used as a selector in the styles', () => {
    const source = withBoxes(1).replace(
      '</style>',
      '  .glow:hover, .card > .title { color: red; }\n    </style>',
    )
    const handle = handleOf(source, 'box-1')
    for (const name of ['canvas', 'glow', 'card', 'title']) {
      expect(validateBoxName(source, handle, name)).toBe('taken')
    }
  })

  it("refuses another box's extra class, but not names that only appear in script", () => {
    const base = withBoxes(2).replace('class="box-2"', 'class="box-2 active"')
    const source = attachJs(base, handleOf(base, 'box-1')).source.replace(
      '</script>',
      '  box1.style.color = "red";\n    </script>',
    )
    const handle = handleOf(source, 'box-1')
    expect(validateBoxName(source, handle, 'active')).toBe('taken')
    // `.style` in JS is a property access, not a class in use.
    expect(validateBoxName(source, handle, 'style')).toBeNull()
  })
})

describe('ensureRule', () => {
  const handleOf = (source: string) => listBoxes(source)[0].handle

  it('finds an existing rule and lands the cursor inside it, unchanged', () => {
    const source = withBoxes(1)
    const result = ensureRule(source, handleOf(source))

    expect(result.created).toBe(false)
    expect(result.source).toBe(source) // no edit when the rule is already there
    const range = ruleRangeOf(source, 'box-1')!
    expect(result.cursor).toBeGreaterThan(range.from)
    expect(result.cursor).toBeLessThan(range.to)
  })

  it('re-creates a minimal rule for a box whose rule was hand-deleted', () => {
    const source = withBoxes(1)
    const handle = handleOf(source)
    const orphaned = source.replace(/\s*\.box-1 \{[^}]*\}/, '')
    expect(ruleRangeOf(orphaned, 'box-1')).toBeNull() // precondition: rule gone

    const result = ensureRule(orphaned, handle)
    expect(result.created).toBe(true)

    const styleText = parse(result.source).querySelector('style')?.textContent ?? ''
    expect(styleText).toMatch(/\.box-1\s*\{/)
    // Cursor lands inside the freshly created rule body.
    const range = ruleRangeOf(result.source, 'box-1')!
    expect(result.cursor).toBeGreaterThan(range.from)
    expect(result.cursor).toBeLessThan(range.to)
  })
})

describe('boxAtOffset', () => {
  it('reports the box whose rule the cursor sits in', () => {
    const source = withBoxes(2)
    const box2 = listBoxes(source)[1]
    const inBox2Rule = ruleRangeOf(source, box2.className)!.from + 1

    expect(boxAtOffset(source, inBox2Rule)).toBe(box2.handle)
  })

  it('reports nothing when the cursor is outside every rule', () => {
    expect(boxAtOffset(withBoxes(1), 0)).toBeNull()
  })
})

describe('attachJs', () => {
  const firstHandle = (source: string) => listBoxes(source)[0].handle

  it('adds an id and a getElementById line in one shared script', () => {
    const source = withBoxes(1)
    const { source: next, varName } = attachJs(source, firstHandle(source))

    const doc = parse(next)
    expect(doc.querySelector('.box-1')?.id).toBe('box-1')
    expect(doc.querySelectorAll('script')).toHaveLength(1)
    expect(doc.querySelector('script')?.textContent).toContain(
      "const box1 = document.getElementById('box-1')",
    )
    expect(varName).toBe('box1')
  })

  it('lands the cursor inside the script, below the wiring line', () => {
    const source = withBoxes(1)
    const { source: next, cursor } = attachJs(source, firstHandle(source))

    const constEnd = next.indexOf(';', next.indexOf('getElementById'))
    const scriptClose = next.indexOf('</script>')
    expect(cursor).toBeGreaterThan(constEnd)
    expect(cursor).toBeLessThan(scriptClose)
  })

  it('appends to the single shared script for a second box', () => {
    let source = withBoxes(2)
    const [b1, b2] = listBoxes(source)
    source = attachJs(source, b1.handle).source
    source = attachJs(source, b2.handle).source

    const doc = parse(source)
    expect(doc.querySelectorAll('script')).toHaveLength(1)
    const script = doc.querySelector('script')?.textContent ?? ''
    expect(script).toContain("getElementById('box-1')")
    expect(script).toContain("getElementById('box-2')")
  })

  it('re-attaching does not duplicate the const line', () => {
    const source = withBoxes(1)
    const handle = firstHandle(source)
    const once = attachJs(source, handle).source
    const twice = attachJs(once, handle)

    expect(twice.source).toBe(once) // no new edit — jump to the existing line
    expect(once.split("getElementById('box-1')").length - 1).toBe(1)
  })

  it('a freshly created box carries no id until JS is attached', () => {
    expect(parse(withBoxes(1)).querySelector('.box-1')?.id).toBe('')
  })
})

describe('detachJs', () => {
  it('removes the id and the wiring line, dropping the now-empty script', () => {
    const source = withBoxes(1)
    const handle = listBoxes(source)[0].handle
    const attached = attachJs(source, handle).source

    const { source: detached } = detachJs(attached, handle)

    const doc = parse(detached)
    expect(doc.querySelector('.box-1')).not.toBeNull() // the box itself stays
    expect(doc.querySelector('.box-1')?.id).toBe('')
    expect(detached).not.toContain("getElementById('box-1')")
    expect(doc.querySelectorAll('script')).toHaveLength(0)
  })

  it('leaves other boxes wired when detaching one', () => {
    let source = withBoxes(2)
    const [b1, b2] = listBoxes(source)
    source = attachJs(source, b1.handle).source
    source = attachJs(source, b2.handle).source

    const { source: detached } = detachJs(source, b1.handle)

    const doc = parse(detached)
    expect(doc.querySelector('.box-1')?.id).toBe('')
    expect(doc.querySelector('.box-2')?.id).toBe('box-2')
    expect(detached).not.toContain("getElementById('box-1')")
    expect(detached).toContain("getElementById('box-2')")
    expect(doc.querySelectorAll('script')).toHaveLength(1)
  })

  it('is a no-op for a box that has no JS', () => {
    const source = withBoxes(1)
    expect(detachJs(source, listBoxes(source)[0].handle).source).toBe(source)
  })

  it('keeps the script when user code without `const` remains in it', () => {
    const base = withBoxes(1)
    const handle = listBoxes(base)[0].handle
    // The user's own code below the wiring, written without any `const`.
    const attached = attachJs(base, handle).source.replace(
      '</script>',
      "  box1.addEventListener('click', () => alert('hi'));\n    </script>",
    )

    const { source: detached } = detachJs(attached, handle)

    expect(detached).not.toContain("getElementById('box-1')")
    const scripts = parse(detached).querySelectorAll('script')
    expect(scripts).toHaveLength(1)
    expect(scripts[0].textContent).toContain("box1.addEventListener('click'")
  })

  it('keeps the script while another box is still wired', () => {
    let source = withBoxes(2)
    const [b1, b2] = listBoxes(source)
    source = attachJs(source, b1.handle).source
    source = attachJs(source, b2.handle).source

    // Detach both, one at a time: the script survives the first, not the last.
    const once = detachJs(source, b2.handle).source
    expect(parse(once).querySelectorAll('script')).toHaveLength(1)
    expect(once).toContain("getElementById('box-1')")

    const twice = detachJs(once, b1.handle).source
    expect(parse(twice).querySelectorAll('script')).toHaveLength(0)
    // Removing the block leaves no blank line where it stood.
    expect(twice).not.toMatch(/\n[ \t]*\n[ \t]*<\/body>/)
  })

  it('removes only its own wiring line, never other getElementById lines', () => {
    const base = withBoxes(1)
    const handle = listBoxes(base)[0].handle
    const attached = attachJs(base, handle).source.replace(
      '</script>',
      "  const title = document.getElementById('title');\n    </script>",
    )

    const { source: detached } = detachJs(attached, handle)

    expect(detached).not.toContain("getElementById('box-1')")
    expect(detached).toContain("const title = document.getElementById('title');")
  })
})

describe('rename with JS attached', () => {
  it('rewrites class + id + getElementById together, keeping the variable name', () => {
    const base = withBoxes(1)
    const source = attachJs(base, listBoxes(base)[0].handle).source
    const handle = listBoxes(source)[0].handle

    const { source: renamed } = rename(source, handle, 'hero')

    const doc = parse(renamed)
    expect(doc.querySelector('.hero')?.id).toBe('hero') // class + id updated
    expect(renamed).toContain("getElementById('hero')") // arg updated
    expect(renamed).toContain('const box1 =') // variable name is user-owned
    expect(renamed).not.toContain('box-1') // no stray old identity left
  })

  it('treats the id and getElementById arg as managed chip occurrences', () => {
    const base = withBoxes(1)
    const source = attachJs(base, listBoxes(base)[0].handle).source

    const token = resolveTokens(source).find((t) => t.className === 'box-1')!
    expect(token.resolved).toBe(true)
    // class attr + CSS selector + id attr + getElementById arg — all 'box-1'.
    expect(token.ranges.length).toBeGreaterThanOrEqual(4)
    for (const { from, to } of token.ranges) {
      expect(source.slice(from, to)).toBe('box-1')
    }
  })

  it('errors the JS reference when the box <div> is deleted', () => {
    const base = withBoxes(1)
    const source = attachJs(base, listBoxes(base)[0].handle).source
    // Drop the box element but keep its rule and its getElementById line.
    const orphaned = source.replace(/<div class="box-1"[^>]*><\/div>\n\s*/, '')

    expect(resolveTokens(orphaned).find((t) => t.className === 'box-1')?.resolved).toBe(
      false,
    )
  })
})
