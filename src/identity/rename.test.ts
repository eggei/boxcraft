import { describe, it, expect } from 'vitest'
import { renameBox } from './rename'

// box-1 appears as a CSS selector, an HTML class, an HTML id, and a
// getElementById string argument. With JS attached, rename rewrites all four
// atomically (DESIGN.md §8). The derived variable name `box1` is user-owned and
// must stay put.
const SCENE = `<!doctype html>
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

/** Apply a change-set (from-descending) to verify the resulting source. */
function applyChanges(source: string, changes: { from: number; to: number; insert: string }[]) {
  let out = source
  for (const c of [...changes].sort((a, b) => b.from - a.from)) {
    out = out.slice(0, c.from) + c.insert + out.slice(c.to)
  }
  return out
}

describe('renameBox', () => {
  it('rewrites the CSS selector and HTML class occurrences to the new name', () => {
    const { source } = renameBox(SCENE, 'box-1', 'hero')

    expect(source).toContain('.hero {')
    expect(source).toContain('class="hero"')
  })

  it('rewrites the JS id and getElementById string too (Phase 3)', () => {
    const { source } = renameBox(SCENE, 'box-1', 'hero')

    expect(source).toContain('id="hero"')
    expect(source).toContain("getElementById('hero')")
    // No box-1 occurrence survives as a managed token.
    expect(source).not.toContain('id="box-1"')
    expect(source).not.toContain("getElementById('box-1')")
  })

  it('leaves the auto-derived variable name untouched (user-owned)', () => {
    const { source } = renameBox(SCENE, 'box-1', 'hero')

    // The var `box1` does not follow the rename (DESIGN.md §8).
    expect(source).toContain('const box1 = document.getElementById')
  })

  it('returns a change-set that applies as one atomic edit (one undo step)', () => {
    const { changes, source } = renameBox(SCENE, 'box-1', 'hero')

    // Four managed occurrences: selector, class, id, and getElementById arg.
    expect(changes).toHaveLength(4)
    expect(changes.every((c) => c.insert === 'hero')).toBe(true)
    // Applying the change-set reproduces the returned source.
    expect(applyChanges(SCENE, changes)).toBe(source)
  })
})
