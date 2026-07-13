import { describe, it, expect } from 'vitest'
import { locateNameTokens } from './name-tokens'

const SCENE = `<!doctype html>
<html>
  <head>
    <style>
      .canvas { position: relative; }
      .box-1 { position: absolute; }
      .glow { box-shadow: 0 0 4px; }
    </style>
  </head>
  <body>
    <div class="canvas">
      <div class="box-1 glow"></div>
    </div>
  </body>
</html>
`

describe('locateNameTokens', () => {
  it('locates both the CSS selector and the HTML class occurrence of a managed name', () => {
    const tokens = locateNameTokens(SCENE, new Set(['box-1']))

    expect(tokens.map((t) => t.kind).sort()).toEqual(['class', 'selector'])
    tokens.forEach((t) => expect(SCENE.slice(t.from, t.to)).toBe('box-1'))
  })

  it('tracks an arbitrarily renamed managed name, not just the box-N pattern', () => {
    // A box previously renamed to "hero": still managed via its handle marker.
    const renamed = SCENE.replaceAll('box-1', 'hero')
    const tokens = locateNameTokens(renamed, new Set(['hero']))

    expect(tokens.map((t) => t.kind).sort()).toEqual(['class', 'selector'])
    tokens.forEach((t) => expect(renamed.slice(t.from, t.to)).toBe('hero'))
  })

  it('never touches unmanaged classes even when they sit beside a managed one', () => {
    // .glow is a user class on the same element; it is not in the managed set.
    const tokens = locateNameTokens(SCENE, new Set(['box-1']))
    expect(tokens.some((t) => t.name === 'glow')).toBe(false)
  })
})

// A scene with JS attached: the box carries an id and the shared script wires it
// up. box-1 also appears as an unrelated word and the derived var name, neither
// of which is a managed token.
const JS_SCENE = `<!doctype html>
<html>
  <head>
    <style>
      .box-1 { position: absolute; }
    </style>
  </head>
  <body>
    <div class="canvas">
      <div class="box-1" id="box-1"></div>
    </div>
    <script>
      const box1 = document.getElementById('box-1');
    </script>
  </body>
</html>
`

describe('locateNameTokens — JS tokens (Phase 3)', () => {
  it('locates the id attribute value of a managed box', () => {
    const tokens = locateNameTokens(JS_SCENE, new Set(['box-1']))
    const id = tokens.filter((t) => t.kind === 'id')

    expect(id).toHaveLength(1)
    expect(JS_SCENE.slice(id[0].from, id[0].to)).toBe('box-1')
  })

  it('locates the getElementById string argument of a managed box', () => {
    const tokens = locateNameTokens(JS_SCENE, new Set(['box-1']))
    const ref = tokens.filter((t) => t.kind === 'js-ref')

    expect(ref).toHaveLength(1)
    expect(JS_SCENE.slice(ref[0].from, ref[0].to)).toBe('box-1')
    // The span is the string argument only — the derived var name is untouched.
    expect(JS_SCENE.slice(ref[0].from - 1, ref[0].to + 1)).toBe("'box-1'")
  })

  it('does not emit the derived variable name as a managed token', () => {
    // `box1` (the var) is user-owned and never renamed (DESIGN.md §8).
    const tokens = locateNameTokens(JS_SCENE, new Set(['box-1']))
    tokens.forEach((t) => expect(t.name).toBe('box-1'))
    // Four managed occurrences: selector, class, id, js-ref.
    expect(tokens).toHaveLength(4)
  })
})
