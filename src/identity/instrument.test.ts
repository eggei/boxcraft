import { describe, it, expect } from 'vitest'
import { instrument } from './instrument'

const SCENE = `<!doctype html>
<html>
  <head>
    <style>
      .canvas { position: relative; }
    </style>
  </head>
  <body>
    <div class="canvas">
      <div class="box-1"></div>
      <div class="glow"></div>
      <div class="box-2 glow"></div>
    </div>
  </body>
</html>
`

describe('instrument', () => {
  it('injects a transient data-bc handle onto each managed box opening tag', () => {
    const html = instrument(SCENE, new Map([['box-1', 'bx_1'], ['box-2', 'bx_2']]))

    expect(html).toContain('<div class="box-1" data-bc="bx_1">')
    expect(html).toContain('<div class="box-2 glow" data-bc="bx_2">')
  })

  it('never touches the clean source: user elements and unmanaged boxes stay verbatim', () => {
    // Only box-1 has a handle; box-2 has none, .glow and .canvas are the user's.
    const html = instrument(SCENE, new Map([['box-1', 'bx_1']]))

    // Unmanaged box and user classes carry no data-bc.
    expect(html).toContain('<div class="box-2 glow"></div>')
    expect(html).toContain('<div class="glow"></div>')
    expect(html).toContain('<div class="canvas">')
    // The only change is the one injected attribute — nothing else moved.
    expect(html).toBe(SCENE.replace('<div class="box-1">', '<div class="box-1" data-bc="bx_1">'))
    // The source-of-truth string itself is not mutated.
    expect(SCENE).toContain('<div class="box-1"></div>')
  })
})
