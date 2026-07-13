import { describe, it, expect } from 'vitest'
import { locateRule, boxAtCursor } from './rules'

const SCENE = `<!doctype html>
<html>
  <head>
    <style>
      .canvas { position: relative; }
      .box-1 {
        position: absolute;
        left: 10px;
      }
    </style>
  </head>
  <body>
    <div class="canvas">
      <div class="box-1"></div>
    </div>
  </body>
</html>
`

describe('locateRule', () => {
  it('brackets a box rule from its selector to its closing brace', () => {
    const range = locateRule(SCENE, 'box-1')!

    expect(range).not.toBeNull()
    const rule = SCENE.slice(range.from, range.to)
    expect(rule.startsWith('.box-1')).toBe(true)
    expect(rule.endsWith('}')).toBe(true)
    expect(rule).toContain('left: 10px;')
  })

  it('returns null when the box has no rule', () => {
    expect(locateRule(SCENE, 'box-9')).toBeNull()
  })
})

describe('boxAtCursor', () => {
  const names = new Set(['box-1'])

  it('reports the box whose rule contains the cursor', () => {
    const offset = SCENE.indexOf('left: 10px;')
    expect(boxAtCursor(SCENE, offset, names)).toBe('box-1')
  })

  it('reports null when the cursor is outside every managed box', () => {
    const offset = SCENE.indexOf('.canvas { position')
    expect(boxAtCursor(SCENE, offset, names)).toBeNull()
  })
})
