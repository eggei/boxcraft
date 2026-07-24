import { describe, expect, it } from 'vitest'
import { DEFAULT_SOURCE } from '@/scenes/sceneList'
import {
  attachJs,
  boxAtOffset,
  createBox,
  detachJs,
  ensureRule,
  instrument,
  listBoxes,
  rename,
  resolveTokens,
  ruleRangeOf,
  serialize,
} from './document'

/** DEFAULT_SOURCE with `n` boxes created in order, for identity-layer tests. */
function withBoxes(n: number): string {
  let source = DEFAULT_SOURCE
  for (let i = 0; i < n; i++) {
    source = createBox(source, { kind: 'point', x: i * 10, y: i * 10 }).source
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
