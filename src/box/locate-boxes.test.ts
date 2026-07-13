import { describe, it, expect } from 'vitest'
import { locateBoxes } from './locate-boxes'

const SCENE = `<!doctype html>
<html>
  <head>
    <style>
      .canvas { position: relative; width: 400px; height: 400px; }
    </style>
  </head>
  <body>
    <div class="canvas">
      <div class="box-1"></div>
    </div>
  </body>
</html>
`

describe('locateBoxes', () => {
  it('finds a managed box with its name and exact class-token span', () => {
    const boxes = locateBoxes(SCENE)

    expect(boxes).toHaveLength(1)
    const [box] = boxes
    expect(box.name).toBe('box-1')
    // The span points precisely at the box-N token inside the class value.
    expect(SCENE.slice(box.nameFrom, box.nameTo)).toBe('box-1')
  })

  it('finds every box in document order and ignores non-box elements', () => {
    // Two boxes, plus a user-classed div and the canvas itself — only the
    // box-N namespace is managed (DESIGN.md §5). box-2 also carries a
    // user-invented class alongside its managed name.
    const scene = SCENE.replace(
      '      <div class="box-1"></div>\n',
      '      <div class="box-1"></div>\n' +
        '      <div class="glow"></div>\n' +
        '      <div class="box-2 glow"></div>\n',
    )

    const boxes = locateBoxes(scene)

    expect(boxes.map((b) => b.name)).toEqual(['box-1', 'box-2'])
    // The span still isolates just the managed token, not the trailing class.
    expect(scene.slice(boxes[1].nameFrom, boxes[1].nameTo)).toBe('box-2')
  })
})
