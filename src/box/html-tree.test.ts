import { describe, it, expect } from 'vitest'
import { parseElements } from './html-tree'

const SCENE = `<html>
  <head>
    <style>
      .box-1 { position: absolute; }
    </style>
  </head>
  <body>
    <div class="box-1 glow"></div>
  </body>
</html>`

describe('parseElements', () => {
  it('reports each element with its tag name and parsed class names', () => {
    const els = parseElements(SCENE)

    const div = els.find((e) => e.tagName === 'div')!
    expect(div.classNames).toEqual(['box-1', 'glow'])
    // The opening-tag span brackets the whole <div ...> tag.
    expect(SCENE.slice(div.openFrom, div.openTo)).toBe('<div class="box-1 glow">')
  })

  it('exposes the content range between a style tag and its close', () => {
    const els = parseElements(SCENE)

    const style = els.find((e) => e.tagName === 'style')!
    expect(style.closeFrom).not.toBeNull()
    const content = SCENE.slice(style.openTo, style.closeFrom!)
    expect(content).toContain('.box-1 { position: absolute; }')
  })
})
