import { describe, it, expect } from 'vitest'
import { computeChips } from './chips'

// box-1 has a live <div>; box-2's rule exists but its <div> was hand-deleted;
// .glow is a user class. Only the box-N namespace is a candidate for chips.
const SCENE = `<!doctype html>
<html>
  <head>
    <style>
      .box-1 { position: absolute; }
      .box-2 { position: absolute; }
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

// Both boxes are managed (tracked by handles); only box-1 renders a live element.
const MANAGED = new Set(['box-1', 'box-2'])
const RESOLVED = new Set(['box-1'])

describe('computeChips', () => {
  it('marks tokens whose handle resolves to a live element as chips', () => {
    const chips = computeChips(SCENE, MANAGED, RESOLVED)

    const box1 = chips.filter((c) => c.name === 'box-1')
    expect(box1.length).toBeGreaterThan(0)
    expect(box1.every((c) => c.resolved)).toBe(true)
  })

  it('error-colors managed tokens that no longer resolve to an element', () => {
    const chips = computeChips(SCENE, MANAGED, RESOLVED)

    // box-2's rule references a managed box with no live element → error.
    const box2 = chips.filter((c) => c.name === 'box-2')
    expect(box2.length).toBeGreaterThan(0)
    expect(box2.every((c) => !c.resolved)).toBe(true)
  })

  it('never decorates unmanaged, user-invented classes', () => {
    const chips = computeChips(SCENE, MANAGED, RESOLVED)
    expect(chips.some((c) => c.name === 'glow')).toBe(false)
  })

  it('chips the attached id from the same handle↔element correspondence as the class', () => {
    // JS attached to box-1: the id names the same live element, so it resolves
    // exactly as the class does — no separate #id matching (DESIGN.md §8).
    const js = SCENE.replace('<div class="box-1 glow">', '<div class="box-1 glow" id="box-1">').replace(
      '  </body>',
      "    <script>const box1 = document.getElementById('box-1');</script>\n  </body>",
    )
    const chips = computeChips(js, MANAGED, RESOLVED)

    const idChip = chips.find((c) => c.kind === 'id')
    const jsRefChip = chips.find((c) => c.kind === 'js-ref')
    expect(idChip?.resolved).toBe(true)
    expect(jsRefChip?.resolved).toBe(true)
  })
})
