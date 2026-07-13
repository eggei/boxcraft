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
